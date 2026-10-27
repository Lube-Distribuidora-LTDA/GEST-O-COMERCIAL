/* =============================================================================
 * fonte_dados.js — de onde o servidor tira o pacote do painel.
 *
 *   1. O BANCO (DATA WAREHOUSE, schema trade): é o caminho normal. O ETL (sync_trade.py) grava a versão
 *      nova do pacote em pedaços e troca o ponteiro `trade.pacote_versao`; este módulo lê a versão que
 *      está no ar, confere o sha1 de cada arquivo e entrega tudo na memória.
 *   2. Os ARQUIVOS de web/dados/: só se o banco não responder (rede fora, senha errada). O painel abre
 *      com o que a última carga local deixou e avisa de onde veio, em /api/versao.
 *
 * Credenciais: o arquivo ENV (o mesmo dos outros BIs), nunca gravado em lugar nenhum daqui.
 *   Procura em: variável TRADE_ENV ou LUBE_ENV, ../etl/ENV, ./ENV, ../ENV, ../1 - CONFIGURACAO/ENV, C:/BI/TRADE/ENV
 *   e, por último, a pasta de integração (P:/INTEGRAÇÃO BI/TRADE/1 - CONFIGURACAO/ENV).
 *   O ENV MANDA sobre variável de ambiente do sistema (já houve máquina com SUPABASE_* de outro projeto).
 * ========================================================================== */
"use strict";

const fs = require("fs");
const path = require("path");
const zlib = require("zlib");
const crypto = require("crypto");

const REF_DW = "ivcnotrynogaljrvvyes";          // projeto DATA WAREHOUSE do Supabase
const SCHEMA = "trade";
const ARQUIVOS_DO_PACOTE = ["dims.json", "estoque.json", "entradas.json", "cc.json", "historico.json", "meta.json", "imagens.json", "venda.bin.gz"];

function lerEnv(caminho) {
  const out = {};
  for (const linha of fs.readFileSync(caminho, "utf8").split(/\r?\n/)) {
    const t = linha.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i < 1) continue;
    const k = t.slice(0, i).trim();
    let v = t.slice(i + 1).trim();
    if (/^".*"$/.test(v) || /^'.*'$/.test(v)) v = v.slice(1, -1);          // dentro de aspas, "#" faz parte da senha
    else v = v.replace(/\s+#.*$/, "");
    out[k] = v;
  }
  return out;
}

function acharEnv() {
  const aqui = __dirname;
  const c = [process.env.TRADE_ENV, process.env.LUBE_ENV,
    path.join(aqui, "..", "etl", "ENV"), path.join(aqui, "ENV"), path.join(aqui, "..", "ENV"),
    path.join(aqui, "..", "1 - CONFIGURACAO", "ENV"), "C:/BI/TRADE/ENV",
    "P:/INTEGRAÇÃO BI/TRADE/1 - CONFIGURACAO/ENV"].filter(Boolean);
  for (const x of c) { try { if (fs.statSync(x).isFile()) return x; } catch (e) { /* próximo */ } }
  return null;
}

/* Na Vercel as credenciais vêm das variáveis de ambiente do projeto (SUPABASE_DB_*); fora dela, do arquivo ENV. */
const NA_VERCEL = !!process.env.VERCEL;

/* uma variável de configuração qualquer (ex.: TRADE_FOTOS): o ambiente do processo e, depois, o arquivo ENV */
function variavel(nome) {
  if (process.env[nome]) return process.env[nome];
  try { const arq = acharEnv(); return arq ? lerEnv(arq)[nome] : undefined; } catch (e) { return undefined; }
}

let pool = null;
function conectar() {
  if (pool) return pool;
  let env, origemEnv;
  if (NA_VERCEL) {
    env = process.env; origemEnv = "variáveis de ambiente da Vercel";
  } else {
    const arq = acharEnv();
    if (!arq) throw new Error("ENV não encontrado (defina TRADE_ENV ou ponha o ENV em ../etl/)");
    env = lerEnv(arq); origemEnv = path.basename(path.dirname(arq)) + "/" + path.basename(arq);
  }
  for (const k of ["SUPABASE_DB_HOST", "SUPABASE_DB_USER", "SUPABASE_DB_PASSWORD"]) if (!env[k]) throw new Error("falta " + k + (NA_VERCEL ? " nas variáveis de ambiente do projeto na Vercel" : " no ENV"));
  if (!(env.SUPABASE_DB_USER.includes(REF_DW) || env.SUPABASE_DB_HOST.includes(REF_DW)))
    throw new Error("o ENV aponta para outro projeto do Supabase (esperado o DATA WAREHOUSE); nada foi lido");
  const { Pool } = require("pg");
  pool = new Pool({
    host: env.SUPABASE_DB_HOST, port: +(env.SUPABASE_DB_PORT || 5432), database: env.SUPABASE_DB_NAME || "postgres",
    user: env.SUPABASE_DB_USER, password: env.SUPABASE_DB_PASSWORD, ssl: { rejectUnauthorized: false },
    max: NA_VERCEL ? 1 : 2, idleTimeoutMillis: NA_VERCEL ? 3000 : 30000, connectionTimeoutMillis: 20000, statement_timeout: 120000, keepAlive: true,
  });
  pool.on("error", e => console.error("[banco] conexão ociosa caiu:", e.message));
  pool.envArquivo = origemEnv;
  return pool;
}

