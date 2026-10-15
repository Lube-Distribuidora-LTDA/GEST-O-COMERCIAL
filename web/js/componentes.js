/* =============================================================================
 * componentes.js — peças de tela: painel (cartão com título), KPI com
 * comparação, seção, espera e erro.
 * ========================================================================== */
(function () {
"use strict";
var L = window.L;

L.secao = function (texto) { return L.h("div", { class: "sec-tit", text: texto }); };

/* miniatura do produto (índice p de D.produtos): quadradinho branco com a foto; passando o mouse, abre a foto maior.
   Produto sem foto fica com um quadradinho cinza, para as linhas não ficarem desalinhadas. */
var zoomFoto = null;
function fecharZoomFoto() { if (zoomFoto) { zoomFoto.remove(); zoomFoto = null; } }
L.fotoMini = function (p) {
  var e = L.ESTp && L.ESTp[p], d = L.D && L.D.produtos && L.D.produtos[p], cod = d ? d[0] : null;
  var box = L.h("span", { class: "foto-mini" });
  if (!(e && e.img) || cod == null) { box.classList.add("sem"); box.innerHTML = L.ic("imagem"); box.title = "Sem foto na pasta FOTOS_ION"; return box; }
  var url = "img/" + encodeURIComponent(cod);
  var im = L.h("img", { src: url, alt: "", loading: "lazy", decoding: "async" });
  im.addEventListener("error", function () { box.classList.add("sem"); box.innerHTML = L.ic("imagem"); box.onmouseenter = null; });
  box.appendChild(im);
  box.onmouseenter = function () {
    fecharZoomFoto();
    var r = box.getBoundingClientRect(), t = 232, esq = r.right + 12 + t > innerWidth ? r.left - 12 - t : r.right + 12, topo = Math.max(8, Math.min(innerHeight - t - 8, r.top + r.height / 2 - t / 2));
    zoomFoto = L.h("div", { class: "foto-zoom", style: { left: Math.max(8, esq) + "px", top: topo + "px" } }, L.h("img", { src: url, alt: "" }));
    document.body.appendChild(zoomFoto);
  };
  box.onmouseleave = fecharZoomFoto;
  return box;
};
window.addEventListener("scroll", fecharZoomFoto, true);
window.addEventListener("mousedown", fecharZoomFoto, true);
L.grade = function () { var g = L.h("div", { class: "grade" }); for (var i = 0; i < arguments.length; i++) L.add(g, arguments[i]); return g; };

/* painel: cfg { titulo, sub, classe, acoes, corpo, semPad, id } — devolve o elemento; el.corpo é onde o gráfico entra */
L.painel = function (cfg) {
  var cab = L.h("div", { class: "painel-cab" },
    L.h("div", { class: "painel-tit" }, L.h("h3", { text: cfg.titulo }), cfg.sub ? L.h("p", { text: cfg.sub }) : null),
    cfg.acoes ? L.h("div", { class: "painel-acoes" }, cfg.acoes) : null);
  var corpo = L.h("div", { class: "painel-corpo" + (cfg.semPad ? " sem-pad" : "") });
  if (cfg.corpo) L.add(corpo, cfg.corpo);
  var el = L.h("section", { class: "painel " + (cfg.classe || "c-12"), id: cfg.id || null }, cab, corpo);
  el.corpo = corpo; el.cab = cab;
  el.subtitulo = function (t) { var p = cab.querySelector(".painel-tit p"); if (!p) { p = L.h("p"); cab.querySelector(".painel-tit").appendChild(p); } p.textContent = t; };
  return el;
};
L.btnPainel = function (icone, texto, fn, titulo) {
  return L.h("button", { class: "mini-btn", type: "button", title: titulo || texto, onclick: fn, html: L.ic(icone) + (texto ? " " + L.esc(texto) : "") });
};

/* seta de variação: atual contra base. inverso: subir é ruim (devolução, ruptura). pp: diferença em pontos percentuais */
L.delta = function (cfg) {
  var atual = cfg.atual, base = cfg.base, pp = cfg.pp;
  var el = L.h("span", { class: "delta neutro" });
  var x = pp ? (atual != null && base != null ? (atual - base) * 100 : null) : (base ? atual / base - 1 : null);
  if (x == null || !isFinite(x)) { el.textContent = "—"; return el; }
  var valor = pp ? x / 100 : x;
  var sobe = valor > 0.0005, desce = valor < -0.0005;
  var bom = cfg.inverso ? desce : sobe, ruim = cfg.inverso ? sobe : desce;
  el.className = "delta " + (bom ? "up" : ruim ? "down" : "neutro");
  el.innerHTML = (sobe ? L.ic("setaCima") : desce ? L.ic("setaBaixo") : "") + (pp ? (valor > 0 ? "+" : valor < 0 ? "−" : "") + L.fNum(Math.abs(x), 1) + " p.p." : L.fDelta(valor, 1));
  return el;
};

/* linha de comparação de um KPI: “▲ 12,3% vs ano anterior (jan–out/2025)” — clicar abre o período comparado */
L.cmpKpi = function (cfg) {
  // cfg: { atual, aa, pa, cmp, fmt, inverso, pp }
  var linha = L.h("div", { class: "cmp-linha" });
  function item(chave, base, info, rot) {
    if (base == null || !info) return;
    var chip = L.delta({ atual: cfg.atual, base: base, inverso: cfg.inverso, pp: cfg.pp });
    var tx = L.h("small", { class: "link", text: "vs " + info.rot, title: rot + " · " + cfg.fmt(base) + " — clique para abrir esse período" });
    var go = function () { L.estado.filtros.mis = info.mis.slice(); delete L.estado.filtros.ano; delete L.estado.filtros.mes; L.setFiltro("mis", info.mis); L.toast("Período: " + info.rot); };
    tx.addEventListener("click", go); chip.style.cursor = "pointer"; chip.addEventListener("click", go);
    var mv = function (ev) { L.dica.mostrar(ev, { titulo: rot, linhas: [{ rot: info.rot, val: cfg.fmt(base) }, { rot: "Período atual", val: cfg.fmt(cfg.atual) }], clique: "Clique para abrir o período comparado" }); };
    chip.addEventListener("mousemove", mv); chip.addEventListener("mouseleave", L.dica.esconder);
    linha.appendChild(chip); linha.appendChild(tx);
  }
  if (cfg.cmp) {
    item("aa", cfg.aa, cfg.cmp.aa, "vs ano anterior");
    item("pa", cfg.pa, cfg.cmp.pa, "vs período anterior");
  }
  return linha;
};

/* cartão de indicador: cfg { icone, rot, valor, fmt, classe, leg, cmp:{...}, aoClicar, ajuda } */
L.kpi = function (cfg) {
  var num = L.h("div", { class: "val num" });
  var el = L.h(cfg.aoClicar ? "button" : "div", { class: "kpi" + (cfg.classe ? " " + cfg.classe : "") + (cfg.aoClicar ? " click" : ""), type: cfg.aoClicar ? "button" : null, title: cfg.ajuda || null },
    L.h("div", { class: "rot", html: L.ic(cfg.icone || "barras") + "<span>" + L.esc(cfg.rot) + "</span>" }), num);
  var leg = L.h("div", { class: "leg" });
  if (cfg.cmp) leg.appendChild(L.cmpKpi(Object.assign({ fmt: cfg.fmtCmp || cfg.fmt, atual: cfg.valor }, cfg.cmp)));
  if (cfg.leg) L.add(leg, cfg.leg);
  el.appendChild(leg);
  if (cfg.texto != null) num.textContent = cfg.texto;
  else if (cfg.valor == null || !isFinite(cfg.valor)) num.textContent = "—"; else L.contar(num, cfg.valor, cfg.fmt);
  if (cfg.aoClicar) el.addEventListener("click", cfg.aoClicar);
  return el;
};
L.kpis = function () { var g = L.h("div", { class: "kpis" }); for (var i = 0; i < arguments.length; i++) L.add(g, arguments[i]); return g; };

/* esperas */
L.espera = function (texto) {
  var t0 = performance.now();
  var rel = L.h("div", { class: "relogio num", text: "0,0 s" });
  var el = L.h("div", { class: "espera" }, rel, L.h("div", { text: texto || "Calculando a visão…" }));
  var id = setInterval(function () { if (!el.isConnected) return clearInterval(id); rel.textContent = L.fNum((performance.now() - t0) / 1000, 1) + " s"; }, 100);
  return el;
};
L.erroTela = function (msg, detalhe) {
  return L.h("div", { class: "vazio" }, L.h("b", { text: msg }), detalhe || "", L.h("div", { style: { marginTop: "14px" } }, L.h("button", { class: "btn pri", type: "button", text: "Tentar de novo", onclick: function () { L.emitir("filtros"); } })));
};
L.nota = function (texto) { return L.h("div", { class: "nota-rodape", html: L.ic("info") + "<span>" + L.esc(texto) + "</span>" }); };

/* tag de estado */
L.tag = function (texto, tipo) { return '<span class="tag ' + (tipo || "neutro") + '">' + L.esc(texto) + "</span>"; };

})();
