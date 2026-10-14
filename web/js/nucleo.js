/* =============================================================================
 * nucleo.js — base da Gestão Comercial: DOM, formatos pt-BR, ícones, estado,
 * acesso ao motor, dica (tooltip), toast e animações.
 * Tudo vive no espaço de nomes global L.
 * ========================================================================== */
(function () {
"use strict";
var L = window.L = window.L || {};

/* ------------------------------ DOM ------------------------------ */
L.$ = function (id) { return document.getElementById(id); };
L.h = function (tag, attrs) {
  var el = document.createElement(tag), i, k, v;
  if (attrs) for (k in attrs) {
    v = attrs[k];
    if (v == null || v === false) continue;
    if (k === "class") el.className = v;
    else if (k === "html") el.innerHTML = v;
    else if (k === "text") el.textContent = v;
    else if (k === "style" && typeof v === "object") Object.assign(el.style, v);
    else if (k.slice(0, 2) === "on" && typeof v === "function") el.addEventListener(k.slice(2), v);
    else if (k === "data") for (var d in v) el.dataset[d] = v[d];
    else el.setAttribute(k, v === true ? "" : v);
  }
  for (i = 2; i < arguments.length; i++) L.add(el, arguments[i]);
  return el;
};
L.add = function (pai, f) {
  if (f == null || f === false) return;
  if (Array.isArray(f)) f.forEach(function (x) { L.add(pai, x); });
  else pai.appendChild(typeof f === "object" ? f : document.createTextNode(String(f)));
};
L.limpar = function (n) { while (n.firstChild) n.removeChild(n.firstChild); return n; };
L.esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
L.norm = function (s) { return String(s == null ? "" : s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, ""); };
L.debounce = function (fn, ms) { var t; return function () { var a = arguments, c = this; clearTimeout(t); t = setTimeout(function () { fn.apply(c, a); }, ms); }; };
L.cssVar = function (n) { return getComputedStyle(document.documentElement).getPropertyValue(n).trim(); };

/* ------------------------------ formatos (padrão brasileiro) ------------------------------ */
var nfCache = {};
function nf(d) { return nfCache[d] || (nfCache[d] = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d })); }
L.fNum = function (n, d) { return n == null || isNaN(n) ? "—" : nf(d == null ? 0 : d).format(n); };
L.fInt = function (n) { return L.fNum(Math.round(n || 0), 0); };
L.fBRL = function (n, d) { return n == null || isNaN(n) ? "—" : (n < 0 ? "−" : "") + "R$ " + nf(d == null ? 2 : d).format(Math.abs(n)); };
L.fPct = function (x, d) { return x == null || !isFinite(x) ? "—" : nf(d == null ? 1 : d).format(x * 100) + "%"; };
L.fPct100 = function (x, d) { return x == null || !isFinite(x) ? "—" : nf(d == null ? 1 : d).format(x) + "%"; };
/* abreviado: R$ 850 · R$ 4,62 mil · R$ 14,4 mil · R$ 1,25 mi · R$ 73,59 mi */
L.fAbrev = function (n, moeda, forcaUn) {
  if (n == null || isNaN(n)) return "—";
  var a = Math.abs(n), s = n < 0 ? "−" : "", p = moeda ? "R$ " : "", u = forcaUn || (a >= 1e9 ? "bi" : a >= 1e6 ? "mi" : a >= 1e3 ? "mil" : "");
  if (u === "bi") return s + p + nf(2).format(a / 1e9) + " bi";
  if (u === "mi") return s + p + nf(2).format(a / 1e6) + " mi";
  if (u === "mil") return s + p + nf(a >= 1e4 ? 1 : 2).format(a / 1e3) + " mil";
  return s + p + nf(a < 100 && a % 1 ? (moeda ? 2 : 1) : 0).format(a);
};
L.fMoedaCurta = function (n) { return L.fAbrev(n, true); };
L.fData = function (iso) { return iso ? iso.slice(8, 10) + "/" + iso.slice(5, 7) + "/" + iso.slice(0, 4) : ""; };
L.fDataHora = function (iso) { if (!iso) return ""; var d = new Date(iso); return d.toLocaleDateString("pt-BR") + " " + d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }); };
L.MESES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
L.MES3 = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
L.fMesAno = function (ym) { return L.MES3[+ym.slice(5, 7) - 1] + "/" + ym.slice(2, 4); };
L.fMesLongo = function (ym) { return L.MESES[+ym.slice(5, 7) - 1] + "/" + ym.slice(0, 4); };
L.fDelta = function (x, d) { if (x == null || !isFinite(x)) return "—"; return (x > 0 ? "+" : x < 0 ? "−" : "") + nf(d == null ? 1 : d).format(Math.abs(x) * 100) + "%"; };
L.crescimento = function (atual, base) { return base ? atual / base - 1 : null; };
L.div = function (a, b) { return b ? a / b : null; };

