/* =============================================================================
 * dados.js — dados do navegador: dimensões, bases pequenas (estoque, conta
 * corrente, entradas), registro de dimensões para filtros e relatórios, e a
 * lógica de comparação entre períodos (com corte no mesmo dia do mês).
 * ========================================================================== */
(function () {
"use strict";
var L = window.L;

/* ------------------------------ carga ------------------------------ */
var ARQUIVOS_ABERTURA = ["dims.json", "estoque.json", "entradas.json", "cc.json", "historico.json", "meta.json"];
/* A abertura: os 6 arquivos e a versão do servidor numa chamada só (/api/abertura). Antes eram 6 chamadas, depois
   /api/versao, depois a 1ª consulta, e na Vercel cada passo podia cair numa cópia fria do servidor (~7 s), uma depois
   da outra (~23 s até aparecer o dado). Se a abertura não responder, cai no jeito antigo: um arquivo por chamada. */
function abrirUmaChamada() {
  return fetch("api/abertura").then(function (r) {
    if (!r.ok) throw new Error("abertura: " + r.status);
    return r.json();
  }).then(function (a) {
    ARQUIVOS_ABERTURA.forEach(function (n) { L.VERSOES[n] = a.versoes[n]; });
    return { arq: a.arquivos, info: a.info };
  });
}
function abrirUmPorUm() {
  return Promise.all(ARQUIVOS_ABERTURA.map(function (n) { return L.carregarJson(n); })).then(function (r) {
    var arq = {}; ARQUIVOS_ABERTURA.forEach(function (n, i) { arq[n] = r[i]; });
    return { arq: arq, info: null };
  });
}
L.carregarTudo = function () {
  return abrirUmaChamada().catch(function (e) {
    console.warn("abertura numa chamada só falhou, baixando os arquivos um a um:", e && e.message);
    return abrirUmPorUm();
  }).then(function (a) {
    var arq = a.arq;
    L.D = arq["dims.json"]; L.META = arq["meta.json"]; L.HIST = arq["historico.json"]; L.ENT = arq["entradas.json"];
    L.DBASE = { clientes: L.D.clientes.length, produtos: L.D.produtos.length, rcas: L.D.rcas.length, equipes: L.D.equipes.length, meses: L.D.meses.length };
    prepararDims(); prepararEstoque(arq["estoque.json"]); prepararCC(arq["cc.json"]);
    // com a abertura a versão do servidor já veio junto; no jeito antigo ainda se pergunta
    var v = a.info ? L.aplicarVersaoServidor(a.info) : L.sincronizarHoje();
    return v.catch(function (e) { console.warn("venda de hoje:", e && e.message); });
  });
};

/* ------------------------------ a venda de hoje (AGENTE LUBE) ------------------------------
   O arquivo da venda tem só dias fechados (até ontem). O servidor põe por cima a venda de hoje, que o agente lê do
   WinThor de 30 em 30 s, e diz em /api/versao a versão dela e os clientes, produtos e RCAs que o arquivo ainda não tem
   (cliente novo de hoje). A tela acrescenta esses extras às listas dela, nos mesmos índices do motor. */
L.HOJE = null;
L.aplicarHoje = function (h) {
  var D = L.D, B = L.DBASE;
  ["clientes", "produtos", "rcas", "equipes", "meses"].forEach(function (k) {
    D[k].length = B[k];
    if (h && h.extras && h.extras[k]) Array.prototype.push.apply(D[k], h.extras[k]);
  });
  L.HOJE = h && h.versao ? h : null;
  prepararDims();
};
/* pergunta ao servidor; true = a venda de hoje ou uma das bases mudou (a tela redesenha). Carga nova do arquivo =
   recarrega a página. */
L.sincronizarHoje = function () {
  return fetch("api/versao?hoje=1&_=" + Date.now(), { cache: "no-store" }).then(function (r) {
    if (!r.ok) throw new Error("versão: " + r.status);
    return r.json();
  }).then(L.aplicarVersaoServidor);
};
/* o que /api/versao diz (ou a abertura traz em `info`): vale a venda de hoje e as bases; true = mudou algo, a tela redesenha */
L.aplicarVersaoServidor = function (m) {
  if (m.gerado_em && L.META && m.gerado_em !== L.META.gerado_em) { L.versaoMudou(); return Promise.resolve(false); }
  var h = m.hoje || null, mudou = false;
  if (!((h ? h.versao : null) === (L.HOJE ? L.HOJE.versao : null) && (!h || h.dia === L.HOJE.dia))) {
    L.aplicarHoje(h);
    if (L.limparCacheConsulta) L.limparCacheConsulta();
    mudou = true;
  }
  return sincronizarBases(m.bases).then(function (mb) { return mudou || mb; },
    function (e) { console.warn("estoque/conta corrente ao vivo:", e && e.message); return mudou; });
};

/* ------------------------------ estoque, conta corrente, entradas e histórico ao vivo (AGENTE LUBE) ------------------------------
   O agente lê o WinThor (estoque de minuto em minuto; giro, conta corrente e entradas de poucos em poucos minutos) e a
   tarefa das fotos olha a pasta FOTOS_ION de 5 em 5 min. O servidor refaz os arquivos e diz em /api/versao a versão
   (sha1) de cada um; a tela baixa de novo só o que mudou e redesenha no lugar. */
L.BASES = null;
var BASES = {
  "estoque.json": function (j) { prepararEstoque(j); },
  "cc.json": function (j) { prepararCC(j); },
  "entradas.json": function (j) { L.ENT = j; },
  "historico.json": function (j) { L.HIST = j; },
};
function sincronizarBases(b) {
  if (b) L.BASES = b;
  if (!b || !b.arquivos) return Promise.resolve(false);
  var nomes = Object.keys(BASES).filter(function (n) { return b.arquivos[n] && b.arquivos[n] !== L.VERSOES[n]; });
  if (!nomes.length) return Promise.resolve(false);
  return Promise.all(nomes.map(function (n) { return L.carregarJson(n, b.arquivos[n]); })).then(function (js) {
    js.forEach(function (j, i) { BASES[nomes[i]](j); });
    return true;
  });
}
/* a base da porcentagem com a venda de hoje nos totais: o período atual só com os dias fechados (decisão do Júlio,
   2026-10-27). R[id + "_f"] vem do L.pedidosCmp; sem a venda de hoje, não existe e a tela compara como sempre. */
L.cmpFechado = function (R, id) { var f = R && R[id + "_f"]; return f ? L.derivar(f) : null; };
/* para os KPIs: põe `atual` (só dias fechados) na comparação, quando houver */
L.comAtualFechado = function (cfgCmp, atF, campo) {
  if (cfgCmp && atF && atF[campo] != null) cfgCmp.atual = atF[campo];
  return cfgCmp;
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
  var cl = j.cols_l, us = j.usuarios || D.usuarios_cc;           // a conta corrente ao vivo traz a própria lista de quem lançou
  L.CCL = j.lancamentos.map(function (r) { var o = {}; cl.forEach(function (n, i) { o[n] = r[i]; }); o.fidx = fi[o.forn] != null ? fi[o.forn] : -1; o.usuarioNome = us[o.usuario]; return o; });
}

/* ------------------------------ períodos e comparação ------------------------------ */
/* meses selecionados (índices), só até o último mês com dado */
L.misDe = function (f) {
  var D = L.D, last = D.corte.mi, out = [];
  // com a venda de hoje, o último mês com dado pode ser um mês novo (dia 1º, antes da carga da manhã ter esse mês)
  if (L.HOJE && L.HOJE.meses && L.HOJE.meses.length) last = Math.max(last, L.HOJE.meses[L.HOJE.meses.length - 1]);
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
  // a comparação é só de dias fechados: um mês que só tem a venda de hoje (o dia 1º, antes da carga da manhã ter
  // esse mês) fica fora dela — e se o período é só ele, ainda não há o que comparar
  var misF = mis.filter(function (i) { return i <= pm; });
  if (!misF.length) { res.semFechado = true; return res; }
  var aaMis = misF.map(function (i) { return i - 12; });
  if (aaMis[0] >= 0) res.aa = { mis: aaMis, corte: parcial ? [pm - 12] : [], rot: L.rotMis(aaMis) };
  var n = misF.length, cont = misF[misF.length - 1] - misF[0] + 1 === n;
  if (cont && n !== 12) {
    var paMis = misF.map(function (i) { return i - n; });
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
  // o atual só com dias fechados: os meses que têm venda de hoje entram "até o dia de corte" (as linhas de hoje valem 0)
  var mh = L.mesesHojeNa(cmp);
  if ((cmp && (cmp.aa || cmp.pa)) && mh.length) out.push(Object.assign({}, base, { id: id + "_f", corte: mh }));
  return out;
};
/* os meses com venda de hoje que estão no período */
L.mesesHojeNa = function (cmp) {
  if (!L.HOJE || !L.HOJE.linhas || !cmp || !cmp.mis) return [];
  return L.HOJE.meses.filter(function (m) { return cmp.mis.indexOf(m) >= 0; });
};
/* filtros da API com o período já resolvido em `mis` (corta os meses sem dado) */
L.filtrosComPeriodo = function () { var f = L.filtrosApi(); return f; };

/* data de referência legível */
L.ateRot = function () { return L.fData(L.D.corte.ate); };

})();
