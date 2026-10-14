/* =============================================================================
 * servidor_local.js — roda a Gestão Comercial na própria máquina (ou na VM).
 *
 *   node servidor_local.js            (porta 8700, só nesta máquina; PORT=xxxx troca a porta, HOST=0.0.0.0 abre para a rede)
 *
 * Os DADOS vêm do banco (DATA WAREHOUSE, schema trade) pelo pacote.js, o mesmo módulo que as funções da Vercel usam: o ETL
 * (etl/sync_trade.py) grava o pacote lá e este servidor lê a versão no ar, monta o motor em memória e responde /api/consulta.
 * A cada minuto pergunta ao banco se saiu versão nova e troca sozinho. Se o banco não responder, abre com a cópia local
 * (web/dados/) e diz isso em /api/versao.
 *
 * As FOTOS dos produtos vêm direto da pasta FOTOS_ION (P:\FOTOS_ION), em miniatura (cache em web/cache_img). Isto só existe
 * aqui: na Vercel a pasta não é visível e a tela esconde a foto.
 * ========================================================================== */
"use strict";

const http = require("http");
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");
const P = require("./pacote.js");
const fonte = require("./fonte_dados.js");

const PORTA = +process.env.PORT || 8700;
const HOST = process.env.HOST || "127.0.0.1";     // só esta máquina; HOST=0.0.0.0 abre para a rede (dado nominal: só de propósito)
const RAIZ = __dirname;
const CACHE_IMG = path.join(RAIZ, "cache_img");

