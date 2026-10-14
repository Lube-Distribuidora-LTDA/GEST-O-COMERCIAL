/* =============================================================================
 * pag-vendas2.js — Comparativo anual, Higiene & Beleza e Devoluções.
 * ========================================================================== */
(function () {
"use strict";
var L = window.L;
var SEM = { ano: null, mes: null, de: null, ate: null, mis: null };
var FILTROS_VENDA = ["ano", "mes", "uf", "equipe", "rca", "comprador", "fornecedor", "depto", "categoria", "ramo"];
var MAIS_VENDA = ["subcategoria", "marca", "municipio", "cliente", "produto", "origem"];
function refazer() { L.emitir("filtros"); }

/* ============================================================================
 * COMPARATIVO ANUAL
 * ========================================================================= */
L.registrarPagina({
  id: "total", titulo: "Comparativo anual", olho: "Vendas", grupo: "Vendas", icone: "tendencia", filtros: ["mes", "uf", "equipe", "comprador", "fornecedor", "depto", "categoria", "ramo"], mais: ["subcategoria", "marca", "rca", "cliente", "produto"],
  render: function (raiz) {
    var D = L.D, yAt = (L.estado.params && L.estado.params.atual) || L.anoAtual, yAnt = yAt - 1;
    var F = L.filtrosApi({ ano: null, mis: null });
    var f = L.estado.filtros, mesSel = f.mes && f.mes.length ? f.mes : null;
    var yc = +D.corte.ate.slice(0, 4), mc = +D.corte.ate.slice(5, 7), parcial = D.corte.dia < new Date(yc, mc, 0).getDate();
    var mesesAtual = [];
    for (var m = 1; m <= 12; m++) if ((!mesSel || mesSel.indexOf(m) >= 0) && (yAt < yc || m <= mc)) mesesAtual.push(m);
    var idxMes = function (y, mm) { return D.meses.indexOf(y + "-" + String(mm).padStart(2, "0")); };
    var misAtual = mesesAtual.map(function (mm) { return idxMes(yAt, mm); }).filter(function (i) { return i >= 0; });
    var misBase = mesesAtual.map(function (mm) { return idxMes(yAnt, mm); }).filter(function (i) { return i >= 0; });
    var cortePar = parcial && yAt === yc && misAtual.indexOf(D.corte.mi) >= 0 ? [D.corte.mi - 12] : [];
    var fa = Object.assign({}, F, { mis: misAtual }), fb = Object.assign({}, F, { mis: misBase });
    var ped = [
      { id: "a", tipo: "resumo", filtros: fa }, { id: "b", tipo: "resumo", filtros: fb, corte: cortePar },
      { id: "ca", tipo: "agrupar", por: "comprador", dist: ["pos", "skus"], filtros: fa }, { id: "cb", tipo: "agrupar", por: "comprador", dist: ["pos", "skus"], filtros: fb, corte: cortePar },
      { id: "ma", tipo: "agrupar", por: "mes", filtros: fa }, { id: "mb", tipo: "agrupar", por: "mes", filtros: fb, corte: cortePar },
      { id: "da", tipo: "agrupar", por: "depto", filtros: fa }, { id: "db", tipo: "agrupar", por: "depto", filtros: fb, corte: cortePar },
    ];
    return L.consultar(ped, { filtros: {} }).then(function (j) {
      var R = j.resultados, a = L.derivar(R.a), b = L.derivar(R.b), C = L.cores();
      var per = L.rotMis(misAtual);
      var seg = L.h("div", { class: "seg" });
      L.anos.slice(1).forEach(function (y) { seg.appendChild(L.h("button", { type: "button", class: y === yAt ? "on" : "", text: String(y), onclick: function () { L.estado.params = { atual: y }; refazer(); } })); });
      raiz.appendChild(L.h("div", { style: { display: "flex", gap: "12px", alignItems: "center", marginBottom: "14px", flexWrap: "wrap" } },
        L.h("span", { class: "fx-rot", text: "Comparar o ano" }), seg,
        L.h("span", { style: { color: "var(--t3)", font: "500 13px var(--f-txt)" }, text: "com " + yAnt + " · " + per + (cortePar.length ? " · mesmo número de dias (até " + L.fData(D.corte.ate).slice(0, 5) + ")" : "") })));
      var fBR0 = function (v) { return L.fBRL(v, 0); };
      var kc = function (valor, base, fmt) { return { cmp: { aa: { rot: String(yAnt), mis: misBase } }, aa: base, fmt: fmt }; };
      raiz.appendChild(L.kpis(
        L.kpi({ icone: "dinheiro", rot: "Venda " + yAt, valor: a.venda, fmt: fBR0, classe: "heroi", cmp: kc(a.venda, b.venda, fBR0), leg: L.h("span", { text: yAnt + ": " + L.fBRL(b.venda, 0) }) }),
        L.kpi({ icone: "pessoas", rot: "Positivação", valor: a.pos, fmt: L.fInt, cmp: kc(a.pos, b.pos, L.fInt), leg: L.h("span", { text: yAnt + ": " + L.fInt(b.pos) }) }),
        L.kpi({ icone: "caixa", rot: "Quantidade", valor: a.qtd, fmt: L.fInt, cmp: kc(a.qtd, b.qtd, L.fInt), leg: L.h("span", { text: yAnt + ": " + L.fInt(b.qtd) }) }),
        L.kpi({ icone: "camadas", rot: "SKUs vendidos", valor: a.skus, fmt: L.fInt, cmp: kc(a.skus, b.skus, L.fInt), leg: L.h("span", { text: yAnt + ": " + L.fInt(b.skus) }) }),
        L.kpi({ icone: "etiqueta", rot: "Ticket médio", valor: a.ticket, fmt: fBR0, cmp: kc(a.ticket, b.ticket, fBR0), leg: L.h("span", { text: yAnt + ": " + L.fBRL(b.ticket, 0) }) })));
      // medidor
      var pMed = L.painel({ titulo: "Venda " + yAt + " contra " + yAnt, sub: per, classe: "c-4" });
      var gm = L.h("div"); pMed.corpo.appendChild(gm);
      L.graf.medidor(gm, { valor: a.venda, ref: b.venda, fmt: function (v) { return L.fAbrev(v, true); }, legenda: "do realizado em " + yAnt, altura: 230 });
      pMed.corpo.appendChild(L.h("div", { style: { textAlign: "center", font: "600 13px var(--f-txt)", color: "var(--t2)", marginTop: "-2px" }, html: "Diferença: <b class='num' style='color:" + (a.venda >= b.venda ? "var(--ok)" : "var(--perigo)") + "'>" + L.esc(L.fBRL(a.venda - b.venda, 0)) + "</b>" }));
      // mensal
      var mA = {}, mB = {}; R.ma.linhas.forEach(function (l) { mA[l.k] = l.venda; }); R.mb.linhas.forEach(function (l) { mB[l.k] = l.venda; });
      var pMes = L.painel({ titulo: "Venda mês a mês", sub: yAt + " contra " + yAnt, classe: "c-8" });
      var gMes = L.h("div"); pMes.corpo.appendChild(gMes);
      L.graf.colunas(gMes, {
        categorias: L.MES3.slice(), tipo: "moeda", fmt: function (v) { return L.fAbrev(v, false); }, altura: 290, agrupaPorCat: true,
        series: [{ nome: String(yAnt), cor: C.d[7], valores: L.MES3.map(function (_, i) { return mB[i] != null ? mB[i] : null; }) }, { nome: String(yAt), cor: L.corAno(yAt), valores: L.MES3.map(function (_, i) { return mA[i] != null ? mA[i] : null; }) }],
        dica: function (i) { var x = mA[i], y = mB[i], ls = [{ cor: L.corAno(yAt), rot: String(yAt), val: x != null ? L.fBRL(x, 0) : "—" }, { cor: C.d[7], rot: String(yAnt), val: y != null ? L.fBRL(y, 0) : "—" }]; if (x != null && y) ls.push({ rot: "Variação", val: L.fDelta(x / y - 1, 1) }); return { titulo: L.MESES[i], linhas: ls }; },
        aoClicar: function (i, s) { var y = s === 0 ? yAnt : yAt, mi = idxMes(y, i + 1); if (mi >= 0) L.abrirDossie({ dim: "ym", id: mi }); },
      });
      pMes.corpo.appendChild(L.graf.legenda([{ rot: String(yAnt), cor: C.d[7] }, { rot: String(yAt), cor: L.corAno(yAt) }]));
      // matriz por comprador
      var bA = {}, bB = {}; R.ca.linhas.forEach(function (l) { bA[l.k] = l; }); R.cb.linhas.forEach(function (l) { bB[l.k] = l; });
      var ks = {}; Object.keys(bA).concat(Object.keys(bB)).forEach(function (k) { ks[k] = 1; });
      var zero = { venda: 0, pos: 0, skus: 0, qtd: 0 };
      var linhasM = Object.keys(ks).map(function (k) {
        k = +k; var x = bA[k] || zero, y = bB[k] || zero;
        return { id: k, nome: L.nomeDe("comprador", k), va: x.venda, vb: y.venda, pa: x.pos, pb: y.pos, qa: x.qtd, qb: y.qtd, sa: x.skus, sb: y.skus };
      }).sort(function (p, q) { return q.va - p.va; });
      var corVar = function (v) { return v == null ? "" : v >= 1 ? "pos" : "neg"; };
      var tM = L.tabela({
        titulo: "Comparativo por comprador — " + yAt + " x " + yAnt, arquivo: "comparativo-comprador", aba: "Comprador", linhas: linhasM, porPagina: 0, livre: true, busca: false,
        colunas: [
          { id: "nome", titulo: "Comprador", tipo: "texto", valor: function (r) { return r.nome; } },
          { id: "vb", titulo: "Venda " + yAnt, tipo: "moedaInt", valor: function (r) { return r.vb; }, exportarTipo: "moeda" },
          { id: "va", titulo: "Venda " + yAt, tipo: "moedaInt", valor: function (r) { return r.va; }, barra: true, exportarTipo: "moeda" },
          { id: "cv", titulo: "% " + yAt + "/" + yAnt, tipo: "pct", valor: function (r) { return r.vb ? r.va / r.vb : null; }, classe: function (v) { return corVar(v); } },
          { id: "pb", titulo: "Posit. " + yAnt, tipo: "inteiro", valor: function (r) { return r.pb; } },
          { id: "pa", titulo: "Posit. " + yAt, tipo: "inteiro", valor: function (r) { return r.pa; } },
          { id: "cp", titulo: "% posit.", tipo: "pct", valor: function (r) { return r.pb ? r.pa / r.pb : null; }, classe: function (v) { return corVar(v); } },
          { id: "qb", titulo: "Qtd " + yAnt, tipo: "inteiro", valor: function (r) { return r.qb; }, essencial: false },
          { id: "qa", titulo: "Qtd " + yAt, tipo: "inteiro", valor: function (r) { return r.qa; }, essencial: false },
          { id: "cq", titulo: "% qtd", tipo: "pct", valor: function (r) { return r.qb ? r.qa / r.qb : null; }, essencial: false, classe: function (v) { return corVar(v); } },
          { id: "sb", titulo: "SKUs " + yAnt, tipo: "inteiro", valor: function (r) { return r.sb; }, essencial: false },
          { id: "sa", titulo: "SKUs " + yAt, tipo: "inteiro", valor: function (r) { return r.sa; }, essencial: false },
        ],
        aoClicar: function (r, ev) { L.cliqueDim("comprador", r.id, ev); },
      });
      var pMat = L.painel({ titulo: "Comparativo por comprador", sub: "venda, positivação, quantidade e SKUs · verde = acima do ano anterior", classe: "c-12", semPad: true, corpo: tM });
      // departamentos
      var dA = {}, dB = {}; R.da.linhas.forEach(function (l) { dA[l.k] = l.venda; }); R.db.linhas.forEach(function (l) { dB[l.k] = l.venda; });
      var deps = Object.keys(Object.assign({}, dA, dB)).map(Number).sort(function (p, q) { return (dA[q] || 0) - (dA[p] || 0); }).slice(0, 10);
      var pDep = L.painel({ titulo: "Departamentos: " + yAt + " contra " + yAnt, sub: "os dez maiores", classe: "c-12" });
      var gD = L.h("div"); pDep.corpo.appendChild(gD);
      L.graf.colunas(gD, {
        categorias: deps.map(function (k) { return L.nomeDe("depto", k); }), tipo: "moeda", fmt: function (v) { return L.fAbrev(v, false); }, altura: 300, agrupaPorCat: true,
        series: [{ nome: String(yAnt), cor: C.d[7], valores: deps.map(function (k) { return dB[k] || 0; }) }, { nome: String(yAt), cor: L.corAno(yAt), valores: deps.map(function (k) { return dA[k] || 0; }) }],
        dica: function (i) { var k = deps[i], x = dA[k] || 0, y = dB[k] || 0, ls = [{ cor: L.corAno(yAt), rot: String(yAt), val: L.fBRL(x, 0) }, { cor: C.d[7], rot: String(yAnt), val: L.fBRL(y, 0) }]; if (y) ls.push({ rot: "Variação", val: L.fDelta(x / y - 1, 1) }); return { titulo: L.nomeDe("depto", k), linhas: ls }; },
        aoClicar: function (i) { L.cliqueDim("depto", deps[i]); },
      });
      pDep.corpo.appendChild(L.graf.legenda([{ rot: String(yAnt), cor: C.d[7] }, { rot: String(yAt), cor: L.corAno(yAt) }]));
      raiz.appendChild(L.grade(pMed, pMes, pMat, pDep));
      raiz.appendChild(L.nota("Os dois anos usam o mesmo conjunto de meses. Quando o ano atual está em andamento, o mês corrente é comparado com o mesmo trecho do mês do ano anterior — por isso o total do ano anterior pode ser menor que o ano fechado."));
    });
  },
});

/* ============================================================================
 * HIGIENE & BELEZA
 * ========================================================================= */
L.registrarPagina({
  id: "hb", titulo: "Higiene & Beleza", olho: "Vendas", grupo: "Vendas", icone: "estrela", filtros: ["ano", "mes", "uf", "equipe", "comprador", "fornecedor", "categoria", "ramo"], mais: ["subcategoria", "marca", "rca", "cliente", "produto"],
  render: function (raiz) {
    var D = L.D, cmp = L.comparar(L.estado.filtros);
    var iHB = D.deptos.indexOf("Higiene & Beleza");
    if (iHB < 0) { raiz.appendChild(L.h("div", { class: "vazio", html: "<b>Departamento não encontrado</b>" })); return; }
    var base = { depto: null }, hbF = { depto: [iHB] };
    var misSel = L.misDe(L.estado.filtros);
    var ped = [].concat(
      L.pedidosCmp("tot", "resumo", { filtros: base }, cmp), L.pedidosCmp("hb", "resumo", { filtros: hbF }, cmp),
      [{ id: "uf_t", tipo: "agrupar", por: "uf", filtros: base }, { id: "uf_h", tipo: "agrupar", por: "uf", filtros: hbF },
       { id: "eq_t", tipo: "agrupar", por: "equipe", filtros: base }, { id: "eq_h", tipo: "agrupar", por: "equipe", filtros: hbF, dist: ["pos"] },
       { id: "m_t", tipo: "agrupar", por: "ym", filtros: Object.assign({}, base, SEM) }, { id: "m_h", tipo: "agrupar", por: "ym", filtros: Object.assign({}, hbF, SEM) },
       { id: "cat_h", tipo: "agrupar", por: "categoria", filtros: hbF, limite: 12, dist: ["pos"] },
       { id: "forn_h", tipo: "agrupar", por: "fornecedor", filtros: hbF, limite: 12, dist: ["pos"] }]);
    return L.consultar(ped).then(function (j) {
      var R = j.resultados, C = L.cores(), tot = L.derivar(R.tot), hb = L.derivar(R.hb);
      var hbAa = R.hb_aa ? L.derivar(R.hb_aa) : null, hbPa = R.hb_pa ? L.derivar(R.hb_pa) : null, totAa = R.tot_aa ? L.derivar(R.tot_aa) : null, totPa = R.tot_pa ? L.derivar(R.tot_pa) : null;
      var sem = tot.venda - hb.venda, pct = L.div(hb.venda, tot.venda);
      var pctAa = totAa ? L.div(hbAa.venda, totAa.venda) : null, pctPa = totPa ? L.div(hbPa.venda, totPa.venda) : null;
      var fBR0 = function (v) { return L.fBRL(v, 0); }, f2 = function (v) { return L.fNum(v, 2) + "%"; };
      raiz.appendChild(L.kpis(
        L.kpi({ icone: "estrela", rot: "Venda Higiene & Beleza", valor: hb.venda, fmt: fBR0, classe: "heroi", cmp: cmp ? { cmp: cmp, aa: hbAa ? hbAa.venda : null, pa: hbPa ? hbPa.venda : null, fmt: fBR0 } : null, aoClicar: function () { L.abrirDossie({ dim: "depto", id: iHB }); }, leg: L.h("span", { text: L.fInt(hb.pos) + " clientes · " + L.fInt(hb.skus) + " SKUs" }) }),
        L.kpi({ icone: "percent", rot: "% da venda total", valor: pct == null ? null : pct * 100, fmt: f2, cmp: cmp ? { cmp: cmp, aa: pctAa != null ? pctAa * 100 : null, pa: pctPa != null ? pctPa * 100 : null, fmt: f2, pp: true } : null, leg: L.h("span", { text: "participação de H&B na venda" }) }),
        L.kpi({ icone: "dinheiro", rot: "Venda sem H&B", valor: sem, fmt: fBR0, leg: L.h("span", { text: "demais departamentos" }) }),
        L.kpi({ icone: "etiqueta", rot: "Ticket H&B", valor: hb.ticket, fmt: fBR0, cmp: cmp ? { cmp: cmp, aa: hbAa ? hbAa.ticket : null, pa: hbPa ? hbPa.ticket : null, fmt: fBR0 } : null, leg: L.h("span", { text: "mix de H&B: " + L.fNum(hb.mix, 1) + " itens/cliente" }) })));
      var corHB = C.d[2], corSem = C.d[0];
      var pRos = L.painel({ titulo: "Venda H&B contra o restante", classe: "c-4", sub: cmp ? cmp.rot : "" });
      var gR = L.h("div"); pRos.corpo.appendChild(gR);
      var fat = [{ rot: "Higiene & Beleza", valor: hb.venda, cor: corHB, idxOriginal: 0 }, { rot: "Demais departamentos", valor: sem, cor: corSem, idxOriginal: 1 }];
      L.graf.rosca(gR, { fatias: fat, fmt: function (v) { return L.fAbrev(v, true); }, altura: 250, centro: { valor: L.fPct(pct, 1), titulo: "é H&B" },
        dica: function (i, s, f, t) { return { titulo: f.rot, linhas: [{ rot: "Venda líquida", val: L.fBRL(f.valor, 0) }, { rot: "Participação", val: L.fPct(f.valor / t, 2) }] }; },
        aoClicar: function (i) { if (i === 0) L.abrirDossie({ dim: "depto", id: iHB }); } });
      pRos.corpo.appendChild(L.graf.legendaLista(fat, function (v) { return L.fAbrev(v, true); }));
      // por estado
      var pUf = L.painel({ titulo: "H&B por estado", sub: "composição da venda de cada estado", classe: "c-4" });
      var gU = L.h("div"); pUf.corpo.appendChild(gU);
      var mapaT = {}, mapaH = {}; R.uf_t.linhas.forEach(function (l) { mapaT[l.k] = l.venda; }); R.uf_h.linhas.forEach(function (l) { mapaH[l.k] = l.venda; });
      var ufs = Object.keys(mapaT).map(Number).sort(function (a, b) { return mapaT[b] - mapaT[a]; });
      L.graf.barras100(gU, {
        linhas: ufs.map(function (k) { return { rot: D.uf[k], k: k, partes: [{ rot: "H&B", valor: mapaH[k] || 0, cor: corHB }, { rot: "Demais", valor: mapaT[k] - (mapaH[k] || 0), cor: corSem }] }; }),
        fmtPct: function (x) { return L.fNum(x, 1) + "%"; }, fmtTotal: function (p) { return L.fAbrev(p[0].valor + p[1].valor, true); }, linhaH: 44,
        dica: function (i) { var k = ufs[i], h = mapaH[k] || 0, t = mapaT[k]; return { titulo: D.uf[k], linhas: [{ cor: corHB, rot: "H&B", val: L.fBRL(h, 0) + " · " + L.fPct(h / t, 2) }, { cor: corSem, rot: "Demais", val: L.fBRL(t - h, 0) }, { rot: "Total", val: L.fBRL(t, 0) }] }; },
        aoClicar: function (i) { L.cliqueDim("uf", ufs[i]); },
      });
      pUf.corpo.appendChild(L.graf.legenda([{ rot: "Higiene & Beleza", cor: corHB }, { rot: "Demais", cor: corSem }]));
      // por equipe
      var pEq = L.painel({ titulo: "H&B por equipe de venda", sub: "% de H&B na venda da equipe", classe: "c-4" });
      var gE = L.h("div"); pEq.corpo.appendChild(gE);
      var eqT = {}, eqH = {}; R.eq_t.linhas.forEach(function (l) { eqT[l.k] = l.venda; }); R.eq_h.linhas.forEach(function (l) { eqH[l.k] = l; });
      var eqs = Object.keys(eqT).map(Number).filter(function (k) { return eqT[k] > 0; }).sort(function (a, b) { return eqT[b] - eqT[a]; }).slice(0, 12);
      L.graf.barras100(gE, {
        linhas: eqs.map(function (k) { return { rot: L.nomeDe("equipe", k), k: k, partes: [{ rot: "H&B", valor: eqH[k] ? eqH[k].venda : 0, cor: corHB }, { rot: "Demais", valor: eqT[k] - (eqH[k] ? eqH[k].venda : 0), cor: corSem }] }; }),
        fmtPct: function (x) { return L.fNum(x, 1) + "%"; }, linhaH: 32,
        dica: function (i) { var k = eqs[i], h = eqH[k] ? eqH[k].venda : 0, t = eqT[k]; return { titulo: L.nomeDe("equipe", k), linhas: [{ cor: corHB, rot: "H&B", val: L.fBRL(h, 0) + " · " + L.fPct(h / t, 2) }, { cor: corSem, rot: "Demais", val: L.fBRL(t - h, 0) }] }; },
        aoClicar: function (i) { L.cliqueDim("equipe", eqs[i]); },
      });
      // mensal empilhado
      var mT = {}, mH = {}; R.m_t.linhas.forEach(function (l) { mT[l.k] = l.venda; }); R.m_h.linhas.forEach(function (l) { mH[l.k] = l.venda; });
      var ms = Object.keys(mT).map(Number).sort(function (a, b) { return a - b; }).slice(-18);
      var pMes = L.painel({ titulo: "H&B por mês", sub: "venda líquida: Higiene & Beleza + demais · últimos " + ms.length + " meses", classe: "c-8" });
      var gM = L.h("div"); pMes.corpo.appendChild(gM);
      L.graf.colunas(gM, {
        categorias: ms.map(function (k) { return L.fMesAno(D.meses[k]); }), modo: "empilhado", tipo: "moeda", fmt: function (v) { return L.fAbrev(v, false); }, altura: 330,
        series: [{ nome: "H&B", cor: corHB, valores: ms.map(function (k) { return mH[k] || 0; }) }, { nome: "Demais", cor: corSem, valores: ms.map(function (k) { return (mT[k] || 0) - (mH[k] || 0); }) }],
        dica: function (i) { var k = ms[i], h = mH[k] || 0, t = mT[k] || 0; return { titulo: L.fMesLongo(D.meses[k]), linhas: [{ cor: corHB, rot: "H&B", val: L.fBRL(h, 0) + " · " + L.fPct(h / t, 2) }, { cor: corSem, rot: "Demais", val: L.fBRL(t - h, 0) }, { rot: "Total", val: L.fBRL(t, 0) }] }; },
        aoClicar: function (i) { L.abrirDossie({ dim: "ym", id: ms[i] }); },
      });
      pMes.corpo.appendChild(L.graf.legenda([{ rot: "Higiene & Beleza", cor: corHB }, { rot: "Demais departamentos", cor: corSem }]));
      var rank = function (titulo, dim, res) {
        var p = L.painel({ titulo: titulo, sub: "dentro de H&B", classe: "c-4" }), g = L.h("div"); p.corpo.appendChild(g);
        L.graf.barras(g, { itens: res.linhas.map(function (l) { return { k: l.k, rot: L.nomeDe(dim, l.k), valor: l.venda }; }), fmt: function (v) { return L.fAbrev(v, true); }, total: hb.venda, linhaH: 28, cor: function (i) { return i === 0 ? C.ouro : corHB; },
          dica: function (i) { var l = res.linhas[i]; return { titulo: L.nomeDe(dim, l.k), linhas: [{ rot: "Venda líquida", val: L.fBRL(l.venda, 0) }, { rot: "Participação em H&B", val: L.fPct(l.venda / hb.venda, 1) }, { rot: "Positivação", val: L.fInt(l.pos) }] }; },
          aoClicar: function (i, s, ev) { L.cliqueDim(dim, res.linhas[i].k, ev); } });
        return p;
      };
      raiz.appendChild(L.grade(pRos, pUf, pEq, pMes, rank("Categorias de H&B", "categoria", R.cat_h), rank("Fornecedores de H&B", "fornecedor", R.forn_h)));
      raiz.appendChild(L.nota("Higiene & Beleza segue a classificação do Trade Marketing (departamento “Higiene_Beleza”). O filtro de departamento não se aplica a esta tela: ela já é o recorte de H&B contra o restante."));
    });
  },
});

/* ============================================================================
 * DEVOLUÇÕES
 * ========================================================================= */
L.registrarPagina({
  id: "devolucao", titulo: "Devoluções", olho: "Vendas", grupo: "Vendas", icone: "devolucao", filtros: FILTROS_VENDA, mais: MAIS_VENDA,
  render: function (raiz) {
    var D = L.D, cmp = L.comparar(L.estado.filtros);
    var ped = [].concat(L.pedidosCmp("res", "resumo", {}, cmp), [
      { id: "ym", tipo: "agrupar", por: "ym", filtros: SEM }, { id: "ano", tipo: "agrupar", por: "ano", filtros: SEM },
      { id: "uf", tipo: "agrupar", por: "uf", dist: ["pos_dev"], ordenar: "dev" }, { id: "forn", tipo: "agrupar", por: "fornecedor", dist: ["pos_dev"], ordenar: "dev", limite: 12 },
      { id: "dep", tipo: "agrupar", por: "depto", ordenar: "dev" }, { id: "cat", tipo: "agrupar", por: "categoria", ordenar: "dev", limite: 12 },
      { id: "ramo", tipo: "agrupar", por: "ramo", ordenar: "dev", limite: 12 }, { id: "prod", tipo: "agrupar", por: "produto", ordenar: "dev", limite: 15 },
      { id: "cli", tipo: "agrupar", por: "cliente", ordenar: "dev", limite: 15 }, { id: "rca", tipo: "agrupar", por: "rca", ordenar: "dev", limite: 15 }]);
    return L.consultar(ped).then(function (j) {
      var R = j.resultados, C = L.cores(), at = L.derivar(R.res), aa = R.res_aa ? L.derivar(R.res_aa) : null, pa = R.res_pa ? L.derivar(R.res_pa) : null;
      var fBR0 = function (v) { return L.fBRL(v, 0); }, f2 = function (v) { return L.fNum(v, 2) + "%"; };
      var kc = function (campo, fmt) { return cmp ? { cmp: cmp, aa: aa ? aa[campo] : null, pa: pa ? pa[campo] : null, fmt: fmt, inverso: true } : null; };
      raiz.appendChild(L.kpis(
        L.kpi({ icone: "devolucao", rot: "Devoluções", valor: at.dev, fmt: fBR0, classe: "heroi", cmp: kc("dev", fBR0), aoClicar: function () { L.abrirDossie({ dim: null }); }, leg: L.h("span", { text: "valor devolvido no período" }) }),
        L.kpi({ icone: "percent", rot: "% sobre a venda bruta", valor: at.pctDev == null ? null : at.pctDev * 100, fmt: f2, classe: at.pctDev > 0.04 ? "atencao" : "", cmp: cmp ? { cmp: cmp, aa: aa ? aa.pctDev * 100 : null, pa: pa ? pa.pctDev * 100 : null, fmt: f2, pp: true, inverso: true } : null, leg: L.h("span", { text: "bruta " + L.fAbrev(at.bruta, true) }) }),
        L.kpi({ icone: "pessoas", rot: "Clientes com devolução", valor: at.pos_dev, fmt: L.fInt, cmp: kc("pos_dev", L.fInt), leg: L.h("span", { text: L.fPct(L.div(at.pos_dev, at.pos), 1) + " dos positivados" }) }),
        L.kpi({ icone: "etiqueta", rot: "Devolução por cliente", valor: L.div(at.dev, at.pos_dev), fmt: fBR0, leg: L.h("span", { text: "ticket médio de devolução" }) }),
        L.kpi({ icone: "caixa", rot: "Unidades devolvidas", valor: at.qtd_dev, fmt: L.fInt, leg: L.h("span", { text: L.fPct(L.div(at.qtd_dev, at.qtd + at.qtd_dev), 2) + " das unidades vendidas" }) })));
      var sel = L.misDe(L.estado.filtros);
      var ym = R.ym.linhas.slice().sort(function (a, b) { return a.k - b.k; }).slice(-24);
      var pM = L.painel({ titulo: "Devolução por mês", sub: "valor devolvido e % da venda bruta · últimos " + ym.length + " meses · dourado = meses do período", classe: "c-8" });
      var g1 = L.h("div"), g2 = L.h("div", { style: { marginTop: "6px" } });
      pM.corpo.appendChild(g1);
      pM.corpo.appendChild(L.h("div", { style: { font: "700 11px var(--f-txt)", letterSpacing: ".14em", textTransform: "uppercase", color: "var(--t3)", margin: "12px 0 4px" }, text: "% da venda bruta" })); pM.corpo.appendChild(g2);
      var cats = ym.map(function (l) { return L.fMesAno(D.meses[l.k]); });
      L.graf.colunas(g1, { categorias: cats, series: [{ nome: "Devolução", valores: ym.map(function (l) { return l.dev; }) }], tipo: "moeda", fmt: function (v) { return L.fAbrev(v, false); }, altura: 270,
        corBarra: function (ci) { return sel.indexOf(ym[ci].k) >= 0 ? C.ouro : C.d[4]; },
        dica: function (i) { var l = ym[i]; return { titulo: L.fMesLongo(D.meses[l.k]), linhas: [{ rot: "Devolução", val: L.fBRL(l.dev, 0) }, { rot: "Venda bruta", val: L.fBRL(l.bruta, 0) }, { rot: "% da bruta", val: L.fPct(l.dev / l.bruta, 2) }] }; }, aoClicar: function (i) { L.abrirDossie({ dim: "ym", id: ym[i].k }); } });
      L.graf.linhas(g2, { categorias: cats, series: [{ nome: "% devolução", cor: C.d[4], destaque: true, area: true, valores: ym.map(function (l) { return l.bruta ? l.dev / l.bruta * 100 : null; }) }], tipo: "pct", fmt: function (v) { return L.fNum(v, 1) + "%"; }, altura: 200,
        dica: function (i) { var l = ym[i]; return { titulo: L.fMesLongo(D.meses[l.k]), linhas: [{ rot: "% da venda bruta", val: L.fPct(l.dev / l.bruta, 2) }] }; }, aoClicar: function (i) { L.abrirDossie({ dim: "ym", id: ym[i].k }); } });
      var pAno = L.painel({ titulo: "Devolução por ano", classe: "c-4", sub: "* ano em andamento" });
      var g3 = L.h("div"); pAno.corpo.appendChild(g3);
      var anos = R.ano.linhas.slice().sort(function (a, b) { return a.k - b.k; });
      L.graf.colunas(g3, { categorias: anos.map(function (l) { return String(L.anos[l.k]) + (L.anos[l.k] === L.anoAtual ? "*" : ""); }), series: [{ nome: "Devolução", valores: anos.map(function (l) { return l.dev; }) }], tipo: "moeda", fmt: function (v) { return L.fAbrev(v, true); }, altura: 330,
        corBarra: function (ci) { return L.corAno(L.anos[anos[ci].k]); }, dica: function (i) { var l = anos[i]; return { titulo: String(L.anos[l.k]), linhas: [{ rot: "Devolução", val: L.fBRL(l.dev, 0) }, { rot: "% da bruta", val: L.fPct(l.dev / l.bruta, 2) }] }; }, aoClicar: function (i, s, ev) { L.cliqueDim("ano", L.anos[anos[i].k], ev); } });
      var rk = function (titulo, dim, res, classe, sub) {
        var p = L.painel({ titulo: titulo, classe: classe, sub: sub || "maior valor devolvido primeiro" }), g = L.h("div"); p.corpo.appendChild(g);
        var itens = res.linhas.filter(function (l) { return l.dev > 0; });
        L.graf.barras(g, { itens: itens.map(function (l) { return { k: l.k, rot: L.nomeDe(dim, l.k), valor: l.dev }; }), fmt: function (v) { return L.fAbrev(v, true); }, total: at.dev, linhaH: 28, cor: function (i) { return i === 0 ? C.ouro : C.d[4]; },
          dica: function (i) { var l = itens[i]; return { titulo: L.nomeDe(dim, l.k), linhas: [{ rot: "Devolução", val: L.fBRL(l.dev, 0) }, { rot: "% da devolução total", val: L.fPct(l.dev / at.dev, 1) }, { rot: "% da venda bruta dele", val: L.fPct(l.dev / l.bruta, 2) }] }; },
          aoClicar: function (i, s, ev) { L.cliqueDim(dim, itens[i].k, ev); } });
        return p;
      };
      raiz.appendChild(L.grade(pM, pAno, rk("Devolução por estado", "uf", R.uf, "c-4"), rk("Por departamento", "depto", R.dep, "c-4"), rk("Por ramo do cliente", "ramo", R.ramo, "c-4"),
        rk("Principais fornecedores", "fornecedor", R.forn, "c-6"), rk("Principais categorias", "categoria", R.cat, "c-6"),
        rk("Produtos mais devolvidos", "produto", R.prod, "c-6", "top 15 por valor"), rk("Clientes que mais devolveram", "cliente", R.cli, "c-6", "top 15 por valor"), rk("RCAs com mais devolução", "rca", R.rca, "c-12", "top 15 por valor")));
      raiz.appendChild(L.nota("Devolução = notas de entrada por devolução de cliente (operação ED), pelo valor da linha. O percentual é sobre a venda bruta do mesmo recorte; a venda líquida das outras telas já desconta este valor."));
    });
  },
});

})();
