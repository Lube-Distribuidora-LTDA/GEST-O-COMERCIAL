/* =============================================================================
 * pacote.js — o pacote de dados no ar: carrega do banco, monta o motor e responde.
 *
 * É a peça comum do servidor local (servidor_local.js) e das funções da Vercel (api/*.js): os dois usam o MESMO código
 * para ler o pacote, conferir a versão e responder, então o que se testa aqui vale lá.
 *
 *   garantir()          o pacote no ar (carrega na primeira chamada; uma carga por vez, mesmo com várias requisições juntas)
 *   verificar()         pergunta ao banco se saiu versão nova e, se saiu, troca sem derrubar ninguém
 *   agendarChecagem()   na Vercel (sem relógio que rode entre as requisições) checa no máximo 1x por minuto, DEPOIS de responder
 *   responderConsulta() aplica o pedido ao motor; recusa (409) se a tela foi montada com OUTRA versão do pacote
 *
 * Por que o 409: os índices (cliente, produto, RCA...) mudam a cada carga. Se o ETL troca a versão com a página aberta,
 * a próxima consulta usaria índices de uma versão contra dados de outra, e mostraria o dado de outro cliente sem avisar.
 * A tela manda a versão em cada pedido (meta.gerado_em) e, ao receber 409, recarrega.
 * ========================================================================== */
"use strict";

const path = require("path");
const zlib = require("zlib");
const { Motor } = require("./motor.js");
const fonte = require("./fonte_dados.js");

const DADOS = path.join(__dirname, "dados");
const NA_VERCEL = !!process.env.VERCEL;
const INTERVALO_MS = +process.env.TRADE_POLL_MS || 60000;
// o que o navegador pode baixar; venda.bin.gz (as linhas) e imagens.json nunca saem do servidor
const PUBLICOS = new Set(["dims.json", "estoque.json", "entradas.json", "cc.json", "historico.json", "meta.json"]);

let estado = null;          // { motor, arquivos, versao, origem, meta, imagens, cacheResp, cacheGz, carregadoEm }
let avisoBanco = null;      // último motivo de o banco não ter respondido
let carregamento = null;    // promessa da carga em andamento
let verificando = null;
let ultimaChecagem = 0;

/* aquecimento: a primeira consulta depois de montar o motor paga a compilação do JavaScript (segundos).
   Rodar um conjunto típico de pedidos antes de o primeiro usuário chegar tira esse custo da frente dele. */
function aquecer(motor) {
  const t = Date.now();
  const SEM = { ano: null, mes: null, de: null, ate: null, mis: null };
  const ano = motor.anos[motor.anos.length - 1];
  const ped = [{ id: "r", tipo: "resumo" }, { id: "a", tipo: "agrupar", por: ["ano", "mes"], dist: ["pos"], filtros: SEM },
    ...["uf", "equipe", "depto", "fornecedor", "categoria", "ramo", "origem", "comprador"].map(por => ({ id: por, tipo: "agrupar", por, dist: ["pos"], limite: 12 })),
    { id: "p", tipo: "agrupar", por: "produto", dist: ["pos"], limite: 20 }, { id: "c", tipo: "agrupar", por: "cliente", dist: ["skus"], limite: 20 },
    { id: "abc", tipo: "abc", por: "produto", limite: 5 }];
  for (let i = 0; i < 3; i++) motor.consultar({ filtros: { ano: [ano] }, pedidos: ped });
  motor.cacheFiltro.clear(); motor._ef && motor._ef.clear();
  motor.resolver({});
  console.log(`motor aquecido em ${Date.now() - t} ms`);
}

function instalar(pac) {
  const t = Date.now();
  const dims = JSON.parse(pac.arquivos["dims.json"].toString("utf8"));
  const motor = new Motor(dims, pac.arquivos["venda.bin.gz"]);
  motor.resolver({});
  aquecer(motor);
  let imagens = {};
  try { imagens = JSON.parse(pac.arquivos["imagens.json"].toString("utf8")); } catch (e) { /* sem mapa: a tela esconde a foto */ }
  const antigo = estado;
  estado = { motor, arquivos: pac.arquivos, versao: pac.versao, origem: pac.origem, meta: pac.meta, imagens,
             cacheResp: new Map(), cacheGz: new Map(), carregadoEm: new Date().toISOString() };
  console.log(`pacote ${pac.versao} (${pac.origem}) no ar: ${motor.n.toLocaleString("pt-BR")} linhas de venda, ${Object.keys(imagens).length} fotos, montado em ${Date.now() - t} ms` +
              (antigo ? ` — substituiu ${antigo.versao}` : ""));
}

