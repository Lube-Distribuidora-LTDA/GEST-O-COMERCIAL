/* /api/motor — a função única do painel (desde 2026-10-28). A rota vem em ?r= e as URLs de sempre continuam, por rewrites
   do vercel.json:
     /api/abertura          r=abertura   a abertura da tela numa resposta só: os 6 arquivos pequenos + a versão do servidor
     /api/versao            r=versao     carimbo da carga no ar e de onde veio. ?verificar=1 pergunta ao banco agora (botão
                                         Atualizar). ?hoje=1 (a tela pergunta de 15 em 15 s): confere a venda de hoje do AGENTE
                                         LUBE antes de responder; a resposta traz `hoje` e `bases`
     /dados/<nome>          r=dados      uma das bases pequenas que a tela filtra no navegador (nunca venda.bin.gz nem imagens.json)
     /api/consulta (POST)   r=consulta   aplica o pedido da tela ao motor em memória (mesmo código do servidor local, via pacote.js)
   Por que uma função só: cada arquivo em api/ é uma função com a SUA memória, e cada uma, ao partir a frio, lia o pacote do
   banco (25 MB) e montava o motor (~7 s). Com /dados, /api/versao e /api/consulta separadas, abrir o painel pagava três
   partidas a frio, uma depois da outra (~23 s). Agora é uma. */
"use strict";
const P = require("../pacote.js");
const { responder, lerCorpo, waitUntil } = require("./_comum.js");

const FOTOS = { fotos: "miniaturas do banco (trade.produto_miniatura), geradas pela carga" };

async function abertura(req, res) {
  if (req.method !== "GET") return responder(res, 405, { erro: "use GET" });
  if (!/gzip/.test(req.headers["accept-encoding"] || "")) return responder(res, 406, { erro: "precisa de gzip" });   // a tela baixa os arquivos um a um
  await P.garantir();
  await Promise.all([P.verificarHoje(), P.verificarBases()]);        // como /api/versao?hoje=1: a abertura já vem com o que o agente gravou agora
  const a = P.abertura(await P.garantir(), FOTOS);
  P.agendarChecagem(waitUntil());
  res.setHeader("Cache-Control", "private, no-cache");              // dado nominal: só o navegador de quem entrou, e sempre revalidando
  res.setHeader("ETag", a.etag);
  if (req.headers["if-none-match"] === a.etag) { res.statusCode = 304; return res.end(); }
  res.statusCode = 200;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Content-Encoding", "gzip");
  res.setHeader("Vary", "Accept-Encoding");
  res.end(a.gz);
}

async function versao(req, res, url) {
  if (req.method !== "GET") return responder(res, 405, { erro: "use GET" });
  await P.garantir();
  if (url.searchParams.get("verificar")) await P.verificar();
  if (url.searchParams.get("verificar") || url.searchParams.get("hoje")) await Promise.all([P.verificarHoje(), P.verificarBases()]);
  responder(res, 200, P.infoVersao(await P.garantir(), FOTOS));
}

async function dados(req, res, url) {
  if (req.method !== "GET" && req.method !== "HEAD") return responder(res, 405, { erro: "use GET" });
  const nome = String(url.searchParams.get("nome") || "");
  if (!P.PUBLICOS.has(nome)) return responder(res, 404, { erro: "arquivo não encontrado" });
  const e = await P.garantir();
  await P.conferirBase(e, nome, String(url.searchParams.get("h") || ""));
  const a = P.arquivoPublico(e, nome);
  if (!a) return responder(res, 404, { erro: "arquivo não encontrado" });
  P.agendarChecagem(waitUntil());
  res.statusCode = 200;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "private, no-cache");           // dado nominal: só o navegador de quem entrou, e sempre revalidando
  res.setHeader("Vary", "Accept-Encoding");
  res.setHeader("X-Versao", a.versao);
  if (/gzip/.test(req.headers["accept-encoding"] || "")) { res.setHeader("Content-Encoding", "gzip"); return res.end(a.gz); }
  res.end(a.bruto);
}

async function consulta(req, res) {
  if (req.method !== "POST") return responder(res, 405, { erro: "use POST" });
  const e = await P.garantir();                                  // 1ª chamada de uma instância: lê o pacote do banco
  let txt, corpo;
  if (typeof req.body === "string") { txt = req.body; corpo = JSON.parse(txt); }
  else if (req.body && typeof req.body === "object" && !Buffer.isBuffer(req.body)) { corpo = req.body; txt = JSON.stringify(corpo); }
  else { txt = await lerCorpo(req); corpo = JSON.parse(txt); }
  if (P.precisaHoje(e, corpo)) await P.verificarHoje();          // a tela já viu venda de hoje mais nova que esta cópia
  const r = P.responderConsulta(e, corpo, txt);
  P.agendarChecagem(waitUntil());                                // depois de responder: saiu versão nova?
  res.statusCode = r.status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(r.corpo);
}

const ROTAS = { abertura, versao, dados, consulta };

module.exports = async function (req, res) {
  let rota = "?";
  try {
    const url = new URL(req.url, "http://x");
    rota = String(url.searchParams.get("r") || "");
    if (!Object.prototype.hasOwnProperty.call(ROTAS, rota)) return responder(res, 404, { erro: "rota não encontrada" });
    await ROTAS[rota](req, res, url);
  } catch (err) {
    console.error("[" + rota + "]", err && err.message || err);
    if (!res.headersSent) responder(res, 503, { erro: "dados indisponíveis agora" });
  }
};
