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

module.exports = { carregarDoBanco, carregarDeArquivos, versaoNoAr, miniatura, fechar, acharEnv, variavel };
