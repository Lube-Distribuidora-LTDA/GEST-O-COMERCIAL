/* =============================================================================
 * dados.js — dados do navegador: dimensões, bases pequenas (estoque, conta
 * corrente, entradas), registro de dimensões para filtros e relatórios, e a
 * lógica de comparação entre períodos (com corte no mesmo dia do mês).
 * ========================================================================== */
(function () {
"use strict";
var L = window.L;

/* ------------------------------ carga ------------------------------ */
L.carregarTudo = function () {
  return Promise.all([L.carregarJson("dims.json"), L.carregarJson("estoque.json"), L.carregarJson("entradas.json"),
                      L.carregarJson("cc.json"), L.carregarJson("historico.json"), L.carregarJson("meta.json")])
    .then(function (r) {
      L.D = r[0]; L.META = r[5]; L.HIST = r[4]; L.ENT = r[2];
      prepararDims(); prepararEstoque(r[1]); prepararCC(r[3]);
    });
};

function prepararDims() {
  var D = L.D;
  L.anos = [];
  D.meses.forEach(function (m) { var y = +m.slice(0, 4); if (L.anos.indexOf(y) < 0) L.anos.push(y); });
  L.anoAtual = L.anos[L.anos.length - 1];
  // município: mesma ordem do motor (primeira aparição)
  var mp = {}; L.municipios = [];
  D.clientes.forEach(function (c) { var k = c[3] + "|" + c[4]; if (!(k in mp)) { mp[k] = L.municipios.length; L.municipios.push([c[3] || "Sem município", c[4] || ""]); } });
  // fornecedor -> comprador (índice)
  L.compDeProduto = function (p) { var f = D.produtos[p][3]; return f >= 0 ? D.fornecedores[f][2] : -1; };
  construirRegistro();
}

/* ------------------------------ registro de dimensões ------------------------------ */
function construirRegistro() {
  var D = L.D;
  var R = L.DIM = {};
  function def(chave, rot, rotP, icone, cfg) { R[chave] = Object.assign({ chave: chave, rot: rot, rotP: rotP, icone: icone }, cfg); }
  def("ano", "Ano", "Anos", "calendario", { n: function () { return L.anos.length; }, nome: function (id) { return String(id); }, todos: function () { return L.anos.slice().reverse().map(function (a) { return { id: a, t: String(a) }; }); } });
  def("mes", "Mês", "Meses", "calendario", { nome: function (id) { return L.MESES[id - 1]; }, todos: function () { return L.MESES.map(function (m, i) { return { id: i + 1, t: m }; }); } });
  def("uf", "Estado", "Estados", "pino", { nome: function (i) { return D.uf[i]; }, todos: function () { return D.uf.map(function (u, i) { return { id: i, t: u }; }); } });
  def("equipe", "Equipe", "Equipes", "pessoas", { nome: function (i) { return D.equipes[i][1]; }, todos: function () { return D.equipes.map(function (e, i) { return { id: i, t: e[1], s: D.uf[e[2]] }; }); } });
  def("rca", "RCA", "RCAs", "pessoas", { nome: function (i) { return D.rcas[i][1]; }, sub: function (i) { return "RCA " + D.rcas[i][0] + " · " + D.equipes[D.rcas[i][2]][1]; }, grande: true, todos: function () { return D.rcas.map(function (r, i) { return { id: i, t: r[1], s: D.equipes[r[2]][1] }; }); } });
  def("comprador", "Comprador", "Compradores", "carteira", { nome: function (i) { return i < 0 ? "Sem comprador" : D.compradores[i][1]; }, todos: function () { return D.compradores.map(function (c, i) { return { id: i, t: c[1] }; }); } });
  def("fornecedor", "Fornecedor", "Fornecedores", "caixa", { nome: function (i) { return i < 0 ? "Sem fornecedor" : D.fornecedores[i][1]; }, sub: function (i) { return i < 0 ? "" : "Cód. " + D.fornecedores[i][0]; }, grande: true, todos: function () { return D.fornecedores.map(function (f, i) { return { id: i, t: f[1], s: String(f[0]) }; }); } });
  def("depto", "Departamento", "Departamentos", "camadas", { nome: function (i) { return i < 0 ? "Sem departamento" : D.deptos[i]; }, todos: function () { return D.deptos.map(function (d, i) { return { id: i, t: d }; }); } });
  def("categoria", "Categoria", "Categorias", "etiqueta", { nome: function (i) { return i < 0 ? "Sem categoria" : D.categorias[i][0]; }, sub: function (i) { return i < 0 ? "" : D.deptos[D.categorias[i][1]]; }, grande: true, todos: function () { return D.categorias.map(function (c, i) { return { id: i, t: c[0], s: D.deptos[c[1]] }; }); } });
  def("subcategoria", "Subcategoria", "Subcategorias", "etiqueta", { nome: function (i) { return i < 0 ? "Sem subcategoria" : D.subcategorias[i][0]; }, sub: function (i) { return i < 0 ? "" : D.categorias[D.subcategorias[i][1]][0]; }, grande: true, todos: function () { return D.subcategorias.map(function (c, i) { return { id: i, t: c[0], s: D.categorias[c[1]][0] }; }); } });
  def("marca", "Marca", "Marcas", "estrela", { nome: function (i) { return i < 0 ? "Sem marca" : D.marcas[i]; }, grande: true, todos: function () { return D.marcas.map(function (m, i) { return { id: i, t: m }; }); } });
  def("ramo", "Ramo do cliente", "Ramos", "loja", { nome: function (i) { return i < 0 ? "Sem ramo" : D.ramos[i]; }, todos: function () { return D.ramos.map(function (m, i) { return { id: i, t: m }; }); } });
  def("municipio", "Município", "Municípios", "pino", { nome: function (i) { return i < 0 ? "Sem município" : L.municipios[i][0] + (L.municipios[i][1] ? "/" + L.municipios[i][1] : ""); }, grande: true, todos: function () { return L.municipios.map(function (m, i) { return { id: i, t: m[0] + (m[1] ? "/" + m[1] : "") }; }); } });
  def("cliente", "Cliente", "Clientes", "loja", { nome: function (i) { return D.clientes[i][1]; }, sub: function (i) { return "Cód. " + D.clientes[i][0] + " · " + D.clientes[i][3] + (D.clientes[i][4] ? "/" + D.clientes[i][4] : ""); }, grande: true, todos: function () { return D.clientes.map(function (c, i) { return { id: i, t: c[1], s: c[0] + " · " + c[3] }; }); } });
  def("produto", "Produto", "Produtos", "caixa", { nome: function (i) { return D.produtos[i][1]; }, sub: function (i) { return "Cód. " + D.produtos[i][0] + " · " + (D.produtos[i][2] || "sem EAN"); }, grande: true, todos: function () { return D.produtos.map(function (p, i) { return { id: i, t: p[1], s: p[0] + " · " + p[2] }; }); } });
  def("origem", "Origem da classificação", "Origens", "info", { nome: function (i) { return ["Planilha do Trade", "Herdada do WinThor", "Sem classificação"][i]; }, todos: function () { return [{ id: 0, t: "Planilha do Trade" }, { id: 1, t: "Herdada do WinThor" }, { id: 2, t: "Sem classificação" }]; } });
  def("status", "Status do produto", "Status", "info", { nome: function (i) { return i ? "Fora de linha" : "Ativo"; }, todos: function () { return [{ id: 0, t: "Ativo" }, { id: 1, t: "Fora de linha" }]; } });
  def("promo", "Promocional", "Promocional", "estrela", { nome: function (i) { return i ? "Promocional" : "Normal"; }, todos: function () { return [{ id: 0, t: "Normal" }, { id: 1, t: "Promocional" }]; } });
  Object.keys(R).forEach(function (k) {
    var d = R[k]; d.cache = null;
    d.itens = function () { if (!d.cache) { d.cache = d.todos().map(function (x) { x.n = L.norm(x.t + " " + (x.s || "")); return x; }); } return d.cache; };
  });
}
/* nome legível de um id em uma dimensão (−1 = sem valor) */
L.nomeDe = function (dim, id) { var d = L.DIM[dim]; return d ? d.nome(id) : String(id); };

/* ------------------------------ estoque ------------------------------ */
function prepararEstoque(j) {
  var D = L.D, c = j.cols;
  L.EST = j.linhas.map(function (r) {
    var o = {}; c.forEach(function (n, i) { o[n] = r[i]; });
    var p = D.produtos[o.p];
    o.cod = p[0]; o.desc = p[1]; o.ean = p[2]; o.forn = p[3]; o.depto = p[4]; o.cat = p[5]; o.sub = p[6]; o.marca = p[7];
    o.comp = o.forn >= 0 ? D.fornecedores[o.forn][2] : -1; o.status = p[9]; o.peso = p[10];
    o.venda_sem = o.venda56 / 8;                       // venda semanal média (R$)
    return o;
  });
  L.ESTp = {}; L.EST.forEach(function (e) { L.ESTp[e.p] = e; });
}
/* passa nos filtros que valem para cadastro de produto? */
L.passaProduto = function (o, f) {
  function ok(chave, v) { var a = f[chave]; return !a || !a.length || a.indexOf(v) >= 0; }
  return ok("comprador", o.comp) && ok("fornecedor", o.forn) && ok("depto", o.depto) && ok("categoria", o.cat) && ok("subcategoria", o.sub) &&
         ok("marca", o.marca) && ok("produto", o.p) && ok("status", o.status) && ok("promo", D_promo(o));
};
function D_promo(o) { return o.promo; }

/* ------------------------------ conta corrente ------------------------------ */
function prepararCC(j) {
  var D = L.D;
  var cf = j.cols_f;
  L.CCF = j.fornecedores.map(function (r) {
    var o = {}; cf.forEach(function (n, i) { o[n] = r[i]; });
    o.meses = o.verba_media > 0 ? o.saldo / o.verba_media : 0;           // meses para pagar a conta
    return o;
  });
  var fi = {}; D.fornecedores.forEach(function (f, i) { fi[f[0]] = i; });
  L.fornIdxDeCod = fi;
  L.CCF.forEach(function (o) { o.fidx = fi[o.cod] != null ? fi[o.cod] : -1; });
  var cl = j.cols_l;
  L.CCL = j.lancamentos.map(function (r) { var o = {}; cl.forEach(function (n, i) { o[n] = r[i]; }); o.fidx = fi[o.forn] != null ? fi[o.forn] : -1; o.usuarioNome = D.usuarios_cc[o.usuario]; return o; });
}

/* ------------------------------ períodos e comparação ------------------------------ */
/* meses selecionados (índices), só até o último mês com dado */
L.misDe = function (f) {
  var D = L.D, last = D.corte.mi, out = [];
  for (var i = 0; i < D.meses.length && i <= last; i++) {
    var y = +D.meses[i].slice(0, 4), m = +D.meses[i].slice(5, 7);
    if (f.mis && f.mis.length) { if (f.mis.indexOf(i) < 0) continue; }
    else { if (f.ano && f.ano.length && f.ano.indexOf(y) < 0) continue; if (f.mes && f.mes.length && f.mes.indexOf(m) < 0) continue; }
    out.push(i);
  }
  return out;
};
L.rotMis = function (mis) {
  var D = L.D;
  if (!mis.length) return "—";
  var a = mis[0], b = mis[mis.length - 1];
  var anoA = +D.meses[a].slice(0, 4), anoB = +D.meses[b].slice(0, 4), mA = +D.meses[a].slice(5, 7), mB = +D.meses[b].slice(5, 7);
  var cont = b - a + 1 === mis.length;
  if (mis.length === 1) return L.MES3[mA - 1] + "/" + anoA;
  if (cont && mA === 1 && mB === 12 && anoA === anoB) return String(anoA);
  if (cont && mA === 1 && mB === 12) return anoA + "–" + anoB;
  if (cont && anoA === anoB) return L.MES3[mA - 1] + "–" + L.MES3[mB - 1] + "/" + anoA;
  if (cont) return L.MES3[mA - 1] + "/" + String(anoA).slice(2) + "–" + L.MES3[mB - 1] + "/" + String(anoB).slice(2);
  var anos = []; mis.forEach(function (i) { var y = +D.meses[i].slice(0, 4); if (anos.indexOf(y) < 0) anos.push(y); });
  var ms = []; mis.forEach(function (i) { var m = +D.meses[i].slice(5, 7); if (ms.indexOf(m) < 0) ms.push(m); });
  return ms.map(function (m) { return L.MES3[m - 1]; }).join(", ") + "/" + anos.join(", ");
};
/* período atual + os dois comparativos (ano anterior e período anterior), com corte no mesmo dia */
L.comparar = function (f) {
  var D = L.D, mis = L.misDe(f);
  if (!mis.length) return null;
  var pm = D.corte.mi, y = +D.meses[pm].slice(0, 4), m = +D.meses[pm].slice(5, 7);
  var diasMes = new Date(y, m, 0).getDate();
  var parcial = mis.indexOf(pm) >= 0 && D.corte.dia < diasMes;
  var res = { mis: mis, rot: L.rotMis(mis), parcial: parcial, ateDia: L.fData(D.corte.ate), aa: null, pa: null };
  var aaMis = mis.map(function (i) { return i - 12; });
  if (aaMis[0] >= 0) res.aa = { mis: aaMis, corte: parcial ? [pm - 12] : [], rot: L.rotMis(aaMis) };
  var n = mis.length, cont = mis[mis.length - 1] - mis[0] + 1 === n;
  if (cont && n !== 12) {
    var paMis = mis.map(function (i) { return i - n; });
    if (paMis[0] >= 0) res.pa = { mis: paMis, corte: parcial ? [pm - n] : [], rot: L.rotMis(paMis) };
  }
  return res;
};
/* três pedidos de resumo (atual, ano anterior, período anterior) para um mesmo conjunto de filtros */
L.pedidosCmp = function (id, tipo, extra, cmp) {
  var base = Object.assign({ id: id, tipo: tipo || "resumo" }, extra || {});
  var out = [Object.assign({}, base)];
  var nul = { ano: null, mes: null, de: null, ate: null, mis: null };
  if (cmp && cmp.aa) out.push(Object.assign({}, base, { id: id + "_aa", filtros: Object.assign({}, base.filtros || {}, nul, { mis: cmp.aa.mis }), corte: cmp.aa.corte }));
  if (cmp && cmp.pa) out.push(Object.assign({}, base, { id: id + "_pa", filtros: Object.assign({}, base.filtros || {}, nul, { mis: cmp.pa.mis }), corte: cmp.pa.corte }));
  return out;
};
/* filtros da API com o período já resolvido em `mis` (corta os meses sem dado) */
L.filtrosComPeriodo = function () { var f = L.filtrosApi(); return f; };

/* data de referência legível */
L.ateRot = function () { return L.fData(L.D.corte.ate); };

})();
