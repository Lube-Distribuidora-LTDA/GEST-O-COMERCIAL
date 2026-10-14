/* Utilidades das funções da Vercel (arquivo com "_" no começo não vira rota). Só a API padrão de req/res do Node. */
"use strict";

function responder(res, status, obj, cabecalhos) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");                    // dado nominal: nunca em cache compartilhado
  for (const k in (cabecalhos || {})) res.setHeader(k, cabecalhos[k]);
  res.end(JSON.stringify(obj));
}

function lerCorpo(req, limite = 2e6) {
  return new Promise((ok, erro) => {
    let n = 0; const partes = [];
    req.on("data", c => { n += c.length; if (n > limite) { erro(new Error("corpo grande demais")); req.destroy(); } else partes.push(c); });
    req.on("end", () => ok(Buffer.concat(partes).toString("utf8")));
    req.on("error", erro);
  });
}

/* waitUntil da Vercel: deixa a checagem de versão terminar depois da resposta. Fora da Vercel (testes) não existe: sem efeito. */
function waitUntil() {
  try { return require("@vercel/functions").waitUntil; } catch (e) { return undefined; }
}

module.exports = { responder, lerCorpo, waitUntil };
