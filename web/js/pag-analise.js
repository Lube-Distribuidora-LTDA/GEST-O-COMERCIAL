/* =============================================================================
 * pag-analise.js — Análise de venda (tabela por qualquer dimensão, com
 * comparativo) e Curva ABC (produtos ou clientes).
 * ========================================================================== */
(function () {
"use strict";
var L = window.L;
var FILTROS_VENDA = ["ano", "mes", "uf", "equipe", "rca", "comprador", "fornecedor", "depto", "categoria", "ramo"];
var MAIS_VENDA = ["subcategoria", "marca", "municipio", "cliente", "produto", "origem"];
var NUL = { ano: null, mes: null, de: null, ate: null, mis: null };
var MEDIDA_ORD = { venda: "venda", bruta: "bruta", dev: "dev", pos: "pos", skus: "skus", qtd: "qtd" };

/* ============================================================================
 * ANÁLISE DE VENDA
 * ========================================================================= */
var DIMS_ANALISE = [["cliente", "Cliente"], ["produto", "Produto"], ["rca", "RCA"], ["fornecedor", "Fornecedor"], ["categoria", "Categoria"], ["subcategoria", "Subcategoria"], ["depto", "Departamento"],
                    ["marca", "Marca"], ["comprador", "Comprador"], ["equipe", "Equipe"], ["uf", "Estado"], ["municipio", "Município"], ["ramo", "Ramo"], ["ym", "Mês"]];

L.registrarPagina({
  id: "analise", titulo: "Análise de venda", olho: "Vendas", grupo: "Vendas", icone: "tabela", filtros: FILTROS_VENDA, mais: MAIS_VENDA,
  render: function (raiz, params) {
    var por = (params && params.por) || L.estado.analisePor || "cliente";
    L.estado.analisePor = por;
    var cmp = L.comparar(L.estado.filtros), D = L.D;
    var rot = (DIMS_ANALISE.filter(function (d) { return d[0] === por; })[0] || [0, por])[1];
    return L.consultar(L.pedidosCmp("res", "resumo", {}, cmp)).then(function (j) {
      var R = j.resultados, at = L.derivar(R.res), aa = R.res_aa ? L.derivar(R.res_aa) : null, pa = R.res_pa ? L.derivar(R.res_pa) : null;
      var fBR0 = function (v) { return L.fBRL(v, 0); };
      var kc = function (campo, fmt) { return cmp ? { cmp: cmp, aa: aa ? aa[campo] : null, pa: pa ? pa[campo] : null, fmt: fmt } : null; };
      raiz.appendChild(L.kpis(
        L.kpi({ icone: "dinheiro", rot: "Venda líquida", valor: at.venda, fmt: fBR0, classe: "heroi", cmp: kc("venda", fBR0), aoClicar: function () { L.abrirDossie({ dim: null }); }, leg: L.h("span", { text: cmp ? cmp.rot + (cmp.parcial ? " · até " + cmp.ateDia : "") : "" }) }),
        L.kpi({ icone: "pessoas", rot: "Positivação", valor: at.pos, fmt: L.fInt, cmp: kc("pos", L.fInt) }),
        L.kpi({ icone: "etiqueta", rot: "Ticket médio", valor: at.ticket, fmt: fBR0, cmp: kc("ticket", fBR0) }),
        L.kpi({ icone: "camadas", rot: "Mix médio", valor: at.mix, fmt: function (v) { return L.fNum(v, 1); }, cmp: kc("mix", function (v) { return L.fNum(v, 1); }) }),
        L.kpi({ icone: "caixa", rot: "SKUs vendidos", valor: at.skus, fmt: L.fInt, cmp: kc("skus", L.fInt) })));

      var seg = L.h("div", { class: "seg", style: { flexWrap: "wrap" } });
      DIMS_ANALISE.forEach(function (d) { seg.appendChild(L.h("button", { type: "button", class: d[0] === por ? "on" : "", text: d[1], onclick: function () { L.estado.analisePor = d[0]; L.estado.params = { por: d[0] }; L.emitir("filtros"); } })); });
      raiz.appendChild(L.h("div", { style: { display: "flex", gap: "12px", alignItems: "center", margin: "0 0 14px", flexWrap: "wrap" } }, L.h("span", { class: "fx-rot", text: "Agrupar por" }), seg));

      var temPos = por !== "cliente" && por !== "ym" || por === "ym";
      var tab = L.tabela({
        titulo: "Venda por " + rot.toLowerCase(), arquivo: "analise-venda-por-" + por, aba: "Venda por " + rot.toLowerCase(), rank: true, porPagina: 50, ordem: { id: "venda", desc: true },
        busca: ["cliente", "produto", "rca", "fornecedor"].indexOf(por) >= 0, buscaDica: "Buscar " + rot.toLowerCase() + " por código ou nome…",
        filtrosTexto: function () { return L.descricaoFiltros([["Agrupado por", rot]]); },
        colunas: [
          { id: "nome", titulo: rot, tipo: "texto", ord: false, valor: function (r) { return r.nome; } },
          { id: "venda", titulo: "Venda líquida", tipo: "moedaInt", valor: function (r) { return r.venda; }, barra: true, exportarTipo: "moeda" },
          { id: "part", titulo: "% do total", tipo: "pct", ord: false, valor: function (r) { return at.venda ? r.venda / at.venda : null; } },
          { id: "base", titulo: "Venda " + (cmp && cmp.aa ? cmp.aa.rot : "ano ant."), tipo: "moedaInt", ord: false, valor: function (r) { return r.base; }, exportarTipo: "moeda", classe: "", dica: "Mesmo período do ano anterior, com o mesmo número de dias" },
          { id: "var", titulo: "Variação", tipo: "pct", ord: false, valor: function (r) { return r.base ? r.venda / r.base - 1 : null; }, fmt: function (v) { return v == null ? "—" : L.fDelta(v, 1); }, classe: function (v) { return v == null ? "" : v >= 0 ? "pos" : "neg"; } },
          { id: "bruta", titulo: "Venda bruta", tipo: "moedaInt", valor: function (r) { return r.bruta; }, essencial: false, exportarTipo: "moeda" },
          { id: "dev", titulo: "Devolução", tipo: "moedaInt", valor: function (r) { return r.dev; }, essencial: false, exportarTipo: "moeda" },
          { id: "pdev", titulo: "% devolução", tipo: "pct", ord: false, valor: function (r) { return r.bruta ? r.dev / r.bruta : null; }, essencial: false },
          por !== "cliente" ? { id: "pos", titulo: por === "produto" ? "Clientes" : "Positivação", tipo: "inteiro", valor: function (r) { return r.pos; } } : null,
          por !== "cliente" && por !== "produto" ? { id: "ticket", titulo: "Ticket médio", tipo: "moedaInt", ord: false, valor: function (r) { return r.pos ? r.venda / r.pos : null; }, exportarTipo: "moeda", essencial: false } : null,
          por !== "produto" ? { id: "skus", titulo: por === "cliente" ? "Mix (SKUs)" : "SKUs", tipo: "inteiro", valor: function (r) { return r.skus; }, essencial: false } : null,
          { id: "qtd", titulo: "Quantidade", tipo: "inteiro", valor: function (r) { return r.qtd; }, essencial: false },
          { id: "kg", titulo: "R$/kg", tipo: "num2", ord: false, valor: function (r) { return r.peso ? r.venda / r.peso : null; }, essencial: false },
        ].filter(Boolean),
        totais: function (res) { return [{ rot: "Venda líquida", valor: L.fBRL(at.venda, 0), pri: true }, { rot: rot + "s com venda", valor: L.fInt(res.total) }, { rot: "Positivação", valor: L.fInt(at.pos) }, { rot: "Ticket médio", valor: L.fBRL(at.ticket, 0) }, { rot: "Devolução", valor: L.fBRL(at.dev, 0) }]; },
        aoClicar: function (r, ev) { if (por === "ym") L.abrirDossie({ dim: "ym", id: r.id }); else L.cliqueDim(por, r.id, ev); },
        carregar: function (e) {
          var ordId = e.ord && MEDIDA_ORD[e.ord.id] ? MEDIDA_ORD[e.ord.id] : "venda";
          var dist = ["pos"]; if (por !== "produto") dist.push("skus");
          var ped = [{ id: "t", tipo: "agrupar", por: por, dist: dist, ordenar: por === "ym" ? "k" : ordId, desc: por === "ym" ? true : (e.ord ? e.ord.desc : true), limite: e.porPag || (e.exportando ? 60000 : undefined), offset: e.porPag ? e.pag * e.porPag : 0, busca: e.busca || undefined }];
          return L.consultar(ped, { canal: "tabela-analise" }).then(function (jj) {
            var res = jj.resultados.t;
            var ids = res.linhas.map(function (l) { return l.k; }).filter(function (k) { return k >= 0; });
            // comparativo com o mesmo período do ano anterior, só para as linhas da página
            if (cmp && cmp.aa && por !== "ym" && ids.length && ids.length <= 3000) {
              var f2 = { mis: cmp.aa.mis, ano: null, mes: null, de: null, ate: null }; f2[por] = ids;
              return L.consultar([{ id: "b", tipo: "agrupar", por: por, filtros: f2, corte: cmp.aa.corte }], { canal: "tabela-analise-b" }).then(function (jb) {
                var m = {}; jb.resultados.b.linhas.forEach(function (l) { m[l.k] = l.venda; });
                return fecha(res, m);
              });
            }
            return fecha(res, {});
          });
          function fecha(res, m) {
            return { total: res.total_grupos, linhas: res.linhas.map(function (l) {
              return { id: l.k, nome: por === "ym" ? L.fMesLongo(D.meses[l.k]) : L.nomeDe(por, l.k), venda: l.venda, bruta: l.bruta, dev: l.dev, pos: l.pos, skus: l.skus, qtd: l.qtd, peso: l.peso, base: m[l.k] != null ? m[l.k] : (cmp && cmp.aa && por !== "ym" ? 0 : null) };
            }) };
          }
        },
      });
      raiz.appendChild(L.grade(L.painel({ titulo: "Venda por " + rot.toLowerCase(), sub: "ordene pelas colunas · busque · exporte em Excel · clique em uma linha para abrir o relatório", classe: "c-12", semPad: true, corpo: tab })));
      raiz.appendChild(L.nota("A coluna do ano anterior usa o mesmo período e o mesmo número de dias. Positivação, mix e SKUs são contagens distintas dentro do recorte: não se somam entre linhas."));
    });
  },
});

/* ============================================================================
 * CURVA ABC
 * ========================================================================= */
L.registrarPagina({
  id: "abc", titulo: "Curva ABC", olho: "Vendas", grupo: "Vendas", icone: "pizza", filtros: FILTROS_VENDA, mais: MAIS_VENDA,
  render: function (raiz, params) {
    var por = (params && params.por) || L.estado.abcPor || "produto";
    L.estado.abcPor = por;
    var D = L.D, C = L.cores(), nomeP = por === "produto" ? "produtos" : "clientes";
    return L.consultar([{ id: "abc", tipo: "abc", por: por, limite: 1 }, { id: "res", tipo: "resumo" }]).then(function (j) {
      var A = j.resultados.abc, res = L.derivar(j.resultados.res), total = A.total;
      var corCl = [C.ouro, C.d[0], C.d[7]], txtCl = ["#1b1303", "#fff", "#fff"];
      var seg = L.h("div", { class: "seg" });
      [["produto", "Produtos"], ["cliente", "Clientes"]].forEach(function (o) { seg.appendChild(L.h("button", { type: "button", class: o[0] === por ? "on" : "", text: o[1], onclick: function () { L.estado.abcPor = o[0]; L.estado.params = { por: o[0] }; L.emitir("filtros"); } })); });
      raiz.appendChild(L.h("div", { style: { display: "flex", gap: "12px", alignItems: "center", margin: "0 0 14px", flexWrap: "wrap" } }, L.h("span", { class: "fx-rot", text: "Curva dos" }), seg,
        L.h("span", { style: { color: "var(--t3)", font: "500 13px var(--f-txt)" }, text: L.fInt(A.itens) + " " + nomeP + " com venda · " + L.fBRL(total, 0) })));
      var fBR0 = function (v) { return L.fBRL(v, 0); };
      var cards = A.classes.map(function (c, i) {
        var pv = total ? c.venda / total : 0, pi = A.itens ? c.itens / A.itens : 0;
        return L.kpi({ icone: "pizza", rot: "Classe " + c.classe + (i === 0 ? " · até " + A.cortes[0] + "%" : i === 1 ? " · até " + A.cortes[1] + "%" : " · o restante"), valor: c.venda, fmt: fBR0, classe: i === 0 ? "heroi" : i === 1 ? "violeta" : "zero",
          leg: [L.h("span", { text: L.fInt(c.itens) + " " + nomeP + " (" + L.fPct(pi, 1) + ")" }), L.h("span", { class: "delta neutro", text: L.fPct(pv, 1) + " da venda" })] });
      });
      cards.push(L.kpi({ icone: "dinheiro", rot: "Total", valor: total, fmt: fBR0, leg: L.h("span", { text: L.fInt(A.itens) + " " + nomeP }) }));
      raiz.appendChild(L.kpis.apply(null, cards));

      var pPar = L.painel({ titulo: "Curva de Pareto", sub: "% acumulado da venda conforme se somam os " + nomeP + ", do maior para o menor", classe: "c-7" });
      var gP = L.h("div"); pPar.corpo.appendChild(gP);
      var pA = A.itens ? A.classes[0].itens / A.itens * 100 : 0, pAB = A.itens ? (A.classes[0].itens + A.classes[1].itens) / A.itens * 100 : 0;
      L.graf.pareto(gP, { curva: A.curva, cortes: A.cortes, altura: 330, fronteiras: [pA, pAB] });
      var pComp = L.painel({ titulo: "Quanto cada classe pesa", sub: "participação na venda e nos itens", classe: "c-5" });
      var gC = L.h("div"); pComp.corpo.appendChild(gC);
      L.graf.barras100(gC, {
        linhas: [{ rot: "Venda", partes: A.classes.map(function (c, i) { return { rot: "Classe " + c.classe, valor: c.venda, cor: corCl[i], corTexto: txtCl[i] }; }) },
                 { rot: "Itens", partes: A.classes.map(function (c, i) { return { rot: "Classe " + c.classe, valor: c.itens, cor: corCl[i], corTexto: txtCl[i] }; }) }],
        fmtPct: function (x) { return L.fNum(x, 1) + "%"; }, linhaH: 56,
        dica: function (i, s) { var c = A.classes[s]; return { titulo: "Classe " + c.classe, linhas: [{ rot: "Venda", val: L.fBRL(c.venda, 0) }, { rot: "% da venda", val: L.fPct(total ? c.venda / total : 0, 1) }, { rot: nomeP, val: L.fInt(c.itens) }, { rot: "% dos itens", val: L.fPct(A.itens ? c.itens / A.itens : 0, 1) }] }; },
        aoClicar: function (i, s) { L.estado.abcClasse = s; L.emitir("filtros"); },
      });
      pComp.corpo.appendChild(L.graf.legenda(A.classes.map(function (c, i) { return { rot: "Classe " + c.classe, cor: corCl[i] }; })));
      pComp.corpo.appendChild(L.h("div", { style: { marginTop: "16px", color: "var(--t2)", font: "500 13px/1.6 var(--f-txt)" }, html:
        "Os <b>" + L.fInt(A.classes[0].itens) + "</b> " + nomeP + " da classe <b style='color:var(--ouro-forte)'>A</b> (" + L.fPct(A.itens ? A.classes[0].itens / A.itens : 0, 1) + " dos itens) respondem por <b>" + L.fPct(total ? A.classes[0].venda / total : 0, 1) + "</b> da venda." }));

      var classe = L.estado.abcClasse != null ? L.estado.abcClasse : null;
      var segC = function () {
        var s = L.h("div", { class: "seg" });
        [[null, "Todas"], [0, "Classe A"], [1, "Classe B"], [2, "Classe C"]].forEach(function (o) { s.appendChild(L.h("button", { type: "button", class: (classe === o[0]) ? "on" : "", text: o[1], onclick: function () { L.estado.abcClasse = o[0]; L.emitir("filtros"); } })); });
        return s;
      };
      var tab = L.tabela({
        titulo: "Curva ABC de " + nomeP, arquivo: "curva-abc-" + por, aba: "Curva ABC", porPagina: 50, rank: false, ordem: { id: "venda", desc: true },
        busca: true, buscaDica: "Buscar " + (por === "produto" ? "produto por código, EAN ou nome" : "cliente por código ou nome") + "…", extraTopo: segC,
        filtrosTexto: function () { return L.descricaoFiltros([["Curva dos", nomeP], ["Classe", classe == null ? "Todas" : "ABC"[classe]]]); },
        colunas: [
          { id: "rank", titulo: "#", tipo: "inteiro", ord: false, valor: function (r) { return r.rank; }, fmt: function (v) { return String(v); }, alinhar: "esq" },
          { id: "nome", titulo: por === "produto" ? "Produto" : "Cliente", tipo: "texto", ord: false, valor: function (r) { return r.nome; } },
          { id: "venda", titulo: "Venda líquida", tipo: "moedaInt", ord: false, valor: function (r) { return r.venda; }, barra: true, exportarTipo: "moeda" },
          { id: "part", titulo: "% da venda", tipo: "pct", ord: false, valor: function (r) { return total ? r.venda / total : null; }, fmt: function (v) { return v == null ? "—" : L.fPct(v, 2); } },
          { id: "ac", titulo: "% acumulado", tipo: "pct", ord: false, valor: function (r) { return r.pareto / 100; }, fmt: function (v) { return L.fPct(v, 1); } },
          { id: "cl", titulo: "Classe", tipo: "tag", ord: false, valor: function (r) { return "ABC"[r.classe]; }, fmt: function (v) { return { html: '<span class="tag ' + v + '">' + v + "</span>" }; }, exp: function (r) { return "ABC"[r.classe]; } },
          { id: "bruta", titulo: "Venda bruta", tipo: "moedaInt", ord: false, valor: function (r) { return r.bruta; }, essencial: false, exportarTipo: "moeda" },
          { id: "dev", titulo: "Devolução", tipo: "moedaInt", ord: false, valor: function (r) { return r.dev; }, essencial: false, exportarTipo: "moeda" },
          { id: "qtd", titulo: "Quantidade", tipo: "inteiro", ord: false, valor: function (r) { return r.qtd; }, essencial: false },
        ],
        totais: function (r) { return [{ rot: "Itens na lista", valor: L.fInt(r.total), pri: true }, { rot: "Venda líquida total", valor: L.fBRL(total, 0) }]; },
        aoClicar: function (r, ev) { L.cliqueDim(por, r.id, ev); },
        carregar: function (e) {
          return L.consultar([{ id: "a", tipo: "abc", por: por, classe: classe, busca: e.busca || undefined, limite: e.porPag || (e.exportando ? 60000 : undefined), offset: e.porPag ? e.pag * e.porPag : 0 }], { canal: "tabela-abc" }).then(function (jj) {
            var r = jj.resultados.a;
            return { total: r.total_lista, linhas: r.linhas.map(function (l) { return { id: l.k, nome: L.nomeDe(por, l.k), venda: l.venda, pareto: l.pareto, classe: l.classe, rank: l.rank, bruta: l.bruta, dev: l.dev, qtd: l.qtd }; }) };
          });
        },
      });
      raiz.appendChild(L.grade(pPar, pComp, L.painel({ titulo: "Lista da curva", sub: "clique numa classe do gráfico ao lado ou use os botões para filtrar · clique numa linha para abrir o relatório", classe: "c-12", semPad: true, corpo: tab })));
      raiz.appendChild(L.nota("Classe pela regra do original, com cortes únicos de " + A.cortes[0] + "% e " + A.cortes[1] + "%: o % acumulado de cada item inclui a venda dele; A fica abaixo de " + A.cortes[0] + "%, B abaixo de " + A.cortes[1] + "%, C é o restante. Só entram itens com venda líquida positiva no período."));
    });
  },
});

})();
