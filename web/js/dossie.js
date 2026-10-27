/* =============================================================================
 * dossie.js — o RELATÓRIO PERSONALIZADO.
 *
 * Qualquer elemento clicável do painel (barra, ponto, fatia, cartão, linha de
 * tabela, resultado da busca) abre aqui o relatório daquele recorte, já com os
 * filtros da tela. Dentro dele, o clique em outro item abre o relatório desse
 * item (com "Voltar"). Abas: Resumo · Detalhar (tabela escolhida pelo usuário,
 * exportável) · Estoque · Verba.
 * ========================================================================== */
(function () {
"use strict";
var L = window.L;

var FILTRAVEIS = ["uf", "equipe", "rca", "comprador", "fornecedor", "depto", "categoria", "subcategoria", "marca", "ramo", "municipio", "cliente", "produto"];
var COM_ESTOQUE = ["produto", "fornecedor", "comprador", "depto", "categoria", "subcategoria", "marca", null];
var COM_VERBA = ["fornecedor", "comprador"];
var SEM_PERIODO = { ano: null, mes: null, de: null, ate: null, mis: null };

var pilha = [];
var aba = "resumo";
var ctlTab = null;

/* ------------------------------ escopo ------------------------------ */
function escopoDe(ent) {
  var f = JSON.parse(JSON.stringify(L.estado.filtros));
  if (!ent || ent.dim == null) return f;
  if (ent.dim === "ano") { f.ano = [ent.id]; delete f.mis; }
  else if (ent.dim === "ym") { delete f.ano; delete f.mes; f.mis = [ent.id]; }
  else if (ent.dim === "mes") { f.mes = [ent.id]; delete f.mis; }
  else f[ent.dim] = [ent.id];
  return f;
}
function apiDe(f) { var o = {}; Object.keys(f).forEach(function (k) { if (f[k] && f[k].length) o[k] = f[k].slice(); }); return o; }
function nomeEnt(ent) {
  if (!ent || ent.dim == null) return "Seleção atual";
  if (ent.dim === "ym") return L.fMesLongo(L.D.meses[ent.id]);
  if (ent.dim === "mes") return L.MESES[ent.id - 1];
  if (ent.dim === "ano") return "Ano " + ent.id;
  return L.nomeDe(ent.dim, ent.id);
}
function tipoEnt(ent) {
  if (!ent || ent.dim == null) return "Relatório da seleção";
  if (ent.dim === "ym") return "Mês";
  return L.DIM[ent.dim].rot;
}
function iconeEnt(ent) { return !ent || ent.dim == null ? "estrela" : ent.dim === "ym" ? "calendario" : (L.DIM[ent.dim] || {}).icone || "info"; }

/* ------------------------------ abrir / fechar ------------------------------ */
L.abrirDossie = function (ent, manter) {
  if (!manter) pilha = [];
  // não empilha o mesmo item duas vezes seguidas
  var topo = pilha[pilha.length - 1];
  if (!topo || topo.dim !== ent.dim || topo.id !== ent.id) pilha.push(ent);
  aba = ent.aba || "resumo";
  L.dica.esconder();
  L.$("dossie").classList.add("on"); L.$("dossie-fundo").classList.add("on");
  document.body.style.overflow = "hidden";
  desenhar();
};
L.fecharDossie = function () {
  pilha = [];
  L.$("dossie").classList.remove("on"); L.$("dossie-fundo").classList.remove("on");
  document.body.style.overflow = "";
};
L.dossieAberto = function () { return L.$("dossie").classList.contains("on"); };
document.addEventListener("keydown", function (ev) { if (ev.key === "Escape" && L.dossieAberto() && !document.querySelector(".pop")) { L.fecharDossie(); } });
document.addEventListener("click", function (ev) { if (ev.target && ev.target.id === "dossie-fundo") L.fecharDossie(); });

/* ------------------------------ montagem ------------------------------ */
function desenhar() {
  var ent = pilha[pilha.length - 1], box = L.$("dossie");
  L.limpar(box);
  var scope = escopoDe(ent), cmp = L.comparar(scope);
  box.appendChild(cabecalho(ent, scope, cmp));
  var corpo = L.h("div", { class: "dos-corpo" });
  box.appendChild(corpo);
  // trilha + abas
  if (pilha.length > 1) {
    var tr = L.h("div", { class: "dos-trilha" });
    pilha.forEach(function (e, i) {
      if (i) tr.appendChild(L.h("span", { text: "›" }));
      tr.appendChild(L.h("button", { type: "button", text: nomeEnt(e), onclick: function () { pilha = pilha.slice(0, i + 1); aba = "resumo"; desenhar(); } }));
    });
    corpo.appendChild(tr);
  }
  var abas = [["resumo", "Resumo"], ["detalhe", "Detalhar"]];
  if (COM_ESTOQUE.indexOf(ent.dim == null ? null : ent.dim) >= 0) abas.push(["estoque", "Estoque"]);
  if (COM_VERBA.indexOf(ent.dim) >= 0) abas.push(["verba", "Verba do fornecedor"]);
  var barra = L.h("div", { class: "dos-abas" });
  abas.forEach(function (a) { barra.appendChild(L.h("button", { type: "button", class: aba === a[0] ? "on" : "", text: a[1], onclick: function () { aba = a[0]; desenhar(); } })); });
  corpo.appendChild(barra);
  var conteudo = L.h("div", { id: "dos-conteudo" });
  corpo.appendChild(conteudo);
  conteudo.appendChild(L.espera("Montando o relatório…"));
  var tok = (desenhar._t = (desenhar._t || 0) + 1);
  var fn = aba === "detalhe" ? abaDetalhe : aba === "estoque" ? abaEstoque : aba === "verba" ? abaVerba : abaResumo;
  Promise.resolve(fn(ent, scope, cmp)).then(function (el) {
    if (tok !== desenhar._t) return;
    L.limpar(conteudo); conteudo.appendChild(el); L.executarFila();
  }).catch(function (e) {
    if (e && e.name === "AbortError") return;
    if (tok === desenhar._t) { L.limpar(conteudo); conteudo.appendChild(L.erroTela("Não foi possível montar o relatório", e.message || String(e))); }
  });
  box.scrollTop = 0;
}

function cabecalho(ent, scope, cmp) {
  var D = L.D, subs = [];
  var chip = function (ic, t) { return L.h("span", { html: L.ic(ic) + " " + L.esc(t) }); };
  if (cmp) subs.push(chip("calendario", cmp.rot + (cmp.parcial ? " · até " + cmp.ateDia : "")));
  if (ent.dim === "produto") { var p = D.produtos[ent.id]; subs.push(chip("caixa", "Cód. " + p[0] + " · EAN " + (p[2] || "—"))); subs.push(chip("camadas", D.deptos[p[4]] + " › " + D.categorias[p[5]][0])); if (p[3] >= 0) subs.push(chip("carteira", D.fornecedores[p[3]][1])); if (p[11] === 1) subs.push(chip("info", "classificação herdada do WinThor (fora da planilha do Trade)")); }
  else if (ent.dim === "cliente") { var c = D.clientes[ent.id]; subs.push(chip("loja", "Cód. " + c[0] + " · " + D.ramos[c[2]])); subs.push(chip("pino", c[3] + (c[4] ? "/" + c[4] : ""))); }
  else if (ent.dim === "rca") { var r = D.rcas[ent.id]; subs.push(chip("pessoas", "RCA " + r[0] + " · " + D.equipes[r[2]][1])); }
  else if (ent.dim === "fornecedor") { var f = D.fornecedores[ent.id]; subs.push(chip("caixa", "Cód. " + f[0])); if (f[2] >= 0) subs.push(chip("carteira", "Comprador: " + D.compradores[f[2]][1])); }
  else if (ent.dim === "categoria") subs.push(chip("camadas", D.deptos[D.categorias[ent.id][1]]));
  else if (ent.dim === "equipe") subs.push(chip("pino", D.uf[D.equipes[ent.id][2]]));
  var extra = Object.keys(scope).filter(function (k) { return FILTRAVEIS.indexOf(k) >= 0 && scope[k].length && !(ent.dim === k); }).length;
  if (extra) subs.push(chip("filtro", extra + " filtro" + (extra > 1 ? "s" : "") + " da tela aplicado" + (extra > 1 ? "s" : "")));
  var acoes = L.h("div", { class: "dos-acoes" });
  if (pilha.length > 1) acoes.appendChild(L.h("button", { class: "btn", type: "button", html: L.ic("dir").replace("<svg", '<svg style="transform:rotate(180deg)"') + " Voltar", onclick: function () { pilha.pop(); aba = "resumo"; desenhar(); } }));
  if (FILTRAVEIS.indexOf(ent.dim) >= 0 || ent.dim === "ano" || ent.dim === "mes") acoes.appendChild(L.h("button", { class: "btn ouro", type: "button", html: L.ic("filtro") + " Filtrar o painel por isso", onclick: function () { L.setFiltro(ent.dim, [ent.id]); L.fecharDossie(); L.toast("Painel filtrado: " + nomeEnt(ent), "ok"); } }));
  if (ent.dim === "ym") acoes.appendChild(L.h("button", { class: "btn ouro", type: "button", html: L.ic("filtro") + " Filtrar o painel por este mês", onclick: function () { L.setFiltro("mis", [ent.id]); L.fecharDossie(); L.toast("Período: " + nomeEnt(ent), "ok"); } }));
  acoes.appendChild(L.h("button", { class: "btn", type: "button", html: L.ic("link") + " Copiar link", onclick: function () { copiarLink(); } }));
  acoes.appendChild(L.h("button", { class: "btn", type: "button", html: L.ic("baixar") + " Imprimir / PDF", onclick: imprimir }));
  acoes.appendChild(L.h("button", { class: "btn-ic", type: "button", title: "Fechar (Esc)", html: L.ic("x"), onclick: L.fecharDossie }));
  var foto = null;
  if (ent.dim === "produto" && L.ESTp[ent.id] && L.ESTp[ent.id].img) {
    var im = L.h("img", { src: "img/" + D.produtos[ent.id][0], alt: "", loading: "lazy" });
    im.addEventListener("error", function () { foto.remove(); });
    foto = L.h("div", { class: "dos-foto" }, im);
  }
  return L.h("div", { class: "dos-cab" },
    foto,
    L.h("div", { style: { minWidth: 0 } },
      L.h("div", { class: "olho", html: L.ic(iconeEnt(ent)).replace("<svg", '<svg style="width:15px;height:15px;stroke:currentColor;fill:none;stroke-width:2"') + "<span>Relatório · " + L.esc(tipoEnt(ent)) + "</span>" }),
      L.h("h2", { text: nomeEnt(ent) }),
      L.h("div", { class: "sub" }, subs)),
    acoes);
}
function imprimir() {
  var tema = document.documentElement.getAttribute("data-tema");
  document.documentElement.setAttribute("data-tema", "claro");
  document.body.classList.add("imprimindo");
  setTimeout(function () { L.redesenharTudo(); window.print(); document.body.classList.remove("imprimindo"); document.documentElement.setAttribute("data-tema", tema); L.redesenharTudo(); }, 250);
}
function copiarLink() {
  var ent = pilha[pilha.length - 1];
  var url = location.href.split("#")[0] + "#/" + L.estado.pagina + "?f=" + encodeURIComponent(JSON.stringify(L.estado.filtros)) + "&d=" + encodeURIComponent(JSON.stringify(ent));
  (navigator.clipboard ? navigator.clipboard.writeText(url) : Promise.reject()).then(function () { L.toast("Link do relatório copiado", "ok"); }, function () { L.toast("Não foi possível copiar o link", "erro"); });
}

/* ============================ aba RESUMO ============================ */
function abaResumo(ent, scope, cmp) {
  var apiScope = apiDe(scope), D = L.D, F = L.filtrosApi();
  var base = function (o) { return Object.assign({ filtros: apiScope }, o); };
  var ped = [].concat(
    L.pedidosCmp("r", "resumo", { filtros: apiScope }, cmp),
    [{ id: "glob", tipo: "resumo", filtros: F },
     { id: "serie", tipo: "agrupar", por: "ym", dist: ["pos"], filtros: Object.assign({}, apiScope, SEM_PERIODO) },
     { id: "anomes", tipo: "agrupar", por: ["ano", "mes"], filtros: Object.assign({}, apiScope, { ano: null, mis: null }) }]);
  var quebras = [["cliente", "Principais clientes", "loja"], ["produto", "Principais produtos", "caixa"], ["rca", "RCAs", "pessoas"], ["fornecedor", "Fornecedores", "caixa"],
                 ["categoria", "Categorias", "etiqueta"], ["depto", "Departamentos", "camadas"], ["ramo", "Ramo do cliente", "loja"], ["uf", "Estados", "pino"], ["equipe", "Equipes", "pessoas"]];
  var uteis = quebras.filter(function (q) {
    if (q[0] === ent.dim) return false;
    // pais da dimensão já fixada não agregam nada
    if (ent.dim === "produto" && ["fornecedor", "categoria", "depto"].indexOf(q[0]) >= 0) return false;
    if (ent.dim === "cliente" && ["ramo", "uf"].indexOf(q[0]) >= 0) return false;
    if (ent.dim === "rca" && ["equipe", "uf"].indexOf(q[0]) >= 0) return false;
    if (ent.dim === "categoria" && q[0] === "depto") return false;
    if (ent.dim === "equipe" && q[0] === "uf") return false;
    if (scope[q[0]] && scope[q[0]].length === 1) return false;
    return true;
  }).slice(0, 6);
  uteis.forEach(function (q) { ped.push({ id: "q_" + q[0], tipo: "agrupar", por: q[0], dist: q[0] === "cliente" ? [] : ["pos"], limite: 8, filtros: apiScope }); });
  return L.consultar(ped, { canal: "dossie", filtros: {} }).then(function (j) {
    var R = j.resultados, at = L.derivar(R.r), aa = R.r_aa ? L.derivar(R.r_aa) : null, pa = R.r_pa ? L.derivar(R.r_pa) : null, glob = R.glob;
    var raiz = L.h("div");
    var atF = L.cmpFechado(R, "r");            // com a venda de hoje nos totais: a % compara só os dias fechados
    var kc = function (campo, fmt, extra) { return cmp ? L.comAtualFechado(Object.assign({ cmp: cmp, aa: aa ? aa[campo] : null, pa: pa ? pa[campo] : null, fmt: fmt }, extra || {}), atF, campo) : null; };
    var fBR0 = function (v) { return L.fBRL(v, 0); }, part = glob && glob.venda ? at.venda / glob.venda : null;
    raiz.appendChild(L.kpis(
      L.kpi({ icone: "dinheiro", rot: "Venda líquida", valor: at.venda, fmt: fBR0, classe: "heroi", cmp: kc("venda", fBR0),
              leg: ent.dim != null && part != null ? L.h("span", { text: L.fPct(part, 1) + " da venda da seleção da tela" }) : L.h("span", { text: "Bruta " + L.fAbrev(at.bruta, true) }) }),
      L.kpi({ icone: "pessoas", rot: "Positivação", valor: at.pos, fmt: L.fInt, cmp: kc("pos", L.fInt), leg: L.h("span", { text: "clientes que compraram" }) }),
      L.kpi({ icone: "etiqueta", rot: "Ticket médio", valor: at.ticket, fmt: fBR0, cmp: kc("ticket", fBR0) }),
      L.kpi({ icone: "camadas", rot: "Mix médio", valor: at.mix, fmt: function (v) { return L.fNum(v, 1); }, cmp: kc("mix", function (v) { return L.fNum(v, 1); }), leg: L.h("span", { text: L.fInt(at.skus) + " SKUs" }) }),
      L.kpi({ icone: "devolucao", rot: "Devolução", valor: at.dev, fmt: fBR0, classe: at.pctDev > 0.05 ? "atencao" : "", cmp: kc("dev", fBR0, { inverso: true }), leg: L.h("span", { text: L.fPct(at.pctDev, 1) + " da venda bruta · " + L.fInt(at.pos_dev) + " clientes" }) })));

    // evolução: últimos 24 meses
    var serie = R.serie.linhas.slice().sort(function (a, b) { return a.k - b.k; });
    var vis = serie.slice(-24);
    var pEv = L.painel({ titulo: "Evolução mensal da venda líquida", sub: "últimos " + vis.length + " meses com venda · clique em uma coluna para abrir o mês", classe: "c-12" });
    var g1 = L.h("div"); pEv.corpo.appendChild(g1);
    var cAtual = L.cores().ouro, cBase = L.cores().d[0];
    L.graf.colunas(g1, {
      categorias: vis.map(function (l) { return L.fMesAno(D.meses[l.k]); }),
      series: [{ nome: "Venda líquida", valores: vis.map(function (l) { return l.venda; }) }],
      tipo: "moeda", fmt: function (v) { return L.fAbrev(v, false); }, altura: 290,
      corBarra: function (ci) { var inScope = cmp && cmp.mis.indexOf(vis[ci].k) >= 0; return inScope ? cAtual : cBase; },
      dica: function (i) { var l = vis[i]; return { titulo: L.fMesLongo(D.meses[l.k]), linhas: [{ rot: "Venda líquida", val: L.fBRL(l.venda, 0) }, { rot: "Positivação", val: L.fInt(l.pos) }, { rot: "Ticket", val: L.fBRL(l.venda / l.pos, 0) }] }; },
      aoClicar: function (i) { L.abrirDossie({ dim: "ym", id: vis[i].k }, true); },
    });
    pEv.corpo.appendChild(L.graf.legenda([{ rot: "meses do período do relatório", cor: cAtual }, { rot: "demais meses", cor: cBase }]));
    raiz.appendChild(L.h("div", { class: "grade", style: { marginBottom: "16px" } }, pEv));

    // quebras
    var g = L.h("div", { class: "grade" });
    uteis.forEach(function (q) {
      var res = R["q_" + q[0]];
      var p = L.painel({ titulo: q[1], sub: L.fInt(res.total_grupos) + " no total · " + (q[0] === "cliente" || q[0] === "produto" ? "top 8" : "clique para abrir"), classe: "c-6",
        acoes: [L.btnPainel("tabela", "Ver todos", function () { aba = "detalhe"; L._dosPor = q[0]; desenhar(); })] });
      var box = L.h("div"); p.corpo.appendChild(box);
      var tot = at.venda;
      L.graf.barras(box, {
        itens: res.linhas.map(function (l) { return { k: l.k, rot: L.nomeDe(q[0], l.k), valor: l.venda }; }),
        fmt: function (v) { return L.fAbrev(v, true); }, total: tot, linhaH: 28, cor: function (i) { return i === 0 ? L.cores().ouro : L.cores().d[0]; },
        dica: function (i) { var l = res.linhas[i]; var ls = [{ rot: "Venda líquida", val: L.fBRL(l.venda, 0) }, { rot: "Participação", val: L.fPct(l.venda / tot, 1) }]; if (l.pos != null) ls.push({ rot: "Positivação", val: L.fInt(l.pos) }); return { titulo: L.nomeDe(q[0], l.k), linhas: ls }; },
        aoClicar: function (i, s, ev) { if (ev && (ev.ctrlKey || ev.metaKey)) { L.alternarFiltro(q[0], res.linhas[i].k); return; } L.abrirDossie({ dim: q[0], id: res.linhas[i].k }, true); },
      });
      g.appendChild(p);
    });
    raiz.appendChild(g);
    raiz.appendChild(L.nota("Os comparativos usam o mesmo período do ano anterior e o período imediatamente anterior, com corte no mesmo dia do mês quando o mês está em andamento. Clique em qualquer barra para abrir o relatório dela; Ctrl+clique aplica como filtro."));
    return raiz;
  });
}

/* ============================ aba DETALHAR ============================ */
var MEDIDAS_ORD = { venda: "venda", bruta: "bruta", dev: "dev", pos: "pos", skus: "skus", qtd: "qtd" };
function abaDetalhe(ent, scope, cmp) {
  var apiScope = apiDe(scope);
  var opcoes = [["cliente", "Cliente"], ["produto", "Produto"], ["rca", "RCA"], ["fornecedor", "Fornecedor"], ["categoria", "Categoria"], ["depto", "Departamento"], ["marca", "Marca"], ["ramo", "Ramo"], ["municipio", "Município"], ["equipe", "Equipe"], ["ym", "Mês"]]
    .filter(function (o) { return o[0] !== ent.dim; });
  var por = L._dosPor && opcoes.some(function (o) { return o[0] === L._dosPor; }) ? L._dosPor : opcoes[0][0];
  L._dosPor = null;
  var raiz = L.h("div");
  var topo = L.h("div", { style: { display: "flex", gap: "12px", alignItems: "center", flexWrap: "wrap", marginBottom: "14px" } },
    L.h("span", { class: "fx-rot", text: "Detalhar por" }));
  var seg = L.h("div", { class: "seg", style: { flexWrap: "wrap" } });
  opcoes.forEach(function (o) { seg.appendChild(L.h("button", { type: "button", class: o[0] === por ? "on" : "", text: o[1], onclick: function () { L._dosPor = o[0]; desenhar(); } })); });
  topo.appendChild(seg);
  raiz.appendChild(topo);
  var rot = (opcoes.filter(function (o) { return o[0] === por; })[0] || [0, por])[1];
  return L.consultar([{ id: "tot", tipo: "resumo", filtros: apiScope }], { canal: "dossie", filtros: {} }).then(function (jt) {
    var tot = L.derivar(jt.resultados.tot);
    var temPos = por !== "cliente";
    var tab = L.tabela({
      titulo: "Venda por " + rot.toLowerCase() + " — " + nomeEnt(ent), arquivo: "venda-por-" + por, aba: "Venda por " + rot.toLowerCase(), rank: true, porPagina: 25,
      ordem: { id: "venda", desc: true }, buscaDica: "Buscar " + rot.toLowerCase() + " por código ou nome…",
      busca: por === "cliente" || por === "produto" || por === "rca" || por === "fornecedor",
      filtrosTexto: function () { return L.descricaoFiltros([["Relatório", nomeEnt(ent)], ["Detalhado por", rot]]); },
      colunas: [
        { id: "nome", titulo: rot, tipo: "texto", ord: false, valor: function (r) { return r.nome; }, barra: false },
        { id: "venda", titulo: "Venda líquida", tipo: "moedaInt", valor: function (r) { return r.venda; }, barra: true, exp: function (r) { return r.venda; }, exportarTipo: "moeda" },
        { id: "part", titulo: "% do total", tipo: "pct", ord: false, valor: function (r) { return tot.venda ? r.venda / tot.venda : null; } },
        { id: "bruta", titulo: "Venda bruta", tipo: "moedaInt", valor: function (r) { return r.bruta; }, essencial: false, exportarTipo: "moeda" },
        { id: "dev", titulo: "Devolução", tipo: "moedaInt", valor: function (r) { return r.dev; }, essencial: false, exportarTipo: "moeda" },
        { id: "pdev", titulo: "% devolução", tipo: "pct", ord: false, valor: function (r) { return r.bruta ? r.dev / r.bruta : null; }, essencial: false },
        temPos ? { id: "pos", titulo: "Positivação", tipo: "inteiro", valor: function (r) { return r.pos; } } : null,
        temPos ? { id: "ticket", titulo: "Ticket médio", tipo: "moedaInt", ord: false, valor: function (r) { return r.pos ? r.venda / r.pos : null; }, essencial: false, exportarTipo: "moeda" } : null,
        { id: "skus", titulo: por === "produto" ? "Clientes" : "SKUs", tipo: "inteiro", valor: function (r) { return por === "produto" ? r.pos : r.skus; }, essencial: false },
        { id: "qtd", titulo: "Quantidade", tipo: "inteiro", valor: function (r) { return r.qtd; }, essencial: false },
        { id: "valorkg", titulo: "R$/kg", tipo: "num2", ord: false, valor: function (r) { return r.peso ? r.venda / r.peso : null; }, essencial: false },
      ].filter(Boolean),
      totais: function (res) { return [{ rot: "Venda líquida", valor: L.fBRL(tot.venda, 0), pri: true }, { rot: rot + "s com venda", valor: L.fInt(res.total) }, { rot: "Positivação", valor: L.fInt(tot.pos) }, { rot: "Ticket médio", valor: L.fBRL(tot.ticket, 0) }, { rot: "Devolução", valor: L.fBRL(tot.dev, 0) }]; },
      aoClicar: function (r, ev) { if (por === "ym") L.abrirDossie({ dim: "ym", id: r.id }, true); else L.cliqueDim2(por, r.id, ev); },
      carregar: function (e) {
        var ordId = e.ord && MEDIDAS_ORD[e.ord.id] ? MEDIDAS_ORD[e.ord.id] : "venda";
        var dist = ["pos"]; if (por !== "produto") dist.push("skus");
        return L.consultar([{ id: "t", tipo: "agrupar", por: por, dist: dist, ordenar: por === "ym" ? "k" : ordId, desc: por === "ym" ? true : (e.ord ? e.ord.desc : true), limite: e.porPag || undefined, offset: e.porPag ? e.pag * e.porPag : 0, busca: e.busca || undefined, filtros: apiScope }],
                           { canal: "dossie-tb", filtros: {} }).then(function (j) {
          var res = j.resultados.t;
          return { total: res.total_grupos, linhas: res.linhas.map(function (l) {
            return { id: l.k, nome: por === "ym" ? L.fMesLongo(L.D.meses[l.k]) : L.nomeDe(por, l.k), venda: l.venda, bruta: l.bruta, dev: l.dev, pos: l.pos, skus: l.skus, qtd: l.qtd, peso: l.peso };
          }) };
        });
      },
    });
    var p = L.painel({ titulo: "Relatório detalhado por " + rot.toLowerCase(), sub: "ordene pelas colunas, busque, exporte em Excel · clique em uma linha para abrir o relatório dela", classe: "c-12", semPad: true, corpo: tab });
    raiz.appendChild(L.grade(p));
    return raiz;
  });
}
L.cliqueDim2 = function (dim, id, ev) {
  if (ev && (ev.ctrlKey || ev.metaKey)) { L.alternarFiltro(dim, id); return; }
  L.abrirDossie({ dim: dim, id: id }, true);
};

/* ============================ aba ESTOQUE ============================ */
function abaEstoque(ent, scope) {
  var D = L.D, raiz = L.h("div");
  if (ent.dim === "produto") return Promise.resolve(estoqueProduto(ent, raiz));
  var lista = L.EST.filter(function (e) { return L.passaProduto(e, scope); });
  var base = lista.filter(function (e) { return e.base; }), rup = lista.filter(function (e) { return e.rup; }), sv = lista.filter(function (e) { return e.sv; });
  var valor = lista.reduce(function (s, e) { return s + (e.valor_custo > 0 ? e.valor_custo : 0); }, 0);
  var parado = sv.reduce(function (s, e) { return s + e.valor_custo; }, 0);
  var semImg = lista.filter(function (e) { return e.ativo && !e.img; }).length;
  raiz.appendChild(L.kpis(
    L.kpi({ icone: "caixa", rot: "SKUs ativos", valor: base.length, fmt: L.fInt, leg: L.h("span", { text: lista.filter(function (e) { return e.ativo; }).length + " ativos no total · " + (lista.length - lista.filter(function (e) { return e.ativo; }).length) + " fora de linha" }) }),
    L.kpi({ icone: "alerta", rot: "Em ruptura", valor: rup.length, fmt: L.fInt, classe: rup.length ? "perigo" : "zero", leg: L.h("span", { text: L.fPct(base.length ? rup.length / base.length : null, 1) + " dos SKUs ativos" }) }),
    L.kpi({ icone: "lua", rot: "Sem venda (8 semanas)", valor: sv.length, fmt: L.fInt, classe: sv.length ? "atencao" : "zero", leg: L.h("span", { text: L.fBRL(parado, 0) + " parados em estoque" }) }),
    L.kpi({ icone: "camadas", rot: "Estoque a custo", valor: valor, fmt: function (v) { return L.fBRL(v, 0); }, classe: "heroi", leg: L.h("span", { text: "estoque disponível × custo financeiro" }) }),
    L.kpi({ icone: "imagem", rot: "Sem imagem", valor: semImg, fmt: L.fInt, classe: semImg ? "atencao" : "zero", leg: L.h("span", { text: "itens ativos sem foto no banco" }) })));
  var cols = function (valor) {
    return [
      { id: "desc", titulo: "Produto", tipo: "texto", valor: function (r) { return r.desc; } },
      { id: "forn", titulo: "Fornecedor", tipo: "texto", valor: function (r) { return r.forn >= 0 ? D.fornecedores[r.forn][1] : "—"; } },
      { id: "total", titulo: "Estoque", tipo: "inteiro", valor: function (r) { return r.total; } },
      { id: "venda", titulo: "Venda semanal", tipo: "moedaInt", valor: function (r) { return r.venda_sem; }, exportarTipo: "moeda" },
      { id: "v", titulo: valor.titulo, tipo: "moedaInt", valor: valor.fn, exportarTipo: "moeda" },
    ];
  };
  var t1 = L.tabela({ titulo: "Produtos em ruptura — " + nomeEnt(ent), arquivo: "ruptura", aba: "Ruptura", rank: true, porPagina: 10, linhas: rup, ordem: { id: "venda", desc: true },
    buscaTexto: function (r) { return r.cod + " " + r.desc; }, colunas: cols({ titulo: "Venda perdida/sem.", fn: function (r) { return r.venda_sem; } }).slice(0, 4), aoClicar: function (r, ev) { L.cliqueDim2("produto", r.p, ev); }, vazio: "Nenhum item em ruptura nesta seleção." });
  var t2 = L.tabela({ titulo: "Produtos sem venda — " + nomeEnt(ent), arquivo: "sem-venda", aba: "Sem venda", rank: true, porPagina: 10, linhas: sv, ordem: { id: "v", desc: true },
    buscaTexto: function (r) { return r.cod + " " + r.desc; }, colunas: cols({ titulo: "Valor parado", fn: function (r) { return r.valor_custo; } }).filter(function (c) { return c.id !== "venda"; }), aoClicar: function (r, ev) { L.cliqueDim2("produto", r.p, ev); }, vazio: "Nenhum item parado nesta seleção." });
  raiz.appendChild(L.grade(
    L.painel({ titulo: "Em ruptura", sub: "maior venda semanal perdida primeiro", classe: "c-6", semPad: true, corpo: t1 }),
    L.painel({ titulo: "Sem venda há 8 semanas", sub: "maior valor parado primeiro", classe: "c-6", semPad: true, corpo: t2 })));
  return Promise.resolve(raiz);
}
function estoqueProduto(ent, raiz) {
  var D = L.D, p = D.produtos[ent.id], e = L.ESTp[ent.id];
  if (!e) { raiz.appendChild(L.h("div", { class: "vazio", html: "<b>Produto fora da base de estoque</b>Este item não está ativo ou não é de revenda." })); return raiz; }
  var st = e.rup ? ["Em ruptura", "perigo"] : e.sv ? ["Sem venda", "atencao"] : e.ativo ? ["Normal", "ok"] : ["Fora de linha", "neutro"];
  raiz.appendChild(L.kpis(
    L.kpi({ icone: "camadas", rot: "Estoque disponível", valor: e.total, fmt: L.fInt, classe: e.total <= 0 ? "perigo" : "", leg: L.h("span", { html: L.tag(st[0], st[1]) + (e.promo ? " " + L.tag("Promocional", "info") : "") + " " + L.tag(e.img ? "Com imagem" : "Sem imagem", e.img ? "ok" : "atencao") }) }),
    L.kpi({ icone: "dinheiro", rot: "Estoque a custo", valor: e.valor_custo, fmt: function (v) { return L.fBRL(v, 0); }, leg: L.h("span", { text: "preço de tabela " + L.fBRL(e.preco, 2) }) }),
    L.kpi({ icone: "relogio", rot: "Cobertura", valor: e.cob, fmt: function (v) { return L.fNum(v, 1) + " sem."; }, leg: L.h("span", { text: e.media ? "média de " + L.fNum(e.media, 1) + " un./semana" : "sem giro suficiente" }) }),
    L.kpi({ icone: "caixa", rot: "Sugestão de compra", valor: e.sug, fmt: function (v) { return L.fInt(v) + " un."; }, leg: L.h("span", { text: "para 8 semanas · pendente: " + L.fInt(e.pend) }) }),
    L.kpi({ icone: "calendario", rot: "Última entrada", texto: e.ult ? L.fData(e.ult) : "sem entrada", leg: L.h("span", { text: e.ult ? "há " + L.fInt(Math.round((new Date(D.ref) - new Date(e.ult)) / 864e5)) + " dias · 1ª entrada " + (e.prim ? L.fData(e.prim) : "—") : "nunca comprado" }) })));
  var pSem = L.painel({ titulo: "Venda das últimas 9 semanas", sub: "unidades · semana 0 é a semana corrente (parcial)", classe: "c-6" });
  var g = L.h("div"); pSem.corpo.appendChild(g);
  var sem = [e.s8, e.s7, e.s6, e.s5, e.s4, e.s3, e.s2, e.s1, e.s0];
  L.graf.colunas(g, { categorias: ["S8", "S7", "S6", "S5", "S4", "S3", "S2", "S1", "S0"], series: [{ nome: "Unidades", valores: sem }], fmt: function (v) { return L.fNum(v, 0); }, altura: 240, corBarra: function (ci) { return ci === 8 ? L.cores().d[7] : L.cores().d[0]; },
    dica: function (i) { return { titulo: "Semana " + (8 - i), linhas: [{ rot: "Unidades", val: L.fNum(sem[i], 1) }] }; } });
  // custo de entrada
  var entr = L.ENT.linhas.filter(function (x) { return x[0] === ent.id; }).sort(function (a, b) { return a[1] - b[1]; });
  var pCusto = L.painel({ titulo: "Custo de entrada por mês", sub: "média ponderada: preço + frete + ST, por unidade", classe: "c-6" });
  var g2 = L.h("div"); pCusto.corpo.appendChild(g2);
  if (entr.length) L.graf.linhas(g2, { categorias: entr.map(function (x) { return L.fMesAno(D.meses[x[1]]); }), series: [{ nome: "Custo unitário", cor: L.cores().ouro, destaque: true, area: true, valores: entr.map(function (x) { return x[2] ? x[3] / x[2] : null; }) }], tipo: "moeda", fmt: function (v) { return L.fBRL(v, 2); }, zero: false, altura: 240, rotuloMin: 0,
    dica: function (i) { var x = entr[i]; return { titulo: L.fMesLongo(D.meses[x[1]]), linhas: [{ rot: "Custo unitário", val: L.fBRL(x[3] / x[2], 4) }, { rot: "Quantidade comprada", val: L.fNum(x[2], 0) }] }; } });
  else pCusto.corpo.appendChild(L.h("div", { class: "vazio", html: "<b>Sem entradas</b>Nenhuma compra registrada desde 2023." }));
  raiz.appendChild(L.grade(pSem, pCusto));
  return raiz;
}

/* ============================ aba VERBA ============================ */
function abaVerba(ent) {
  var D = L.D, raiz = L.h("div");
  var forns = ent.dim === "fornecedor" ? L.CCF.filter(function (x) { return x.fidx === ent.id; }) : L.CCF.filter(function (x) { return x.comprador === ent.id && x.ativo; });
  if (!forns.length) { raiz.appendChild(L.h("div", { class: "vazio", html: "<b>Sem conta corrente</b>Este recorte não tem lançamentos de verba." })); return Promise.resolve(raiz); }
  var saldo = 0, deb = 0, cre = 0, verba = 0;
  forns.forEach(function (x) { saldo += x.saldo; deb += x.debito; cre += x.credito; verba += x.verba_media; });
  var meses = verba > 0 ? saldo / verba : 0;
  raiz.appendChild(L.kpis(
    L.kpi({ icone: "carteira", rot: "Saldo da conta corrente", valor: saldo, fmt: function (v) { return L.fBRL(v, 0); }, classe: "heroi", leg: L.h("span", { text: forns.length + " fornecedor" + (forns.length > 1 ? "es" : "") }) }),
    L.kpi({ icone: "setaCima", rot: "Débitos acumulados", valor: deb, fmt: function (v) { return L.fBRL(v, 0); } }),
    L.kpi({ icone: "setaBaixo", rot: "Créditos acumulados", valor: cre, fmt: function (v) { return L.fBRL(v, 0); } }),
    L.kpi({ icone: "tendencia", rot: "Verba média do trimestre", valor: verba, fmt: function (v) { return L.fBRL(v, 0); }, leg: L.h("span", { text: "débitos dos 3 meses fechados ÷ 3" }) }),
    L.kpi({ icone: "relogio", rot: "Meses para pagar a conta", valor: meses, fmt: function (v) { return L.fNum(v, 1) + " meses"; }, classe: meses > 6 ? "atencao" : "", leg: L.h("span", { text: "saldo ÷ verba média" }) })));
  if (ent.dim === "fornecedor") {
    var f = forns[0], lanc = L.CCL.filter(function (x) { return x.forn === f.cod; }).sort(function (a, b) { return a.data < b.data ? -1 : 1; });
    // saldo ao longo do tempo: parte do saldo atual e volta
    var soma = lanc.reduce(function (s, x) { return s + (x.tipo === 0 ? x.valor : -x.valor); }, 0), acc = f.saldo - soma, pts = {};
    lanc.forEach(function (x) { acc += x.tipo === 0 ? x.valor : -x.valor; pts[x.data.slice(0, 7)] = acc; });
    var chaves = Object.keys(pts).sort();
    var pS = L.painel({ titulo: "Saldo no fim de cada mês", sub: "só meses com lançamento · desde jan/2024", classe: "c-12" });
    var gs = L.h("div"); pS.corpo.appendChild(gs);
    if (chaves.length > 1) L.graf.colunas(gs, { categorias: chaves.map(function (k) { return L.fMesAno(k); }), series: [{ nome: "Saldo", valores: chaves.map(function (k) { return pts[k]; }) }], tipo: "moeda", fmt: function (v) { return L.fAbrev(v, true); }, altura: 260,
      corBarra: function (ci) { return pts[chaves[ci]] >= 0 ? L.cores().d[0] : L.cores().perigo; }, dica: function (i) { return { titulo: L.fMesLongo(chaves[i]), linhas: [{ rot: "Saldo", val: L.fBRL(pts[chaves[i]], 2) }] }; } });
    else gs.innerHTML = '<div class="vazio"><b>Poucos lançamentos</b>Sem histórico suficiente para a evolução.</div>';
    var t = L.tabela({ titulo: "Lançamentos — " + nomeEnt(ent), arquivo: "conta-corrente", aba: "Lançamentos", linhas: lanc, porPagina: 25, ordem: { id: "data", desc: true },
      buscaTexto: function (r) { return r.historico + " " + (r.verba || "") + " " + r.usuarioNome; },
      colunas: [
        { id: "data", titulo: "Data", tipo: "data", valor: function (r) { return r.data; } },
        { id: "hist", titulo: "Histórico", tipo: "texto", valor: function (r) { return r.historico; }, ordVal: function (r) { return r.historico; } },
        { id: "verba", titulo: "Verba nº", tipo: "texto", valor: function (r) { return r.verba ? String(r.verba) : ""; } },
        { id: "deb", titulo: "Débito", tipo: "moeda", valor: function (r) { return r.tipo === 0 ? r.valor : null; }, exportarTipo: "moeda" },
        { id: "cre", titulo: "Crédito", tipo: "moeda", valor: function (r) { return r.tipo === 1 ? -r.valor : null; }, exportarTipo: "moeda" },
        { id: "neg", titulo: "Negociação", tipo: "tag", valor: function (r) { return r.negociacao; }, fmt: function (v) { return { html: v ? L.tag("Sim", "info") : "" }; }, essencial: false, exp: function (r) { return r.negociacao ? "Sim" : ""; } },
        { id: "usu", titulo: "Lançado por", tipo: "texto", valor: function (r) { return r.usuarioNome; }, essencial: false },
      ] });
    raiz.appendChild(L.grade(pS, L.painel({ titulo: "Lançamentos da conta corrente", sub: "débito soma, crédito abate · classificação de negociação por palavra-chave do histórico", classe: "c-12", semPad: true, corpo: t })));
  } else {
    var t2 = L.tabela({ titulo: "Contas dos fornecedores — " + nomeEnt(ent), arquivo: "conta-corrente-fornecedores", aba: "Fornecedores", linhas: forns, porPagina: 25, rank: true, ordem: { id: "saldo", desc: true },
      buscaTexto: function (r) { return r.cod + " " + r.nome; },
      colunas: [
        { id: "nome", titulo: "Fornecedor", tipo: "texto", valor: function (r) { return r.nome; } },
        { id: "saldo", titulo: "Saldo", tipo: "moedaInt", valor: function (r) { return r.saldo; }, barra: true, exportarTipo: "moeda" },
        { id: "verba", titulo: "Verba média tri.", tipo: "moedaInt", valor: function (r) { return r.verba_media; }, exportarTipo: "moeda" },
        { id: "meses", titulo: "Meses para pagar", tipo: "num", valor: function (r) { return r.verba_media > 0 ? r.meses : null; } },
      ], aoClicar: function (r, ev) { if (r.fidx >= 0) L.cliqueDim2("fornecedor", r.fidx, ev); } });
    raiz.appendChild(L.grade(L.painel({ titulo: "Fornecedores do comprador", sub: "só fornecedores com produto ativo · clique para abrir", classe: "c-12", semPad: true, corpo: t2 })));
  }
  return Promise.resolve(raiz);
}

})();
