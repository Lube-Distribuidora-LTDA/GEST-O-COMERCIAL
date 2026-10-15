/* =============================================================================
 * pag-compras.js — Conta corrente de fornecedor (verba), lançamentos da conta
 * e Custo de compra (evolução do custo de entrada).
 * ========================================================================== */
(function () {
"use strict";
var L = window.L;
function soma(a, f) { var s = 0; for (var i = 0; i < a.length; i++) s += f(a[i]) || 0; return s; }

/* ============================================================================
 * CONTA CORRENTE DE FORNECEDOR
 * ========================================================================= */
function ccFiltrado() {
  var f = L.estado.filtros, at = L.estado.ccAtivo == null ? 1 : L.estado.ccAtivo;
  return L.CCF.filter(function (x) {
    if (f.comprador && f.comprador.length && f.comprador.indexOf(x.comprador) < 0) return false;
    if (f.fornecedor && f.fornecedor.length && f.fornecedor.indexOf(x.fidx) < 0) return false;
    if (at !== "todos" && x.ativo !== at) return false;
    return true;
  });
}
function segAtivo() {
  var at = L.estado.ccAtivo == null ? 1 : L.estado.ccAtivo, s = L.h("div", { class: "seg" });
  [[1, "Ativos"], [0, "Inativos"], ["todos", "Todos"]].forEach(function (o) { s.appendChild(L.h("button", { type: "button", class: o[0] === at ? "on" : "", text: o[1], onclick: function () { L.estado.ccAtivo = o[0]; L.emitir("filtros"); } })); });
  return s;
}

L.registrarPagina({
  id: "cc", titulo: "Conta corrente de fornecedores", olho: "Compras", grupo: "Compras", icone: "carteira", menu: "Conta corrente", filtros: ["comprador", "fornecedor"], mais: [],
  render: function (raiz) {
    var D = L.D, C = L.cores(), forns = ccFiltrado(), nomeComp = function (k) { return L.nomeDe("comprador", k); };
    var saldo = soma(forns, function (x) { return x.saldo; }), deb = soma(forns, function (x) { return x.debito; }), cre = soma(forns, function (x) { return x.credito; });
    var verba = soma(forns, function (x) { return x.verba_media; }), neg = soma(forns, function (x) { return x.negociacao_media; });
    var meses = verba > 0 ? saldo / verba : null, fBR0 = function (v) { return L.fBRL(v, 0); };
    var set = {}; forns.forEach(function (x) { set[x.cod] = 1; });
    raiz.appendChild(L.h("div", { style: { display: "flex", gap: "12px", alignItems: "center", marginBottom: "14px", flexWrap: "wrap" } }, L.h("span", { class: "fx-rot", text: "Fornecedores" }), segAtivo(),
      L.h("span", { style: { color: "var(--t3)", font: "500 13px var(--f-txt)" }, text: "ativo = tem ao menos um produto ativo no cadastro" })));
    raiz.appendChild(L.kpis(
      L.kpi({ icone: "carteira", rot: "Saldo da conta corrente", valor: saldo, fmt: fBR0, classe: "heroi", leg: L.h("span", { text: L.fInt(forns.length) + " fornecedores" }) }),
      L.kpi({ icone: "setaCima", rot: "Débitos acumulados", valor: deb, fmt: fBR0, leg: L.h("span", { text: "tudo que foi lançado a débito" }) }),
      L.kpi({ icone: "setaBaixo", rot: "Créditos acumulados", valor: cre, fmt: fBR0, leg: L.h("span", { text: "tudo que foi abatido" }) }),
      L.kpi({ icone: "tendencia", rot: "Verba média do trimestre", valor: verba, fmt: fBR0, leg: L.h("span", { text: "débitos de verba dos 3 últimos meses fechados ÷ 3" }) }),
      L.kpi({ icone: "relogio", rot: "Meses para pagar a conta", valor: meses, fmt: function (v) { return L.fNum(v, 1) + " meses"; }, classe: meses != null && meses > 6 ? "atencao" : "", leg: L.h("span", { text: "saldo ÷ verba média do trimestre" }) })));

    // por comprador
    var porC = {}; forns.forEach(function (x) { var c = porC[x.comprador] = porC[x.comprador] || { k: x.comprador, s: 0, v: 0, n: 0 }; c.s += x.saldo; c.v += x.verba_media; c.n++; });
    var comps = Object.keys(porC).map(function (k) { return porC[k]; }).sort(function (a, b) { return b.s - a.s; });
    var pC = L.painel({ titulo: "Saldo por comprador", sub: "saldo e meses para pagar", classe: "c-4" });
    var gC = L.h("div"); pC.corpo.appendChild(gC);
    L.graf.barras(gC, { itens: comps.map(function (c) { return { k: c.k, rot: nomeComp(c.k), valor: Math.max(0, c.s), rotuloValor: L.fAbrev(c.s, true) + " · " + (c.v > 0 ? L.fNum(c.s / c.v, 1) + " m" : "—") }; }), fmt: function (v) { return L.fAbrev(v, true); }, pct: false, linhaH: 34, cor: function (i) { return i === 0 ? C.ouro : C.d[0]; },
      dica: function (i) { var c = comps[i]; return { titulo: nomeComp(c.k), linhas: [{ rot: "Saldo", val: L.fBRL(c.s, 0) }, { rot: "Verba média do trimestre", val: L.fBRL(c.v, 0) }, { rot: "Meses para pagar", val: c.v > 0 ? L.fNum(c.s / c.v, 1) : "—" }, { rot: "Fornecedores", val: L.fInt(c.n) }] }; },
      aoClicar: function (i, s, ev) { L.cliqueDim("comprador", comps[i].k, ev); } });

    // maiores saldos
    var top = forns.slice().sort(function (a, b) { return b.saldo - a.saldo; }).slice(0, 12);
    var pT = L.painel({ titulo: "Maiores saldos por fornecedor", sub: "saldo · meses para pagar", classe: "c-4" });
    var gT = L.h("div"); pT.corpo.appendChild(gT);
    L.graf.barras(gT, { itens: top.map(function (x) { return { k: x.fidx, rot: x.nome, valor: Math.max(0, x.saldo), rotuloValor: L.fAbrev(x.saldo, true) + " · " + (x.verba_media > 0 ? L.fNum(x.meses, 1) + " m" : "—") }; }), fmt: function (v) { return L.fAbrev(v, true); }, pct: false, linhaH: 28, cor: function (i) { return i === 0 ? C.ouro : C.d[0]; },
      dica: function (i) { var x = top[i]; return { titulo: x.nome, linhas: [{ rot: "Saldo", val: L.fBRL(x.saldo, 0) }, { rot: "Verba média do trimestre", val: L.fBRL(x.verba_media, 0) }, { rot: "Meses para pagar", val: x.verba_media > 0 ? L.fNum(x.meses, 1) : "—" }] }; },
      aoClicar: function (i) { if (top[i].fidx >= 0) L.abrirDossie({ dim: "fornecedor", id: top[i].fidx, aba: "verba" }); } });

    // faixas de meses para pagar
    var faixas = [["Sem verba", function (x) { return x.verba_media <= 0; }], ["Até 1 mês", function (x) { return x.verba_media > 0 && x.meses <= 1; }], ["1 a 3 meses", function (x) { return x.meses > 1 && x.meses <= 3; }], ["3 a 6 meses", function (x) { return x.meses > 3 && x.meses <= 6; }], ["6 a 12 meses", function (x) { return x.meses > 6 && x.meses <= 12; }], ["Mais de 12", function (x) { return x.meses > 12; }]];
    var fx = faixas.map(function (f) { var it = forns.filter(function (x) { return x.saldo > 0 && f[1](x); }); return { rot: f[0], n: it.length, s: soma(it, function (x) { return x.saldo; }) }; });
    var pF = L.painel({ titulo: "Em quanto tempo a verba paga o saldo", sub: "fornecedores com saldo a favor, por faixa de meses", classe: "c-4" });
    var gF = L.h("div"); pF.corpo.appendChild(gF);
    L.graf.colunas(gF, { categorias: fx.map(function (f) { return f.rot; }), series: [{ nome: "Saldo", valores: fx.map(function (f) { return f.s; }) }], tipo: "moeda", fmt: function (v) { return L.fAbrev(v, true); }, altura: 280, corBarra: function (ci) { return ci >= 4 ? C.atencao : ci === 0 ? C.d[7] : C.d[0]; },
      dica: function (i) { return { titulo: fx[i].rot, linhas: [{ rot: "Saldo", val: L.fBRL(fx[i].s, 0) }, { rot: "Fornecedores", val: L.fInt(fx[i].n) }], semClique: true }; } });

    // lançamentos por mês: débito de negociação x demais; saldo ao final do mês
    var lan = L.CCL.filter(function (x) { return set[x.forn]; });
    var mesesL = {}; lan.forEach(function (x) { var k = x.data.slice(0, 7); var m = mesesL[k] = mesesL[k] || { d: 0, dn: 0, c: 0 }; if (x.tipo === 0) { if (x.negociacao) m.dn += x.valor; else m.d += x.valor; } else m.c += x.valor; });
    var ks = Object.keys(mesesL).sort().slice(-18);
    var pD = L.painel({ titulo: "Débitos de verba por mês", sub: "negociação (ação, campanha, rebaixa, perda, bonificação…) e demais débitos · últimos " + ks.length + " meses", classe: "c-8" });
    var gD = L.h("div"); pD.corpo.appendChild(gD);
    L.graf.colunas(gD, { categorias: ks.map(function (k) { return L.fMesAno(k); }), modo: "empilhado", tipo: "moeda", fmt: function (v) { return L.fAbrev(v, false); }, altura: 300,
      series: [{ nome: "Negociação", cor: C.ouro, corTexto: "#1b1303", valores: ks.map(function (k) { return mesesL[k].dn; }) }, { nome: "Demais débitos", cor: C.d[0], valores: ks.map(function (k) { return mesesL[k].d; }) }],
      dica: function (i) { var m = mesesL[ks[i]]; return { titulo: L.fMesLongo(ks[i]), linhas: [{ cor: C.ouro, rot: "Negociação", val: L.fBRL(m.dn, 0) }, { cor: C.d[0], rot: "Demais débitos", val: L.fBRL(m.d, 0) }, { rot: "Créditos no mês", val: L.fBRL(m.c, 0) }], semClique: true }; } });
    pD.corpo.appendChild(L.graf.legenda([{ rot: "Negociação", cor: C.ouro }, { rot: "Demais débitos", cor: C.d[0] }]));
    // saldo total no fim de cada mês
    var totalFlux = soma(lan, function (x) { return x.tipo === 0 ? x.valor : -x.valor; });
    var acc = saldo - totalFlux, sd = {}; lan.slice().sort(function (a, b) { return a.data < b.data ? -1 : 1; }).forEach(function (x) { acc += x.tipo === 0 ? x.valor : -x.valor; sd[x.data.slice(0, 7)] = acc; });
    var ksd = Object.keys(sd).sort();
    var pS = L.painel({ titulo: "Saldo total mês a mês", sub: "saldo da conta corrente ao fim de cada mês", classe: "c-4" });
    var gS = L.h("div"); pS.corpo.appendChild(gS);
    if (ksd.length > 1) L.graf.linhas(gS, { categorias: ksd.map(L.fMesAno), series: [{ nome: "Saldo", cor: C.ouro, destaque: true, area: true, valores: ksd.map(function (k) { return sd[k]; }) }], tipo: "moeda", fmt: function (v) { return L.fAbrev(v, false); }, altura: 300, rotuloMin: 0, zero: false,
      dica: function (i) { return { titulo: L.fMesLongo(ksd[i]), linhas: [{ rot: "Saldo", val: L.fBRL(sd[ksd[i]], 0) }], semClique: true }; } });

    // tabela de fornecedores
    var tab = L.tabela({
      titulo: "Conta corrente por fornecedor", arquivo: "conta-corrente-fornecedores", aba: "Fornecedores", linhas: forns, rank: true, porPagina: 25, ordem: { id: "saldo", desc: true },
      buscaTexto: function (r) { return r.cod + " " + r.nome + " " + nomeComp(r.comprador); },
      colunas: [
        { id: "nome", titulo: "Fornecedor", tipo: "texto", valor: function (r) { return r.nome; } },
        { id: "cod", titulo: "Código", tipo: "texto", valor: function (r) { return String(r.cod); }, ordVal: function (r) { return r.cod; }, essencial: false },
        { id: "comp", titulo: "Comprador", tipo: "texto", valor: function (r) { return nomeComp(r.comprador); } },
        { id: "saldo", titulo: "Saldo", tipo: "moedaInt", valor: function (r) { return r.saldo; }, barra: true, exportarTipo: "moeda" },
        { id: "deb", titulo: "Débito total", tipo: "moedaInt", valor: function (r) { return r.debito; }, essencial: false, exportarTipo: "moeda" },
        { id: "cre", titulo: "Crédito total", tipo: "moedaInt", valor: function (r) { return r.credito; }, essencial: false, exportarTipo: "moeda" },
        { id: "verba", titulo: "Verba média tri.", tipo: "moedaInt", valor: function (r) { return r.verba_media; }, exportarTipo: "moeda" },
        { id: "meses", titulo: "Meses para pagar", tipo: "num", valor: function (r) { return r.verba_media > 0 ? r.meses : null; } },
        { id: "st", titulo: "Situação", tipo: "tag", valor: function (r) { return r.ativo ? "Ativo" : "Inativo"; }, fmt: function (v) { return { html: L.tag(v, v === "Ativo" ? "ok" : "neutro") }; }, ord: false },
      ],
      totais: function (res) { return [{ rot: "Saldo total", valor: fBR0(saldo), pri: true }, { rot: "Fornecedores", valor: L.fInt(res.total) }, { rot: "Verba média do trimestre", valor: fBR0(verba) }, { rot: "Meses para pagar", valor: meses == null ? "—" : L.fNum(meses, 1) }]; },
      aoClicar: function (r) { if (r.fidx >= 0) L.abrirDossie({ dim: "fornecedor", id: r.fidx, aba: "verba" }); else L.toast("Fornecedor sem cadastro de produto de revenda"); },
    });
    raiz.appendChild(L.grade(pC, pT, pF, pD, pS, L.painel({ titulo: "Fornecedores", sub: "clique em um fornecedor para abrir os lançamentos dele", classe: "c-12", semPad: true, corpo: tab })));
    raiz.appendChild(L.nota("Saldo = débitos − créditos de toda a conta corrente (rotina de verba do WinThor, com os estornos, como no saldo corrido do relatório dela); débito soma, crédito abate. Verba média do trimestre = débitos ligados a uma verba nos 3 últimos meses fechados ÷ 3. Meses para pagar = saldo ÷ verba média."));
  },
});

/* ============================================================================
 * LANÇAMENTOS DA CONTA CORRENTE (consulta)
 * ========================================================================= */
L.registrarPagina({
  id: "cclanc", titulo: "Lançamentos da conta corrente", olho: "Compras", grupo: "Compras", icone: "tabela", menu: "Lançamentos de verba", filtros: ["comprador", "fornecedor"], mais: [],
  render: function (raiz) {
    var D = L.D, f = L.estado.filtros, C = L.cores();
    var passa = function (x) {
      if (f.fornecedor && f.fornecedor.length && f.fornecedor.indexOf(x.fidx) < 0) return false;
      if (f.comprador && f.comprador.length) { var cf = L.CCF.filter(function (c) { return c.cod === x.forn; })[0]; if (!cf || f.comprador.indexOf(cf.comprador) < 0) return false; }
      return true;
    };
    var fornNome = {}; L.CCF.forEach(function (c) { fornNome[c.cod] = c.nome; });
    var filtro = L.estado.cclTipo || "todos";
    var base = L.CCL.filter(passa);
    var linhas = base.filter(function (x) { return filtro === "todos" || (filtro === "deb" && x.tipo === 0) || (filtro === "cre" && x.tipo === 1) || (filtro === "neg" && x.negociacao); });
    var deb = soma(base, function (x) { return x.tipo === 0 ? x.valor : 0; }), cre = soma(base, function (x) { return x.tipo === 1 ? x.valor : 0; }), neg = soma(base, function (x) { return x.negociacao ? x.valor : 0; });
    var fBR0 = function (v) { return L.fBRL(v, 0); };
    raiz.appendChild(L.kpis(
      L.kpi({ icone: "tabela", rot: "Lançamentos", valor: base.length, fmt: L.fInt, leg: L.h("span", { text: "desde jan/2024" }) }),
      L.kpi({ icone: "setaCima", rot: "Débitos", valor: deb, fmt: fBR0, classe: "heroi" }),
      L.kpi({ icone: "setaBaixo", rot: "Créditos", valor: cre, fmt: fBR0 }),
      L.kpi({ icone: "dinheiro", rot: "Débitos de negociação", valor: neg, fmt: fBR0, leg: L.h("span", { text: L.fPct(L.div(neg, deb), 1) + " dos débitos" }) }),
      L.kpi({ icone: "carteira", rot: "Resultado", valor: deb - cre, fmt: fBR0, leg: L.h("span", { text: "débitos − créditos no período" }) })));
    var seg = L.h("div", { class: "seg" });
    [["todos", "Todos"], ["deb", "Débitos"], ["cre", "Créditos"], ["neg", "Negociação"]].forEach(function (o) { seg.appendChild(L.h("button", { type: "button", class: o[0] === filtro ? "on" : "", text: o[1], onclick: function () { L.estado.cclTipo = o[0]; L.emitir("filtros"); } })); });
    var tab = L.tabela({
      titulo: "Lançamentos da conta corrente", arquivo: "lancamentos-verba", aba: "Lançamentos", linhas: linhas, porPagina: 50, ordem: { id: "data", desc: true }, extraTopo: function () { return seg; },
      buscaTexto: function (r) { return r.historico + " " + (r.verba || "") + " " + (fornNome[r.forn] || "") + " " + r.usuarioNome + " " + r.transacao; }, buscaDica: "Buscar por histórico, verba, fornecedor ou usuário…",
      colunas: [
        { id: "data", titulo: "Data", tipo: "data", valor: function (r) { return r.data; } },
        { id: "forn", titulo: "Fornecedor", tipo: "texto", valor: function (r) { return fornNome[r.forn] || String(r.forn); } },
        { id: "trans", titulo: "Transação", tipo: "texto", valor: function (r) { return String(r.transacao); }, ordVal: function (r) { return r.transacao; }, essencial: false },
        { id: "verba", titulo: "Verba nº", tipo: "texto", valor: function (r) { return r.verba ? String(r.verba) : ""; } },
        { id: "hist", titulo: "Histórico", tipo: "texto", valor: function (r) { return r.historico; } },
        { id: "deb", titulo: "Débito", tipo: "moeda", valor: function (r) { return r.tipo === 0 ? r.valor : null; }, ordVal: function (r) { return r.tipo === 0 ? r.valor : -1; }, exportarTipo: "moeda" },
        { id: "cre", titulo: "Crédito", tipo: "moeda", valor: function (r) { return r.tipo === 1 ? -r.valor : null; }, ordVal: function (r) { return r.tipo === 1 ? r.valor : -1; }, exportarTipo: "moeda" },
        { id: "neg", titulo: "Negociação", tipo: "tag", valor: function (r) { return r.negociacao; }, fmt: function (v) { return { html: v ? L.tag("Sim", "info") : "" }; }, exp: function (r) { return r.negociacao ? "Sim" : ""; }, ord: false },
        { id: "est", titulo: "Estorno", tipo: "tag", valor: function (r) { return r.estorno; }, fmt: function (v) { return { html: v ? L.tag("Estornado", "neutro") : "" }; }, exp: function (r) { return r.estorno ? "Estornado" : ""; }, ord: false, essencial: false },
        { id: "usu", titulo: "Lançado por", tipo: "texto", valor: function (r) { return r.usuarioNome; }, essencial: false },
      ],
      totais: function (res) { return [{ rot: "Lançamentos na lista", valor: L.fInt(res.total), pri: true }, { rot: "Débitos", valor: fBR0(deb) }, { rot: "Créditos", valor: fBR0(cre) }]; },
      aoClicar: function (r) { var cf = L.CCF.filter(function (c) { return c.cod === r.forn; })[0]; if (cf && cf.fidx >= 0) L.abrirDossie({ dim: "fornecedor", id: cf.fidx, aba: "verba" }); },
    });
    raiz.appendChild(L.grade(L.painel({ titulo: "Histórico de lançamentos", sub: "cada linha é um lançamento da conta corrente do fornecedor · clique para abrir a conta dele", classe: "c-12", semPad: true, corpo: tab })));
    raiz.appendChild(L.nota("Lançamentos desde 01/01/2024 (os estornados trazem a marca “Estornado”), da rotina de conta corrente de fornecedor do WinThor. “Negociação” marca débitos cujo histórico traz ação, campanha, rebaixa, perda, vencimento, verba, negociação ou compra de mercadoria bonificada."));
  },
});

/* ============================================================================
 * CUSTO DE COMPRA
 * ========================================================================= */
var infoCache = {};
function infoProd(p) {
  var x = infoCache[p]; if (x) return x;
  var d = L.D.produtos[p], forn = d[3];
  return (infoCache[p] = { p: p, cod: d[0], desc: d[1], forn: forn, comp: forn >= 0 ? L.D.fornecedores[forn][2] : -1, depto: d[4], cat: d[5], sub: d[6], marca: d[7], promo: d[8], status: d[9] });
}
L.registrarPagina({
  id: "custo", titulo: "Custo de compra", olho: "Compras", grupo: "Compras", icone: "linha", filtros: ["ano", "mes", "comprador", "fornecedor", "depto", "categoria"], mais: ["subcategoria", "marca", "produto"],
  render: function (raiz) {
    var D = L.D, C = L.cores(), f = L.estado.filtros;
    var sel = L.misDe(f), selSet = {}; sel.forEach(function (i) { selSet[i] = 1; });
    var linhas = L.ENT.linhas.filter(function (r) { return selSet[r[1]] && L.passaProduto(infoProd(r[0]), f); });
    if (!linhas.length) { raiz.appendChild(L.h("div", { class: "vazio", html: "<b>Sem compras no recorte</b>Nenhuma entrada de mercadoria com os filtros atuais." })); return; }
    // por produto: série mensal de custo unitário
    var prod = {}; linhas.forEach(function (r) { var o = prod[r[0]] = prod[r[0]] || { p: r[0], m: {} }; o.m[r[1]] = { q: r[2], v: r[3], c: r[2] ? r[3] / r[2] : null }; });
    var plist = Object.keys(prod).map(function (k) { return prod[k]; });
    var mis = sel.filter(function (i) { return linhas.some(function (r) { return r[1] === i; }); });
    var valorTot = soma(linhas, function (r) { return r[3]; });
    // índice encadeado (base 100): variação do custo dos mesmos itens de um mês para o seguinte, ponderada pelo valor comprado
    function indice(filtroP) {
      var out = [], idx = 100;
      mis.forEach(function (mi, i) {
        if (i === 0) { out.push(100); return; }
        var ant = mis[i - 1], num = 0, den = 0;
        plist.forEach(function (o) { if (filtroP && !filtroP(o)) return; var a = o.m[ant], b = o.m[mi]; if (a && b && a.c > 0 && b.c > 0) { num += a.v * (b.c / a.c); den += a.v; } });
        if (den > 0) idx = idx * (num / den);
        out.push(den > 0 ? idx : null);
      });
      return out;
    }
    var geral = indice(null), ultimo = geral.filter(function (x) { return x != null; }).pop() || 100;
    // resumo por produto
    var linhasP = plist.map(function (o) {
      var ks = Object.keys(o.m).map(Number).sort(function (a, b) { return a - b; });
      var cs = ks.map(function (k) { return o.m[k].c; }).filter(function (c) { return c > 0; });
      var q = soma(ks, function (k) { return o.m[k].q; }), v = soma(ks, function (k) { return o.m[k].v; });
      var med = cs.reduce(function (s, c) { return s + c; }, 0) / (cs.length || 1), dp = cs.length > 1 ? Math.sqrt(cs.reduce(function (s, c) { return s + Math.pow(c - med, 2); }, 0) / (cs.length - 1)) : 0;
      var ini = o.m[ks[0]].c, fim = o.m[ks[ks.length - 1]].c, info = infoProd(o.p);
      return { p: o.p, desc: info.desc, cod: info.cod, forn: info.forn, depto: info.depto, comp: info.comp, n: ks.length, ini: ini, fim: fim, var: ini > 0 ? fim / ini - 1 : null, dp: dp, cv: med > 0 ? dp / med : null, valor: v, qtd: q, ult: D.meses[ks[ks.length - 1]] + "-01", medio: med };
    });
    var comVar = linhasP.filter(function (x) { return x.n >= 2 && x.var != null; });
    var altas = comVar.filter(function (x) { return x.var > 0.1; }), quedas = comVar.filter(function (x) { return x.var < -0.05; });
    var fBR0 = function (v) { return L.fBRL(v, 0); };
    raiz.appendChild(L.kpis(
      L.kpi({ icone: "dinheiro", rot: "Valor comprado", valor: valorTot, fmt: fBR0, classe: "heroi", leg: L.h("span", { text: L.rotMis(mis) + " · " + L.fInt(plist.length) + " produtos" }) }),
      L.kpi({ icone: "tendencia", rot: "Variação do custo no período", valor: ultimo - 100, fmt: function (v) { return (v > 0 ? "+" : v < 0 ? "−" : "") + L.fNum(Math.abs(v), 1) + "%"; }, classe: ultimo - 100 > 8 ? "atencao" : "", leg: L.h("span", { text: "índice dos mesmos itens, ponderado pelo valor comprado" }) }),
      L.kpi({ icone: "alerta", rot: "Itens com alta acima de 10%", valor: altas.length, fmt: L.fInt, classe: altas.length ? "atencao" : "zero", leg: L.h("span", { text: "de " + L.fInt(comVar.length) + " com 2 ou mais compras" }) }),
      L.kpi({ icone: "setaBaixo", rot: "Itens com queda acima de 5%", valor: quedas.length, fmt: L.fInt, classe: quedas.length ? "ok" : "zero" }),
      L.kpi({ icone: "caixa", rot: "Quantidade comprada", valor: soma(linhas, function (r) { return r[2]; }), fmt: L.fInt, leg: L.h("span", { text: L.fInt(linhas.length) + " combinações produto × mês" }) })));

    // índice geral + por departamento
    var pI = L.painel({ titulo: "Índice de custo de compra", sub: "base 100 no primeiro mês · custo = preço + frete + ST por unidade", classe: "c-8" });
    var gI = L.h("div"); pI.corpo.appendChild(gI);
    var porDep = {}; plist.forEach(function (o) { var d = infoProd(o.p).depto; porDep[d] = (porDep[d] || 0) + soma(Object.keys(o.m), function (k) { return o.m[k].v; }); });
    var topDeps = Object.keys(porDep).map(Number).sort(function (a, b) { return porDep[b] - porDep[a]; }).slice(0, 5);
    var ser = [{ nome: "Geral", cor: C.ouro, destaque: true, area: true, valores: geral }].concat(topDeps.map(function (d, i) { return { nome: L.nomeDe("depto", d), cor: C.d[(i + 2) % 8], valores: indice(function (o) { return infoProd(o.p).depto === d; }) }; }));
    var vals = geral.concat(); ser.forEach(function (s) { vals = vals.concat(s.valores); });
    var modoRot = L.estado.custoRot === "todos" ? true : "destaque";
    L.graf.linhas(gI, { categorias: mis.map(function (i) { return L.fMesAno(D.meses[i]); }), series: ser, tipo: "num", fmt: function (v) { return L.fNum(v, 1); }, altura: 340, zero: false, rotulos: modoRot,
      dica: function (i) { return { titulo: L.fMesLongo(D.meses[mis[i]]), linhas: ser.filter(function (s) { return s.valores[i] != null; }).map(function (s) { return { cor: s.cor, rot: s.nome, val: L.fNum(s.valores[i], 1) }; }), semClique: true }; } });
    pI.corpo.appendChild(L.graf.legenda(ser.map(function (s) { return { rot: s.nome, cor: s.cor }; })));

    // maiores altas / quedas
    var rank = function (titulo, lista, cor, sub) {
      var p = L.painel({ titulo: titulo, sub: sub, classe: "c-4" }), g = L.h("div"); p.corpo.appendChild(g);
      L.graf.barras(g, { itens: lista.map(function (x) { return { k: x.p, rot: x.desc, valor: Math.abs(x.var), rotuloValor: (x.var > 0 ? "+" : "−") + L.fNum(Math.abs(x.var) * 100, 1) + "%" }; }), fmt: function (v) { return L.fNum(v * 100, 1) + "%"; }, pct: false, linhaH: 28, cor: cor,
        dica: function (i) { var x = lista[i]; return { titulo: x.desc, linhas: [{ rot: "Custo inicial", val: L.fBRL(x.ini, 4) }, { rot: "Custo atual", val: L.fBRL(x.fim, 4) }, { rot: "Variação", val: L.fDelta(x.var, 1) }, { rot: "Compras (meses)", val: L.fInt(x.n) }] }; },
        aoClicar: function (i, s, ev) { L.cliqueDim("produto", lista[i].p, ev); } });
      return p;
    };
    var topUp = comVar.filter(function (x) { return x.valor > 5000; }).sort(function (a, b) { return b.var - a.var; }).slice(0, 10);
    var topDown = comVar.filter(function (x) { return x.valor > 5000; }).sort(function (a, b) { return a.var - b.var; }).slice(0, 10);
    var pUp = rank("Maiores altas de custo", topUp, C.perigo, "itens com mais de R$ 5 mil comprados");
    // tabela
    var tab = L.tabela({
      titulo: "Custo de compra por produto", arquivo: "custo-compra", aba: "Custo de compra", linhas: linhasP, rank: true, porPagina: 25, ordem: { id: "valor", desc: true },
      buscaTexto: function (r) { return r.cod + " " + r.desc + " " + L.nomeDe("fornecedor", r.forn); },
      colunas: [
        { id: "desc", titulo: "Produto", tipo: "texto", valor: function (r) { return r.desc; } },
        { id: "forn", titulo: "Fornecedor", tipo: "texto", valor: function (r) { return L.nomeDe("fornecedor", r.forn); }, essencial: false },
        { id: "valor", titulo: "Valor comprado", tipo: "moedaInt", valor: function (r) { return r.valor; }, barra: true, exportarTipo: "moeda" },
        { id: "ini", titulo: "Custo inicial", tipo: "moeda", valor: function (r) { return r.ini; } },
        { id: "fim", titulo: "Custo atual", tipo: "moeda", valor: function (r) { return r.fim; } },
        { id: "var", titulo: "Variação", tipo: "pct", valor: function (r) { return r.n >= 2 ? r.var : null; }, fmt: function (v) { return v == null ? "—" : L.fDelta(v, 1); }, classe: function (v) { return v == null ? "" : v > 0.0005 ? "neg" : v < -0.0005 ? "pos" : ""; } },
        { id: "dp", titulo: "Desvio padrão", tipo: "moeda", valor: function (r) { return r.n >= 2 ? r.dp : null; }, dica: "Desvio padrão do custo unitário mensal no período" },
        { id: "cv", titulo: "Oscilação (CV)", tipo: "pct", valor: function (r) { return r.n >= 2 ? r.cv : null; }, dica: "Desvio padrão ÷ custo médio" },
        { id: "n", titulo: "Meses com compra", tipo: "inteiro", valor: function (r) { return r.n; }, essencial: false },
        { id: "qtd", titulo: "Quantidade", tipo: "inteiro", valor: function (r) { return r.qtd; }, essencial: false },
        { id: "ult", titulo: "Última compra", tipo: "texto", valor: function (r) { return L.fMesAno(r.ult.slice(0, 7)); }, ordVal: function (r) { return r.ult; }, essencial: false },
      ],
      foto: function (r) { return r.p; },
      aoClicar: function (r, ev) { L.cliqueDim2("produto", r.p, ev); },
      totais: function (res) { return [{ rot: "Produtos", valor: L.fInt(res.total), pri: true }, { rot: "Valor comprado", valor: fBR0(valorTot) }, { rot: "Variação do custo", valor: (ultimo - 100 > 0 ? "+" : "") + L.fNum(ultimo - 100, 1) + "%" }];  },
    });
    raiz.appendChild(L.grade(pI, pUp, rank("Maiores quedas de custo", topDown, C.ok, "itens com mais de R$ 5 mil comprados"), L.painel({ titulo: "Custo de compra por produto", sub: "variação entre a primeira e a última compra do período · desvio padrão e oscilação do custo unitário mensal", classe: "c-8", semPad: true, corpo: tab })));
    raiz.appendChild(L.nota("Custo de entrada = preço da nota + frete + ST, por unidade, vindo das entradas de mercadoria (operação E). O índice encadeia, mês a mês, a variação do custo dos itens comprados nos dois meses, ponderada pelo valor do mês anterior — assim a troca de mix não parece reajuste. Desvio padrão e oscilação (CV) medem o quanto o custo unitário mensal do item varia."));
  },
});

})();