/* na Vercel a conexão com o banco abre, lê e fecha na hora: o session pooler do Supabase tem número limitado de conexões */
async function soltarConexao() { if (NA_VERCEL) await fonte.fechar(); }

function carregar() {
  if (!carregamento) {
    carregamento = (async () => {
      const t = Date.now();
      let pac = null;
      try {
        pac = await fonte.carregarDoBanco();
        avisoBanco = null;
        console.log(`banco: versão ${pac.versao} lida em ${Date.now() - t} ms`);
      } catch (e) {
        avisoBanco = e.message;
        console.error("[banco] não consegui ler o pacote:", e.message);
        if (!NA_VERCEL) {
          try { pac = fonte.carregarDeArquivos(DADOS); console.warn("abrindo com a cópia local de web/dados/ (pode estar desatualizada)"); }
          catch (e2) { console.error("sem dados nenhum:", e2.message, "— rode etl/sync_trade.py"); }
        }
      } finally { await soltarConexao(); }
      if (pac) instalar(pac);
    })().finally(() => { carregamento = null; });
  }
  return carregamento;
}

/* o pacote no ar; lança se não há (banco fora e sem cópia) */
async function garantir() {
  if (estado) return estado;
  await carregar();
  if (!estado) throw new Error("sem dados" + (avisoBanco ? " (" + avisoBanco + ")" : ""));
  return estado;
}

async function verificar() {
  if (verificando) return verificando;
  verificando = (async () => {
    try {
      const v = await fonte.versaoNoAr();
      avisoBanco = null;
      if (v && (!estado || estado.origem !== "banco" || v.versao !== estado.versao)) {
        console.log(`versão nova no banco: ${v.versao}`);
        instalar(await fonte.carregarDoBanco());
      }
    } catch (e) {
      if (e.message !== avisoBanco) console.error("[banco] não consegui checar a versão:", e.message);
      avisoBanco = e.message;
    } finally { await soltarConexao(); }
  })().finally(() => { verificando = null; });
  return verificando;
}

/* Vercel: função não tem relógio entre as requisições. Checa no máximo 1x por INTERVALO, depois de responder (waitUntil). */
function agendarChecagem(waitUntil) {
  if (!estado || verificando || Date.now() - ultimaChecagem < INTERVALO_MS) return;
  ultimaChecagem = Date.now();
  const p = verificar();
  if (typeof waitUntil === "function") waitUntil(p);
}

function responderConsulta(e, corpo, txt) {
  if (corpo && corpo.v && e.meta && corpo.v !== e.meta.gerado_em)
    return { status: 409, corpo: JSON.stringify({ erro: "versao", atual: e.meta.gerado_em }) };
  let r = e.cacheResp.get(txt);
  if (!r) {
    r = JSON.stringify(e.motor.consultar(corpo));
    e.cacheResp.set(txt, r);
    if (e.cacheResp.size > 400) e.cacheResp.delete(e.cacheResp.keys().next().value);
  }
  return { status: 200, corpo: r };
}

/* arquivo do pacote que o navegador pode baixar (JSON), já comprimido uma vez só */
function arquivoPublico(e, nome) {
  if (!PUBLICOS.has(nome) || !e.arquivos[nome]) return null;
  let gz = e.cacheGz.get(nome);
  if (!gz) { gz = zlib.gzipSync(e.arquivos[nome], { level: 6 }); e.cacheGz.set(nome, gz); }
  return { bruto: e.arquivos[nome], gz };
}

function infoVersao(e, extra) {
  return Object.assign({}, e.meta, { fonte: Object.assign({ origem: e.origem, versao: e.versao, carregado_em: e.carregadoEm, aviso_banco: avisoBanco }, extra || {}) });
}

function estadoAtual() { return estado; }

module.exports = { garantir, carregar, verificar, agendarChecagem, responderConsulta, arquivoPublico, infoVersao, estadoAtual, PUBLICOS, NA_VERCEL, INTERVALO_MS, DADOS };