/* escala de eixo com a mesma "língua" do rótulo: se a barra diz R$ 4,6 mil, o eixo diz R$ 4 mil */
L.ticks = function (max, n, min) {
  min = min || 0;
  if (!(max > min)) max = min + 1;
  var span = max - min, bruto = span / (n || 5), mag = Math.pow(10, Math.floor(Math.log10(bruto))), r = bruto / mag;
  var passo = (r <= 1 ? 1 : r <= 2 ? 2 : r <= 2.5 ? 2.5 : r <= 5 ? 5 : 10) * mag;
  var ini = Math.floor(min / passo) * passo, out = [];
  for (var v = ini; v <= max + passo * 0.001; v += passo) out.push(+v.toFixed(10));
  if (out[out.length - 1] < max) out.push(+(out[out.length - 1] + passo).toFixed(10));
  return out;
};
L.fEixo = function (ticks, tipo) {
  var max = Math.max.apply(null, ticks.map(Math.abs)), passo = ticks.length > 1 ? Math.abs(ticks[1] - ticks[0]) : max;
  var esc = tipo === "pct" ? 1 : max >= 1e9 ? 1e9 : max >= 1e6 ? 1e6 : max >= 1e4 ? 1e3 : 1;
  var suf = tipo === "pct" ? "%" : esc === 1e9 ? " bi" : esc === 1e6 ? " mi" : esc === 1e3 ? " mil" : "";
  var dec = 0; var q = passo / esc; while (dec < 3 && Math.abs(q * Math.pow(10, dec) - Math.round(q * Math.pow(10, dec))) > 1e-6) dec++;
  var pre = tipo === "moeda" ? "R$ " : "";
  return function (v) { return (v < 0 ? "−" : "") + pre + nf(dec).format(Math.abs(v) / esc) + suf; };
};

