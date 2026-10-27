/* =============================================================================
 * pag-vendas.js — telas de venda: Visão geral, Comparativo anual,
 * Higiene & Beleza e Devoluções.
 * Toda barra, ponto, fatia, cartão e linha de tabela abre o relatório
 * (dossiê) do que foi clicado; Ctrl+clique aplica como filtro.
 * ========================================================================== */
(function () {
"use strict";
var L = window.L;
L.paginas = L.paginas || {};

var FILTROS_VENDA = ["ano", "mes", "uf", "equipe", "rca", "comprador", "fornecedor", "depto", "categoria", "ramo"];
var MAIS_VENDA = ["subcategoria", "marca", "municipio", "cliente", "produto", "origem"];

/* ------------------------------ utilidades das telas de venda ------------------------------ */
var SEM = { ano: null, mes: null, de: null, ate: null, mis: null };

/* clique padrão: abre o relatório; Ctrl/⌘ aplica o filtro direto */
L.cliqueDim = function (dim, id, ev) {
  if (ev && (ev.ctrlKey || ev.metaKey)) { L.alternarFiltro(dim, id); L.toast(L.DIM[dim].rot + ": " + L.nomeDe(dim, id)); return; }
  L.abrirDossie({ dim: dim, id: id });
};

L.derivar = function (r) {
  if (!r) return {};
  return Object.assign({}, r, { ticket: L.div(r.venda, r.pos), mix: L.div(r.pares, r.pos), valorKg: L.div(r.venda, r.peso), pctDev: L.div(r.dev, r.bruta) });
};

function subPeriodo(cmp) {
  if (!cmp) return "";
  return cmp.rot + (cmp.parcial ? " · dados até " + cmp.ateDia : "");
}

/* tabela de ranking padrão (nome, venda, %, positivação, ticket) a partir de linhas do motor */
function linhasRank(res, dim, total) {
  return res.linhas.map(function (l) { return { id: l.k, nome: L.nomeDe(dim, l.k), venda: l.venda, pos: l.pos, ticket: L.div(l.venda, l.pos), part: L.div(l.venda, total) }; });
}
L.linhasRank = linhasRank;

/* ============================================================================
 * VISÃO GERAL
 * ========================================================================= */
L.registrarPagina({
  id: "visao", titulo: "Visão geral das vendas", olho: "Vendas", grupo: "Vendas", icone: "home", filtros: FILTROS_VENDA, mais: MAIS_VENDA,
  render: function (raiz) {
    var F = L.estado.filtros, cmp = L.comparar(F);
    var ped = [].concat(
      L.pedidosCmp("res", "resumo", {}, cmp),
      [{ id: "anomes", tipo: "agrupar", por: ["ano", "mes"], dist: ["pos"], filtros: Object.assign({}, SEM) },
       { id: "ano", tipo: "agrupar", por: "ano", dist: ["pos"], filtros: Object.assign({}, SEM) },
       { id: "uf", tipo: "agrupar", por: "uf", dist: ["pos"] },
       { id: "equipe", tipo: "agrupar", por: "equipe", dist: ["pos"] },
       { id: "depto", tipo: "agrupar", por: "depto", dist: ["pos"] },
       { id: "forn", tipo: "agrupar", por: "fornecedor", dist: ["pos"], limite: 12 },
       { id: "cat", tipo: "agrupar", por: "categoria", dist: ["pos"], limite: 12 },
       { id: "ramo", tipo: "agrupar", por: "ramo", dist: ["pos"], limite: 12 },
       { id: "origem", tipo: "agrupar", por: "origem" }],
      cmp && cmp.aa ? [{ id: "gp", tipo: "agrupar", por: (L.estado.ganhoDim || "fornecedor"), corte: L.mesesHojeNa(cmp) },
                       { id: "gp_aa", tipo: "agrupar", por: (L.estado.ganhoDim || "fornecedor"), filtros: { ano: null, mes: null, de: null, ate: null, mis: cmp.aa.mis }, corte: cmp.aa.corte }] : [],
      L.HOJE ? [{ id: "hoje", tipo: "hoje", hora: new Date().getHours() }] : []);
    return L.consultar(ped).then(function (j) {
      var R = j.resultados, C = L.cores();
      var at = L.derivar(R.res), aa = R.res_aa ? L.derivar(R.res_aa) : null, pa = R.res_pa ? L.derivar(R.res_pa) : null;
      var atF = L.cmpFechado(R, "res");          // com a venda de hoje nos totais: a % compara só os dias fechados
      var D = L.D, total = at.venda;

      /* --- KPIs --- */
      var kpiCmp = function (campo, fmt, extra) { return cmp ? L.comAtualFechado(Object.assign({ cmp: cmp, aa: aa ? aa[campo] : null, pa: pa ? pa[campo] : null, fmt: fmt }, extra || {}), atF, campo) : null; };
      var fBR0 = function (v) { return L.fBRL(v, 0); };
      if (R.hoje && R.hoje.ativo) raiz.appendChild(L.cartaoHoje(R.hoje));
      raiz.appendChild(L.kpis(
        L.kpi({ icone: "dinheiro", rot: "Venda líquida", valor: at.venda, fmt: fBR0, classe: "heroi", cmp: kpiCmp("venda", fBR0), aoClicar: function () { L.abrirDossie({ dim: null }); },
                ajuda: "Venda bruta menos devoluções. Clique para abrir o relatório da seleção.",
                leg: L.h("span", { text: "Bruta " + L.fAbrev(at.bruta, true) + " · devolução " + L.fAbrev(at.dev, true) }) }),
        L.kpi({ icone: "pessoas", rot: "Positivação", valor: at.pos, fmt: L.fInt, cmp: kpiCmp("pos", L.fInt), leg: L.h("span", { text: "clientes que compraram" }) }),
        L.kpi({ icone: "etiqueta", rot: "Ticket médio", valor: at.ticket, fmt: fBR0, cmp: kpiCmp("ticket", fBR0), leg: L.h("span", { text: "venda por cliente positivado" }) }),
        L.kpi({ icone: "camadas", rot: "Mix médio", valor: at.mix, fmt: function (v) { return L.fNum(v, 1); }, cmp: kpiCmp("mix", function (v) { return L.fNum(v, 1); }), leg: L.h("span", { text: "produtos por cliente" }) }),
        L.kpi({ icone: "caixa", rot: "SKUs vendidos", valor: at.skus, fmt: L.fInt, cmp: kpiCmp("skus", L.fInt), leg: L.h("span", { text: L.fAbrev(at.qtd, false) + " un. · " + L.fBRL(at.valorKg, 2) + "/kg" }) })
      ));

      /* --- aviso: parte da venda está em produtos fora da planilha de classificação do Trade --- */
      var herdada = R.origem.linhas.filter(function (l) { return l.k > 0; }).reduce(function (s, l) { return s + l.venda; }, 0);
      if (total > 0 && herdada / total > 0.01) {
        raiz.appendChild(L.h("div", { class: "aviso-class" },
          L.h("span", { html: L.ic("info") }),
          L.h("div", { html: "<b>" + L.fPct(herdada / total, 1) + " da venda (" + L.fAbrev(herdada, true) + ")</b> está em produtos que ainda não constam na planilha de classificação do Trade — eles herdam o departamento da seção do WinThor. Atualizar a planilha <i>Categoria e subcategoria</i> corrige departamento, categoria e marca." }),
          L.h("button", { class: "mini-btn", type: "button", text: "Ver os produtos", onclick: function () { L.estado.filtros.origem = [1, 2]; L.irPara("analise", { por: "produto" }); L.setFiltro("origem", [1, 2]); } })));
      }

      /* --- venda mensal por ano (linhas) + venda por ano (colunas) --- */
      var porAnoMes = {};
      R.anomes.linhas.forEach(function (l) { (porAnoMes[l.k[0]] = porAnoMes[l.k[0]] || {})[l.k[1]] = l; });
      var anosIdx = Object.keys(porAnoMes).map(Number).sort(), anoValor = function (k) { return L.anos[k]; };
      var anoAtualVal = L.anos[L.anos.length - 1], ult = D.corte.mi;
      var yc = +D.corte.ate.slice(0, 4), mc = +D.corte.ate.slice(5, 7);
      var parcialIdx = D.corte.dia < new Date(yc, mc, 0).getDate() ? mc - 1 : null;    // mês em andamento (índice do mês do ano)
      var serVenda = anosIdx.map(function (k) {
        var y = anoValor(k);
        return { nome: String(y), cor: L.corAno(y), destaque: y === anoAtualVal, area: y === anoAtualVal, parcial: y === anoAtualVal ? parcialIdx : null, valores: L.MES3.map(function (_, m) { var l = porAnoMes[k][m]; return l ? l.venda : null; }) };
      });
      var serPos = anosIdx.map(function (k) {
        var y = anoValor(k);
        return { nome: String(y), cor: L.corAno(y), destaque: y === anoAtualVal, parcial: y === anoAtualVal ? parcialIdx : null, valores: L.MES3.map(function (_, m) { var l = porAnoMes[k][m]; return l ? l.pos : null; }) };
      });
      var segRot = L.h("div", { class: "seg" });
      [["atual", "Rótulos: ano atual"], ["todos", "Rótulos: todos os anos"]].forEach(function (o) {
        segRot.appendChild(L.h("button", { type: "button", "data-m": o[0], class: (L.estado.rotModo || "atual") === o[0] ? "on" : "", text: o[1], onclick: function () { L.estado.rotModo = o[0]; segRot.querySelectorAll("button").forEach(function (b) { b.classList.toggle("on", b.dataset.m === o[0]); }); desenharMensal(); } }));
      });
      var pMensal = L.painel({ titulo: "Venda e positivação por mês", sub: "uma linha por ano · o filtro de ano não corta este gráfico" + (parcialIdx != null ? " · * mês em andamento (até " + L.fData(D.corte.ate).slice(0, 5) + ")" : ""), classe: "c-8", acoes: [segRot] });
      var gv = L.h("div"), gp = L.h("div", { style: { marginTop: "6px" } });
      pMensal.corpo.appendChild(L.h("div", { style: { font: "700 11px var(--f-txt)", letterSpacing: ".14em", textTransform: "uppercase", color: "var(--t3)", margin: "2px 0 4px" }, text: "Venda líquida (R$)" }));
      pMensal.corpo.appendChild(gv);
      pMensal.corpo.appendChild(L.h("div", { style: { font: "700 11px var(--f-txt)", letterSpacing: ".14em", textTransform: "uppercase", color: "var(--t3)", margin: "12px 0 4px" }, text: "Clientes positivados" }));
      pMensal.corpo.appendChild(gp);
      pMensal.corpo.appendChild(G_leg(serVenda));
      var abrirMes = function (i, s, ser) {
        var k = s != null ? anosIdx[s] : anosIdx[anosIdx.length - 1];
        var y = anoValor(k), mi = D.meses.indexOf(y + "-" + String(i + 1).padStart(2, "0"));
        if (mi < 0) return;
        L.abrirDossie({ dim: "ym", id: mi });
      };
      var dicaMes = function (fm, ser) {
        return function (i) {
          var linhas = ser.filter(function (s) { return s.valores[i] != null; }).map(function (s) { return { cor: s.cor, rot: s.nome + (s.parcial != null && i >= s.parcial ? " (parcial)" : ""), val: fm(s.valores[i]) }; });
          return { titulo: L.MESES[i], linhas: linhas, clique: "Clique em um ponto para abrir o relatório do mês" };
        };
      };
      var desenharMensal = function () {
        var modo = (L.estado.rotModo || "atual") === "todos" ? true : "destaque";
        L.graf.linhas(gv, { categorias: L.MES3, series: serVenda, tipo: "moeda", fmt: function (v) { return L.fAbrev(v, false); }, altura: 320, rotulos: modo, aoClicar: function (i, s) { abrirMes(i, s, serVenda); }, dica: dicaMes(function (v) { return L.fBRL(v, 0); }, serVenda) });
        L.graf.linhas(gp, { categorias: L.MES3, series: serPos, tipo: "num", fmt: L.fInt, altura: 230, rotulos: modo, aoClicar: function (i, s) { abrirMes(i, s, serPos); }, dica: dicaMes(L.fInt, serPos) });
      };
      desenharMensal();

      /* --- por ano --- */
      var pAno = L.painel({ titulo: "Venda líquida por ano", sub: "o último ano está parcial (até " + L.fData(D.corte.ate).slice(0, 5) + ")", classe: "c-4" });
      var gAno = L.h("div"); pAno.corpo.appendChild(gAno);
      var lAno = R.ano.linhas.slice().sort(function (a, b) { return a.k - b.k; });
      L.graf.colunas(gAno, {
        categorias: lAno.map(function (l) { return String(anoValor(l.k)) + (anoValor(l.k) === anoAtualVal ? "*" : ""); }),
        series: [{ nome: "Venda líquida", valores: lAno.map(function (l) { return l.venda; }) }],
        tipo: "moeda", fmt: function (v) { return L.fAbrev(v, true); }, altura: 340,
        corBarra: function (ci) { return L.corAno(anoValor(lAno[ci].k)); },
        dica: function (i) {
          var l = lAno[i], ant = i > 0 ? lAno[i - 1] : null;
          var ls = [{ rot: "Venda líquida", val: L.fBRL(l.venda, 0) }, { rot: "Positivação", val: L.fInt(l.pos) }];
          if (ant) ls.push({ rot: "vs " + anoValor(ant.k), val: L.fDelta(L.crescimento(l.venda, ant.venda), 1) });
          return { titulo: String(anoValor(l.k)), linhas: ls };
        },
        aoClicar: function (i, s, ev) { L.cliqueDim("ano", anoValor(lAno[i].k), ev); },
      });

      /* --- estado, equipe --- */
      var cores8 = C.d;
      var pUf = L.painel({ titulo: "Venda por estado", classe: "c-4", sub: subPeriodo(cmp) });
      var gUf = L.h("div"); pUf.corpo.appendChild(gUf);
      L.graf.barras(gUf, {
        itens: R.uf.linhas.map(function (l, i) { return { k: l.k, rot: D.uf[l.k], valor: l.venda, cor: cores8[i % 8], l: l }; }),
        fmt: function (v) { return L.fAbrev(v, true); }, linhaH: 38, total: total,
        dica: function (i) { var l = R.uf.linhas[i]; return { titulo: D.uf[l.k], linhas: [{ rot: "Venda líquida", val: L.fBRL(l.venda, 0) }, { rot: "Participação", val: L.fPct(l.venda / total, 1) }, { rot: "Positivação", val: L.fInt(l.pos) }, { rot: "Ticket médio", val: L.fBRL(l.venda / l.pos, 0) }] }; },
        aoClicar: function (i, s, ev) { L.cliqueDim("uf", R.uf.linhas[i].k, ev); },
      });

      var pEq = L.painel({ titulo: "Venda por equipe", classe: "c-4", sub: subPeriodo(cmp) });
      var gEq = L.h("div"); pEq.corpo.appendChild(gEq);
      var lEq = R.equipe.linhas.slice(0, 12);
      L.graf.barras(gEq, {
        itens: lEq.map(function (l) { return { k: l.k, rot: L.nomeDe("equipe", l.k), valor: l.venda }; }),
        fmt: function (v) { return L.fAbrev(v, true); }, linhaH: 28, total: total, cor: C.d[0],
        dica: function (i) { var l = lEq[i]; return { titulo: L.nomeDe("equipe", l.k), linhas: [{ rot: "Venda líquida", val: L.fBRL(l.venda, 0) }, { rot: "Participação", val: L.fPct(l.venda / total, 1) }, { rot: "Positivação", val: L.fInt(l.pos) }] }; },
        aoClicar: function (i, s, ev) { L.cliqueDim("equipe", lEq[i].k, ev); },
      });

      /* --- departamento (rosca + legenda) --- */
      var pDep = L.painel({ titulo: "Venda por departamento", classe: "c-4", sub: "clique em uma fatia ou na legenda" });
      var gDep = L.h("div"); pDep.corpo.appendChild(gDep);
      var dep = R.depto.linhas.map(function (l, i) { return { k: l.k, rot: L.nomeDe("depto", l.k), valor: l.venda, cor: cores8[i % 8], corTexto: i === 1 ? "#1b1303" : "#fff" }; });
      var depTop = dep.slice(0, 7), outros = dep.slice(7).reduce(function (s, x) { return s + x.valor; }, 0);
      if (outros > 0) depTop.push({ k: -2, rot: "Outros", valor: outros, cor: C.d[7] });
      depTop.forEach(function (f, i) { f.cor = cores8[i % 8]; f.corTexto = (cores8[i % 8] === C.d[1] || cores8[i % 8] === C.d[3]) ? "#0b1533" : "#fff"; });
      L.graf.rosca(gDep, {
        fatias: depTop, fmt: function (v) { return L.fAbrev(v, true); }, altura: 250, centro: { valor: L.fAbrev(total, true), titulo: "venda líquida" },
        dica: function (i, s, f, tot) { return { titulo: f.rot, linhas: [{ rot: "Venda líquida", val: L.fBRL(f.valor, 0) }, { rot: "Participação", val: L.fPct(f.valor / tot, 1) }] }; },
        aoClicar: function (i, s, ev) { if (depTop[i].k >= 0) L.cliqueDim("depto", depTop[i].k, ev); },
      });
      pDep.corpo.appendChild(L.graf.legendaLista(depTop, function (v) { return L.fAbrev(v, true); }, function (i, ev) { if (depTop[i].k >= 0) L.cliqueDim("depto", depTop[i].k, ev); }));

      /* --- fornecedor / categoria / ramo --- */
      var topPainel = function (titulo, dim, res, classe, linhaH) {
        var p = L.painel({ titulo: titulo, classe: classe, sub: subPeriodo(cmp), acoes: [L.btnPainel("tabela", "Ver tudo", function () { L.irPara("analise", { por: dim }); }, "Abrir na Análise de venda")] });
        var g = L.h("div"); p.corpo.appendChild(g);
        L.graf.barras(g, {
          itens: res.linhas.map(function (l) { return { k: l.k, rot: L.nomeDe(dim, l.k), valor: l.venda }; }),
          fmt: function (v) { return L.fAbrev(v, true); }, linhaH: linhaH || 28, total: total, cor: function (i) { return i === 0 ? C.ouro : C.d[0]; },
          dica: function (i) { var l = res.linhas[i]; return { titulo: L.nomeDe(dim, l.k), linhas: [{ rot: "Venda líquida", val: L.fBRL(l.venda, 0) }, { rot: "Participação", val: L.fPct(l.venda / total, 1) }, { rot: "Positivação", val: L.fInt(l.pos) }, { rot: "Ticket médio", val: L.fBRL(l.venda / l.pos, 0) }] }; },
          aoClicar: function (i, s, ev) { L.cliqueDim(dim, res.linhas[i].k, ev); },
        });
        return p;
      };
      var pForn = topPainel("Principais fornecedores", "fornecedor", R.forn, "c-6");
      var pCat = topPainel("Principais categorias", "categoria", R.cat, "c-6");
      var pRamo = topPainel("Grupo de cliente (ramo)", "ramo", R.ramo, "c-6");

      /* --- sazonalidade --- */
      var pCalor = L.painel({ titulo: "Sazonalidade", sub: "venda líquida por mês e ano — quanto mais dourado, maior o mês", classe: "c-6" });
      var gCalor = L.h("div"); pCalor.corpo.appendChild(gCalor);
      L.graf.calor(gCalor, {
        linhas: anosIdx.map(function (k) { return { rot: String(anoValor(k)), valores: L.MES3.map(function (_, m) { var l = porAnoMes[k][m]; return l ? l.venda : null; }) }; }),
        colunas: L.MES3.map(function (m) { return m; }),
        fmt: function (v) { return L.fNum(v / 1e6, 2); },
        dica: function (li, ci) { var k = anosIdx[li], l = porAnoMes[k][ci]; return { titulo: L.MESES[ci] + "/" + anoValor(k), linhas: [{ rot: "Venda líquida", val: L.fBRL(l.venda, 0) }, { rot: "Positivação", val: L.fInt(l.pos) }], clique: "Clique para abrir o relatório do mês" }; },
        aoClicar: function (li, ci) { var y = anoValor(anosIdx[li]), mi = D.meses.indexOf(y + "-" + String(ci + 1).padStart(2, "0")); if (mi >= 0) L.abrirDossie({ dim: "ym", id: mi }); },
      });
      pCalor.corpo.appendChild(L.h("div", { class: "calor-nota", text: "Valores em R$ milhões." }));

      /* --- ganhos e perdas contra o ano anterior --- */
      var pGP = null;
      if (R.gp && R.gp_aa) {
        var dimGP = L.estado.ganhoDim || "fornecedor", mapa = {}, base = {};
        R.gp.linhas.forEach(function (l) { mapa[l.k] = l.venda; }); R.gp_aa.linhas.forEach(function (l) { base[l.k] = l.venda; });
        var chaves = {}; Object.keys(mapa).concat(Object.keys(base)).forEach(function (k) { chaves[k] = 1; });
        var difs = Object.keys(chaves).map(function (k) { k = +k; var a = mapa[k] || 0, b = base[k] || 0; return { k: k, a: a, b: b, d: a - b }; });
        var ganhos = difs.filter(function (x) { return x.d > 0; }).sort(function (x, y) { return y.d - x.d; }).slice(0, 8);
        var perdas = difs.filter(function (x) { return x.d < 0; }).sort(function (x, y) { return x.d - y.d; }).slice(0, 8);
        var totGanho = difs.reduce(function (s, x) { return s + (x.d > 0 ? x.d : 0); }, 0), totPerda = difs.reduce(function (s, x) { return s + (x.d < 0 ? -x.d : 0); }, 0);
        var segG = L.h("div", { class: "seg", style: { flexWrap: "wrap" } });
        [["fornecedor", "Fornecedor"], ["categoria", "Categoria"], ["depto", "Departamento"], ["marca", "Marca"], ["rca", "RCA"], ["equipe", "Equipe"], ["ramo", "Ramo"]].forEach(function (o) {
          segG.appendChild(L.h("button", { type: "button", class: o[0] === dimGP ? "on" : "", text: o[1], onclick: function () { L.estado.ganhoDim = o[0]; L.emitir("filtros"); } }));
        });
        pGP = L.painel({ titulo: "Ganhos e perdas contra o ano anterior", sub: cmp.rot + " contra " + cmp.aa.rot + " · variação da venda líquida em R$, por " + L.DIM[dimGP].rot.toLowerCase(), classe: "c-12", acoes: [segG] });
        var duas = L.h("div", { style: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: "28px" } });
        var lado = function (titulo, lista, cor, sinal, tot) {
          var col = L.h("div"), g = L.h("div");
          col.appendChild(L.h("div", { style: { display: "flex", justifyContent: "space-between", margin: "4px 0 8px", font: "800 12px var(--f-tit)", letterSpacing: ".12em", textTransform: "uppercase", color: cor } },
            L.h("span", { text: titulo }), L.h("span", { class: "num", style: { color: "var(--t2)" }, text: sinal + L.fAbrev(tot, true) + " no total" })));
          col.appendChild(g);
          L.graf.barras(g, {
            itens: lista.map(function (x) { return { k: x.k, rot: L.nomeDe(dimGP, x.k), valor: Math.abs(x.d), rotuloValor: sinal + L.fAbrev(Math.abs(x.d), true) + (x.b ? " · " + L.fDelta(x.a / x.b - 1, 0) : " · novo") }; }),
            fmt: function (v) { return L.fAbrev(v, true); }, pct: false, linhaH: 30, cor: cor,
            dica: function (i) { var x = lista[i]; return { titulo: L.nomeDe(dimGP, x.k), linhas: [{ rot: cmp.rot, val: L.fBRL(x.a, 0) }, { rot: cmp.aa.rot, val: L.fBRL(x.b, 0) }, { rot: "Diferença", val: (x.d > 0 ? "+" : "−") + L.fBRL(Math.abs(x.d), 0) }] }; },
            aoClicar: function (i, s, ev) { L.cliqueDim(dimGP, lista[i].k, ev); },
          });
          return col;
        };
        duas.appendChild(lado("Quem mais cresceu", ganhos, C.ok, "+", totGanho));
        duas.appendChild(lado("Quem mais perdeu", perdas, C.perigo, "−", totPerda));
        pGP.corpo.appendChild(duas);
      }
      raiz.appendChild(L.grade(pMensal, pAno, pGP, pUf, pEq, pDep, pForn, pCat, pRamo, pCalor));
      raiz.appendChild(L.nota("Venda líquida = vendas (operação S) menos devoluções (operação ED), a preço de venda + outras despesas, das filiais 1, 7, 10, 11 e 12. Positivação conta clientes com venda no recorte; mix é a média de produtos distintos por cliente. Comparações usam sempre o mesmo número de dias (mês em andamento contra o mesmo trecho do mês comparado)."));
    });
  },
});

/* legenda de séries (cores dos anos) */
function G_leg(series) {
  return L.graf.legenda(series.map(function (s) { return { rot: s.nome, cor: s.cor }; }));
}

})();