/* Várias requisições dividem a conexão; na Vercel ela fecha quando a última termina (o session pooler tem poucas
   conexões), sem uma requisição fechar o pool no meio da outra. */
let emUso = 0;
async function comConexao(fn) {
  emUso++;
  try { return await fn(conectar()); }
  finally { if (--emUso === 0 && NA_VERCEL) await fechar(); }
}

/* a versão no ar (consulta levíssima; o servidor pergunta de tempos em tempos) */
function versaoNoAr() {
  return comConexao(async c => (await c.query(`SELECT versao, meta, arquivos FROM ${SCHEMA}.pacote_versao WHERE id = 1`)).rows[0] || null);
}

/* ---- a venda de hoje (AGENTE LUBE, ver hoje.js) ---- */
/* a versão da venda: quando o agente gravou por último um dos fluxos da venda (consulta levíssima). Até 2026-10-27 era
   a versão do sistema 'trade' inteiro; com o estoque e a conta corrente no agente ela muda de minuto em minuto, e a
   venda de hoje seria montada de novo sem ter mudado. Mesmo formato (AAAAMMDD-HHMMSS.mmm, hora de Brasília). */
const FLUXOS_VENDA = ["trade.venda_dia", "trade.venda_dia_3d", "trade.venda_hora"];
function versaoHoje() {
  return comConexao(async c => (await c.query(
    `SELECT to_char(max(mudou_em) AT TIME ZONE 'America/Sao_Paulo', 'YYYYMMDD-HH24MISS.MS') AS versao, max(mudou_em) AS mudou_em
       FROM agente.estado WHERE fluxo = ANY($1::text[])`, [FLUXOS_VENDA])).rows[0] || null);
}

/* ---- estoque, conta corrente, entradas e fotos ao vivo (ver bases.js) ---- */
const FLUXOS_BASES = ["trade.estoque_posicao", "trade.estoque_giro", "trade.entrada_mes", "trade.cc_lancamento"];
/* quando o agente gravou cada tabela, e se a última leitura dele é mais nova que o arquivo da carga no ar (`fresco`);
   e a assinatura das fotos (quantas, quais, a última mudança). Consulta levíssima: a tela pergunta de 15 em 15 s. */
function versaoBases() {
  return comConexao(async c => {
    const f = await c.query(
      `SELECT e.fluxo, to_char(e.mudou_em AT TIME ZONE 'America/Sao_Paulo', 'YYYYMMDD-HH24MISS.MS') AS versao,
              (e.mudou_em IS NOT NULL AND e.lido_em > pv.gerado_em) AS fresco
         FROM agente.estado e CROSS JOIN ${SCHEMA}.pacote_versao pv
        WHERE pv.id = 1 AND e.fluxo = ANY($1::text[]) ORDER BY e.fluxo`, [FLUXOS_BASES]);
    const i = await c.query(
      `SELECT count(*) || ':' || coalesce(sum(codprod), 0) || ':' ||
              coalesce(to_char(max(atualizado_em) AT TIME ZONE 'UTC', 'YYYYMMDD-HH24MISS.US'), '') AS assinatura
         FROM ${SCHEMA}.produto_imagem`);
    return { fluxos: Object.fromEntries(f.rows.map(r => [r.fluxo, { versao: r.versao, fresco: r.fresco }])), fotos: i.rows[0].assinatura };
  });
}
/* datas como texto (AAAA-MM-DD) e números como float8: o node-pg devolve numeric como texto e date como meia-noite local */
function lerPosicao() {
  return comConexao(async c => (await c.query(
    `SELECT codprod, estoque::float8 AS estoque, reservado::float8 AS reservado, bloq_semav::float8 AS bloq_semav, avaria::float8 AS avaria,
            disponivel::float8 AS disponivel, valor_custo::float8 AS valor_custo, pvenda::float8 AS pvenda, pendente::float8 AS pendente
       FROM ${SCHEMA}.estoque_posicao`)).rows);
}
function lerGiro() {
  return comConexao(async c => (await c.query(
    `SELECT codprod, s0::float8 AS s0, s1::float8 AS s1, s2::float8 AS s2, s3::float8 AS s3, s4::float8 AS s4, s5::float8 AS s5,
            s6::float8 AS s6, s7::float8 AS s7, s8::float8 AS s8, venda56::float8 AS venda56,
            to_char(primeira, 'YYYY-MM-DD') AS primeira, to_char(ultima, 'YYYY-MM-DD') AS ultima
       FROM ${SCHEMA}.estoque_giro`)).rows);
}
function lerEntradas() {
  return comConexao(async c => (await c.query(
    `SELECT to_char(mes, 'YYYY-MM-DD') AS mes, codprod, qt::float8 AS qt, valor::float8 AS valor FROM ${SCHEMA}.entrada_mes`)).rows);
}
/* a conta corrente: o saldo de cada fornecedor somado no banco (os 43 mil lançamentos) e, linha a linha, só o que a tela
   mostra (desde 2024) — é desse pedaço que saem a verba e a negociação do último trimestre fechado */