/* ------------------------------ ícones ------------------------------ */
var IC = {
  home: "M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z",
  barras: "M4 20V10M10 20V4M16 20v-7M22 20H2",
  tendencia: "M3 17l6-6 4 4 8-8M15 7h6v6",
  etiqueta: "M20.6 13.4l-7.2 7.2a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8zM7.5 7.5h.01",
  devolucao: "M9 14 4 9l5-5M4 9h10a6 6 0 0 1 0 12h-3",
  tabela: "M3 5h18v14H3zM3 10h18M9 5v14",
  pizza: "M21 12A9 9 0 1 1 12 3v9zM15 3.5A9 9 0 0 1 20.5 9H15z",
  alerta: "M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0zM12 9v4M12 17h.01",
  lua: "M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z",
  camadas: "M12 2 2 7l10 5 10-5zM2 17l10 5 10-5M2 12l10 5 10-5",
  imagem: "M3 4h18v16H3zM3 16l5-5 4 4 3-3 6 6M9 9h.01",
  carteira: "M3 7a2 2 0 0 1 2-2h13v4M3 7v11a2 2 0 0 0 2 2h15V9H5a2 2 0 0 1-2-2zM16 14h.01",
  linha: "M3 3v18h18M7 15l4-5 3 3 5-7",
  filtro: "M3 4h18l-7 8v7l-4 2v-9z",
  calendario: "M4 5h16v16H4zM4 10h16M8 3v4M16 3v4",
  busca: "M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM21 21l-4.3-4.3",
  baixar: "M12 3v12M7 10l5 5 5-5M4 21h16",
  sol: "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4",
  maximizar: "M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5",
  x: "M6 6l12 12M18 6 6 18",
  dir: "M9 6l6 6-6 6", baixo: "M6 9l6 6 6-6", cima: "M6 15l6-6 6 6",
  setaCima: "M12 19V5M5 12l7-7 7 7", setaBaixo: "M12 5v14M19 12l-7 7-7-7",
  externo: "M14 4h6v6M20 4l-9 9M18 14v6H4V6h6",
  info: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 11v5M12 8h.01",
  pessoas: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8",
  caixa: "M21 8l-9-5-9 5v8l9 5 9-5zM3 8l9 5 9-5M12 13v8",
  loja: "M4 9l1.5-5h13L20 9M4 9v11h16V9M4 9a3 3 0 0 0 5.3 2 3 3 0 0 0 5.4 0A3 3 0 0 0 20 9M9 20v-5h6v5",
  pino: "M12 22s7-6.5 7-12a7 7 0 1 0-14 0c0 5.5 7 12 7 12zM12 7a3 3 0 1 0 0 6 3 3 0 0 0 0-6z",
  percent: "M19 5 5 19M7 4a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM17 14a3 3 0 1 0 0 6 3 3 0 0 0 0-6z",
  dinheiro: "M12 2v20M17 6.5C16 5 14.2 4.5 12 4.5c-2.8 0-4.5 1.2-4.5 3.2 0 4.3 9.5 2.2 9.5 6.6 0 2-2 3.2-5 3.2-2.4 0-4.3-.7-5.2-2.2",
  estrela: "M12 2l3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21l1.2-6.8-5-4.9 6.9-1z",
  medidor: "M12 14l4-4M3.3 17a9 9 0 1 1 17.4 0M12 14h.01",
  copiar: "M9 9h11v11H9zM5 15H4V4h11v1",
  link: "M10 14a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1M14 10a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1",
  play: "M6 4l14 8-14 8z",
  menu: "M4 7h16M4 12h16M4 17h16",
  alvo: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10zM12 11a1 1 0 1 0 0 2 1 1 0 0 0 0-2z",
  coroa: "M3 8l4 4 5-7 5 7 4-4-2 11H5zM5 22h14",
  relogio: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 7v5l3 2",
  ordem: "M7 4v16M3 16l4 4 4-4M17 20V4M13 8l4-4 4 4",
  verificar: "M5 12l5 5 9-10",
  cadeado: "M6 11V8a6 6 0 1 1 12 0v3M5 11h14v10H5z",
};
L.ic = function (nome, cls) {
  return '<svg viewBox="0 0 24 24" class="' + (cls || "") + '" aria-hidden="true"><path d="' + (IC[nome] || IC.info) + '"/></svg>';
};
L.icEl = function (nome) { var d = document.createElement("span"); d.innerHTML = L.ic(nome); return d.firstChild; };

/* ------------------------------ registro de telas ------------------------------ */
L.paginas = {};
L.ordemPaginas = [];
L.registrarPagina = function (p) { L.paginas[p.id] = p; L.ordemPaginas.push(p.id); };
L.paginaAtual = function () { return L.paginas[L.estado.pagina] || L.paginas[L.ordemPaginas[0]]; };

/* ------------------------------ estado e eventos ------------------------------ */
L.estado = {
  pagina: "visao",
  filtros: {},                     // chave -> array de ids
  tema: "escuro",
  apresentando: false,
};
var ouvintes = {};
L.ouvir = function (ev, fn) { (ouvintes[ev] = ouvintes[ev] || []).push(fn); };
L.emitir = function (ev, dado) { (ouvintes[ev] || []).forEach(function (f) { try { f(dado); } catch (e) { console.error(e); } }); };

