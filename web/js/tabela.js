/* =============================================================================
 * tabela.js — tabela navegável no padrão da casa:
 *   · duas primeiras colunas fixas, cabeçalho fixo, #1 a #3 em ouro;
 *   · barra proporcional atrás da coluna principal;
 *   · botão "Colunas essenciais / Todas";
 *   · paginação 25 / 50 / 100 / tudo e busca;
 *   · totais numa faixa centralizada ACIMA da tabela;
 *   · exporta .xlsx formatado (planilha.js), com os filtros aplicados escritos.
 *
 * Fonte dos dados: cfg.linhas (array, ordenação e busca no navegador) ou
 * cfg.carregar(estado) → Promise<{ total, linhas, totais? }> (ordenação e busca
 * no servidor, usado nas listas grandes de cliente e produto).
 * ========================================================================== */
(function () {
"use strict";
var L = window.L;

var FMT = {
  moeda: function (v) { return L.fBRL(v, 2); },
  moedaInt: function (v) { return L.fBRL(v, 0); },
  inteiro: function (v) { return L.fInt(v); },
  pct: function (v) { return L.fPct(v, 1); },
  num: function (v) { return L.fNum(v, 1); },
  num2: function (v) { return L.fNum(v, 2); },
  data: function (v) { return L.fData(v); },
  texto: function (v) { return v == null ? "" : String(v); },
};
var EXPORT = { moeda: "moeda", moedaInt: "moeda", inteiro: "inteiro", pct: "percentual", num: "inteiro", num2: "moeda", data: "data", texto: "texto" };

L.tabela = function (cfg) {
  var est = { pag: 0, porPag: cfg.porPagina || 25, ord: cfg.ordem ? { id: cfg.ordem.id, desc: cfg.ordem.desc !== false } : null, busca: "", todas: cfg.todasColunas === true };
  var cols = cfg.colunas;
  var chaveCols = "gc-cols-" + (cfg.arquivo || cfg.titulo || "t");
  try { var salvo = JSON.parse(localStorage.getItem(chaveCols) || "null"); if (salvo) est.colsSel = salvo; } catch (e) {}
  var temEssenciais = cols.length > 3;
  var raiz = L.h("div", { class: "tabela-comp" });
  var corpo = L.h("div");
  raiz.appendChild(corpo);
  var ultimo = null, tok = 0;

  /* ---- fonte local ---- */
  function carregarLocal(e) {
    var lin = cfg.linhas.slice();
    if (e.busca && cfg.buscaTexto) {
      var termos = L.norm(e.busca).split(/\s+/).filter(Boolean);
      lin = lin.filter(function (r) { var t = L.norm(cfg.buscaTexto(r)); return termos.every(function (x) { return t.indexOf(x) >= 0; }); });
    }
    if (e.ord) {
      var c = cols.filter(function (x) { return x.id === e.ord.id; })[0];
      if (c) {
        var val = c.ordVal || c.valor;
        lin.sort(function (a, b) {
          var x = val(a), y = val(b);
          if (x == null && y == null) return 0; if (x == null) return 1; if (y == null) return -1;
          var r = typeof x === "string" ? x.localeCompare(y, "pt-BR") : x - y;
          return e.ord.desc ? -r : r;
        });
      }
    }
    var total = lin.length, res = e.porPag ? lin.slice(e.pag * e.porPag, e.pag * e.porPag + e.porPag) : lin;
    return Promise.resolve({ total: total, linhas: res, todas: lin });
  }
  var fonte = cfg.carregar || carregarLocal;

  function ehVisivel(c, i) {
    if (i === 0) return true;                                   // a coluna do nome nunca some
    if (est.colsSel && est.colsSel[c.id] != null) return !!est.colsSel[c.id];
    return est.todas || c.essencial !== false;
  }
  function visiveis() { return cols.filter(ehVisivel); }
  function salvarCols() { try { if (est.colsSel) localStorage.setItem(chaveCols, JSON.stringify(est.colsSel)); else localStorage.removeItem(chaveCols); } catch (e) {} }
  function abrirColunas(ancora) {
    if (L.fecharPopover) L.fecharPopover();
    var pop = L.h("div", { class: "pop", style: { width: "270px" } }), lista = L.h("div", { class: "pop-lista" });
    function marcar() {
      L.limpar(lista);
      cols.forEach(function (c, i) {
        if (i === 0) return;
        var on = ehVisivel(c, i);
        lista.appendChild(L.h("button", { class: "pop-item" + (on ? " on" : ""), type: "button", onclick: function () {
          est.colsSel = est.colsSel || {}; cols.forEach(function (x, j) { if (est.colsSel[x.id] == null) est.colsSel[x.id] = ehVisivel(x, j); });
          est.colsSel[c.id] = !on; salvarCols(); marcar(); desenhar(ultimo);
        } }, L.h("span", { class: "cx" }), L.h("span", { class: "tx", text: c.titulo })));
      });
    }
    marcar();
    pop.appendChild(lista);
    pop.appendChild(L.h("div", { class: "pop-rodape" }, L.h("span", { text: "Escolha as colunas do relatório" }), L.h("button", { class: "mini-btn", type: "button", text: "Padrão", onclick: function () { est.colsSel = null; est.todas = false; salvarCols(); marcar(); desenhar(ultimo); } })));
    document.body.appendChild(pop);
    var r = ancora.getBoundingClientRect(); pop.style.left = Math.max(8, Math.min(innerWidth - 278, r.right - 270)) + "px"; pop.style.top = (r.bottom + 6) + "px";
    var fora = function (ev) { if (!pop.contains(ev.target) && !ancora.contains(ev.target)) { pop.remove(); document.removeEventListener("mousedown", fora, true); } };
    document.addEventListener("mousedown", fora, true);
  }

  function atualizar() {
    var meu = ++tok;
    var req = { pag: est.pag, porPag: est.porPag, ord: est.ord, busca: est.busca };
    Promise.resolve(fonte(req)).then(function (res) {
      if (meu !== tok) return;
      ultimo = res; desenhar(res);
    }).catch(function (e) { if (meu === tok) corpo.innerHTML = '<div class="vazio"><b>Não foi possível carregar</b>' + L.esc(e.message || e) + "</div>"; });
  }

  function desenhar(res) {
    var vis = visiveis(), off = est.pag * (est.porPag || 0);
    L.limpar(corpo);
    // barra de topo: busca + colunas + exportar
    var topo = L.h("div", { class: "tb-topo" });
    if (cfg.busca !== false && (cfg.buscaTexto || cfg.carregar)) {
      var inp = L.h("input", { type: "search", placeholder: cfg.buscaDica || "Buscar por código ou nome…", value: est.busca, autocomplete: "off", spellcheck: "false" });
      var tm;
      inp.addEventListener("input", function () { clearTimeout(tm); tm = setTimeout(function () { est.busca = inp.value; est.pag = 0; atualizar(); }, 220); });
      topo.appendChild(L.h("label", { class: "tb-busca" }, L.icEl("busca"), inp));
      if (est.busca) setTimeout(function () { inp.focus(); inp.setSelectionRange(inp.value.length, inp.value.length); }, 0);
    }
    topo.appendChild(L.h("span", { style: { flex: 1 } }));
    if (cfg.extraTopo) L.add(topo, cfg.extraTopo());
    if (temEssenciais) {
      var custom = !!est.colsSel;
      var seg = L.h("div", { class: "seg" },
        L.h("button", { class: !custom && !est.todas ? "on" : "", text: "Essenciais", onclick: function () { est.colsSel = null; est.todas = false; salvarCols(); desenhar(ultimo); } }),
        L.h("button", { class: !custom && est.todas ? "on" : "", text: "Todas", onclick: function () { est.colsSel = null; est.todas = true; salvarCols(); desenhar(ultimo); } }));
      topo.appendChild(seg);
      topo.appendChild(L.h("button", { class: "mini-btn" + (custom ? " ativo" : ""), type: "button", html: L.ic("tabela") + " Colunas", title: "Escolher as colunas do relatório", onclick: function (ev) { abrirColunas(ev.currentTarget); } }));
    }
    if (cfg.exportar !== false) topo.appendChild(L.h("button", { class: "mini-btn", type: "button", onclick: exportar, html: L.ic("baixar") + " Excel", title: "Baixa em Excel as colunas que estão visíveis (use Todas ou Colunas para incluir mais)" }));
    corpo.appendChild(topo);

    // totais em faixa
    var tot = cfg.totais ? cfg.totais(res) : null;
    if (tot && tot.length) {
      var f = L.h("div", { class: "tb-totais" });
      tot.forEach(function (t) { f.appendChild(L.h("div", { class: "t" + (t.pri ? " pri" : "") }, L.h("small", { text: t.rot }), L.h("b", { class: "num", text: t.valor }))); });
      corpo.appendChild(f);
    }

    if (!res.linhas.length) { corpo.appendChild(L.h("div", { class: "vazio", html: "<b>" + L.esc(cfg.vazioTitulo || "Nada por aqui") + "</b>" + L.esc(cfg.vazio || "Nenhuma linha com os filtros atuais.") })); return; }

    // máximos para barras
    var maxCol = {};
    vis.forEach(function (c) { if (c.barra) maxCol[c.id] = Math.max.apply(null, res.linhas.map(function (r) { var v = c.valor(r); return v > 0 ? v : 0; }).concat([1e-9])); });

    var tab = L.h("table", { class: "tabela" }), tr = L.h("tr");
    var nFix = cfg.rank ? 2 : 1;
    if (cfg.rank) tr.appendChild(L.h("th", { class: "f1 rk", text: "#" }));
    vis.forEach(function (c, i) {
      var th = L.h("th", { class: (c.alinhar === "esq" || c.tipo === "texto" || c.tipo === "tag" ? "" : "d") + ((c.ord !== false) ? " ord" : "") + (i === 0 && cfg.rank ? " f2" : i === 0 ? " f1" : ""), title: c.dica || "" });
      th.appendChild(document.createTextNode(c.titulo));
      if (est.ord && est.ord.id === c.id) th.appendChild(L.h("span", { class: "seta", text: est.ord.desc ? "▼" : "▲" }));
      if (c.ord !== false) th.addEventListener("click", function () {
        est.ord = est.ord && est.ord.id === c.id ? { id: c.id, desc: !est.ord.desc } : { id: c.id, desc: c.tipo !== "texto" };
        est.pag = 0; atualizar();
      });
      tr.appendChild(th);
    });
    tab.appendChild(L.h("thead", null, tr));
    var tb = L.h("tbody");
    res.linhas.forEach(function (r, idx) {
      var rk = off + idx + 1;
      var linha = L.h("tr", { class: (cfg.aoClicar ? "click " : "") + (cfg.rank && rk <= 3 && !est.busca ? "top" + rk : "") });
      if (cfg.rank) linha.appendChild(L.h("td", { class: "f1 rk", text: String(rk) }));
      vis.forEach(function (c, i) {
        var v = c.valor(r, idx), td = L.h("td", { class: (c.alinhar === "esq" || c.tipo === "texto" || c.tipo === "tag" ? "" : "d") + (i === 0 && cfg.rank ? " f2" : i === 0 ? " f1" : "") + (c.classe ? " " + (typeof c.classe === "function" ? c.classe(v, r) : c.classe) : "") });
        var txt = c.fmt ? c.fmt(v, r) : (FMT[c.tipo || "texto"] || FMT.texto)(v);
        var inner;
        if (txt && typeof txt === "object" && txt.html != null) { inner = L.h("span", { html: txt.html }); }
        else inner = document.createTextNode(txt);
        if (c.barra) {
          var bx = L.h("span", { class: "bx", style: { "--p": (v > 0 ? Math.max(1, v / maxCol[c.id] * 100) : 0).toFixed(1) + "%", "--cor-barra": c.corBarra || "" } });
          bx.appendChild(inner); td.appendChild(bx);
        } else td.appendChild(inner);
        if (c.titleTd) td.title = c.titleTd(r);
        else if (c.tipo === "texto" && typeof txt === "string" && txt.length > 28) td.title = txt;
        linha.appendChild(td);
      });
      if (cfg.aoClicar) linha.addEventListener("click", function (ev) { cfg.aoClicar(r, ev); });
      tb.appendChild(linha);
    });
    tab.appendChild(tb);
    var wrap = L.h("div", { class: "tb-wrap" + (cfg.livre ? " livre" : ""), style: cfg.alturaMax ? { maxHeight: cfg.alturaMax + "px" } : {} }, tab);
    corpo.appendChild(wrap);
    // fixar a segunda coluna logo após a primeira
    if (cfg.rank) {
      requestAnimationFrame(function () {
        var th1 = tab.querySelector("th.f1"); if (!th1) return;
        var w = th1.getBoundingClientRect().width;
        tab.querySelectorAll(".f2").forEach(function (x) { x.style.left = w + "px"; });
      });
    }
    // rodapé: paginação
    var pe = L.h("div", { class: "tb-pe" });
    var nPag = est.porPag ? Math.max(1, Math.ceil(res.total / est.porPag)) : 1;
    pe.appendChild(L.h("span", { text: (est.porPag ? (off + 1) + "–" + Math.min(res.total, off + est.porPag) : "1–" + res.total) + " de " + L.fInt(res.total) + (est.busca ? " (busca: “" + est.busca + "”)" : "") }));
    var pg = L.h("div", { class: "pg" });
    if (nPag > 1) {
      pg.appendChild(L.h("button", { class: "mini-btn", text: "‹", disabled: est.pag === 0, onclick: function () { est.pag--; atualizar(); } }));
      pg.appendChild(L.h("span", { class: "mono", text: (est.pag + 1) + " / " + nPag }));
      pg.appendChild(L.h("button", { class: "mini-btn", text: "›", disabled: est.pag >= nPag - 1, onclick: function () { est.pag++; atualizar(); } }));
    }
    var sel = L.h("select", { onchange: function () { est.porPag = +sel.value; est.pag = 0; atualizar(); } });
    [[25, "25 linhas"], [50, "50 linhas"], [100, "100 linhas"], [0, "Tudo"]].forEach(function (o) { var op = L.h("option", { value: o[0], text: o[1] }); if (o[0] === est.porPag) op.selected = true; sel.appendChild(op); });
    pg.appendChild(sel);
    pe.appendChild(pg);
    corpo.appendChild(pe);
  }

  function exportar() {
    var preparar = cfg.exportar && typeof cfg.exportar === "function"
      ? Promise.resolve(cfg.exportar(est))
      : (cfg.carregar ? Promise.resolve(cfg.carregar({ pag: 0, porPag: 0, ord: est.ord, busca: est.busca, exportando: true })).then(function (r) { return r.linhas; })
                      : carregarLocal({ pag: 0, porPag: 0, ord: est.ord, busca: est.busca }).then(function (r) { return r.todas || r.linhas; }));
    preparar.then(function (linhas) {
      var vis = cols.filter(function (c, i) { return c.exportar !== false && ehVisivel(c, i); });
      Planilha.baixar({
        arquivo: (cfg.arquivo || "relatorio") + "-" + new Date().toISOString().slice(0, 10) + ".xlsx",
        titulo: cfg.titulo || "Relatório",
        aba: cfg.aba || "Dados",
        filtros: cfg.filtrosTexto ? cfg.filtrosTexto() : L.descricaoFiltros(),
        colunas: vis.map(function (c) {
          var tipo = c.exportarTipo || EXPORT[c.tipo || "texto"] || "texto";
          return { titulo: c.tituloExp || c.titulo, tipo: tipo, somar: c.somar !== false, valor: function (r, i) { var v = c.exp ? c.exp(r, i) : c.valor(r, i); return tipo === "percentual" && v != null ? v * 100 : v; } };
        }),
        linhas: linhas,
      });
      L.toast("Planilha gerada: " + L.fInt(linhas.length) + " linhas", "ok");
    }).catch(function (e) { L.toast("Não foi possível gerar a planilha: " + (e.message || e), "erro"); });
  }

  raiz.recarregar = function (zerarPag) { if (zerarPag) est.pag = 0; atualizar(); };
  raiz.estado = est;
  atualizar();
  return raiz;
};

/* texto dos filtros aplicados (para a planilha e para o cabeçalho dos relatórios) */
L.descricaoFiltros = function (extra) {
  var out = [], f = L.estado.filtros;
  var D = L.D, cmp = L.misDe(f);
  out.push(["Período", cmp.length ? L.rotMis(cmp) : "—"]);
  out.push(["Dados até", L.fData(D.corte.ate)]);
  Object.keys(L.DIM).forEach(function (k) {
    if (k === "ano" || k === "mes") return;
    var a = f[k]; if (!a || !a.length) return;
    var nomes = a.map(function (id) { return L.nomeDe(k, id); });
    out.push([L.DIM[k].rot, nomes.length > 6 ? nomes.slice(0, 6).join("; ") + " e mais " + (nomes.length - 6) : nomes.join("; ")]);
  });
  if (extra) extra.forEach(function (x) { out.push(x); });
  return out;
};

})();
