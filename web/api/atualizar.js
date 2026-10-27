/* /api/atualizar — o botão Atualizar pede ao AGENTE LUBE uma leitura do WinThor agora (a ponte é o próprio banco:
   agente.pedir_atualizacao grava o pedido e avisa por NOTIFY; o agente, na SRV-IA, lê na hora e responde em
   agente.pedido). POST pede; GET ?pedido=<id> diz como está. Sem o agente ligado, nada é pedido e a tela confere a carga. */
"use strict";
const fonte = require("../fonte_dados.js");
const { responder } = require("./_comum.js");

module.exports = async function (req, res) {
  try {
    if (req.method === "POST") {
      const l = await fonte.pedirAtualizacao();
      if (!l.pedido) {
        return responder(res, 200, { agente: false, visto_em: l.visto || null,
          mensagem: l.visto ? "O agente do WinThor está em pausa." : "O agente do WinThor não está ligado agora." });
      }
      return responder(res, 200, { agente: true, pedido: Number(l.pedido) });
    }
    if (req.method === "GET") {
      const id = new URL(req.url, "http://x").searchParams.get("pedido");
      if (!/^\d{1,15}$/.test(id || "")) return responder(res, 400, { erro: "pedido inválido" });
      return responder(res, 200, { pedido: await fonte.lerPedido(id) });
    }
    responder(res, 405, { erro: "use POST ou GET" });
  } catch (err) {
    const semAgente = err && (err.code === "42P01" || err.code === "3F000" || err.code === "42883");
    console.error("[atualizar]", err && err.message || err);
    responder(res, semAgente ? 200 : 503, semAgente ? { agente: false, mensagem: "O agente do WinThor ainda não foi instalado." } : { erro: "banco indisponível agora" });
  } finally {
    if (process.env.VERCEL) await fonte.fechar();
  }
};
