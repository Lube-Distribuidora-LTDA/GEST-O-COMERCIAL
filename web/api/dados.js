/* GET /dados/<nome>.json (reescrito para /api/dados?nome=<nome>.json) — as bases pequenas que a tela filtra no navegador.
   Nunca entrega venda.bin.gz (as linhas) nem imagens.json: só o que está na lista do pacote.js. */
"use strict";
const P = require("../pacote.js");
const { responder, waitUntil } = require("./_comum.js");

module.exports = async function (req, res) {
  if (req.method !== "GET" && req.method !== "HEAD") return responder(res, 405, { erro: "use GET" });
  try {
    const nome = String(new URL(req.url, "http://x").searchParams.get("nome") || "");
    if (!P.PUBLICOS.has(nome)) return responder(res, 404, { erro: "arquivo não encontrado" });
    const e = await P.garantir();
    const a = P.arquivoPublico(e, nome);
    if (!a) return responder(res, 404, { erro: "arquivo não encontrado" });
    P.agendarChecagem(waitUntil());
    res.statusCode = 200;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Cache-Control", "private, no-cache");           // dado nominal: só o navegador de quem entrou, e sempre revalidando
    res.setHeader("Vary", "Accept-Encoding");
    if (/gzip/.test(req.headers["accept-encoding"] || "")) { res.setHeader("Content-Encoding", "gzip"); return res.end(a.gz); }
    res.end(a.bruto);
  } catch (err) {
    console.error("[dados]", err && err.message || err);
    responder(res, 503, { erro: "dados indisponíveis agora" });
  }
};
