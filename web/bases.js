/* =============================================================================
 * bases.js — estoque, conta corrente, entradas e o histórico de hoje ao vivo (AGENTE LUBE, fases 2 e 3, 2026-10-27)
 *
 * As bases pequenas que a tela filtra no navegador (estoque.json, cc.json, entradas.json, historico.json) vinham só
 * da carga grande. O AGENTE LUBE, na SRV-IA, passou a gravar o que elas precisam (trade.estoque_posicao de 60 em 60 s,
 * trade.estoque_giro de 5 em 5 min, trade.entrada_mes e trade.cc_lancamento de 2 em 2 min) e a tarefa "Trade - Fotos"
 * mantém trade.produto_imagem de 5 em 5 min. Este módulo refaz os arquivos com as MESMAS contas do ETL
 * (etl/extrair_trade.py, construir(): ruptura, sem venda, média aparada, cobertura, sugestão, verba do trimestre,
 * negociação) e troca no pacote em memória só o arquivo que mudou.
 *
 * A versão de cada arquivo é o sha1 do conteúdo: toda cópia do servidor (na Vercel há várias) chega à mesma versão
 * com o mesmo dado, e a tela baixa de novo só o arquivo cuja versão mudou.
 *
 * Quando a leitura do agente é mais velha que o arquivo da carga (agente parado), vale o arquivo da carga; as fotos
 * valem sempre a tabela (a carga grava a mesma tabela). Produto que o arquivo ainda não tem (cadastrado hoje) entra
 * na carga da manhã: os índices de produto são os do arquivo.
 * ========================================================================== */
"use strict";

const crypto = require("crypto");
const fonte = require("./fonte_dados.js");
const hoje = require("./hoje.js");

const ANO_INICIAL = 2023;                 // DATA_INICIAL do ETL: mês índice 0 = jan/2023
const DATA_INICIAL_CC = "2024-01-01";     // lançamentos da conta corrente exibidos
const PALAVRAS_NEGOCIACAO = ["REBAIXA", "VERBA", "VENCIMENTO", "PERDA", "COMPRA DE MERC.BONIFIC.", "NEGOC", "CAMPANHA"];
const ARQUIVOS = ["estoque.json", "entradas.json", "cc.json", "historico.json"];
const EST_COLS = ["p", "ativo", "promo", "disp", "bloq", "total", "avaria", "reserv", "preco", "valor_custo",
  "valor_pf", "venda56", "media", "cob", "sug", "pend", "prim", "ult", "img",
  "s0", "s1", "s2", "s3", "s4", "s5", "s6", "s7", "s8", "rup", "sv", "base"];
const I = Object.fromEntries(EST_COLS.map((c, i) => [c, i]));

/* round() do Python: o mais perto do valor exato do número; empate exato (só frações binárias, como 0,125) vai para o par */
function arred(x, n) {
  if (x == null || !isFinite(x)) return x;
  const f = 10 ** n, y = x * f, t = Math.trunc(y);
  if (Math.abs(y - t) === 0.5 && (t + Math.sign(y) * 0.5) / f === x) return ((t % 2 === 0) ? t : t + Math.sign(y)) / f || 0;
  return Number(x.toFixed(n)) || 0;
}
function limpo(s) { return s == null ? "" : String(s).replace(/ /g, " ").replace(/\s+/g, " ").trim(); }
function semAcento(s) { return s.normalize("NFD").replace(/\p{Mn}/gu, ""); }
function eNegociacao(hist) {
  const t = semAcento(hist || "").toUpperCase();
  if (PALAVRAS_NEGOCIACAO.some((p) => t.includes(p))) return true;
  return t.includes("ACAO") && !t.startsWith("ALTERACAO");
}
/* MEDIA do BI COMPRAS: descarta a melhor e a pior semana das 9 */
function mediaAparada(sem) {
  const tot = sem.reduce((a, b) => a + b, 0);
  if (tot <= 1) return null;
  const comVenda = sem.filter((s) => s > 0).length;
  if (comVenda - 2 <= 0) return null;
  return (tot - Math.max(...sem) - Math.min(...sem)) / (comVenda - 2);
}
const DIA_MS = 86400000;
function dias(a, b) { return Math.round((Date.parse(a + "T00:00:00Z") - Date.parse(b + "T00:00:00Z")) / DIA_MS); }
function mesIndice(isoMes) { return (+isoMes.slice(0, 4) - ANO_INICIAL) * 12 + (+isoMes.slice(5, 7)) - 1; }
function isoDe(y, m0, d) { return new Date(Date.UTC(y, m0, d)).toISOString().slice(0, 10); }
function sha(buf) { return crypto.createHash("sha1").update(buf).digest("hex").slice(0, 16); }
function json(obj) { return Buffer.from(JSON.stringify(obj), "utf8"); }