/* filtros ativos -> objeto da API (só os preenchidos) */
L.filtrosApi = function (extra) {
  var f = {}, k, src = L.estado.filtros;
  for (k in src) if (src[k] && src[k].length) f[k] = src[k].slice();
  if (extra) for (k in extra) { if (extra[k] === null) delete f[k]; else f[k] = extra[k]; }
  return f;
};

/* ------------------------------ acesso ao motor ------------------------------ */
var cacheConsulta = new Map();
var controles = {};
L.consultar = function (pedidos, opts) {
  opts = opts || {};
  // v = versão do pacote com que ESTA tela foi montada: se o servidor já trocou de versão, ele recusa (409) em vez de
  // aplicar índices de uma carga a dados de outra
  var corpo = JSON.stringify({ v: L.META && L.META.gerado_em, filtros: opts.filtros || L.filtrosApi(), pedidos: pedidos });
  if (cacheConsulta.has(corpo)) return Promise.resolve(cacheConsulta.get(corpo));
  var canal = opts.canal || "pagina";
  if (controles[canal]) controles[canal].abort();
  var ctl = controles[canal] = new AbortController();
  var t0 = performance.now();
  return fetch("api/consulta", { method: "POST", headers: { "Content-Type": "application/json" }, body: corpo, signal: ctl.signal })
    .then(function (r) {
      if (r.status === 409) { L.versaoMudou(); throw new Error("Há dados novos: a página vai recarregar."); }
      if (!r.ok) throw new Error("O servidor respondeu " + r.status);
      return r.json();
    })
    .then(function (j) {
      j._ms = Math.round(performance.now() - t0);
      for (var k in j.resultados) if (j.resultados[k] && j.resultados[k].erro) throw new Error(j.resultados[k].erro);
      cacheConsulta.set(corpo, j);
      if (cacheConsulta.size > 80) cacheConsulta.delete(cacheConsulta.keys().next().value);
      return j;
    });
};
L.limparCacheConsulta = function () { cacheConsulta.clear(); };

/* o ETL publicou uma carga nova com a tela aberta: recarrega, uma vez só (a tela antiga não serve para a base nova) */
var recarregando = false;
L.versaoMudou = function () {
  if (recarregando) return;
  recarregando = true;
  if (L.toast) L.toast("Há dados novos — recarregando…", "ok");
  setTimeout(function () { location.reload(); }, 900);
};

L.carregarJson = function (nome) {
  return fetch("dados/" + nome).then(function (r) { if (!r.ok) throw new Error("Falta o arquivo dados/" + nome); return r.json(); });
};

/* ------------------------------ dica (tooltip) ------------------------------ */
var dicaEl;
L.dica = {
  mostrar: function (ev, cfg) {
    dicaEl = dicaEl || L.$("dica");
    var h = "";
    if (cfg.titulo) h += '<div class="t">' + L.esc(cfg.titulo) + "</div>";
    (cfg.linhas || []).forEach(function (l) {
      h += '<div class="l"><span>' + (l.cor ? '<i style="background:' + l.cor + '"></i>' : "") + L.esc(l.rot) + "</span><b>" + L.esc(l.val) + "</b></div>";
    });
    if (cfg.extra) h += cfg.extra;
    if (cfg.clique) h += '<div class="dica-clique">' + L.esc(cfg.clique) + "</div>";
    dicaEl.innerHTML = h;
    dicaEl.classList.add("on");
    L.dica.mover(ev);
  },
  mover: function (ev) {
    if (!dicaEl) return;
    var w = dicaEl.offsetWidth, hh = dicaEl.offsetHeight, x = ev.clientX + 16, y = ev.clientY + 16;
    if (x + w > innerWidth - 10) x = ev.clientX - w - 16;
    if (y + hh > innerHeight - 10) y = ev.clientY - hh - 16;
    dicaEl.style.left = Math.max(8, x) + "px"; dicaEl.style.top = Math.max(8, y) + "px";
  },
  esconder: function () { if (dicaEl) dicaEl.classList.remove("on"); },
};

