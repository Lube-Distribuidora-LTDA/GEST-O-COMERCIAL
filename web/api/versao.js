/* GET /api/versao — carimbo da carga no ar e de onde veio. ?verificar=1 pergunta ao banco agora (botão Atualizar da tela).
   ?hoje=1 (a tela pergunta de 15 em 15 s): confere a venda de hoje do AGENTE LUBE antes de responder; a resposta traz
   `hoje` (versão, até quando e os clientes/produtos/RCAs novos que o arquivo ainda não tem) e `bases` (a versão do
   estoque, da conta corrente, das entradas e do histórico que o agente mantém; a tela baixa de novo só o que mudou). */
"use strict";
const P = require("../pacote.js");
const { responder } = require("./_comum.js");

module.exports = async function (req, res) {
  if (req.method !== "GET") return responder(res, 405, { erro: "use GET" });
  try {
    const url = new URL(req.url, "http://x");
    await P.garantir();
    if (url.searchParams.get("verificar")) await P.verificar();
    if (url.searchParams.get("verificar") || url.searchParams.get("hoje")) await Promise.all([P.verificarHoje(), P.verificarBases()]);
    responder(res, 200, P.infoVersao(await P.garantir(), { fotos: "miniaturas do banco (trade.produto_miniatura), geradas pela carga" }));
  } catch (err) {
    console.error("[versao]", err && err.message || err);
    responder(res, 503, { erro: "dados indisponíveis agora" });
  }
};
