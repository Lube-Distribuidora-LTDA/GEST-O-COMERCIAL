/* =============================================================================
 * hoje.js — a venda de hoje por cima do arquivo grande (AGENTE LUBE, 2026-10-27)
 *
 * O arquivo da venda (trade.pacote, venda.bin.gz) é refeito pela carga e só tem dias fechados (até ontem). O
 * AGENTE LUBE, na SRV-IA, grava de 30 em 30 s o que vem depois: trade.venda_dia (por dia, RCA x cliente x
 * produto) e trade.venda_hora (por hora e RCA, 8 dias). A cada gravação ele troca a versão em
 * agente.sistema('trade'), e é ela que este módulo pergunta.
 *
 * Quando a versão muda (ou o dia vira), monta as linhas dos dias depois do corte do arquivo no grão do motor
 * (mês x RCA x cliente x produto) e entrega ao Motor.aplicarHoje, que as põe por cima — com zero nas colunas
 * "até o dia de corte", então a comparação segue só com dias fechados (decisão do Júlio).
 *
 * Cliente, produto ou RCA que o arquivo ainda não tem (cliente novo de hoje) entra no FIM das listas, com o
 * cadastro dos core.dim_* que o agente mantém, em ordem de código: toda cópia do servidor (na Vercel há várias)
 * chega aos mesmos índices para a mesma versão. O navegador recebe esses extras em /api/versao (hoje.extras).
 * ========================================================================== */
"use strict";

const fonte = require("./fonte_dados.js");

const FUSO = "America/Sao_Paulo";
function diaSP() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: FUSO, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}
function horaSP() {
  return +new Intl.DateTimeFormat("en-GB", { timeZone: FUSO, hour: "2-digit", hourCycle: "h23" }).format(new Date());
}
function menosDias(dia, n) {
  const t = new Date(dia + "T12:00:00Z");
  t.setUTCDate(t.getUTCDate() - n);
  return t.toISOString().slice(0, 10);
}
function titulo(s) { return String(s || "").trim().toLowerCase().replace(/(^|\s)\S/g, (x) => x.toUpperCase()); }
const VAZIO = { clientes: [], produtos: [], rcas: [], equipes: [], meses: [] };

/* o tamanho das listas no arquivo (o que vier depois é extra de hoje) e os mapas código -> índice */
function base(e) {
  if (!e.dimsBase) {
    const D = e.motor.dims;
    e.dimsBase = {
      clientes: D.clientes.length, produtos: D.produtos.length, rcas: D.rcas.length, equipes: D.equipes.length, meses: D.meses.length,
      c: new Map(D.clientes.map((x, i) => [x[0], i])), p: new Map(D.produtos.map((x, i) => [x[0], i])),
      r: new Map(D.rcas.map((x, i) => [x[0], i])), m: new Map(D.meses.map((x, i) => [x, i])),
      eq: new Map(D.equipes.map((x, i) => [x[0], i])),
    };
  }
  return e.dimsBase;
}