/* o que vem do arquivo da carga e não muda até a próxima carga: os mapas código -> índice e as bases como vieram */
function doArquivo(e) {
  if (!e.basesArq) {
    const D = e.motor.dims, B = hoje.base(e);
    const comp = new Map(D.compradores.map((c, i) => [c[0], i]));
    const parse = (n) => JSON.parse(e.arquivos[n].toString("utf8"));
    e.basesArq = { D, B, comp, estoque: parse("estoque.json"), entradas: parse("entradas.json"), cc: parse("cc.json"), historico: parse("historico.json") };
  }
  return e.basesArq;
}

/* ---- estoque (o bloco "estoque" do construir) ---- */
function montarEstoque(A, ref, pos, giro, fotos) {
  const { D, B } = A;
  const out = [];
  let fora = 0;
  for (const r of pos) {
    const p = B.p.get(r.codprod);
    if (p == null || p >= B.produtos) { fora++; continue; }
    const pinfo = D.produtos[p], g = giro.get(r.codprod);
    const reserv = r.reservado, bloq = r.bloq_semav, avaria = r.avaria, disp = r.disponivel, valorCusto = r.valor_custo, pend = r.pendente;
    const sem = g ? [g.s0, g.s1, g.s2, g.s3, g.s4, g.s5, g.s6, g.s7, g.s8] : [0, 0, 0, 0, 0, 0, 0, 0, 0];
    const venda56 = g ? g.venda56 : 0, prim = g ? g.primeira : null, ult = g ? g.ultima : null;
    const ativo = pinfo[9] === 0 ? 1 : 0, promo = pinfo[8];
    const total = disp + bloq;                                       // "estoque total disponível" do original
    const base = ativo && !promo ? 1 : 0;                            // SKUs (p)
    const recente = !!(ult && dias(ref, ult) < 365);
    const rup = base && recente && total <= 0 ? 1 : 0;
    const primeiraOk = !!(prim && dias(ref, prim) > 14);
    const sv = ativo && venda56 <= 0 && primeiraOk && disp > 0 ? 1 : 0;
    const media = mediaAparada(sem);
    const cob = media ? (disp + bloq) / media : null;
    const sug = media != null && media * 8 - disp > 0 ? media * 8 - disp : null;
    const preco = r.pvenda || 0;
    out.push([p, ativo, promo, arred(disp, 2), arred(bloq, 2), arred(total, 2), arred(avaria, 2), arred(reserv, 2), arred(preco, 4),
      arred(valorCusto, 2), arred(total * preco / 1.35, 2), arred(venda56, 2), media == null ? null : arred(media, 3),
      cob == null ? null : arred(cob, 2), sug == null ? null : arred(sug, 1), arred(pend, 1), prim, ult, fotos.has(r.codprod) ? 1 : 0,
      ...sem.map((s) => arred(s, 1)), rup, sv, base]);
  }
  out.sort((a, b) => a[0] - b[0]);
  return { linhas: out, fora };
}
/* sem leitura nova do agente: o estoque do arquivo, só com a foto de agora */
function estoqueDoArquivo(A, fotos) {
  const { D } = A, ip = A.estoque.cols.indexOf("img");
  return A.estoque.linhas.map((r) => { const x = r.slice(); x[ip] = fotos.has(D.produtos[r[0]][0]) ? 1 : 0; return x; });
}

/* ---- foto de hoje dos indicadores por comprador (vira o dia de hoje do historico.json) ---- */
function fotoDeHoje(A, est) {
  const { D } = A, por = new Map();
  for (const e of est) {
    const f = D.produtos[e[I.p]][3], ic = f >= 0 ? D.fornecedores[f][2] : -1;
    let d = por.get(ic);
    if (!d) { d = { skus: 0, rup: 0, sv: 0, ativos: 0, parado: 0, parado_pf: 0 }; por.set(ic, d); }
    d.ativos += e[I.ativo]; d.skus += e[I.base]; d.rup += e[I.rup]; d.sv += e[I.sv];
    if (e[I.sv]) { d.parado += e[I.valor_custo]; d.parado_pf += e[I.valor_pf]; }
  }
  const comp = {};
  for (const ic of [...por.keys()].sort((a, b) => a - b)) {
    const d = por.get(ic), cod = ic < 0 ? -1 : D.compradores[ic][0], nome = ic < 0 ? "Sem comprador" : D.compradores[ic][1];
    comp[String(cod)] = { nome: nome || "", ativos: d.ativos, skus: d.skus, rup: d.rup, sv: d.sv, parado: arred(d.parado, 2), parado_pf: arred(d.parado_pf, 2) };
  }
  return comp;
}

