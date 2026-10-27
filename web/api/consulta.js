/* POST /api/consulta — aplica o pedido da tela ao motor em memória (mesmo código do servidor local, via pacote.js). */
"use strict";
const P = require("../pacote.js");
const { responder, lerCorpo, waitUntil } = require("./_comum.js");

module.exports = async function (req, res) {
  if (req.method !== "POST") return responder(res, 405, { erro: "use POST" });
  try {
    const e = await P.garantir();                                  // 1ª chamada de uma instância: lê o pacote do banco (~10 s)
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
  } catch (err) {
    console.error("[consulta]", err && err.message || err);
    responder(res, 503, { erro: "dados indisponíveis agora" });
  }
};