const MIME = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8", ".png": "image/png", ".svg": "image/svg+xml", ".woff2": "font/woff2",
  ".ico": "image/x-icon", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".txt": "text/plain; charset=utf-8",
};
// o que nunca é entregue ao navegador
const BLOQUEADOS = [/^\/dados\/venda\.bin\.gz$/, /^\/dados\/imagens\.json$/, /^\/motor\.js$/, /^\/servidor_local\.js$/, /^\/fonte_dados\.js$/, /^\/pacote\.js$/,
  /^\/api\//, /^\/package/, /^\/node_modules\//, /^\/db\//, /^\/cache_img\//, /^\/middleware\.ts$/, /^\/sentinela-guarda\.ts$/, /^\/vercel\.json$/, /^\/\./];

/* ------------------------------ respostas ------------------------------ */
function gz(req, res, tipo, corpo, extra) {
  const h = Object.assign({ "Content-Type": tipo, "Cache-Control": "no-cache", "X-Content-Type-Options": "nosniff" }, extra || {});
  const buf = Buffer.isBuffer(corpo) ? corpo : Buffer.from(corpo);
  if (/gzip/.test(req.headers["accept-encoding"] || "") && buf.length > 900) {
    h["Content-Encoding"] = "gzip"; h["Vary"] = "Accept-Encoding";
    res.writeHead(200, h); res.end(zlib.gzipSync(buf, { level: 5 }));
  } else { res.writeHead(200, h); res.end(buf); }
}

/* arquivo do pacote que está na memória (dims, estoque, entradas, cc, historico, meta) */
function doPacote(req, res, e, nome) {
  const a = P.arquivoPublico(e, nome);
  const h = { "Content-Type": MIME[".json"], "Cache-Control": "no-cache", "X-Content-Type-Options": "nosniff", "Vary": "Accept-Encoding" };
  if (/gzip/.test(req.headers["accept-encoding"] || "")) { h["Content-Encoding"] = "gzip"; res.writeHead(200, h); return res.end(a.gz); }
  res.writeHead(200, h); res.end(a.bruto);
}

const cacheGzEstatico = new Map();
function estatico(req, res, url) {
  let rel = decodeURIComponent(url.pathname);
  if (rel === "/") rel = "/index.html";
  if (BLOQUEADOS.some(r => r.test(rel))) { res.writeHead(404); return res.end("não encontrado"); }
  const e = P.estadoAtual();
  if (e && /^\/dados\/[\w.-]+\.json$/.test(rel) && P.arquivoPublico(e, rel.slice(7))) return doPacote(req, res, e, rel.slice(7));
  const arq = path.normalize(path.join(RAIZ, rel));
  if (!arq.startsWith(RAIZ)) { res.writeHead(403); return res.end(); }
  fs.stat(arq, (err, st) => {
    if (err || !st.isFile()) { res.writeHead(404); return res.end("não encontrado"); }
    const tipo = MIME[path.extname(arq).toLowerCase()] || "application/octet-stream";
    const chave = arq + st.mtimeMs;
    if (/^(text|application\/json)/.test(tipo) && cacheGzEstatico.has(chave) && /gzip/.test(req.headers["accept-encoding"] || "")) {
      res.writeHead(200, { "Content-Type": tipo, "Content-Encoding": "gzip", "Vary": "Accept-Encoding", "Cache-Control": "no-cache" });
      return res.end(cacheGzEstatico.get(chave));
    }
    fs.readFile(arq, (e2, buf) => {
      if (e2) { res.writeHead(500); return res.end("erro"); }
      if (/^(text|application\/json)/.test(tipo) && buf.length > 900 && /gzip/.test(req.headers["accept-encoding"] || "")) {
        const z = zlib.gzipSync(buf, { level: 6 });
        cacheGzEstatico.set(chave, z);
        res.writeHead(200, { "Content-Type": tipo, "Content-Encoding": "gzip", "Vary": "Accept-Encoding", "Cache-Control": "no-cache" });
        return res.end(z);
      }
      res.writeHead(200, { "Content-Type": tipo, "Cache-Control": "no-cache" });
      res.end(buf);
    });
  });
}

function carregando(res) {
  res.writeHead(503, { "Content-Type": "text/html; charset=utf-8", "Retry-After": "3", "Refresh": "3" });
  res.end('<!doctype html><meta charset="utf-8"><title>Gestão Comercial</title><body style="font:16px system-ui;background:#0b1730;color:#e9eefb;display:grid;place-items:center;height:100vh;margin:0">' +
    '<div style="text-align:center"><h2 style="margin:0 0 8px">Carregando os dados…</h2><p style="opacity:.7;margin:0">Montando a base de venda na memória. A página abre sozinha.</p></div></body>');
}

function lerCorpo(req, limite = 2e6) {
  return new Promise((ok, erro) => {
    let n = 0; const partes = [];
    req.on("data", c => { n += c.length; if (n > limite) { erro(new Error("corpo grande demais")); req.destroy(); } else partes.push(c); });
    req.on("end", () => ok(Buffer.concat(partes).toString("utf8")));
    req.on("error", erro);
  });
}

/* ------------------------------ fotos: direto da pasta FOTOS_ION ------------------------------ */
let sharp = null;
try { sharp = require("sharp"); sharp.concurrency(2); } catch (e) { console.warn("sharp não está instalado: as fotos saem no tamanho original (rode npm install em web/)"); }

let pastaFotosCache = { dir: null, quando: 0 };
function pastaFotos() {
  const agora = Date.now();
  if (pastaFotosCache.dir && agora - pastaFotosCache.quando < 300000) return pastaFotosCache.dir;
  if (!pastaFotosCache.dir && agora - pastaFotosCache.quando < 30000 && pastaFotosCache.quando) return null;     // não martela a rede
  // o caminho de rede (se houver) vem do ENV (TRADE_FOTOS); nenhum endereço de servidor fica no código
  const candidatas = [process.env.FOTOS_DIR, process.env.IMAGENS_DIR, fonte.variavel("TRADE_FOTOS"), "P:\\FOTOS_ION"].filter(Boolean);
  let achada = null;
  for (const c of candidatas) { try { if (fs.statSync(c).isDirectory()) { achada = c; break; } } catch (e) { /* próxima */ } }
  pastaFotosCache = { dir: achada, quando: agora };
  return achada;
}

const miniaturas = new Map();       // chave -> Promise<caminho>, para duas telas pedindo a mesma foto não gerarem duas vezes
function miniatura(origem, mtimeMs, cod, w) {
  const dest = path.join(CACHE_IMG, `${cod}-${w}-${Math.floor(mtimeMs)}.webp`);
  if (fs.existsSync(dest)) return Promise.resolve(dest);
  if (miniaturas.has(dest)) return miniaturas.get(dest);
  fs.mkdirSync(CACHE_IMG, { recursive: true });
  const p = sharp(origem, { failOn: "none" }).rotate().resize({ width: w, height: w, fit: "inside", withoutEnlargement: true })
    .webp({ quality: 82 }).toFile(dest + ".tmp").then(() => { fs.renameSync(dest + ".tmp", dest); return dest; })
    .finally(() => miniaturas.delete(dest));
  miniaturas.set(dest, p);
  return p;
}

async function servirFoto(res, cod, w) {
  const e = P.estadoAtual();
  const nome = e && e.imagens[cod];
  const dir = pastaFotos();
  const origem = nome && dir ? path.join(dir, path.basename(nome)) : null;     // basename: o nome vem do banco e não pode sair da pasta
  let st = null;
  if (origem) { try { st = fs.statSync(origem); } catch (e2) { st = null; } }
  if (!st) {                                                    // pasta fora do ar nesta máquina: a miniatura que o ETL guardou no banco
    try {
      const webp = nome ? await fonte.miniatura(cod) : null;
      if (webp) { res.writeHead(200, { "Content-Type": "image/webp", "Cache-Control": "public, max-age=3600" }); return res.end(webp); }
    } catch (e4) { console.error(`[foto ${cod}] miniatura do banco falhou:`, e4.message); }
    res.writeHead(404); return res.end();
  }
  if (sharp) {
    try {
      const arq = await miniatura(origem, st.mtimeMs, cod, w);
      res.writeHead(200, { "Content-Type": "image/webp", "Cache-Control": "public, max-age=3600" });
      return fs.createReadStream(arq).pipe(res);
    } catch (e3) { console.error(`[foto ${cod}] miniatura falhou, mandando o original:`, e3.message); }
  }
  res.writeHead(200, { "Content-Type": MIME[path.extname(origem).toLowerCase()] || "image/png", "Cache-Control": "public, max-age=3600" });
  fs.createReadStream(origem).pipe(res);
}

/* ------------------------------ servidor ------------------------------ */
http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://x");
  try {
    if (url.pathname === "/api/consulta" && req.method === "POST") {
      const e = P.estadoAtual();                                 // a versão pode trocar no meio; esta consulta termina na que começou
      if (!e) { res.writeHead(503, { "Content-Type": "application/json" }); return res.end('{"erro":"sem dados"}'); }
      const txt = await lerCorpo(req);
      const r = P.responderConsulta(e, JSON.parse(txt), txt);
      if (r.status !== 200) { res.writeHead(r.status, { "Content-Type": "application/json", "Cache-Control": "no-store" }); return res.end(r.corpo); }
      return gz(req, res, "application/json; charset=utf-8", r.corpo);
    }
    const mi = /^\/img\/(\d{1,9})$/.exec(url.pathname);
    if (mi) {
      const w = Math.min(1200, Math.max(64, Math.round((+url.searchParams.get("w") || 480) / 16) * 16));
      return servirFoto(res, +mi[1], w);
    }
    if (url.pathname === "/api/versao") {
      if (url.searchParams.get("verificar")) await P.verificar();          // botão "atualizar": pergunta ao banco agora
      const e = P.estadoAtual();
      if (!e) { res.writeHead(503, { "Content-Type": "application/json" }); return res.end('{"erro":"sem dados"}'); }
      return gz(req, res, "application/json; charset=utf-8", JSON.stringify(P.infoVersao(e, { fotos: pastaFotos() ? "ok" : "pasta FOTOS_ION fora do ar" })));
    }
    if (req.method !== "GET" && req.method !== "HEAD") { res.writeHead(405); return res.end(); }
    if (!P.estadoAtual() && (url.pathname === "/" || url.pathname === "/index.html" || url.pathname.startsWith("/dados/"))) return carregando(res);
    return estatico(req, res, url);
  } catch (e) {
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ erro: String(e && e.message || e) }));
  }
}).listen(PORTA, HOST, () => {
  console.log(`Gestão Comercial em http://${HOST === "0.0.0.0" ? "<esta-máquina>" : "localhost"}:${PORTA}`);
  P.carregar().catch(e => console.error("falha ao montar o pacote:", e && e.stack || e)).then(() => setInterval(P.verificar, P.INTERVALO_MS));
});