async function montar(e, v) {
  const t0 = Date.now();
  const D = e.motor.dims, B = base(e);
  const hoje = diaSP(), semana = menosDias(hoje, 7), corte = D.corte.ate;
  const { dia, hora } = await fonte.lerHoje(corte, hoje, semana);

  // códigos novos, em ordem de código
  const nc = new Set(), np = new Set(), nr = new Set();
  for (const l of dia) { if (!B.c.has(l.codcli)) nc.add(l.codcli); if (!B.p.has(l.codprod)) np.add(l.codprod); if (!B.r.has(l.codusur)) nr.add(l.codusur); }
  for (const l of hora) if (!B.r.has(l.codusur)) nr.add(l.codusur);
  const ord = (s) => [...s].sort((a, b) => a - b);
  const cs = ord(nc), ps = ord(np), rs = ord(nr);
  const cad = cs.length || ps.length || rs.length ? await fonte.cadastros(cs, ps, rs) : { cli: [], prod: [], rca: [] };
  const cC = new Map(cad.cli.map((x) => [x.codcli, x])), cP = new Map(cad.prod.map((x) => [x.codprod, x])), cR = new Map(cad.rca.map((x) => [x.codusur, x]));

  const ex = { clientes: [], produtos: [], rcas: [], equipes: [], meses: [...new Set(dia.map((l) => l.dia.slice(0, 7)).filter((m) => !B.m.has(m)))].sort() };
  for (const cod of cs) {
    const x = cC.get(cod);
    ex.clientes.push([cod, (x && x.cliente || "").trim() || `Cliente ${cod}`, -1, x ? titulo(x.cidade) : "", x && x.uf ? String(x.uf).trim().toUpperCase() : ""]);
  }
  for (const cod of ps) {
    const x = cP.get(cod);
    ex.produtos.push([cod, (x && x.descricao || "").trim() || `Produto ${cod}`, "", -1, -1, -1, -1, -1, 0, 0, 0, 2]);
  }
  let semEquipe = B.eq.get(-1);
  for (const cod of rs) {
    const x = cR.get(cod);
    let eq = x && x.codsupervisor != null ? B.eq.get(x.codsupervisor) : undefined;
    if (eq == null) {
      if (semEquipe == null) { semEquipe = B.equipes + ex.equipes.length; ex.equipes.push([-1, "SEM EQUIPE", 0]); }
      eq = semEquipe;
    }
    ex.rcas.push([cod, (x && x.nome || "").trim() || `RCA ${cod}`, eq]);
  }

  // as listas do motor voltam ao tamanho do arquivo e recebem os extras DESTA versão
  const mudou = JSON.stringify(ex) !== JSON.stringify(e.hoje ? e.hoje.extras : VAZIO);
  for (const k of ["clientes", "produtos", "rcas", "equipes", "meses"]) { D[k].length = B[k]; D[k].push(...ex[k]); }
  const ic = (cod) => B.c.has(cod) ? B.c.get(cod) : B.clientes + cs.indexOf(cod);
  const ip = (cod) => B.p.has(cod) ? B.p.get(cod) : B.produtos + ps.indexOf(cod);
  const ir = (cod) => B.r.has(cod) ? B.r.get(cod) : B.rcas + rs.indexOf(cod);
  const im = (m) => B.m.has(m) ? B.m.get(m) : B.meses + ex.meses.indexOf(m);

  const k = dia.length;
  const h = { m: new Uint8Array(k), c: new Uint32Array(k), p: new Uint16Array(k), r: new Uint16Array(k), v: new Int32Array(k), d: new Int32Array(k),
              qv: new Float32Array(k), qd: new Float32Array(k), w: new Float32Array(k), diaHoje: new Uint8Array(k) };
  const meses = new Set();
  let ate = null, venda = 0;
  for (let j = 0; j < k; j++) {
    const l = dia[j], m = im(l.dia.slice(0, 7));
    h.m[j] = m; h.c[j] = ic(l.codcli); h.p[j] = ip(l.codprod); h.r[j] = ir(l.codusur);
    h.v[j] = Math.round((l.v || 0) * 100); h.d[j] = Math.round((l.d || 0) * 100);
    h.qv[j] = l.qv || 0; h.qd[j] = l.qd || 0; h.w[j] = l.w || 0; h.diaHoje[j] = l.dia === hoje ? 1 : 0;
    meses.add(m);
    if (!ate || l.dia > ate) ate = l.dia;
    venda += h.v[j] - h.d[j];
  }
  const hh = { dia: new Uint8Array(hora.length), hora: new Uint8Array(hora.length), r: new Uint16Array(hora.length), v: new Int32Array(hora.length) };
  hora.forEach((l, j) => { hh.dia[j] = l.dia === hoje ? 0 : 7; hh.hora[j] = Math.max(0, Math.min(23, l.hora | 0)); hh.r[j] = ir(l.codusur); hh.v[j] = Math.round((l.v || 0) * 100); });

  e.motor.aplicarHoje(h, mudou, hh, { hoje, semana, horaAgora: horaSP() });
  e.hoje = {
    versao: v.versao, mudou_em: v.mudou_em, dia: hoje, semana, corte, ate, linhas: k, venda: venda / 100,
    meses: [...meses].sort((a, b) => a - b), extras: ex, montado_em: new Date().toISOString(), ms: Date.now() - t0,
  };
  e.cacheResp.clear();
  console.log(`hoje: versão ${v.versao}, ${k} linhas depois do corte (${corte}), R$ ${(venda / 100).toFixed(2)}` +
              (cs.length + ps.length + rs.length ? `, ${cs.length} cliente(s) / ${ps.length} produto(s) / ${rs.length} RCA(s) novos` : "") +
              `, em ${Date.now() - t0} ms`);
}

/* pergunta a versão e, se mudou (ou o dia virou), monta de novo */
async function atualizar(e, forcar) {
  const v = await fonte.versaoHoje();
  if (!v || !v.versao) return false;
  if (!forcar && e.hoje && e.hoje.versao === v.versao && e.hoje.dia === diaSP()) return false;
  await montar(e, v);
  return true;
}

module.exports = { atualizar, diaSP, horaSP };
