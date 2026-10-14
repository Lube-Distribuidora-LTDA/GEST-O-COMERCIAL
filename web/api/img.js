/* GET /img/<código> (reescrito para /api/img?cod=<código>) — foto do produto em miniatura, guardada no banco pelo ETL.
   A Vercel não enxerga a pasta de fotos da rede interna; quem enxerga é o ETL, que grava a miniatura (WebP, 288 px)
   em trade.produto_miniatura. Atrás do guarda da Sentinela, como todo o resto. */
"use strict";
const fonte = require("../fonte_dados.js");
const { responder } = require("./_comum.js");

const recentes = new Map();                 // cod -> { webp, ate }: evita ir ao banco duas vezes pela mesma foto (a miniatura quase não muda)
const VALIDADE_MS = 10 * 60 * 1000;
const MAX_RECENTES = 300;

module.exports = async function (req, res) {
  if (req.method !== "GET" && req.method !== "HEAD") return responder(res, 405, { erro: "use GET" });
  const cod = Number(new URL(req.url, "http://x").searchParams.get("cod"));
  if (!Number.isInteger(cod) || cod <= 0 || cod > 999999999) return responder(res, 404, { erro: "foto não encontrada" });
  try {
    let hit = recentes.get(cod);
    if (!hit || hit.ate < Date.now()) {
      const webp = await fonte.miniatura(cod);
      hit = { webp, ate: Date.now() + VALIDADE_MS };
      recentes.set(cod, hit);
      if (recentes.size > MAX_RECENTES) recentes.delete(recentes.keys().next().value);
    }
    if (!hit.webp) {                        // produto sem foto: a tela esconde a imagem
      res.statusCode = 404;
      res.setHeader("Cache-Control", "private, max-age=300");
      return res.end();
    }
    res.statusCode = 200;
    res.setHeader("Content-Type", "image/webp");
    res.setHeader("Cache-Control", "private, max-age=86400");           // só o navegador de quem entrou; nunca cache compartilhado
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.end(hit.webp);
  } catch (err) {
    console.error("[img]", err && err.message || err);
    responder(res, 503, { erro: "foto indisponível agora" });
  }
};