function lerCC(desde) {
  return comConexao(async c => {
    const agregado = (await c.query(
      `SELECT codfornec, max(fornecedor) AS fornecedor, max(codcomprador) AS codcomprador,
              coalesce(sum(valor) FILTER (WHERE tipo = 'D'), 0)::float8 AS debito, coalesce(sum(valor) FILTER (WHERE tipo = 'C'), 0)::float8 AS credito
         FROM ${SCHEMA}.cc_lancamento WHERE codfornec IS NOT NULL GROUP BY codfornec`)).rows;
    const linhas = (await c.query(
      `SELECT transacao::text AS transacao, to_char(data, 'YYYY-MM-DD') AS data, codfornec, tipo, coalesce(valor, 0)::float8 AS valor,
              historico, numverba::text AS numverba, usuario, to_char(dtestorno, 'YYYY-MM-DD') AS dtestorno
         FROM ${SCHEMA}.cc_lancamento WHERE codfornec IS NOT NULL AND data >= $1::date ORDER BY data, transacao`, [desde])).rows;
    return { agregado, linhas };
  });
}
function lerFotos() {
  return comConexao(async c => (await c.query(`SELECT codprod, arquivo FROM ${SCHEMA}.produto_imagem`)).rows);
}
/* as linhas dos dias depois do corte do arquivo (venda_dia) e a venda por hora e RCA de hoje e do mesmo dia da semana
   passada (venda_hora). Valores em float8: o hoje.js passa para centavos como o ETL (round(x * 100)). */
function lerHoje(corteAte, hoje, semana) {
  return comConexao(async c => {
    const dia = await c.query(
      `SELECT to_char(dtmov, 'YYYY-MM-DD') AS dia, codusur, codcli, codprod, venda::float8 AS v, devolucao::float8 AS d,
              qt_venda::float8 AS qv, qt_dev::float8 AS qd, peso::float8 AS w
         FROM ${SCHEMA}.venda_dia WHERE dtmov > $1::date ORDER BY dtmov, codcli, codprod, codusur`, [corteAte]);
    const hora = await c.query(
      `SELECT to_char(dtmov, 'YYYY-MM-DD') AS dia, hora, codusur, (venda - devolucao)::float8 AS v
         FROM ${SCHEMA}.venda_hora WHERE dtmov IN ($1::date, $2::date)`, [hoje, semana]);
    return { dia: dia.rows, hora: hora.rows };
  });
}
/* cadastro dos códigos que o arquivo ainda não tem (cliente, produto ou RCA novo de hoje), dos core.dim_* que o agente mantém */
function cadastros(cli, prod, rca) {
  return comConexao(async c => ({
    cli: cli.length ? (await c.query(`SELECT codcli, cliente, cidade, uf FROM core.dim_cliente WHERE codcli = ANY($1::int[])`, [cli])).rows : [],
    prod: prod.length ? (await c.query(`SELECT codprod, descricao FROM core.dim_produto WHERE codprod = ANY($1::int[])`, [prod])).rows : [],
    rca: rca.length ? (await c.query(`SELECT codusur, nome, codsupervisor FROM core.dim_rca WHERE codusur = ANY($1::int[])`, [rca])).rows : [],
  }));
}

/* o botão Atualizar (a ponte, como no Inventário e no Comercial): pede ao agente uma leitura do WinThor agora. Com o
   agente fora do ar (batimento com mais de 3 minutos) nada é pedido e a tela cai no jeito antigo. */