/* ---- entradas: os meses do agente por cima dos do arquivo ---- */
function montarEntradas(A, ref, vivas) {
  const mi = mesIndice(ref), meses = new Set([mi, mi - 1, mi - 2]);
  const novas = [];
  for (const r of vivas) {
    const m = mesIndice(r.mes);
    if (!meses.has(m)) continue;
    const p = A.B.p.get(r.codprod);
    if (p == null || p >= A.B.produtos) continue;
    novas.push([p, m, arred(r.qt, 3), arred(r.valor, 2)]);
  }
  novas.sort((a, b) => a[1] - b[1] || a[0] - b[0]);
  return { cols: A.entradas.cols, linhas: A.entradas.linhas.filter((r) => !meses.has(r[1])).concat(novas) };
}

/* ---- conta corrente (o bloco "conta corrente" do construir) ---- */
function montarCC(A, ref, cc, est) {
  const { D } = A;
  const y = +ref.slice(0, 4), m0 = +ref.slice(5, 7) - 1;
  const iniTri = isoDe(y, m0 - 3, 1), fimTri = isoDe(y, m0, 0);   // os 3 meses fechados antes do mês de ref
  const ccf = new Map();
  for (const a of cc.agregado) ccf.set(a.codfornec, { nome: limpo(a.fornecedor), comp: a.codcomprador, deb: a.debito, cre: a.credito, trim: 0, neg: 0 });
  const usuarios = [], posUsu = new Map(), lanc = [];
  for (const l of cc.linhas) {
    const a = ccf.get(l.codfornec);
    if (!a) continue;
    const valor = l.valor || 0, deb = l.tipo === "D" ? valor : 0, neg = l.tipo === "D" && eNegociacao(l.historico);
    const noTri = l.data >= iniTri && l.data <= fimTri;
    if (deb && l.numverba != null && noTri) a.trim += deb;
    if (deb && neg && noTri) a.neg += deb;
    if (l.data >= DATA_INICIAL_CC) {
      const u = limpo(l.usuario) || "—";
      if (!posUsu.has(u)) { posUsu.set(u, usuarios.length); usuarios.push(u); }
      lanc.push([l.data, l.codfornec, l.tipo === "D" ? 0 : 1, arred(valor, 2), limpo(l.historico).slice(0, 140),
        l.numverba != null ? Number(l.numverba) : null, posUsu.get(u), Number(l.transacao), neg ? 1 : 0, l.dtestorno != null ? 1 : 0]);
    }
  }
  const ativosCod = new Set();
  for (const e of est) if (e[I.ativo] === 1) { const f = D.produtos[e[I.p]][3]; if (f >= 0) ativosCod.add(D.fornecedores[f][0]); }
  const forn = [];
  for (const codf of [...ccf.keys()].sort((a, b) => a - b)) {
    const a = ccf.get(codf), ic = a.comp != null && A.comp.has(a.comp) ? A.comp.get(a.comp) : -1;
    forn.push([codf, a.nome, ic, arred(a.deb, 2), arred(a.cre, 2), arred(a.deb - a.cre, 2), arred(a.trim / 3, 2), arred(a.neg / 3, 2), ativosCod.has(codf) ? 1 : 0]);
  }
  return {
    fornecedores: forn, cols_f: A.cc.cols_f, lancamentos: lanc, cols_l: A.cc.cols_l,
    usuarios,                       // a lista de "quem lançou" desta versão (a do dims.json é a da carga)
  };
}

/* ---- leitura e troca ---- */
function trocar(e, nome, obj) {
  const buf = json(obj), h = sha(buf);
  if (e.basesHash && e.basesHash[nome] === h) return false;
  e.arquivos[nome] = buf;
  e.cacheGz.delete(nome);
  e.basesHash = Object.assign({}, e.basesHash, { [nome]: h });
  return true;
}