/* ------------------------------ toast ------------------------------ */
L.toast = function (msg, tipo) {
  var box = L.$("toasts"), t = L.h("div", { class: "toast " + (tipo || ""), text: msg });
  box.appendChild(t);
  setTimeout(function () { t.style.transition = "opacity .3s, transform .3s"; t.style.opacity = "0"; t.style.transform = "translateX(40px)"; setTimeout(function () { t.remove(); }, 320); }, 4200);
};

/* ------------------------------ animação de número ------------------------------ */
var reduz = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
L.contar = function (el, valor, fmt, dur) {
  var de = el._v == null ? 0 : el._v;
  el._v = valor;
  if (reduz || document.hidden || valor == null || !isFinite(valor) || de === valor) { el.textContent = fmt(valor); return; }
  var t0 = performance.now(); dur = dur || 800;
  var id = el._anim = (el._anim || 0) + 1;
  (function passo() {
    if (el._anim !== id) return;
    var p = Math.min(1, (performance.now() - t0) / dur), e = 1 - Math.pow(1 - p, 3);
    el.textContent = fmt(de + (valor - de) * e);
    if (p < 1) setTimeout(passo, 16); else el.textContent = fmt(valor);
  })();
};

/* ------------------------------ medir texto (para rótulos que cabem) ------------------------------ */
var ctxTexto;
var cacheMedida = {};
L.medir = function (texto, tam, peso, familia) {
  ctxTexto = ctxTexto || document.createElement("canvas").getContext("2d");
  var fam = familia || '"JetBrains Mono", Consolas, monospace';
  var chave = tam + "|" + peso + "|" + fam + "|" + texto;
  var v = cacheMedida[chave];
  if (v == null) {
    ctxTexto.font = (peso || 700) + " " + tam + "px " + fam;
    v = cacheMedida[chave] = ctxTexto.measureText(texto).width;
    if (Object.keys(cacheMedida).length > 6000) cacheMedida = {};
  }
  return v;
};
L.cortar = function (texto, larg, tam, peso, familia) {
  texto = String(texto == null ? "" : texto);
  if (L.medir(texto, tam, peso, familia) <= larg) return texto;
  var a = 0, b = texto.length;
  while (a < b) { var m = (a + b + 1) >> 1; if (L.medir(texto.slice(0, m) + "…", tam, peso, familia) <= larg) a = m; else b = m - 1; }
  return texto.slice(0, a).trimEnd() + "…";
};

/* ------------------------------ cores ------------------------------ */
L.cores = function () {
  var g = L.cssVar;
  return {
    d: [g("--d1"), g("--d2"), g("--d3"), g("--d4"), g("--d5"), g("--d6"), g("--d7"), g("--d8")],
    ano: { 2022: g("--a2022"), 2023: g("--a2023"), 2024: g("--a2024"), 2025: g("--a2025"), 2026: g("--a2026") },
    ok: g("--ok"), atencao: g("--atencao"), perigo: g("--perigo"), info: g("--info"),
    ouro: g("--ouro"), azul: g("--d1"), t1: g("--t1"), t2: g("--t2"), t3: g("--t3"), eixo: g("--eixo"), linha: g("--linha"), s1: g("--s1"),
  };
};
L.corAno = function (ano) {
  var c = L.cores().ano; if (c[ano]) return c[ano];
  var d = L.cores().d; return d[Math.abs(ano) % d.length];
};

/* ------------------------------ redimensionar: redesenha o que está na tela ------------------------------ */
var registro = [];
L.registrarGrafico = function (box, fn) {
  registro = registro.filter(function (r) { return r.box.isConnected && r.box !== box; });
  registro.push({ box: box, fn: fn, w: box.clientWidth });
};
var reRedesenhar = L.debounce(function () {
  registro = registro.filter(function (r) { return r.box.isConnected; });
  registro.forEach(function (r) { var w = r.box.clientWidth; if (Math.abs(w - r.w) > 2) { r.w = w; r.fn(false); } });
}, 140);
window.addEventListener("resize", reRedesenhar);
L.redesenharTudo = function () { registro = registro.filter(function (r) { return r.box.isConnected; }); registro.forEach(function (r) { r.fn(false); }); };

})();
