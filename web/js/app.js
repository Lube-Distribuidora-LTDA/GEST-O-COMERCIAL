/* =============================================================================
 * app.js — inicialização, menu, rotas, busca global, tema, modo apresentação.
 * ========================================================================== */
(function () {
"use strict";
var L = window.L;

var tokRender = 0;

/* ------------------------------ hash (link da visão) ------------------------------ */
L.sincronizarHash = L.debounce(function () {
  var h = "#/" + L.estado.pagina + "?f=" + encodeURIComponent(JSON.stringify(L.estado.filtros));
  try { history.replaceState(null, "", h); } catch (e) {}
}, 200);
function lerHash() {
  var m = /^#\/([\w-]+)(?:\?(.*))?$/.exec(location.hash || ""), out = { pagina: null, filtros: null, dossie: null };
  if (!m) return out;
  out.pagina = m[1];
  (m[2] || "").split("&").forEach(function (kv) {
    var i = kv.indexOf("="); if (i < 0) return;
    var k = kv.slice(0, i), v = decodeURIComponent(kv.slice(i + 1));
    try { if (k === "f") out.filtros = JSON.parse(v); if (k === "d") out.dossie = JSON.parse(v); } catch (e) {}
  });
  return out;
}

/* ------------------------------ menu ------------------------------ */
function construirMenu() {
  var nav = L.limpar(L.$("menu-itens")), grupos = [], vistos = {};
  L.ordemPaginas.forEach(function (id) { var g = L.paginas[id].grupo; if (!vistos[g]) { vistos[g] = 1; grupos.push(g); } });
  grupos.forEach(function (g) {
    nav.appendChild(L.h("div", { class: "grupo-menu", text: g }));
    L.ordemPaginas.filter(function (id) { return L.paginas[id].grupo === g; }).forEach(function (id) {
      var p = L.paginas[id];
      nav.appendChild(L.h("button", { class: "item-menu", type: "button", "data-p": id, html: L.ic(p.icone) + "<span>" + L.esc(p.menu || p.titulo) + "</span>", onclick: function () { L.irPara(id); document.body.classList.remove("menu-aberto"); } }));
    });
  });
  var D = L.D, M = L.META;
  L.$("menu-rodape").innerHTML =
    '<div><span class="vivo"></span><b>Dados até ' + L.fData(D.corte.ate) + "</b></div>" +
    "<div>Carga de " + L.fDataHora(M.gerado_em) + "</div>" +
    "<div>" + L.fInt(M.linhas_venda) + " linhas de venda</div>" +
    "<div>versão " + (window.VERSAO || "") + "</div>";
}
function marcarMenu() {
  document.querySelectorAll(".item-menu").forEach(function (b) { b.classList.toggle("ativo", b.dataset.p === L.estado.pagina); });
}

/* ------------------------------ rotas e renderização ------------------------------ */
L.irPara = function (id, params) {
  if (!L.paginas[id]) return;
  var mudou = L.estado.pagina !== id;
  L.estado.pagina = id; L.estado.params = params || {};
  if (L.dossieAberto && L.dossieAberto()) L.fecharDossie();
  if (mudou) { L.construirFiltros(); marcarMenu(); }
  L.sincronizarHash();
  renderizar();
  window.scrollTo({ top: 0 });
};

function renderizar() {
  // sem os dados (ainda carregando, ou a carga falhou) não há o que desenhar: quem explica é a tela de erro da carga,
  // e não um "undefined" de dentro de uma página
  if (!L.D) return;
  var pag = L.paginaAtual(), tok = ++tokRender, cont = L.$("conteudo");
  L.$("titulo").textContent = pag.titulo; L.$("olho").textContent = pag.olho || "";
  document.title = pag.titulo + " — Gestão Comercial · Lube";
  L.fila.length = 0;
  var espera = L.espera(pag.espera || "Calculando a visão…");
  var raiz = L.h("div", { class: "pagina oculta" });
  L.limpar(cont); cont.appendChild(espera); cont.appendChild(raiz);
  Promise.resolve().then(function () { return pag.render(raiz, L.estado.params || {}); }).then(function () {
    if (tok !== tokRender) return;
    espera.remove(); raiz.classList.remove("oculta");
    L.executarFila();
  }).catch(function (e) {
    if (tok !== tokRender || (e && e.name === "AbortError")) return;
    console.error(e);
    L.limpar(cont); cont.appendChild(L.erroTela("Não foi possível montar esta tela", (e && e.message) || String(e)));
  });
}
L.ouvir("filtros", function () { renderizar(); });

/* ------------------------------ busca global ------------------------------ */
function iniciarBusca() {
  var inp = L.$("busca-global"), box = L.$("busca-box"), pop = null;
  var tipos = [["cliente", "Clientes"], ["produto", "Produtos"], ["fornecedor", "Fornecedores"], ["rca", "RCAs"], ["comprador", "Compradores"], ["depto", "Departamentos"], ["categoria", "Categorias"], ["marca", "Marcas"], ["equipe", "Equipes"], ["ramo", "Ramos"], ["municipio", "Municípios"]];
  function fechar() { if (pop) { pop.remove(); pop = null; } }
  function buscar() {
    var q = L.norm(inp.value).split(/\s+/).filter(Boolean);
    fechar();
    if (!q.length) return;
    var grupos = [];
    tipos.forEach(function (t) {
      var itens = L.DIM[t[0]].itens(), achou = [];
      for (var i = 0; i < itens.length && achou.length < 5; i++) { var n = itens[i].n; if (q.every(function (x) { return n.indexOf(x) >= 0; })) achou.push(itens[i]); }
      if (achou.length) grupos.push([t, achou]);
    });
    pop = L.h("div", { class: "pop", style: { width: "420px", maxHeight: "70vh" } });
    var lista = L.h("div", { class: "pop-lista" });
    if (!grupos.length) lista.appendChild(L.h("div", { class: "pop-vazio", text: "Nada encontrado para “" + inp.value + "”" }));
    var primeiro = null;
    grupos.forEach(function (g) {
      lista.appendChild(L.h("div", { class: "grupo-menu", style: { padding: "10px 10px 4px" }, text: g[0][1] }));
      g[1].forEach(function (x) {
        var b = L.h("button", { class: "pop-item", type: "button", onclick: function () { fechar(); inp.value = ""; inp.blur(); L.abrirDossie({ dim: g[0][0], id: x.id }); } },
          L.h("span", { class: "tx", text: x.t, title: x.t }), x.s ? L.h("span", { class: "cn", text: x.s.length > 26 ? x.s.slice(0, 25) + "…" : x.s }) : null);
        if (!primeiro) primeiro = b;
        lista.appendChild(b);
      });
    });
    pop.appendChild(lista); pop._primeiro = primeiro;
    var r = box.getBoundingClientRect();
    pop.style.left = Math.max(8, Math.min(innerWidth - 428, r.left)) + "px"; pop.style.top = (r.bottom + 6) + "px";
    document.body.appendChild(pop);
  }
  inp.addEventListener("input", L.debounce(buscar, 120));
  inp.addEventListener("keydown", function (ev) {
    if (ev.key === "Enter" && pop && pop._primeiro) pop._primeiro.click();
    if (ev.key === "Escape") { fechar(); inp.value = ""; inp.blur(); }
  });
  document.addEventListener("mousedown", function (ev) { if (pop && !pop.contains(ev.target) && !box.contains(ev.target)) fechar(); });
  document.addEventListener("keydown", function (ev) {
    if (ev.key === "/" && !/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName)) { ev.preventDefault(); inp.focus(); }
  });
}

/* ------------------------------ tema, apresentação, link, atualizar ------------------------------ */
function aplicarTema(t) {
  document.documentElement.setAttribute("data-tema", t);
  try { localStorage.setItem("gc-tema", t); } catch (e) {}
  L.estado.tema = t;
  L.$("btn-tema").innerHTML = L.ic(t === "escuro" ? "sol" : "lua");
  setTimeout(L.redesenharTudo, 30);
}
function apresentar(on) {
  L.estado.apresentando = on;
  document.body.classList.toggle("apresentando", on);
  if (on && document.documentElement.requestFullscreen) document.documentElement.requestFullscreen().catch(function () {});
  if (!on && document.fullscreenElement) document.exitFullscreen().catch(function () {});
  setTimeout(L.redesenharTudo, 120);
}
function navegarPaginas(d) {
  var i = L.ordemPaginas.indexOf(L.estado.pagina) + d;
  if (i >= 0 && i < L.ordemPaginas.length) L.irPara(L.ordemPaginas[i]);
}
function atualizarDados() {
  fetch("api/versao?verificar=1&_=" + Date.now(), { cache: "no-store" }).then(function (r) { return r.json(); }).then(function (m) {
    if (m.gerado_em !== L.META.gerado_em) { L.toast("Há dados novos — recarregando…", "ok"); setTimeout(function () { location.reload(); }, 600); }
    else { L.limparCacheConsulta(); renderizar(); L.toast("Os dados já estão na carga mais recente (" + L.fDataHora(m.gerado_em) + ")", "ok"); }
  }).catch(function () { L.toast("Não foi possível consultar a carga", "erro"); });
}

/* ------------------------------ início ------------------------------ */
function iniciar() {
  L.$("ic-busca").innerHTML = L.ic("busca");
  L.$("btn-menu").innerHTML = L.ic("menu");
  L.$("btn-apresentar").innerHTML = L.ic("maximizar");
  L.$("btn-link").innerHTML = L.ic("link");
  L.$("btn-atualizar").innerHTML = L.ic("relogio");
  aplicarTema(document.documentElement.getAttribute("data-tema") || "escuro");
  L.$("btn-tema").addEventListener("click", function () { aplicarTema(L.estado.tema === "escuro" ? "claro" : "escuro"); });
  L.$("btn-menu").addEventListener("click", function () { document.body.classList.toggle("menu-aberto"); });
  L.$("btn-apresentar").addEventListener("click", function () { apresentar(!L.estado.apresentando); });
  L.$("btn-link").addEventListener("click", function () {
    var url = location.href.split("#")[0] + "#/" + L.estado.pagina + "?f=" + encodeURIComponent(JSON.stringify(L.estado.filtros));
    (navigator.clipboard ? navigator.clipboard.writeText(url) : Promise.reject()).then(function () { L.toast("Link desta visão copiado", "ok"); }, function () { L.toast("Não foi possível copiar o link", "erro"); });
  });
  L.$("btn-atualizar").addEventListener("click", atualizarDados);
  document.addEventListener("keydown", function (ev) {
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName)) return;
    if (ev.key === "f" || ev.key === "F") { if (!L.dossieAberto()) apresentar(!L.estado.apresentando); }
    if (L.estado.apresentando && !L.dossieAberto()) { if (ev.key === "ArrowRight") navegarPaginas(1); if (ev.key === "ArrowLeft") navegarPaginas(-1); }
  });
  document.addEventListener("fullscreenchange", function () { if (!document.fullscreenElement && L.estado.apresentando) { L.estado.apresentando = false; document.body.classList.remove("apresentando"); setTimeout(L.redesenharTudo, 120); } });

  var cont = L.$("conteudo");
  cont.appendChild(L.espera("Carregando as bases…"));
  L.carregarTudo().then(function () {
    construirMenu(); iniciarBusca();
    var h = lerHash();
    L.estado.pagina = h.pagina && L.paginas[h.pagina] ? h.pagina : L.ordemPaginas[0];
    L.estado.filtros = h.filtros || { ano: [L.anoAtual] };
    L.construirFiltros(); marcarMenu();
    renderizar();
    if (h.dossie) setTimeout(function () { L.abrirDossie(h.dossie); }, 400);
  }).catch(function (e) {
    console.error(e);
    L.limpar(cont); cont.appendChild(L.erroTela("Não foi possível carregar os dados", (e && e.message) || String(e)));
  });
}
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", iniciar); else iniciar();
})();