async function montar(e, v) {
  const t0 = Date.now();
  const A = doArquivo(e), ref = hoje.diaSP(), memo = e.basesMemo || (e.basesMemo = {});
  const f = v.fluxos || {};
  const vivo = (n) => !!(f[n] && f[n].fresco);
  const modo = { estoque: vivo("trade.estoque_posicao") && vivo("trade.estoque_giro") ? "agente" : "arquivo",
                 entradas: vivo("trade.entrada_mes") ? "agente" : "arquivo", cc: vivo("trade.cc_lancamento") ? "agente" : "arquivo" };
  const ver = (n) => (f[n] && f[n].versao) || "";

  // fotos: a tabela vale sempre (a tarefa das fotos e a carga grande gravam nela)
  if (memo.fotosV !== v.fotos) {
    const fotos = await fonte.lerFotos();
    memo.fotos = new Set(fotos.map((x) => x.codprod));
    e.imagens = Object.fromEntries(fotos.map((x) => [String(x.codprod), x.arquivo]));     // o servidor local serve a foto pelo nome do arquivo
    memo.fotosV = v.fotos;
  }
  // estoque: a posição muda de minuto em minuto; o giro, de 5 em 5 min (só relê o que mudou)
  let est, fora = 0;
  if (modo.estoque === "agente") {
    if (memo.giroV !== ver("trade.estoque_giro")) {
      memo.giro = new Map((await fonte.lerGiro()).map((g) => [g.codprod, g]));
      memo.giroV = ver("trade.estoque_giro");
    }
    if (memo.posV !== ver("trade.estoque_posicao")) { memo.pos = await fonte.lerPosicao(); memo.posV = ver("trade.estoque_posicao"); }
    const r = montarEstoque(A, ref, memo.pos, memo.giro, memo.fotos);
    est = r.linhas; fora = r.fora;
  } else est = estoqueDoArquivo(A, memo.fotos);

  // conta corrente e entradas: só relê quando o agente gravou
  let cc = A.cc;
  if (modo.cc === "agente") {
    if (memo.ccV !== ver("trade.cc_lancamento")) { memo.cc = await fonte.lerCC(DATA_INICIAL_CC); memo.ccV = ver("trade.cc_lancamento"); }
    cc = montarCC(A, ref, memo.cc, est);
  }
  let ent = A.entradas;
  if (modo.entradas === "agente") {
    if (memo.entV !== ver("trade.entrada_mes")) { memo.ent = await fonte.lerEntradas(); memo.entV = ver("trade.entrada_mes"); }
    if (memo.ent.length) ent = montarEntradas(A, ref, memo.ent);
  }
  // histórico: o arquivo traz um dia por carga; o de hoje é refeito com o estoque de agora
  let hist = A.historico;
  if (modo.estoque === "agente") hist = A.historico.filter((h) => h.data !== ref).concat([{ data: ref, comprador: fotoDeHoje(A, est) }]).sort((a, b) => (a.data < b.data ? -1 : 1));

  const mudaram = [];
  if (trocar(e, "estoque.json", { cols: EST_COLS, linhas: est })) mudaram.push("estoque");
  if (trocar(e, "entradas.json", ent)) mudaram.push("entradas");
  if (trocar(e, "cc.json", cc)) mudaram.push("cc");
  if (trocar(e, "historico.json", hist)) mudaram.push("historico");
  const ativos = est.filter((x) => x[I.ativo]);
  e.bases = {
    dia: ref, modo, arquivos: Object.fromEntries(ARQUIVOS.map((n) => [n, e.basesHash[n]])),
    leitura: Object.fromEntries(Object.entries(f).map(([k, x]) => [k.replace("trade.", ""), x.versao])),
    contagens: { estoque: est.length, ruptura: est.filter((x) => x[I.rup]).length, sem_venda: est.filter((x) => x[I.sv]).length,
                 sem_imagem: ativos.filter((x) => !x[I.img]).length, cc_lancamentos: (cc.lancamentos || []).length, produtos_novos: fora },
    montado_em: new Date().toISOString(), ms: Date.now() - t0,
  };
  if (mudaram.length) console.log(`bases: ${mudaram.join(", ")} (${modo.estoque === "agente" ? "agente" : "arquivo da carga"}), ` +
    `${e.bases.contagens.ruptura} ruptura(s), ${e.bases.contagens.sem_venda} sem venda, ${e.bases.contagens.sem_imagem} ativo(s) sem imagem` +
    (fora ? `, ${fora} produto(s) novo(s) ficam para a carga` : "") + `, em ${e.bases.ms} ms`);
  return mudaram.length > 0;
}

/* pergunta as versões e, se algo mudou (ou o dia virou), refaz */
async function atualizar(e, forcar) {
  const v = await fonte.versaoBases();
  const chave = JSON.stringify([v, hoje.diaSP()]);
  if (!forcar && e.basesChave === chave) return false;
  const mudou = await montar(e, v);
  e.basesChave = chave;
  return mudou;
}

/* a versão (sha1) de um arquivo do pacote, para o cabeçalho X-Versao (o navegador guarda e compara) */
function versaoDe(e, nome) {
  if (e.basesHash && e.basesHash[nome]) return e.basesHash[nome];
  e.versaoArq = e.versaoArq || {};
  if (!e.versaoArq[nome] && e.arquivos[nome]) e.versaoArq[nome] = sha(e.arquivos[nome]);
  return e.versaoArq[nome] || "";
}

module.exports = { atualizar, versaoDe, ARQUIVOS, _teste: { arred, eNegociacao, mediaAparada, montarEstoque, montarCC, montarEntradas, fotoDeHoje, doArquivo } };
