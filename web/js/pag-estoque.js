/* =============================================================================
 * pag-estoque.js — Ruptura, Sem venda, Cobertura e Imagens.
 * Base: um produto por linha (estoque, entradas, venda das últimas 8 semanas),
 * já carregada no navegador — os filtros respondem na hora.
 * ========================================================================== */
(function () {
"use strict";
var L = window.L;
var FILTROS_EST = ["comprador", "fornecedor", "depto", "categoria"];
var MAIS_EST = ["subcategoria", "marca", "produto", "status", "promo"];

function soma(a, f) { var s = 0; for (var i = 0; i < a.length; i++) s += f(a[i]) || 0; return s; }
function filtrar() { var f = L.estado.filtros; return L.EST.filter(function (e) { return L.passaProduto(e, f); }); }
/* valor do estoque conforme a base escolhida: custo financeiro (padrão) ou preço ÷ 1,35 (regra do original) */
function valorBase(e) { return Math.max(0, L.estado.baseValor === "pf" ? e.valor_pf : e.valor_custo); }
function segBase() {
  var s = L.h("div", { class: "seg", title: "Como o estoque é valorizado" });
  [["custo", "Custo real"], ["pf", "Preço ÷ 1,35"]].forEach(function (o) {
    s.appendChild(L.h("button", { type: "button", class: (L.estado.baseValor || "custo") === o[0] ? "on" : "", text: o[1], onclick: function () { L.estado.baseValor = o[0]; L.emitir("filtros"); } }));
  });
  return s;
}
function dataCarga() { return L.fData(L.D.ref); }

/* ------------------------------ tabela em árvore: comprador › fornecedor › produto ------------------------------ */
L.arvore = function (cfg) {
  var D = L.D, raiz = L.h("div", { class: "tb-wrap livre" });
  var tab = L.h("table", { class: "tabela" }), cab = L.h("tr");
  cab.appendChild(L.h("th", { class: "f1", text: cfg.rotuloNome || "Comprador › fornecedor › produto" }));
  cfg.colunas.forEach(function (c) { cab.appendChild(L.h("th", { class: "d", text: c.titulo, title: c.dica || "" })); });
  tab.appendChild(L.h("thead", null, cab));
  var tb = L.h("tbody"); tab.appendChild(tb); raiz.appendChild(tab);
  var ordCol = cfg.colunas.filter(function (c) { return c.id === cfg.ordem; })[0] || cfg.colunas[0];
  function agrupar(itens, chave) { var m = {}; itens.forEach(function (e) { var k = chave(e); (m[k] = m[k] || []).push(e); }); return Object.keys(m).map(function (k) { return { k: +k, itens: m[k] }; }); }
  function linha(nome, itens, nivel, dim, id, filhos, pai) {
    var tr = L.h("tr", { class: "click" + (nivel ? " nv" + nivel : ""), "data-n": nivel });
    var td = L.h("td", { class: "f1", style: { paddingLeft: (14 + nivel * 22) + "px" } });
    var temFilhos = !!filhos;
    var seta = L.h("span", { class: "arv-seta" + (temFilhos ? "" : " vazia"), html: temFilhos ? L.ic("dir") : "" });
    td.appendChild(seta);
    if (dim === "produto") td.appendChild(L.fotoMini(id));
    td.appendChild(L.h("span", { class: "arv-nome" + (nivel === 0 ? " forte" : ""), text: nome, title: nome }));
    var go = L.h("button", { class: "arv-abrir", type: "button", title: "Abrir o relatório", html: L.ic("externo"), onclick: function (ev) { ev.stopPropagation(); L.cliqueDim(dim, id, ev); } });
    td.appendChild(go); tr.appendChild(td);
    cfg.colunas.forEach(function (c) {
      var v = c.valor(itens), txt = c.fmt ? c.fmt(v, itens) : String(v);
      var cel = L.h("td", { class: "d" + (c.classe ? " " + c.classe(v, itens) : "") });
      if (txt && txt.html != null) cel.innerHTML = txt.html; else cel.textContent = txt;
      tr.appendChild(cel);
    });
    var aberto = false, linhasFilhas = [];
    tr.addEventListener("click", function () {
      if (!temFilhos) { L.cliqueDim(dim, id); return; }
      aberto = !aberto; seta.classList.toggle("aberta", aberto);
      if (aberto) {
        var ref = tr;
        filhos().forEach(function (f) { ref.after(f); ref = f; linhasFilhas.push(f); });
      } else { linhasFilhas.forEach(function (f) { fechar(f); }); linhasFilhas = []; }
    });
    return tr;
  }
  function fechar(tr) { // remove a linha e tudo que estiver abaixo dela (níveis maiores)
    var n = +tr.dataset.n;
    while (tr.nextSibling && +tr.nextSibling.dataset.n > n) tr.nextSibling.remove();
    tr.remove();
  }
  var comps = agrupar(cfg.itens, function (e) { return e.comp; }).sort(function (a, b) { return ordCol.valor(b.itens) - ordCol.valor(a.itens); });
  comps.forEach(function (c) {
    tb.appendChild(linha(L.nomeDe("comprador", c.k), c.itens, 0, "comprador", c.k, function () {
      return agrupar(c.itens, function (e) { return e.forn; }).sort(function (a, b) { return ordCol.valor(b.itens) - ordCol.valor(a.itens); }).filter(function (f) { return ordCol.valor(f.itens) > 0 || cfg.mostrarZerados; }).map(function (f) {
        return linha(L.nomeDe("fornecedor", f.k), f.itens, 1, "fornecedor", f.k, function () {
          return f.itens.slice().sort(function (a, b) { return ordCol.valor([b]) - ordCol.valor([a]); }).filter(function (p) { return ordCol.valor([p]) > 0 || cfg.mostrarZerados; }).map(function (p) { return linha(p.desc, [p], 2, "produto", p.p, null); });
        });
      });
    }));
  });
  var tot = L.h("tr", { class: "tot", "data-n": -1 }, L.h("td", { class: "f1", text: "TOTAL" }));
  cfg.colunas.forEach(function (c) { var v = c.valor(cfg.itens), t = c.fmt ? c.fmt(v, cfg.itens) : String(v); var td = L.h("td", { class: "d" }); if (t && t.html != null) td.innerHTML = t.html; else td.textContent = t; tot.appendChild(td); });
  tb.insertBefore(tot, tb.firstChild);
  return raiz;
};

/* ============================================================================
 * RUPTURA
 * ========================================================================= */
L.registrarPagina({
  id: "ruptura", titulo: "Ruptura de estoque", olho: "Estoque e abastecimento", grupo: "Estoque", icone: "alerta", filtros: FILTROS_EST, mais: MAIS_EST,
  render: function (raiz) {
    var D = L.D, C = L.cores(), lista = filtrar();
    var base = lista.filter(function (e) { return e.base; }), rup = base.filter(function (e) { return e.rup; });
    var semRup = base.length - rup.length;
    var vendaSem = soma(lista, function (e) { return e.venda56; }) / 8, perdida = soma(rup, function (e) { return e.venda56; }) / 8;
    var pct = L.div(rup.length, base.length), pPerda = L.div(perdida, vendaSem);
    raiz.appendChild(L.kpis(
      L.kpi({ icone: "caixa", rot: "SKUs ativos", valor: base.length, fmt: L.fInt, leg: L.h("span", { text: "ativos e não promocionais · " + L.fInt(lista.filter(function (e) { return e.ativo; }).length) + " ativos no total" }) }),
      L.kpi({ icone: "alerta", rot: "Itens em ruptura", valor: rup.length, fmt: L.fInt, classe: rup.length ? "perigo" : "zero", leg: L.h("span", { text: "estoque zerado e comprado nos últimos 12 meses" }) }),
      L.kpi({ icone: "percent", rot: "% de ruptura", valor: pct == null ? null : pct * 100, fmt: function (v) { return L.fNum(v, 2) + "%"; }, classe: "heroi", leg: L.h("span", { text: L.fInt(semRup) + " itens com estoque" }) }),
      L.kpi({ icone: "dinheiro", rot: "Venda perdida por semana", valor: perdida, fmt: function (v) { return L.fBRL(v, 0); }, classe: perdida ? "atencao" : "zero", leg: L.h("span", { text: "média das 8 semanas dos itens em ruptura" }) }),
      L.kpi({ icone: "tendencia", rot: "% da venda semanal", valor: pPerda == null ? null : pPerda * 100, fmt: function (v) { return L.fNum(v, 2) + "%"; }, leg: L.h("span", { text: "perdida sobre " + L.fAbrev(vendaSem, true) + "/semana" }) })));

    // rosca
    var pRos = L.painel({ titulo: "Com estoque e em ruptura", sub: "SKUs ativos não promocionais", classe: "c-4" });
    var gR = L.h("div"); pRos.corpo.appendChild(gR);
    var fat = [{ rot: "Em ruptura", valor: rup.length, cor: C.perigo, corTexto: "#1b0508" }, { rot: "Com estoque", valor: semRup, cor: C.d[0] }];
    L.graf.rosca(gR, { fatias: fat, fmt: L.fInt, altura: 250, centro: { valor: L.fPct(pct, 1), titulo: "em ruptura" }, dica: function (i, s, f, t) { return { titulo: f.rot, linhas: [{ rot: "SKUs", val: L.fInt(f.valor) }, { rot: "Participação", val: L.fPct(f.valor / t, 2) }], semClique: true }; } });
    pRos.corpo.appendChild(L.graf.legendaLista(fat, L.fInt));

    // por departamento: 100% (ruptura x ok) com total
    var porDep = {}; base.forEach(function (e) { var d = porDep[e.depto] = porDep[e.depto] || { k: e.depto, n: 0, r: 0, venda: 0 }; d.n++; if (e.rup) { d.r++; d.venda += e.venda56 / 8; } });
    var deps = Object.keys(porDep).map(function (k) { return porDep[k]; }).sort(function (a, b) { return b.r - a.r; });
    var pDep = L.painel({ titulo: "Ruptura por departamento", sub: "% dos SKUs do departamento em ruptura", classe: "c-4" });
    var gD = L.h("div"); pDep.corpo.appendChild(gD);
    var depsMostra = deps.filter(function (d) { return d.n >= 5; }).slice(0, 12);
    L.graf.barras100(gD, {
      linhas: depsMostra.map(function (d) { return { rot: L.nomeDe("depto", d.k), k: d.k, partes: [{ rot: "Em ruptura", valor: d.r, cor: C.perigo, corTexto: "#1b0508" }, { rot: "Com estoque", valor: d.n - d.r, cor: C.d[0] }] }; }),
      fmtPct: function (x) { return L.fNum(x, 1) + "%"; }, fmtTotal: function (p) { return L.fInt(p[0].valor) + " de " + L.fInt(p[0].valor + p[1].valor); }, linhaH: 34,
      dica: function (i) { var d = depsMostra[i]; return { titulo: L.nomeDe("depto", d.k), linhas: [{ cor: C.perigo, rot: "Em ruptura", val: L.fInt(d.r) + " · " + L.fPct(d.r / d.n, 1) }, { cor: C.d[0], rot: "Com estoque", val: L.fInt(d.n - d.r) }, { rot: "Venda perdida/semana", val: L.fBRL(d.venda, 0) }] }; },
      aoClicar: function (i) { L.cliqueDim("depto", depsMostra[i].k); },
    });
    pDep.corpo.appendChild(L.graf.legenda([{ rot: "Em ruptura", cor: C.perigo }, { rot: "Com estoque", cor: C.d[0] }]));

    // por fornecedor: ranking
    var porF = {}; rup.forEach(function (e) { var f = porF[e.forn] = porF[e.forn] || { k: e.forn, n: 0, venda: 0 }; f.n++; f.venda += e.venda56 / 8; });
    var forns = Object.keys(porF).map(function (k) { return porF[k]; }).sort(function (a, b) { return b.n - a.n; }).slice(0, 12);
    var pF = L.painel({ titulo: "Fornecedores com mais itens em ruptura", sub: "itens em ruptura e venda semanal perdida", classe: "c-4" });
    var gF = L.h("div"); pF.corpo.appendChild(gF);
    L.graf.barras(gF, { itens: forns.map(function (f) { return { k: f.k, rot: L.nomeDe("fornecedor", f.k), valor: f.n, rotuloValor: L.fInt(f.n) + " · " + L.fAbrev(f.venda, true) + "/sem." }; }), fmt: L.fInt, pct: false, total: rup.length, linhaH: 30, cor: function (i) { return i === 0 ? C.ouro : C.perigo; },
      dica: function (i) { var f = forns[i]; return { titulo: L.nomeDe("fornecedor", f.k), linhas: [{ rot: "Itens em ruptura", val: L.fInt(f.n) }, { rot: "Venda perdida/semana", val: L.fBRL(f.venda, 0) }, { rot: "% das rupturas", val: L.fPct(f.n / rup.length, 1) }] }; },
      aoClicar: function (i, s, ev) { L.cliqueDim("fornecedor", forns[i].k, ev); } });

    // matriz por comprador (árvore)
    var colsArv = [
      { id: "tot", titulo: "Total SKUs", dica: "Produtos de revenda ativos e fora de linha", valor: function (it) { return it.length; }, fmt: L.fInt },
      { id: "base", titulo: "SKUs ativos", dica: "Ativos e não promocionais", valor: function (it) { return it.filter(function (e) { return e.base; }).length; }, fmt: L.fInt },
      { id: "rup", titulo: "Em ruptura", valor: function (it) { return it.filter(function (e) { return e.rup; }).length; }, fmt: L.fInt },
      { id: "pr", titulo: "% ruptura", valor: function (it) { var b = it.filter(function (e) { return e.base; }).length, r = it.filter(function (e) { return e.rup; }).length; return b ? r / b : null; }, fmt: function (v) { return v == null ? "—" : L.fPct(v, 2); } },
      { id: "pv", titulo: "% da venda semanal", valor: function (it) { var t = soma(it, function (e) { return e.venda56; }), r = soma(it.filter(function (e) { return e.rup; }), function (e) { return e.venda56; }); return t ? r / t : null; }, fmt: function (v) { return v == null ? "—" : L.fPct(v, 2); } },
      { id: "vr", titulo: "Venda perdida/sem.", valor: function (it) { return soma(it.filter(function (e) { return e.rup; }), function (e) { return e.venda56; }) / 8; }, fmt: function (v) { return L.fBRL(v, 0); } },
    ];
    var pMat = L.painel({ titulo: "Ruptura por comprador, fornecedor e produto", sub: "clique na linha para abrir o nível seguinte · ↗ abre o relatório", classe: "c-12", semPad: true, corpo: L.arvore({ itens: lista.filter(function (e) { return e.ativo; }), colunas: colsArv, ordem: "rup" }) });

    // lista de produtos
    var linhasP = rup.map(function (e) { return e; });
    var hoje = new Date(D.ref);
    var tab = L.tabela({
      titulo: "Itens em ruptura", arquivo: "ruptura", aba: "Ruptura", linhas: linhasP, rank: true, porPagina: 25, ordem: { id: "perda", desc: true },
      buscaTexto: function (r) { return r.cod + " " + r.desc + " " + r.ean + " " + L.nomeDe("fornecedor", r.forn); },
      colunas: [
        { id: "desc", titulo: "Produto", tipo: "texto", valor: function (r) { return r.desc; } },
        { id: "cod", titulo: "Código", tipo: "texto", valor: function (r) { return String(r.cod); }, ordVal: function (r) { return r.cod; } },
        { id: "forn", titulo: "Fornecedor", tipo: "texto", valor: function (r) { return L.nomeDe("fornecedor", r.forn); } },
        { id: "comp", titulo: "Comprador", tipo: "texto", valor: function (r) { return L.nomeDe("comprador", r.comp); }, essencial: false },
        { id: "dep", titulo: "Departamento", tipo: "texto", valor: function (r) { return L.nomeDe("depto", r.depto); }, essencial: false },
        { id: "perda", titulo: "Venda perdida/sem.", tipo: "moedaInt", valor: function (r) { return r.venda56 / 8; }, barra: true, exportarTipo: "moeda", corBarra: "rgba(255,107,116,.18)" },
        { id: "ult", titulo: "Última entrada", tipo: "data", valor: function (r) { return r.ult; } },
        { id: "pend", titulo: "Pedido pendente", tipo: "inteiro", valor: function (r) { return r.pend; }, essencial: false },
        { id: "tot", titulo: "Estoque", tipo: "inteiro", valor: function (r) { return r.total; }, essencial: false },
      ],
      foto: function (r) { return r.p; },
      aoClicar: function (r, ev) { L.cliqueDim2("produto", r.p, ev); },
      totais: function (res) { return [{ rot: "Itens em ruptura", valor: L.fInt(res.total), pri: true }, { rot: "Venda perdida por semana", valor: L.fBRL(perdida, 0) }, { rot: "Com pedido pendente", valor: L.fInt(linhasP.filter(function (e) { return e.pend > 0; }).length) }]; },
    });
    var pLista = L.painel({ titulo: "Itens em ruptura", sub: "maior venda perdida primeiro · clique em um item para abrir o relatório dele", classe: "c-12", semPad: true, corpo: tab });

    // histórico
    var h = L.HIST || [], pHist = L.painel({ titulo: "Evolução do % de ruptura", sub: "uma foto por carga, por comprador", classe: "c-12" });
    if (h.length >= 2) {
      var gH = L.h("div"); pHist.corpo.appendChild(gH);
      // o histórico é guardado por CÓDIGO de comprador (o índice das dimensões muda a cada carga); -1 = sem comprador
      var comps = {}; h.forEach(function (x) { Object.keys(x.comprador).forEach(function (k) { comps[k] = x.comprador[k].nome || ("Comprador " + k); }); });
      var ser = Object.keys(comps).map(function (k, i) { return { nome: comps[k], cor: C.d[i % 8], valores: h.map(function (x) { var c = x.comprador[k]; return c && c.skus ? c.rup / c.skus * 100 : null; }) }; });
      L.graf.linhas(gH, { categorias: h.map(function (x) { return L.fData(x.data).slice(0, 5); }), series: ser, tipo: "pct", fmt: function (v) { return L.fNum(v, 1) + "%"; }, altura: 260 });
      pHist.corpo.appendChild(L.graf.legenda(ser.map(function (s) { return { rot: s.nome, cor: s.cor }; })));
    } else {
      pHist.corpo.appendChild(L.h("div", { class: "vazio", html: "<b>O histórico começa agora</b>Cada carga grava a foto do dia (" + L.fData(h.length ? h[0].data : D.ref) + " é a primeira). Com duas fotos o gráfico aparece." }));
    }
    raiz.appendChild(L.grade(pRos, pDep, pF, pMat, pLista, pHist));
    raiz.appendChild(L.nota("Ruptura = produto ativo, não promocional, com entrada de mercadoria nos últimos 365 dias e estoque total disponível zerado (disponível + bloqueado sem avaria, filiais 1, 2, 7, 8 e 10). Venda perdida = vendas das últimas 8 semanas ÷ 8. Foto do estoque de " + dataCarga() + "."));
  },
});

/* ============================================================================
 * SEM VENDA
 * ========================================================================= */
L.registrarPagina({
  id: "semvenda", titulo: "Estoque sem venda", olho: "Estoque e abastecimento", grupo: "Estoque", icone: "lua", filtros: FILTROS_EST, mais: MAIS_EST,
  render: function (raiz) {
    var D = L.D, C = L.cores(), lista = filtrar();
    var ativos = lista.filter(function (e) { return e.ativo; }), sv = ativos.filter(function (e) { return e.sv; });
    var valor = soma(sv, valorBase), valorTotal = soma(ativos, valorBase);
    var pct = L.div(sv.length, ativos.length), fBR0 = function (v) { return L.fBRL(v, 0); };
    raiz.appendChild(L.h("div", { style: { display: "flex", gap: "12px", alignItems: "center", marginBottom: "14px", flexWrap: "wrap" } }, L.h("span", { class: "fx-rot", text: "Estoque valorizado a" }), segBase(),
      L.h("span", { style: { color: "var(--t3)", font: "500 13px var(--f-txt)" }, text: (L.estado.baseValor === "pf" ? "preço de venda ÷ 1,35 (regra do Power BI)" : "custo financeiro do WinThor") })));
    raiz.appendChild(L.kpis(
      L.kpi({ icone: "caixa", rot: "SKUs ativos", valor: ativos.length, fmt: L.fInt, leg: L.h("span", { text: "base do percentual" }) }),
      L.kpi({ icone: "lua", rot: "Itens sem venda", valor: sv.length, fmt: L.fInt, classe: sv.length ? "atencao" : "zero", leg: L.h("span", { text: "com estoque e sem venda há 8 semanas" }) }),
      L.kpi({ icone: "percent", rot: "% sem venda", valor: pct == null ? null : pct * 100, fmt: function (v) { return L.fNum(v, 2) + "%"; }, classe: "heroi", leg: L.h("span", { text: "dos SKUs ativos" }) }),
      L.kpi({ icone: "dinheiro", rot: "Valor parado", valor: valor, fmt: fBR0, classe: valor ? "atencao" : "zero", leg: L.h("span", { text: L.fPct(L.div(valor, valorTotal), 1) + " do estoque ativo" }) }),
      L.kpi({ icone: "camadas", rot: "Estoque ativo", valor: valorTotal, fmt: fBR0, leg: L.h("span", { text: "todos os SKUs ativos" }) })));

    var pRos = L.painel({ titulo: "Itens: com giro e sem venda", sub: "SKUs ativos", classe: "c-4" });
    var gR = L.h("div"); pRos.corpo.appendChild(gR);
    var fat = [{ rot: "Sem venda", valor: sv.length, cor: C.atencao, corTexto: "#1f1200" }, { rot: "Com venda ou lançamento", valor: ativos.length - sv.length, cor: C.d[0] }];
    L.graf.rosca(gR, { fatias: fat, fmt: L.fInt, altura: 250, centro: { valor: L.fPct(pct, 1), titulo: "sem venda" }, dica: function (i, s, f, t) { return { titulo: f.rot, linhas: [{ rot: "SKUs", val: L.fInt(f.valor) }, { rot: "Participação", val: L.fPct(f.valor / t, 2) }], semClique: true }; } });
    pRos.corpo.appendChild(L.graf.legendaLista(fat, L.fInt));

    var porDep = {}; sv.forEach(function (e) { var d = porDep[e.depto] = porDep[e.depto] || { k: e.depto, n: 0, v: 0 }; d.n++; d.v += valorBase(e); });
    var deps = Object.keys(porDep).map(function (k) { return porDep[k]; }).sort(function (a, b) { return b.v - a.v; }).slice(0, 12);
    var pDep = L.painel({ titulo: "Valor parado por departamento", sub: "estoque de itens sem venda", classe: "c-4" });
    var gD = L.h("div"); pDep.corpo.appendChild(gD);
    L.graf.barras(gD, { itens: deps.map(function (d) { return { k: d.k, rot: L.nomeDe("depto", d.k), valor: d.v, rotuloValor: L.fAbrev(d.v, true) + " · " + L.fInt(d.n) + " itens" }; }), fmt: function (v) { return L.fAbrev(v, true); }, pct: false, total: valor, linhaH: 30, cor: function (i) { return i === 0 ? C.ouro : C.atencao; },
      dica: function (i) { var d = deps[i]; return { titulo: L.nomeDe("depto", d.k), linhas: [{ rot: "Valor parado", val: L.fBRL(d.v, 0) }, { rot: "Itens", val: L.fInt(d.n) }, { rot: "% do valor parado", val: L.fPct(d.v / valor, 1) }] }; }, aoClicar: function (i) { L.cliqueDim("depto", deps[i].k); } });

    var porF = {}; sv.forEach(function (e) { var f = porF[e.forn] = porF[e.forn] || { k: e.forn, n: 0, v: 0 }; f.n++; f.v += valorBase(e); });
    var forns = Object.keys(porF).map(function (k) { return porF[k]; }).sort(function (a, b) { return b.v - a.v; }).slice(0, 12);
    var pF = L.painel({ titulo: "Fornecedores com mais valor parado", sub: "estoque de itens sem venda", classe: "c-4" });
    var gF = L.h("div"); pF.corpo.appendChild(gF);
    L.graf.barras(gF, { itens: forns.map(function (f) { return { k: f.k, rot: L.nomeDe("fornecedor", f.k), valor: f.v, rotuloValor: L.fAbrev(f.v, true) + " · " + L.fInt(f.n) + " itens" }; }), fmt: function (v) { return L.fAbrev(v, true); }, pct: false, total: valor, linhaH: 30, cor: function (i) { return i === 0 ? C.ouro : C.atencao; },
      dica: function (i) { var f = forns[i]; return { titulo: L.nomeDe("fornecedor", f.k), linhas: [{ rot: "Valor parado", val: L.fBRL(f.v, 0) }, { rot: "Itens", val: L.fInt(f.n) }] }; }, aoClicar: function (i, s, ev) { L.cliqueDim("fornecedor", forns[i].k, ev); } });

    var colsArv = [
      { id: "tot", titulo: "Total SKUs", valor: function (it) { return it.length; }, fmt: L.fInt },
      { id: "ativ", titulo: "SKUs ativos", valor: function (it) { return it.filter(function (e) { return e.ativo; }).length; }, fmt: L.fInt },
      { id: "sv", titulo: "Sem venda", valor: function (it) { return it.filter(function (e) { return e.sv; }).length; }, fmt: L.fInt },
      { id: "psv", titulo: "% sem venda", valor: function (it) { var a = it.filter(function (e) { return e.ativo; }).length, s = it.filter(function (e) { return e.sv; }).length; return a ? s / a : null; }, fmt: function (v) { return v == null ? "—" : L.fPct(v, 2); } },
      { id: "vl", titulo: "Valor do estoque parado", valor: function (it) { return soma(it.filter(function (e) { return e.sv; }), valorBase); }, fmt: fBR0 },
    ];
    var pMat = L.painel({ titulo: "Sem venda por comprador, fornecedor e produto", sub: "clique na linha para abrir o nível seguinte · ↗ abre o relatório", classe: "c-12", semPad: true, corpo: L.arvore({ itens: lista.filter(function (e) { return e.ativo; }), colunas: colsArv, ordem: "vl" }) });

    var tab = L.tabela({
      titulo: "Itens sem venda", arquivo: "sem-venda", aba: "Sem venda", linhas: sv, rank: true, porPagina: 25, ordem: { id: "vl", desc: true },
      buscaTexto: function (r) { return r.cod + " " + r.desc + " " + r.ean + " " + L.nomeDe("fornecedor", r.forn); },
      colunas: [
        { id: "desc", titulo: "Produto", tipo: "texto", valor: function (r) { return r.desc; } },
        { id: "cod", titulo: "Código", tipo: "texto", valor: function (r) { return String(r.cod); }, ordVal: function (r) { return r.cod; } },
        { id: "forn", titulo: "Fornecedor", tipo: "texto", valor: function (r) { return L.nomeDe("fornecedor", r.forn); } },
        { id: "comp", titulo: "Comprador", tipo: "texto", valor: function (r) { return L.nomeDe("comprador", r.comp); }, essencial: false },
        { id: "tot", titulo: "Estoque", tipo: "inteiro", valor: function (r) { return r.total; } },
        { id: "vl", titulo: "Valor parado", tipo: "moedaInt", valor: valorBase, barra: true, exportarTipo: "moeda", corBarra: "rgba(255,179,64,.18)" },
        { id: "prim", titulo: "1ª entrada", tipo: "data", valor: function (r) { return r.prim; }, essencial: false },
        { id: "ult", titulo: "Última entrada", tipo: "data", valor: function (r) { return r.ult; } },
        { id: "pf", titulo: "Preço de venda", tipo: "moeda", valor: function (r) { return r.preco; }, essencial: false },
      ],
      foto: function (r) { return r.p; },
      aoClicar: function (r, ev) { L.cliqueDim2("produto", r.p, ev); },
      totais: function (res) { return [{ rot: "Itens sem venda", valor: L.fInt(res.total), pri: true }, { rot: "Valor parado", valor: fBR0(valor) }, { rot: "Base de valor", valor: L.estado.baseValor === "pf" ? "Preço ÷ 1,35" : "Custo real" }]; },
    });
    var pLista = L.painel({ titulo: "Itens sem venda", sub: "maior valor parado primeiro", classe: "c-12", semPad: true, corpo: tab });
    raiz.appendChild(L.grade(pRos, pDep, pF, pMat, pLista));
    raiz.appendChild(L.nota("Sem venda = item ativo, com estoque disponível, primeira entrada há mais de 14 dias (não é lançamento) e nenhuma venda nas últimas 8 semanas. O valor usa o custo financeiro do WinThor; “Preço ÷ 1,35” reproduz a aproximação do Power BI antigo, para conferência. Foto do estoque de " + dataCarga() + "."));
  },
});

/* ============================================================================
 * COBERTURA
 * ========================================================================= */
L.registrarPagina({
  id: "cobertura", titulo: "Cobertura de estoque", olho: "Estoque e abastecimento", grupo: "Estoque", icone: "camadas", filtros: FILTROS_EST, mais: MAIS_EST,
  espera: "Cruzando estoque e venda…",
  render: function (raiz) {
    var D = L.D, C = L.cores(), lista = filtrar().filter(function (e) { return e.ativo || e.total > 0; });
    // venda média mensal: 3 meses fechados anteriores ao de corte
    var pm = D.corte.mi, yc = +D.corte.ate.slice(0, 4), mc = +D.corte.ate.slice(5, 7), fechado = D.corte.dia >= new Date(yc, mc, 0).getDate();
    var fim = fechado ? pm : pm - 1, mis = [fim - 2, fim - 1, fim].filter(function (i) { return i >= 0; });
    var f = L.filtrosApi({ ano: null, mes: null, de: null, ate: null, mis: mis }); delete f.cliente; delete f.rca; delete f.uf; delete f.equipe; delete f.ramo; delete f.municipio;
    return L.consultar([{ id: "tot", tipo: "resumo", filtros: f }, { id: "comp", tipo: "agrupar", por: "comprador", filtros: f }, { id: "forn", tipo: "agrupar", por: "fornecedor", filtros: f }, { id: "prod", tipo: "agrupar", por: "produto", filtros: f }], { filtros: {} }).then(function (j) {
      var R = j.resultados, nM = mis.length || 1, rotMis = L.rotMis(mis);
      var vm = function (l) { return l ? l.venda / nM : 0; };
      var mComp = {}, mForn = {}, mProd = {}; R.comp.linhas.forEach(function (l) { mComp[l.k] = l; }); R.forn.linhas.forEach(function (l) { mForn[l.k] = l; }); R.prod.linhas.forEach(function (l) { mProd[l.k] = l; });
      var vendaMes = R.tot.venda / nM;
      // estoque valorizado a preço de venda (mesma base da venda) e a custo
      var vp = function (e) { return Math.max(0, e.total) * (e.preco || 0); };
      var estPreco = soma(lista, vp), estCusto = soma(lista, function (e) { return Math.max(0, e.valor_custo); }), estPf = soma(lista, function (e) { return Math.max(0, e.valor_pf); });
      var cob = L.div(estPreco, vendaMes), cobOrig = L.div(estPf, vendaMes);
      var fBR0 = function (v) { return L.fBRL(v, 0); };
      raiz.appendChild(L.kpis(
        L.kpi({ icone: "camadas", rot: "Estoque a preço de venda", valor: estPreco, fmt: fBR0, classe: "heroi", leg: L.h("span", { text: "a custo: " + L.fAbrev(estCusto, true) }) }),
        L.kpi({ icone: "dinheiro", rot: "Venda média mensal", valor: vendaMes, fmt: fBR0, leg: L.h("span", { text: "3 meses fechados: " + rotMis }) }),
        L.kpi({ icone: "relogio", rot: "Cobertura", valor: cob, fmt: function (v) { return L.fNum(v, 2) + " meses"; }, classe: cob != null && cob > 3 ? "atencao" : "ok", leg: L.h("span", { text: "estoque ÷ venda mensal, na mesma base de preço" }) }),
        L.kpi({ icone: "info", rot: "Cobertura (conta original)", valor: cobOrig, fmt: function (v) { return L.fNum(v, 2) + " meses"; }, classe: "zero", ajuda: "Estoque a preço ÷ 1,35 sobre a venda mensal a preço — a conta do Power BI antigo", leg: L.h("span", { text: "estoque a preço ÷ 1,35 ÷ venda" }) }),
        L.kpi({ icone: "caixa", rot: "SKUs com estoque", valor: lista.filter(function (e) { return e.total > 0; }).length, fmt: L.fInt, leg: L.h("span", { text: L.fInt(lista.length) + " SKUs na análise" }) })));

      var faixa = function (m) { return m == null ? ["—", "neutro"] : m < 1 ? ["Baixa", "perigo"] : m <= 3 ? ["Saudável", "ok"] : ["Excesso", "atencao"]; };
      var corFx = function (m) { return m == null ? C.d[7] : m < 1 ? C.perigo : m <= 3 ? C.ok : C.atencao; };
      // por comprador
      var porC = {}; lista.forEach(function (e) { var c = porC[e.comp] = porC[e.comp] || { k: e.comp, e: 0 }; c.e += vp(e); });
      var comps = Object.keys(porC).map(function (k) { var c = porC[k]; c.v = vm(mComp[c.k]); c.cob = c.v ? c.e / c.v : null; return c; }).sort(function (a, b) { return b.e - a.e; });
      var pC = L.painel({ titulo: "Estoque por comprador", sub: "valor a preço de venda · cobertura em meses", classe: "c-6" });
      var gC = L.h("div"); pC.corpo.appendChild(gC);
      L.graf.barras(gC, { itens: comps.map(function (c) { return { k: c.k, rot: L.nomeDe("comprador", c.k), valor: c.e, cor: corFx(c.cob), rotuloValor: L.fAbrev(c.e, true) + " · " + (c.cob == null ? "—" : L.fNum(c.cob, 1) + " m") }; }), fmt: function (v) { return L.fAbrev(v, true); }, pct: false, linhaH: 36,
        dica: function (i) { var c = comps[i]; return { titulo: L.nomeDe("comprador", c.k), linhas: [{ rot: "Estoque a preço", val: L.fBRL(c.e, 0) }, { rot: "Venda mensal", val: L.fBRL(c.v, 0) }, { rot: "Cobertura", val: c.cob == null ? "—" : L.fNum(c.cob, 2) + " meses" }, { rot: "Faixa", val: faixa(c.cob)[0] }] }; },
        aoClicar: function (i, s, ev) { L.cliqueDim("comprador", comps[i].k, ev); } });
      pC.corpo.appendChild(L.graf.legenda([{ rot: "menos de 1 mês", cor: C.perigo }, { rot: "1 a 3 meses", cor: C.ok }, { rot: "mais de 3 meses", cor: C.atencao }]));

      // rosca: peso do estoque por comprador
      var pRos = L.painel({ titulo: "Quem concentra o estoque", sub: "participação por comprador", classe: "c-6" });
      var gRo = L.h("div"); pRos.corpo.appendChild(gRo);
      var fat = comps.map(function (c, i) { return { rot: L.nomeDe("comprador", c.k), valor: c.e, cor: C.d[i % 8], corTexto: [1, 3].indexOf(i % 8) >= 0 ? "#0b1533" : "#fff", idxOriginal: i }; });
      L.graf.rosca(gRo, { fatias: fat, fmt: function (v) { return L.fAbrev(v, true); }, altura: 250, centro: { valor: L.fAbrev(estPreco, true), titulo: "em estoque" },
        dica: function (i, s, f, t) { return { titulo: f.rot, linhas: [{ rot: "Estoque a preço", val: L.fBRL(f.valor, 0) }, { rot: "Participação", val: L.fPct(f.valor / t, 1) }] }; }, aoClicar: function (i, s, ev) { L.cliqueDim("comprador", comps[i].k, ev); } });
      pRos.corpo.appendChild(L.graf.legendaLista(fat, function (v) { return L.fAbrev(v, true); }, function (i, ev) { L.cliqueDim("comprador", comps[i].k, ev); }));

      // por fornecedor (tabela)
      var porF = {}; lista.forEach(function (e) { var c = porF[e.forn] = porF[e.forn] || { k: e.forn, e: 0, ec: 0, n: 0 }; c.e += vp(e); c.ec += Math.max(0, e.valor_custo); if (e.total > 0) c.n++; });
      var linhasF = Object.keys(porF).map(function (k) { var c = porF[k]; c.v = vm(mForn[c.k]); c.cob = c.v ? c.e / c.v : (c.e > 0 ? Infinity : null); c.comp = c.k >= 0 ? D.fornecedores[c.k][2] : -1; return c; }).filter(function (c) { return c.e > 0 || c.v > 0; });
      var tab = L.tabela({
        titulo: "Cobertura por fornecedor", arquivo: "cobertura-fornecedor", aba: "Cobertura", linhas: linhasF, rank: true, porPagina: 25, ordem: { id: "e", desc: true },
        buscaTexto: function (r) { return L.nomeDe("fornecedor", r.k) + " " + L.nomeDe("comprador", r.comp); },
        colunas: [
          { id: "nome", titulo: "Fornecedor", tipo: "texto", valor: function (r) { return L.nomeDe("fornecedor", r.k); } },
          { id: "comp", titulo: "Comprador", tipo: "texto", valor: function (r) { return L.nomeDe("comprador", r.comp); }, essencial: false },
          { id: "e", titulo: "Estoque a preço", tipo: "moedaInt", valor: function (r) { return r.e; }, barra: true, exportarTipo: "moeda" },
          { id: "ec", titulo: "Estoque a custo", tipo: "moedaInt", valor: function (r) { return r.ec; }, essencial: false, exportarTipo: "moeda" },
          { id: "v", titulo: "Venda mensal", tipo: "moedaInt", valor: function (r) { return r.v; }, exportarTipo: "moeda" },
          { id: "cob", titulo: "Cobertura (meses)", tipo: "num", valor: function (r) { return r.cob === Infinity ? 999 : r.cob; }, fmt: function (v) { return v == null ? "—" : v >= 999 ? "sem venda" : L.fNum(v, 1); } },
          { id: "fx", titulo: "Faixa", tipo: "tag", valor: function (r) { return faixa(r.cob === Infinity ? 999 : r.cob)[0]; }, fmt: function (v, r) { var f = faixa(r.cob === Infinity ? 999 : r.cob); return { html: L.tag(f[0], f[1]) }; }, ord: false },
          { id: "n", titulo: "SKUs c/ estoque", tipo: "inteiro", valor: function (r) { return r.n; }, essencial: false },
        ],
        totais: function (res) { return [{ rot: "Fornecedores", valor: L.fInt(res.total), pri: true }, { rot: "Estoque a preço", valor: fBR0(estPreco) }, { rot: "Venda média mensal", valor: fBR0(vendaMes) }, { rot: "Cobertura", valor: cob == null ? "—" : L.fNum(cob, 2) + " meses" }]; },
        aoClicar: function (r, ev) { if (r.k >= 0) L.cliqueDim2("fornecedor", r.k, ev); },
      });
      var pT = L.painel({ titulo: "Cobertura por fornecedor", sub: "ordene pelas colunas · clique em um fornecedor para abrir o relatório", classe: "c-12", semPad: true, corpo: tab });
      raiz.appendChild(L.grade(pC, pRos, pT));
      raiz.appendChild(L.nota("Cobertura = estoque disponível (a preço de venda) ÷ venda líquida média dos 3 meses fechados (" + rotMis + "), na mesma base de preço. “Conta original” divide o estoque a preço por 1,35 antes de comparar com a venda, como o Power BI antigo — por isso dá um valor menor. O estoque é uma foto de " + dataCarga() + ", não é histórico."));
    });
  },
});

/* ============================================================================
 * IMAGENS
 * ========================================================================= */
L.registrarPagina({
  id: "imagens", titulo: "Produtos sem imagem", olho: "Estoque e abastecimento", grupo: "Estoque", icone: "imagem", filtros: FILTROS_EST, mais: MAIS_EST,
  render: function (raiz) {
    var D = L.D, C = L.cores(), lista = filtrar().filter(function (e) { return e.ativo; });
    var modo = L.estado.imgModo || "sem";
    var com = lista.filter(function (e) { return e.img; }), sem = lista.filter(function (e) { return !e.img; });
    var pct = L.div(com.length, lista.length);
    var segM = L.h("div", { class: "seg" });
    [["sem", "Sem imagem"], ["com", "Com imagem"], ["todas", "Todas"]].forEach(function (o) { segM.appendChild(L.h("button", { type: "button", class: o[0] === modo ? "on" : "", text: o[1], onclick: function () { L.estado.imgModo = o[0]; L.emitir("filtros"); } })); });
    raiz.appendChild(L.kpis(
      L.kpi({ icone: "caixa", rot: "SKUs ativos", valor: lista.length, fmt: L.fInt, leg: L.h("span", { text: "produtos de revenda ativos" }) }),
      L.kpi({ icone: "imagem", rot: "Com imagem", valor: com.length, fmt: L.fInt, classe: "ok", leg: L.h("span", { text: "fotos no banco de imagens" }) }),
      L.kpi({ icone: "alerta", rot: "Sem imagem", valor: sem.length, fmt: L.fInt, classe: sem.length ? "atencao" : "zero", leg: L.h("span", { text: "precisam de foto" }) }),
      L.kpi({ icone: "percent", rot: "% com imagem", valor: pct == null ? null : pct * 100, fmt: function (v) { return L.fNum(v, 1) + "%"; }, classe: "heroi", leg: L.h("span", { text: "cobertura do banco de imagens" }) })));
    var pRos = L.painel({ titulo: "Banco de imagens", sub: "SKUs ativos", classe: "c-4" });
    var gR = L.h("div"); pRos.corpo.appendChild(gR);
    var fat = [{ rot: "Com imagem", valor: com.length, cor: C.d[0] }, { rot: "Sem imagem", valor: sem.length, cor: C.atencao, corTexto: "#1f1200" }];
    L.graf.rosca(gR, { fatias: fat, fmt: L.fInt, altura: 250, centro: { valor: L.fPct(pct, 1), titulo: "com foto" }, dica: function (i, s, f, t) { return { titulo: f.rot, linhas: [{ rot: "SKUs", val: L.fInt(f.valor) }, { rot: "Participação", val: L.fPct(f.valor / t, 1) }], semClique: true }; } });
    pRos.corpo.appendChild(L.graf.legendaLista(fat, L.fInt));
    var porC = {}; sem.forEach(function (e) { porC[e.comp] = (porC[e.comp] || 0) + 1; });
    var comps = Object.keys(porC).map(function (k) { return { k: +k, n: porC[k] }; }).sort(function (a, b) { return b.n - a.n; });
    var pC = L.painel({ titulo: "Sem imagem por comprador", classe: "c-4", sub: "quantidade de SKUs ativos" });
    var gC = L.h("div"); pC.corpo.appendChild(gC);
    L.graf.barras(gC, { itens: comps.map(function (c) { return { k: c.k, rot: L.nomeDe("comprador", c.k), valor: c.n }; }), fmt: L.fInt, total: sem.length, linhaH: 32, cor: function (i) { return i === 0 ? C.ouro : C.atencao; },
      aoClicar: function (i, s, ev) { L.cliqueDim("comprador", comps[i].k, ev); }, dica: function (i) { return { titulo: L.nomeDe("comprador", comps[i].k), linhas: [{ rot: "SKUs sem imagem", val: L.fInt(comps[i].n) }] }; } });
    var porF = {}; sem.forEach(function (e) { porF[e.forn] = (porF[e.forn] || 0) + 1; });
    var forns = Object.keys(porF).map(function (k) { return { k: +k, n: porF[k] }; }).sort(function (a, b) { return b.n - a.n; }).slice(0, 12);
    var pF = L.painel({ titulo: "Fornecedores com mais itens sem imagem", classe: "c-4", sub: "os 12 maiores" });
    var gF = L.h("div"); pF.corpo.appendChild(gF);
    L.graf.barras(gF, { itens: forns.map(function (c) { return { k: c.k, rot: L.nomeDe("fornecedor", c.k), valor: c.n }; }), fmt: L.fInt, total: sem.length, linhaH: 28, cor: function (i) { return i === 0 ? C.ouro : C.atencao; },
      aoClicar: function (i, s, ev) { L.cliqueDim("fornecedor", forns[i].k, ev); }, dica: function (i) { return { titulo: L.nomeDe("fornecedor", forns[i].k), linhas: [{ rot: "SKUs sem imagem", val: L.fInt(forns[i].n) }] }; } });
    var linhas = modo === "sem" ? sem : modo === "com" ? com : lista;
    var tab = L.tabela({
      titulo: "Produtos — " + (modo === "sem" ? "sem imagem" : modo === "com" ? "com imagem" : "todos"), arquivo: "imagens", aba: "Imagens", linhas: linhas, rank: true, porPagina: 25, ordem: { id: "desc", desc: false },
      buscaTexto: function (r) { return r.cod + " " + r.ean + " " + r.desc + " " + L.nomeDe("fornecedor", r.forn); }, buscaDica: "Buscar por código, EAN ou nome…", extraTopo: function () { return segM; },
      colunas: [
        { id: "desc", titulo: "Produto", tipo: "texto", valor: function (r) { return r.desc; } },
        { id: "cod", titulo: "Código", tipo: "texto", valor: function (r) { return String(r.cod); }, ordVal: function (r) { return r.cod; } },
        { id: "ean", titulo: "EAN", tipo: "texto", valor: function (r) { return r.ean || ""; } },
        { id: "forn", titulo: "Fornecedor", tipo: "texto", valor: function (r) { return L.nomeDe("fornecedor", r.forn); } },
        { id: "comp", titulo: "Comprador", tipo: "texto", valor: function (r) { return L.nomeDe("comprador", r.comp); }, essencial: false },
        { id: "dep", titulo: "Departamento", tipo: "texto", valor: function (r) { return L.nomeDe("depto", r.depto); }, essencial: false },
        { id: "img", titulo: "Imagem", tipo: "tag", valor: function (r) { return r.img ? "SIM" : "NÃO"; }, fmt: function (v) { return { html: L.tag(v === "SIM" ? "Sim" : "Não", v === "SIM" ? "ok" : "atencao") }; } },
      ],
      foto: function (r) { return r.p; },
      aoClicar: function (r, ev) { L.cliqueDim2("produto", r.p, ev); },
      totais: function (res) { return [{ rot: "Produtos na lista", valor: L.fInt(res.total), pri: true }, { rot: "% com imagem", valor: L.fPct(pct, 1) }]; },
    });
    raiz.appendChild(L.grade(pRos, pC, pF, L.painel({ titulo: "Lista de produtos", sub: "o banco de imagens vem da pasta do Trade Marketing (um arquivo por código de produto)", classe: "c-12", semPad: true, corpo: tab })));
    raiz.appendChild(L.nota("Um produto tem imagem se existe o arquivo dele (<código>.png, ou .jpg) na pasta FOTOS_ION, a mesma do WinThor; as fotos são lidas direto de lá. Pasta lida na carga de " + dataCarga() + "."));
  },
});

})();