function pedirAtualizacao() {
  return comConexao(async c => (await c.query(
    `WITH a AS (SELECT max(visto_em) AS visto, bool_or(ligado) AS ligado FROM agente.batimento WHERE visto_em > now() - interval '3 minutes')
     SELECT a.visto, coalesce(a.ligado, false) AS ligado,
            CASE WHEN a.visto IS NOT NULL AND a.ligado THEN agente.pedir_atualizacao('trade', 'painel gestao-comercial-trade') END AS pedido
       FROM a`)).rows[0] || {});
}
function lerPedido(id) {
  return comConexao(async c => (await c.query(
    `SELECT id, status, mensagem, segundos::float8 AS segundos, detalhe FROM agente.pedido WHERE id = $1 AND sistema = 'trade'`, [id])).rows[0] || null);
}

/* miniatura WebP da foto do produto (guardada pelo ETL em trade.produto_miniatura); null se não há */
function miniatura(cod) {
  return comConexao(async c => {
    const r = await c.query(`SELECT webp FROM ${SCHEMA}.produto_miniatura WHERE codprod = $1`, [cod]);
    return r.rows[0] ? r.rows[0].webp : null;
  });
}

/* lê o pacote inteiro do banco. Devolve { origem, versao, arquivos: {nome: Buffer}, meta } onde os JSON já vêm
   descomprimidos e venda.bin.gz continua em gzip (é como o motor o lê). */
function carregarDoBanco() { return comConexao(lerPacote); }

async function lerPacote() {
  for (let tentativa = 0; tentativa < 3; tentativa++) {
    const v = await versaoNoAr();
    if (!v) throw new Error("o banco ainda não tem pacote (rode o sync_trade.py)");
    const arquivos = {};
    try {
      for (const nome of ARQUIVOS_DO_PACOTE) {
        const info = v.arquivos[nome];
        if (!info) { if (nome === "imagens.json") { arquivos[nome] = Buffer.from("{}"); continue; } throw new Error("falta " + nome + " no pacote"); }
        // os pedaços moram na versão `versao_dados`: a própria versão no ar, ou uma anterior quando o arquivo não mudou
        // (versões gravadas antes de 2026-10-19 não têm o campo: os pedaços estão na própria versão)
        const r = await conectar().query(`SELECT dados FROM ${SCHEMA}.pacote WHERE versao = $1 AND nome = $2 ORDER BY parte`, [info.versao_dados || v.versao, nome]);
        if (r.rows.length !== info.partes) throw Object.assign(new Error(`${nome}: vieram ${r.rows.length} de ${info.partes} partes`), { versaoTrocada: true });
        const gz = Buffer.concat(r.rows.map(x => x.dados));
        if (gz.length !== info.bytes || crypto.createHash("sha1").update(gz).digest("hex") !== info.sha1) throw new Error(nome + ": sha1 não confere (pacote corrompido)");
        arquivos[nome] = nome.endsWith(".gz") ? gz : zlib.gunzipSync(gz);
      }
    } catch (e) {
      if (e.versaoTrocada && tentativa < 2) { console.warn("[banco] a versão mudou durante a leitura; lendo de novo"); continue; }
      throw e;
    }
    return { origem: "banco", versao: v.versao, arquivos, meta: v.meta };
  }
  throw new Error("não consegui ler uma versão estável do pacote");
}

/* fallback: arquivos de web/dados/ (o sync_trade.py --arquivos mantém essa cópia) */
function carregarDeArquivos(dir) {
  const arquivos = {};
  for (const nome of ARQUIVOS_DO_PACOTE) {
    try { arquivos[nome] = fs.readFileSync(path.join(dir, nome)); }
    catch (e) { if (nome === "imagens.json") arquivos[nome] = Buffer.from("{}"); else throw new Error("faltam arquivos em " + dir + " (" + nome + ")"); }
  }
  const meta = JSON.parse(arquivos["meta.json"].toString("utf8"));
  return { origem: "arquivos", versao: "arquivos@" + (meta.gerado_em || ""), arquivos, meta };
}

async function fechar() {
  if (emUso > 0 || !pool) return;                       // alguém ainda está usando: quem sair por último fecha
  const p = pool; pool = null;                           // tira antes de esperar: requisição nova abre um pool novo
  await p.end().catch(() => {});
}

module.exports = { carregarDoBanco, carregarDeArquivos, versaoNoAr, miniatura, fechar, acharEnv, variavel, versaoHoje, lerHoje, cadastros,
                   pedirAtualizacao, lerPedido, versaoBases, lerPosicao, lerGiro, lerEntradas, lerCC, lerFotos };
