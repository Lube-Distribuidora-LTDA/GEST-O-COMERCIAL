/* =============================================================================
 * pag-carteira.js — Carteira de clientes: quem ficou, quem chegou, quem voltou
 * e quem se perdeu, com a "ponte" que explica a variação da venda.
 * ========================================================================== */
(function () {
"use strict";
var L = window.L;

L.registrarPagina({
  id: "carteira", titulo: "Carteira de clientes", olho: "Vendas", grupo: "Vendas", icone: "pessoas",
  filtros: ["ano", "mes", "uf", "equipe", "rca", "comprador", "fornecedor", "depto", "categoria", "ramo"], mais: ["subcategoria", "marca", "municipio", "produto"],
  espera: "Cruzando a carteira de clientes…",
  render: function (raiz) {
    var D = L.D, C = L.cores(), cmp = L.comparar(L.estado.filtros);
    if (!cmp || (!cmp.aa && !cmp.pa)) { raiz.appendChild(L.h("div", { class: "vazio", html: "<b>Sem base de comparação</b>Escolha um período com ano anterior ou período anterior disponível (o histórico começa em jan/2023)." })); return; }
    var qual = L.estado.carteiraBase === "pa" && cmp.pa ? "pa" : (cmp.aa ? "aa" : "pa");
    var base = cmp[qual], rotBase = base.rot;
    // a carteira é uma comparação: o período atual entra só com os dias fechados (a venda de hoje fica fora, decisão do Júlio)
    var mh = L.mesesHojeNa(cmp);
    var ped = [{ id: "c", tipo: "carteira", base: { ano: null, mes: null, de: null, ate: null, mis: base.mis }, corteBase: base.corte, corte: mh, limite: 600 }];
    return L.consultar(ped).then(function (j) {
      var R = j.resultados.c, S = R.resumo, fBR0 = function (v) { return L.fBRL(v, 0); };
      var seg = L.h("div", { class: "seg" });
      [["aa", "Ano anterior (mesmo período)"], ["pa", "Período anterior"]].forEach(function (o) {
        if (!cmp[o[0]]) return;
        seg.appendChild(L.h("button", { type: "button", class: o[0] === qual ? "on" : "", text: o[1], onclick: function () { L.estado.carteiraBase = o[0]; L.emitir("filtros"); } }));
      });
      raiz.appendChild(L.h("div", { style: { display: "flex", gap: "12px", alignItems: "center", margin: "0 0 14px", flexWrap: "wrap" } }, L.h("span", { class: "fx-rot", text: "Comparar " + cmp.rot + " com" }), seg,
        L.h("span", { style: { color: "var(--t3)", font: "500 13px var(--f-txt)" }, text: rotBase + (cmp.parcial ? " · mesmo número de dias" : "") + (mh.length ? " · só dias fechados (a venda de hoje entra amanhã)" : "") })));
      var ret = L.div(S.retidos.n, R.base.n);
      raiz.appendChild(L.kpis(
        L.kpi({ icone: "pessoas", rot: "Clientes ativos", valor: R.atual.n, fmt: L.fInt, classe: "heroi", cmp: { cmp: { aa: { rot: rotBase, mis: base.mis } }, aa: R.base.n, fmt: L.fInt }, leg: L.h("span", { text: "base: " + L.fInt(R.base.n) + " clientes" }) }),
        L.kpi({ icone: "verificar", rot: "Retidos", valor: S.retidos.n, fmt: L.fInt, classe: "ok", leg: L.h("span", { text: L.fPct(ret, 1) + " da base compraram de novo" }) }),
        L.kpi({ icone: "estrela", rot: "Novos clientes", valor: S.novos.n, fmt: L.fInt, classe: "violeta", leg: L.h("span", { text: fBR0(S.novos.a) + " em venda" }) }),
        L.kpi({ icone: "relogio", rot: "Reativados", valor: S.reativados.n, fmt: L.fInt, leg: L.h("span", { text: "já compraram antes · " + L.fAbrev(S.reativados.a, true) }) }),
        L.kpi({ icone: "alerta", rot: "Perdidos", valor: S.perdidos.n, fmt: L.fInt, classe: S.perdidos.n ? "perigo" : "zero", leg: L.h("span", { text: L.fAbrev(S.perdidos.b, true) + " de venda na base" }) })));

      // pontes
      var dRet = S.retidos.a - S.retidos.b, dPer = S.perdidos.a - S.perdidos.b, dNov = S.novos.a - S.novos.b, dRea = S.reativados.a - S.reativados.b;
      var pV = L.painel({ titulo: "Ponte da venda líquida", sub: rotBase + " → " + cmp.rot + " · o que cada grupo de clientes explica", classe: "c-7" });
      var gV = L.h("div"); pV.corpo.appendChild(gV);
      var passosV = [
        { rot: "Venda\n" + rotBase, valor: R.base.venda, total: true, cor: C.d[7] },
        { rot: "Perdidos", valor: dPer, tag: "perdidos" }, { rot: "Retidos\n(± compra)", valor: dRet, tag: "retidos" },
        { rot: "Novos", valor: dNov, tag: "novos" }, { rot: "Reativados", valor: dRea, tag: "reativados" },
        { rot: "Venda\n" + cmp.rot, valor: R.atual.venda, total: true, cor: C.ouro },
      ];
      L.graf.cascata(gV, { passos: passosV, fmt: function (v) { return L.fAbrev(v, true); }, tipo: "moeda", altura: 340,
        dica: function (i) { var p = passosV[i]; var ls = [{ rot: p.total ? "Venda líquida" : "Variação da venda", val: (p.total ? "" : p.valor > 0 ? "+" : p.valor < 0 ? "−" : "") + L.fBRL(Math.abs(p.valor), 0) }]; if (p.tag) { var x = S[p.tag]; ls.push({ rot: "Clientes", val: L.fInt(x.n) }); if (p.tag !== "novos") ls.push({ rot: "Venda na base", val: L.fBRL(x.b, 0) }); if (p.tag !== "perdidos") ls.push({ rot: "Venda no período", val: L.fBRL(x.a, 0) }); } return { titulo: p.rot.replace("\n", " "), linhas: ls, clique: p.tag ? "Clique para ver a lista" : null, semClique: !p.tag }; },
        aoClicar: function (i) { var t = passosV[i].tag; if (t) { L.estado.carteiraLista = t; var el = document.getElementById("cart-lista"); if (el) { desenharLista(t); el.scrollIntoView({ behavior: "smooth", block: "start" }); } } } });

      var pN = L.painel({ titulo: "Ponte de clientes", sub: "quantos clientes entraram e saíram", classe: "c-5" });
      var gN = L.h("div"); pN.corpo.appendChild(gN);
      var passosN = [
        { rot: "Clientes\n" + rotBase, valor: R.base.n, total: true, cor: C.d[7] },
        { rot: "Perdidos", valor: -S.perdidos.n, tag: "perdidos" }, { rot: "Novos", valor: S.novos.n, tag: "novos" }, { rot: "Reativados", valor: S.reativados.n, tag: "reativados" },
        { rot: "Clientes\n" + cmp.rot, valor: R.atual.n, total: true, cor: C.ouro },
      ];
      L.graf.cascata(gN, { passos: passosN, fmt: L.fInt, tipo: "num", altura: 340,
        dica: function (i) { var p = passosN[i]; return { titulo: p.rot.replace("\n", " "), linhas: [{ rot: p.total ? "Clientes" : "Variação", val: (p.total ? "" : p.valor > 0 ? "+" : p.valor < 0 ? "−" : "") + L.fInt(Math.abs(p.valor)) }], clique: p.tag ? "Clique para ver a lista" : null, semClique: !p.tag }; },
        aoClicar: function (i) { var t = passosN[i].tag; if (t) { L.estado.carteiraLista = t; var el = document.getElementById("cart-lista"); if (el) { desenharLista(t); el.scrollIntoView({ behavior: "smooth", block: "start" }); } } } });

      // listas
      var listaBox = L.h("div", { id: "cart-lista" });
      var nomes = { perdidos: "Clientes perdidos", novos: "Clientes novos", reativados: "Clientes reativados", emQueda: "Retidos em queda", emAlta: "Retidos em alta" };
      var subs = { perdidos: "compraram na base e não compraram no período — maior venda da base primeiro", novos: "primeira compra na vida dentro do período — maior venda primeiro", reativados: "já tinham comprado antes, mas não na base", emQueda: "compraram nos dois períodos e caíram — maior queda em R$ primeiro", emAlta: "compraram nos dois períodos e cresceram — maior ganho em R$ primeiro" };
      function desenharLista(qual2) {
        qual2 = qual2 || L.estado.carteiraLista || "perdidos";
        L.estado.carteiraLista = qual2;
        var lin = R.listas[qual2].map(function (x) { var c = D.clientes[x.k]; return { id: x.k, nome: c[1], cod: c[0], mun: c[3] + (c[4] ? "/" + c[4] : ""), ramo: D.ramos[c[2]], a: x.a, b: x.b, d: x.a - x.b }; });
        var tab = L.tabela({
          titulo: nomes[qual2] + " — " + cmp.rot + " contra " + rotBase, arquivo: "carteira-" + qual2, aba: nomes[qual2].slice(0, 28), linhas: lin, rank: true, porPagina: 25, ordem: { id: qual2 === "perdidos" ? "b" : qual2 === "emQueda" ? "d" : qual2 === "emAlta" ? "d" : "a", desc: qual2 !== "emQueda" },
          buscaTexto: function (r) { return r.cod + " " + r.nome + " " + r.mun + " " + r.ramo; }, buscaDica: "Buscar cliente por código, nome ou município…",
          filtrosTexto: function () { return L.descricaoFiltros([["Relatório", nomes[qual2]], ["Base de comparação", rotBase]]); },
          colunas: [
            { id: "nome", titulo: "Cliente", tipo: "texto", valor: function (r) { return r.nome; } },
            { id: "cod", titulo: "Código", tipo: "texto", valor: function (r) { return String(r.cod); }, ordVal: function (r) { return r.cod; }, essencial: false },
            { id: "mun", titulo: "Município", tipo: "texto", valor: function (r) { return r.mun; }, essencial: false },
            { id: "ramo", titulo: "Ramo", tipo: "texto", valor: function (r) { return r.ramo; }, essencial: false },
            { id: "b", titulo: "Venda " + rotBase, tipo: "moedaInt", valor: function (r) { return r.b; }, exportarTipo: "moeda", barra: qual2 === "perdidos", corBarra: "rgba(255,107,116,.18)" },
            { id: "a", titulo: "Venda " + cmp.rot, tipo: "moedaInt", valor: function (r) { return r.a; }, exportarTipo: "moeda", barra: qual2 === "novos" || qual2 === "reativados", corBarra: "rgba(52,232,158,.16)" },
            { id: "d", titulo: "Diferença", tipo: "moedaInt", valor: function (r) { return r.d; }, exportarTipo: "moeda", classe: function (v) { return v == null ? "" : v >= 0 ? "pos" : "neg"; } },
            { id: "v", titulo: "Variação", tipo: "pct", valor: function (r) { return r.b > 0 ? r.a / r.b - 1 : null; }, fmt: function (v) { return v == null ? "—" : L.fDelta(v, 0); }, classe: function (v) { return v == null ? "" : v >= 0 ? "pos" : "neg"; }, essencial: false },
          ],
          totais: function (res) { return [{ rot: nomes[qual2], valor: L.fInt(S[qual2 === "emQueda" || qual2 === "emAlta" ? "retidos" : qual2].n), pri: true }, { rot: "Na lista (top " + lin.length + ")", valor: L.fInt(lin.length) }, { rot: "Venda " + rotBase, valor: fBR0(lin.reduce(function (s, x) { return s + x.b; }, 0)) }, { rot: "Venda " + cmp.rot, valor: fBR0(lin.reduce(function (s, x) { return s + x.a; }, 0)) }]; },
          aoClicar: function (r, ev) { L.cliqueDim("cliente", r.id, ev); },
          extraTopo: function () {
            var sg = L.h("div", { class: "seg", style: { flexWrap: "wrap" } });
            ["perdidos", "novos", "reativados", "emQueda", "emAlta"].forEach(function (k) { sg.appendChild(L.h("button", { type: "button", class: k === qual2 ? "on" : "", text: nomes[k].replace("Clientes ", "").replace("Retidos ", ""), onclick: function () { desenharLista(k); } })); });
            return sg;
          },
        });
        L.limpar(listaBox);
        listaBox.appendChild(L.painel({ titulo: nomes[qual2], sub: subs[qual2], classe: "c-12", semPad: true, corpo: tab }));
      }
      desenharLista(L.estado.carteiraLista);
      raiz.appendChild(L.grade(pV, pN, L.h("div", { class: "c-12" }, listaBox)));
      raiz.appendChild(L.nota("Ativo = cliente com venda bruta no período. Retidos compraram nos dois períodos; novos têm a primeira compra de toda a história dentro do período atual (o histórico começa em jan/2023, então quem já comprava nessa data não é contado como novo); reativados compraram antes, mas não na base; perdidos compraram na base e não compraram agora. As listas mostram os 600 maiores de cada grupo; o Excel sai com o que está na lista."));
    });
  },
});

})();
