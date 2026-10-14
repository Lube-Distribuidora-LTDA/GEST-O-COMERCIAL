/* =============================================================================
 * filtros.js — faixa de filtros (chips com busca), pílulas dos filtros ativos,
 * períodos rápidos e a função única de "mudar filtro" que todo gráfico usa.
 * Regra de clique herdada da casa: o clique troca só a dimensão clicada e mantém
 * o resto; esvaziar volta para "Todos".
 * ========================================================================== */
(function () {
"use strict";
var L = window.L;
var aberto = null;

/* ------------------------------ mudança de filtro ------------------------------ */
var avisar = L.debounce(function () { L.emitir("filtros"); }, 120);
function mudou() { L.sincronizarHash && L.sincronizarHash(); L.atualizarFaixa(); avisar(); }

L.setFiltro = function (chave, ids) {
  if (chave === "ano" || chave === "mes") delete L.estado.filtros.mis;
  if (ids && ids.length) L.estado.filtros[chave] = ids.slice(); else delete L.estado.filtros[chave];
  mudou();
};
L.alternarFiltro = function (chave, id) {
  var a = (L.estado.filtros[chave] || []).slice(), i = a.indexOf(id);
  if (i >= 0) a.splice(i, 1); else a.push(id);
  L.setFiltro(chave, a);
};
L.soFiltro = function (chave, id) { L.setFiltro(chave, [id]); };
L.limparFiltros = function (manterPeriodo) {
  var f = L.estado.filtros, nf = {};
  if (manterPeriodo) { if (f.ano) nf.ano = f.ano; if (f.mes) nf.mes = f.mes; if (f.mis) nf.mis = f.mis; }
  L.estado.filtros = nf; mudou();
};
L.periodoRapido = function (id) {
  var D = L.D, f = L.estado.filtros, pm = D.corte.mi, y = +D.meses[pm].slice(0, 4), m = +D.meses[pm].slice(5, 7);
  delete f.mis; delete f.ano; delete f.mes;
  if (id === "mes") { f.ano = [y]; f.mes = [m]; }
  else if (id === "ano") { f.ano = [y]; }
  else if (id === "tri") { var a = []; for (var i = Math.max(0, pm - 2); i <= pm; i++) a.push(i); f.mis = a; }
  else if (id === "12m") { var b = []; for (var j = Math.max(0, pm - 11); j <= pm; j++) b.push(j); f.mis = b; }
  else if (id === "ant") { f.ano = [y - 1]; }
  mudou();
};
L.periodoAtualId = function () {
  var D = L.D, f = L.estado.filtros, pm = D.corte.mi, y = +D.meses[pm].slice(0, 4), m = +D.meses[pm].slice(5, 7);
  var tem = function (k) { return f[k] && f[k].length; };
  if (tem("mis")) { var n = f.mis.length, ult = f.mis[n - 1]; if (ult === pm && n === 3) return "tri"; if (ult === pm && n === 12) return "12m"; return "custom"; }
  if (tem("ano") && f.ano.length === 1 && f.ano[0] === y && !tem("mes")) return "ano";
  if (tem("ano") && f.ano.length === 1 && f.ano[0] === y && f.mes && f.mes.length === 1 && f.mes[0] === m) return "mes";
  if (tem("ano") && f.ano.length === 1 && f.ano[0] === y - 1 && !tem("mes")) return "ant";
  if (!tem("ano") && !tem("mes") && !tem("mis")) return "tudo";
  return "custom";
};

/* ------------------------------ popover ------------------------------ */
function fechar() { if (aberto) { aberto.el.remove(); document.removeEventListener("mousedown", aberto.fora, true); document.removeEventListener("keydown", aberto.tecla, true); aberto = null; } }
L.fecharPopover = fechar;

function abrir(chave, ancora) {
  if (aberto && aberto.chave === chave) return fechar();
  fechar();
  var dim = L.DIM[chave], itens = dim.itens();
  var el = L.h("div", { class: "pop" });
  var inp = L.h("input", { type: "search", placeholder: "Buscar " + dim.rot.toLowerCase() + "…", autocomplete: "off", spellcheck: "false" });
  var lista = L.h("div", { class: "pop-lista" });
  var rod = L.h("div", { class: "pop-rodape" });
  el.appendChild(L.h("div", { class: "pop-topo" }, inp));
  el.appendChild(lista); el.appendChild(rod);

  function sel() { return L.estado.filtros[chave] || []; }
  function desenhar() {
    var q = L.norm(inp.value).split(/\s+/).filter(Boolean), s = sel(), conj = {}; s.forEach(function (x) { conj[x] = 1; });
    var res = itens.filter(function (x) { return q.every(function (t) { return x.n.indexOf(t) >= 0; }); });
    var marc = [], resto = [];
    res.forEach(function (x) { (conj[x.id] ? marc : resto).push(x); });
    var ordenado = q.length ? res : marc.concat(resto);
    var limite = 140, mostrar = ordenado.slice(0, limite);
    L.limpar(lista);
    if (!mostrar.length) lista.appendChild(L.h("div", { class: "pop-vazio", text: "Nada encontrado" }));
    mostrar.forEach(function (x) {
      var b = L.h("button", { class: "pop-item" + (conj[x.id] ? " on" : ""), type: "button", onclick: function () { L.alternarFiltro(chave, x.id); desenhar(); } },
        L.h("span", { class: "cx" }), L.h("span", { class: "tx", text: x.t, title: x.t }), x.s ? L.h("span", { class: "cn", text: x.s.length > 22 ? x.s.slice(0, 21) + "…" : x.s }) : null);
      lista.appendChild(b);
    });
    if (ordenado.length > limite) lista.appendChild(L.h("div", { class: "pop-vazio", text: "+ " + L.fInt(ordenado.length - limite) + " resultados — refine a busca" }));
    L.limpar(rod);
    rod.appendChild(L.h("span", { text: s.length ? s.length + " selecionado" + (s.length > 1 ? "s" : "") : "Todos" }));
    rod.appendChild(L.h("button", { class: "mini-btn", type: "button", text: "Limpar", onclick: function () { L.setFiltro(chave, []); desenhar(); } }));
  }
  inp.addEventListener("input", desenhar);
  document.body.appendChild(el);
  var r = ancora.getBoundingClientRect(), w = 320;
  el.style.left = Math.max(8, Math.min(innerWidth - w - 8, r.left)) + "px";
  el.style.top = (r.bottom + 6) + "px";
  desenhar();
  setTimeout(function () { inp.focus(); }, 30);
  var fora = function (ev) { if (!el.contains(ev.target) && !ancora.contains(ev.target)) fechar(); };
  var tecla = function (ev) { if (ev.key === "Escape") fechar(); };
  document.addEventListener("mousedown", fora, true); document.addEventListener("keydown", tecla, true);
  aberto = { el: el, chave: chave, fora: fora, tecla: tecla };
}

/* ------------------------------ faixa ------------------------------ */
var rapidos = [["mes", "Mês atual"], ["tri", "3 meses"], ["ano", "Ano atual"], ["12m", "12 meses"], ["ant", "Ano anterior"], ["tudo", "Tudo"]];

L.construirFiltros = function () {
  var pag = L.paginaAtual(), box = L.$("faixa-filtros");
  L.limpar(box);
  box.dataset.pagina = pag.id;
  var lista = pag.filtros || [];
  var temPeriodo = lista.indexOf("ano") >= 0;
  box.appendChild(L.h("span", { class: "fx-rot", html: L.ic("filtro") + " Filtros" }));
  if (temPeriodo) {
    var seg = L.h("div", { class: "seg", id: "fx-rapido" });
    rapidos.forEach(function (r) {
      seg.appendChild(L.h("button", { type: "button", "data-r": r[0], text: r[1], onclick: function () { if (r[0] === "tudo") { delete L.estado.filtros.ano; delete L.estado.filtros.mes; delete L.estado.filtros.mis; L.setFiltro("ano", []); } else L.periodoRapido(r[0]); } }));
    });
    box.appendChild(seg);
  }
  lista.forEach(function (chave) {
    var d = L.DIM[chave];
    var b = L.h("button", { class: "fx-btn", type: "button", "data-k": chave, onclick: function (ev) { abrir(chave, ev.currentTarget); } },
      L.h("span", { text: d.rot }), L.h("span", { class: "n", hidden: true }), L.icEl("baixo"));
    box.appendChild(b);
  });
  var mais = pag.mais || [];
  if (mais.length) {
    box.appendChild(L.h("button", { class: "fx-btn fx-mais", type: "button", onclick: function (ev) { menuMais(mais, ev.currentTarget); } },
      L.h("span", { text: "Mais filtros" }), L.h("span", { class: "n", hidden: true }), L.icEl("baixo")));
  }
  box.appendChild(L.h("button", { class: "fx-limpar", type: "button", text: "Limpar tudo", onclick: function () { L.limparFiltros(false); L.toast("Filtros limpos"); } }));
  box.appendChild(L.h("div", { class: "fx-pilulas", id: "fx-pilulas" }));
  L.atualizarFaixa();
};

function menuMais(lista, ancora) {
  fechar();
  var el = L.h("div", { class: "pop", style: { width: "240px" } }), corpo = L.h("div", { class: "pop-lista" });
  lista.forEach(function (k) {
    var n = (L.estado.filtros[k] || []).length;
    corpo.appendChild(L.h("button", { class: "pop-item" + (n ? " on" : ""), type: "button", onclick: function () { fechar(); abrir(k, ancora); } },
      L.h("span", { class: "tx", text: L.DIM[k].rot }), n ? L.h("span", { class: "cn", text: n + " sel." }) : null));
  });
  el.appendChild(corpo); document.body.appendChild(el);
  var r = ancora.getBoundingClientRect(); el.style.left = Math.max(8, Math.min(innerWidth - 248, r.left)) + "px"; el.style.top = (r.bottom + 6) + "px";
  var fora = function (ev) { if (!el.contains(ev.target) && !ancora.contains(ev.target)) fechar(); };
  var tecla = function (ev) { if (ev.key === "Escape") fechar(); };
  document.addEventListener("mousedown", fora, true); document.addEventListener("keydown", tecla, true);
  aberto = { el: el, chave: "_mais", fora: fora, tecla: tecla };
}

L.atualizarFaixa = function () {
  var box = L.$("faixa-filtros"); if (!box || !box.dataset.pagina) return;
  var pag = L.paginaAtual(), lista = pag.filtros || [], f = L.estado.filtros;
  box.querySelectorAll(".fx-btn").forEach(function (b) {
    var k = b.dataset.k, a = f[k] || [], n = b.querySelector(".n");
    var ativo = a.length > 0 || ((k === "ano" || k === "mes") && f.mis && f.mis.length);
    b.classList.toggle("on", !!ativo);
    if (a.length) { n.hidden = false; n.textContent = a.length; } else n.hidden = true;
  });
  var bm = box.querySelector(".fx-mais");
  if (bm) { var nm = (pag.mais || []).reduce(function (s, k) { return s + (f[k] || []).length; }, 0), nn = bm.querySelector(".n"); bm.classList.toggle("on", nm > 0); nn.hidden = !nm; nn.textContent = nm; }
  var rap = box.querySelector("#fx-rapido");
  if (rap) { var id = L.periodoAtualId(); rap.querySelectorAll("button").forEach(function (b) { b.classList.toggle("on", b.dataset.r === id); }); }
  var pil = L.$("fx-pilulas"); if (!pil) return;
  L.limpar(pil);
  var qtd = 0;
  if (f.mis && f.mis.length && lista.indexOf("ano") >= 0) {
    qtd++;
    pil.appendChild(pilula("Período", L.rotMis(f.mis), function () { delete L.estado.filtros.mis; L.setFiltro("ano", []); }));
  }
  lista.concat(pag.mais || []).forEach(function (k) {
    (f[k] || []).forEach(function (id) {
      qtd++;
      pil.appendChild(pilula(L.DIM[k].rot, L.nomeDe(k, id), function () { L.alternarFiltro(k, id); }));
    });
  });
  pil.style.display = qtd ? "" : "none";
  var nl = box.querySelector(".fx-limpar"); if (nl) nl.style.display = qtd ? "" : "none";
};
function pilula(rot, texto, aoRemover) {
  return L.h("span", { class: "pilula" }, L.h("b", { text: rot }), L.h("span", { text: texto, title: texto }),
    L.h("button", { type: "button", title: "Remover", html: L.ic("x"), onclick: aoRemover }));
}

})();
