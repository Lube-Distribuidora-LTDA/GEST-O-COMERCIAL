/* GET /api/versao — carimbo da carga no ar e de onde veio. ?verificar=1 pergunta ao banco agora (botão Atualizar da tela). */
"use strict";
const P = require("../pacote.js");
const { responder } = require("./_comum.js");

module.exports = async function (req, res) {
  if (req.method !== "GET") return responder(res, 405, { erro: "use GET" });
  try {
    const url = new URL(req.url, "http://x");
    await P.garantir();
    if (url.searchParams.get("verificar")) await P.verificar();
    responder(res, 200, P.infoVersao(await P.garantir(), { fotos: "miniaturas do banco (trade.produto_miniatura), geradas pela carga" }));
  } catch (err) {
    console.error("[versao]", err && err.message || err);
    responder(res, 503, { erro: "dados indisponíveis agora" });
  }
};
