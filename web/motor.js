/* =============================================================================
 * motor.js — motor de consulta da Gestão Comercial (Node, em memória)
 *
 * O fato de venda é mensal, por RCA x cliente x produto (~3 milhões de linhas).
 * Positivação, ticket e mix são contagens DISTINTAS: não dá para somar pedaços.
 * Por isso o cálculo é feito aqui, linha a linha, com os filtros aplicados:
 *   1. os filtros viram máscaras (mês, produto, cliente, RCA) e uma lista das
 *      linhas que passam;
 *   2. cada pedido (resumo, agrupar, abc) percorre só essas linhas;
 *   3. distintos por grupo: ordenação por contagem + carimbo (O(n), exato).
 * Responde em dezenas de milissegundos; o navegador nunca recebe as linhas.
 *
 * Regras de medida (ver README):
 *   bruta        = Σ venda (operação S, qt x (punit + vloutros))
 *   dev          = Σ devolução (operação ED, mesmo valor)
 *   venda        = bruta − dev                      ("venda líquida")
 *   positivação  = clientes distintos com venda bruta > 0 no recorte
 *   mix          = pares cliente x produto distintos com venda > 0 ÷ positivação
 *   ticket       = venda líquida ÷ positivação
 * ========================================================================== */
"use strict";

const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

function norm(s) {
  return String(s == null ? "" : s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

const TIPOS = { u1: Uint8Array, u2: Uint16Array, u4: Uint32Array, i4: Int32Array, f4: Float32Array };

class Motor {
  constructor(dims, vendaGz) {
    const t0 = Date.now();
    this.dims = dims;
    const buf = zlib.gunzipSync(vendaGz);
    // cópia para um ArrayBuffer alinhado (as visões tipadas exigem offset múltiplo do elemento)
    const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length);
    const tamCab = new DataView(ab).getUint32(0, true);
    const cab = JSON.parse(Buffer.from(ab, 4, tamCab).toString("utf8"));
    let base = 4 + tamCab;
    base += (8 - (base % 8)) % 8;
    this.n = cab.n;
    this.col = {};
    for (const c of cab.cols) this.col[c.nome] = new TIPOS[c.tipo](ab, base + c.off, cab.n);
    this.preparar();
    this.cacheFiltro = new Map();
    this.msCarga = Date.now() - t0;
  }

  static deDiretorio(dir) {
    const dims = JSON.parse(fs.readFileSync(path.join(dir, "dims.json"), "utf8"));
    const venda = fs.readFileSync(path.join(dir, "venda.bin.gz"));
    return new Motor(dims, venda);
  }

  /* ---------------- tabelas derivadas ---------------- */
  preparar() {
    const D = this.dims;
    const nP = D.produtos.length, nC = D.clientes.length, nR = D.rcas.length, nM = D.meses.length;
    this.nP = nP; this.nC = nC; this.nR = nR; this.nM = nM;

    // mês -> ano (valor) / mês do ano
    this.anos = [...new Set(D.meses.map(m => +m.slice(0, 4)))].sort((a, b) => a - b);
    this.mAno = new Int32Array(nM);
    this.mMes = new Int32Array(nM);
    D.meses.forEach((m, i) => { this.mAno[i] = this.anos.indexOf(+m.slice(0, 4)); this.mMes[i] = +m.slice(5, 7) - 1; });

    // produto
    this.pForn = new Int32Array(nP); this.pComp = new Int32Array(nP); this.pDep = new Int32Array(nP);
    this.pCat = new Int32Array(nP); this.pSub = new Int32Array(nP); this.pMar = new Int32Array(nP);
    this.pPromo = new Uint8Array(nP); this.pSta = new Uint8Array(nP); this.pOrig = new Uint8Array(nP);
    D.produtos.forEach((p, i) => {
      const f = p[3];
      this.pForn[i] = f; this.pComp[i] = f >= 0 ? D.fornecedores[f][2] : -1;
      this.pDep[i] = p[4]; this.pCat[i] = p[5]; this.pSub[i] = p[6]; this.pMar[i] = p[7];
      this.pPromo[i] = p[8]; this.pSta[i] = p[9]; this.pOrig[i] = p[11] || 0;
    });

    // cliente
    const mun = new Map();
    this.municipios = [];
    this.cRamo = new Int32Array(nC); this.cMun = new Int32Array(nC);
    D.clientes.forEach((c, i) => {
      this.cRamo[i] = c[2];
      const chave = c[3] + "|" + c[4];
      if (!mun.has(chave)) { mun.set(chave, this.municipios.length); this.municipios.push([c[3] || "Sem município", c[4] || ""]); }
      this.cMun[i] = mun.get(chave);
    });

    // RCA
    this.rEq = new Int32Array(nR); this.rUf = new Int32Array(nR);
    D.rcas.forEach((r, i) => { this.rEq[i] = r[2]; this.rUf[i] = D.equipes[r[2]][2]; });

    // pares cliente x produto
    const { c, p } = this.col, n = this.n;
    const chaves = new Uint32Array(n);
    for (let i = 0; i < n; i++) chaves[i] = c[i] * 65536 + p[i];
    const ord = chaves.slice().sort();
    let u = 0;
    for (let i = 0; i < n; i++) if (i === 0 || ord[i] !== ord[i - 1]) ord[u++] = ord[i];
    const unicas = ord.subarray(0, u);
    this.nPares = u;
    this.pair = new Uint32Array(n);
    for (let i = 0; i < n; i++) {
      let lo = 0, hi = u - 1; const k = chaves[i];
      while (lo < hi) { const mid = (lo + hi) >>> 1; if (unicas[mid] < k) lo = mid + 1; else hi = mid; }
      this.pair[i] = lo;
    }

    // primeiro mês com venda de cada cliente (0 = já comprava quando o histórico começa: não dá para saber)
    this.cFirst = new Int16Array(nC).fill(32767);
    for (let i = 0; i < n; i++) { if (this.col.v[i] > 0) { const ci = c[i], mi = this.col.m[i]; if (mi < this.cFirst[ci]) this.cFirst[ci] = mi; } }

    // dimensões de agrupamento: fonte (coluna da linha) + tabela fonte->chave (−1 vai para o último balde)
    const idt = (len) => { const a = new Int32Array(len); for (let i = 0; i < len; i++) a[i] = i; return a; };
    const nz = (arr, fn) => arr;
    this.DIM = {
      ym:           { fonte: "m", tab: idt(nM), n: nM, rotulo: (k) => D.meses[k] },
      ano:          { fonte: "m", tab: this.mAno, n: this.anos.length, rotulo: (k) => this.anos[k] },
      mes:          { fonte: "m", tab: this.mMes, n: 12, rotulo: (k) => k + 1 },
      uf:           { fonte: "r", tab: this.rUf, n: D.uf.length, rotulo: (k) => D.uf[k] },
      equipe:       { fonte: "r", tab: this.rEq, n: D.equipes.length, rotulo: (k) => D.equipes[k][1] },
      rca:          { fonte: "r", tab: idt(nR), n: nR, rotulo: (k) => D.rcas[k][1] },
      cliente:      { fonte: "c", tab: idt(nC), n: nC, rotulo: (k) => D.clientes[k][1] },
      ramo:         { fonte: "c", tab: this.cRamo, n: D.ramos.length, rotulo: (k) => D.ramos[k] },
      municipio:    { fonte: "c", tab: this.cMun, n: this.municipios.length, rotulo: (k) => this.municipios[k][0] },
      produto:      { fonte: "p", tab: idt(nP), n: nP, rotulo: (k) => D.produtos[k][1] },
      fornecedor:   { fonte: "p", tab: this.pForn, n: D.fornecedores.length, rotulo: (k) => D.fornecedores[k][1] },
      comprador:    { fonte: "p", tab: this.pComp, n: D.compradores.length, rotulo: (k) => D.compradores[k][1] },
      depto:        { fonte: "p", tab: this.pDep, n: D.deptos.length, rotulo: (k) => D.deptos[k] },
      categoria:    { fonte: "p", tab: this.pCat, n: D.categorias.length, rotulo: (k) => D.categorias[k][0] },
      subcategoria: { fonte: "p", tab: this.pSub, n: D.subcategorias.length, rotulo: (k) => D.subcategorias[k][0] },
      marca:        { fonte: "p", tab: this.pMar, n: D.marcas.length, rotulo: (k) => D.marcas[k] },
      origem:       { fonte: "p", tab: this.pOrig, n: 3, rotulo: (k) => ["Planilha do Trade", "Herdada do WinThor", "Sem classificação"][k] },
    };
    // texto pesquisável por dimensão (só as que o painel lista)
    this.textos = {
      produto: D.produtos.map(p => norm(p[0] + " " + p[1] + " " + p[2])),
      cliente: D.clientes.map(c => norm(c[0] + " " + c[1] + " " + c[3])),
      rca: D.rcas.map(r => norm(r[0] + " " + r[1])),
      fornecedor: D.fornecedores.map(f => norm(f[0] + " " + f[1])),
    };
  }

  /* ---------------- filtros ---------------- */
  resolver(f) {
    f = f || {};
    const chave = JSON.stringify(f);
    const hit = this.cacheFiltro.get(chave);
    if (hit) { this.cacheFiltro.delete(chave); this.cacheFiltro.set(chave, hit); return hit; }

    const D = this.dims;
    const conj = (a) => (Array.isArray(a) && a.length ? new Set(a) : null);
    const mOK = new Uint8Array(this.nM).fill(1);
    const sAno = conj(f.ano), sMes = conj(f.mes), sMis = conj(f.mis);
    let de = -1, ate = this.nM;
    if (f.de) de = D.meses.indexOf(f.de);
    if (f.ate) ate = D.meses.indexOf(f.ate);
    for (let i = 0; i < this.nM; i++) {
      if (sMis) { if (!sMis.has(i)) mOK[i] = 0; }
      else if (sAno && !sAno.has(this.anos[this.mAno[i]])) mOK[i] = 0;
      else if (sMes && !sMes.has(this.mMes[i] + 1)) mOK[i] = 0;
      else if (i < de || i > ate) mOK[i] = 0;
    }
    const pOK = new Uint8Array(this.nP).fill(1);
    const sPro = conj(f.produto), sFor = conj(f.fornecedor), sCom = conj(f.comprador), sDep = conj(f.depto),
      sCat = conj(f.categoria), sSub = conj(f.subcategoria), sMar = conj(f.marca), sSta = conj(f.status), sPro2 = conj(f.promo), sOri = conj(f.origem);
    if (sPro || sFor || sCom || sDep || sCat || sSub || sMar || sSta || sPro2 || sOri) {
      for (let i = 0; i < this.nP; i++) {
        if ((sPro && !sPro.has(i)) || (sFor && !sFor.has(this.pForn[i])) || (sCom && !sCom.has(this.pComp[i])) ||
            (sDep && !sDep.has(this.pDep[i])) || (sCat && !sCat.has(this.pCat[i])) || (sSub && !sSub.has(this.pSub[i])) ||
            (sMar && !sMar.has(this.pMar[i])) || (sSta && !sSta.has(this.pSta[i])) || (sPro2 && !sPro2.has(this.pPromo[i])) || (sOri && !sOri.has(this.pOrig[i]))) pOK[i] = 0;
      }
    }
    const cOK = new Uint8Array(this.nC).fill(1);
    const sCli = conj(f.cliente), sRam = conj(f.ramo), sMun = conj(f.municipio);
    if (sCli || sRam || sMun) {
      for (let i = 0; i < this.nC; i++) {
        if ((sCli && !sCli.has(i)) || (sRam && !sRam.has(this.cRamo[i])) || (sMun && !sMun.has(this.cMun[i]))) cOK[i] = 0;
      }
    }
    const rOK = new Uint8Array(this.nR).fill(1);
    const sRca = conj(f.rca), sEqu = conj(f.equipe), sUf = conj(f.uf);
    if (sRca || sEqu || sUf) {
      for (let i = 0; i < this.nR; i++) {
        if ((sRca && !sRca.has(i)) || (sEqu && !sEqu.has(this.rEq[i])) || (sUf && !sUf.has(this.rUf[i]))) rOK[i] = 0;
      }
    }
    const { m, p, c, r } = this.col, n = this.n;
    let cont = 0;
    const tmp = new Int32Array(n);
    for (let i = 0; i < n; i++) if (mOK[m[i]] & pOK[p[i]] & cOK[c[i]] & rOK[r[i]]) tmp[cont++] = i;
    const res = { idx: tmp.slice(0, cont), mOK: mOK };
    this.cacheFiltro.set(chave, res);
    if (this.cacheFiltro.size > 6) this.cacheFiltro.delete(this.cacheFiltro.keys().next().value);
    return res;
  }

  /* ---------------- pedidos ---------------- */
  consultar(corpo) {
    const t0 = Date.now();
    const base = corpo.filtros || {};
    const out = {};
    for (const ped of corpo.pedidos || []) {
      try {
        const f = ped.filtros ? Object.assign({}, base, ped.filtros) : base;
        // chave null remove o filtro herdado
        for (const k of Object.keys(f)) if (f[k] === null) delete f[k];
        const { idx } = this.resolver(f);
        const ef = this.efetivos(ped.corte);
        if (ped.tipo === "resumo") out[ped.id] = this.resumo(idx, ef);
        else if (ped.tipo === "agrupar") out[ped.id] = this.agrupar(idx, ped, ef);
        else if (ped.tipo === "abc") out[ped.id] = this.abc(idx, ped);
        else if (ped.tipo === "carteira") {
          const fb = Object.assign({}, f, ped.base || {});
          for (const k of Object.keys(fb)) if (fb[k] === null) delete fb[k];
          out[ped.id] = this.carteira(this.resolver(f), this.resolver(fb), ef, this.efetivos(ped.corteBase), ped);
        }
        else out[ped.id] = { erro: "tipo de pedido desconhecido: " + ped.tipo };
      } catch (e) {
        out[ped.id] = { erro: String(e && e.message || e) };
      }
    }
    return { ref: this.dims.ref, ms: Date.now() - t0, resultados: out };
  }

  /* colunas "efetivas": para os meses listados em `corte`, vale a venda só até o dia de corte */
  efetivos(lista) {
    const col = this.col;
    if (!lista || !lista.length) return { V: col.v, Dv: col.d, QV: col.qv, QD: col.qd };
    const chave = [...new Set(lista)].sort((a, b) => a - b).join(",");
    this._ef = this._ef || new Map();
    if (this._ef.has(chave)) return this._ef.get(chave);
    const mask = new Uint8Array(this.nM);
    lista.forEach(m => { if (m >= 0 && m < this.nM) mask[m] = 1; });
    const V = col.v.slice(), Dv = col.d.slice(), QV = col.qv.slice(), QD = col.qd.slice(), m = col.m, n = this.n;
    for (let i = 0; i < n; i++) if (mask[m[i]]) { V[i] = col.vc[i]; Dv[i] = col.dc[i]; QV[i] = col.qvc[i]; QD[i] = col.qdc[i]; }
    const r = { V, Dv, QV, QD };
    this._ef.set(chave, r);
    if (this._ef.size > 3) this._ef.delete(this._ef.keys().next().value);
    return r;
  }

  resumo(idx, ef) {
    const col = this.col, pr = this.pair;
    const V = ef.V, Dv = ef.Dv, QV = ef.QV, QD = ef.QD;
    let bruta = 0, dev = 0, q1 = 0, q2 = 0, peso = 0;
    const sc = new Uint8Array(this.nC), sp = new Uint8Array(this.nP), spar = new Uint8Array(this.nPares), scd = new Uint8Array(this.nC);
    let pos = 0, skus = 0, pares = 0, posDev = 0;
    for (let k = 0; k < idx.length; k++) {
      const i = idx[k];
      const vi = V[i], di = Dv[i];
      bruta += vi; dev += di; q1 += QV[i]; q2 += QD[i]; peso += col.w[i];
      if (vi > 0) {
        const ci = col.c[i], pi = col.p[i];
        if (!sc[ci]) { sc[ci] = 1; pos++; }
        if (!sp[pi]) { sp[pi] = 1; skus++; }
        const q = pr[i];
        if (!spar[q]) { spar[q] = 1; pares++; }
      }
      if (di > 0) { const ci = col.c[i]; if (!scd[ci]) { scd[ci] = 1; posDev++; } }
    }
    return { bruta: bruta / 100, dev: dev / 100, venda: (bruta - dev) / 100, qtd: q1 - q2, qtd_dev: q2, peso, pos, skus, pares, pos_dev: posDev, linhas: idx.length };
  }

  /* agrupar: por uma ou duas dimensões; medidas somáveis sempre, distintas sob pedido (dist) */
  /* agrupar com distintos por BITSET: uma passada, sem ordenar. Cada grupo guarda um mapa de bits de clientes (ou
     produtos, ou pares). Se o mapa não couber (muitos grupos x muitos pares), cai no método por ordenação. */
  agrupar(idx, req, ef) {
    ef = ef || this.efetivos(null);
    const por = Array.isArray(req.por) ? req.por : [req.por];
    const dd = por.map(nome => { const x = this.DIM[nome]; if (!x) throw new Error("dimensão desconhecida: " + nome); return x; });
    const G1 = dd[0].n + 1, G2 = dd[1] ? dd[1].n + 1 : 1, nG = G1 * G2;
    const dist = new Set(req.dist || []);
    const wC = (this.nC + 31) >>> 5, wP = (this.nP + 31) >>> 5, wQ = (this.nPares + 31) >>> 5;
    const temCli = por.indexOf("cliente") >= 0, temProd = por.indexOf("produto") >= 0;
    const usaPos = dist.has("pos") && !temCli, usaDev = dist.has("pos_dev") && !temCli;
    const usaSkus = (dist.has("skus") && !temProd) || (dist.has("pares") && temCli);
    const usaPosP = dist.has("pares") && temProd && !usaPos;            // pares de um produto = clientes distintos dele
    const usaPares = dist.has("pares") && !temCli && !temProd;
    const LIM = 24e6;
    if ((usaPos || usaPosP || usaDev) && nG * wC > LIM || usaSkus && nG * wP > LIM || usaPares && nG * wQ > LIM) return this.agruparOrdenado(idx, req, ef);

    const col = this.col, V = ef.V, Dv = ef.Dv, QV = ef.QV, QD = ef.QD;
    const f1 = col[dd[0].fonte], t1 = dd[0].tab, f2 = dd[1] ? col[dd[1].fonte] : null, t2 = dd[1] ? dd[1].tab : null;
    const bruta = new Float64Array(nG), dev = new Float64Array(nG), qv = new Float64Array(nG), qd = new Float64Array(nG), peso = new Float64Array(nG), linhas = new Int32Array(nG);
    const bC = usaPos || usaPosP ? new Uint32Array(nG * wC) : null, bD = usaDev ? new Uint32Array(nG * wC) : null;
    const bP = usaSkus ? new Uint32Array(nG * wP) : null, bQ = usaPares ? new Uint32Array(nG * wQ) : null;
    const flagPos = temCli && dist.has("pos") ? new Uint8Array(nG) : null, flagDev = temCli && dist.has("pos_dev") ? new Uint8Array(nG) : null, flagSku = temProd && dist.has("skus") ? new Uint8Array(nG) : null;
    const cc = col.c, pp = col.p, pr = this.pair, n = idx.length;
    for (let k = 0; k < n; k++) {
      const i = idx[k];
      let a = t1[f1[i]]; if (a < 0) a = G1 - 1;
      let g = a;
      if (f2) { let b = t2[f2[i]]; if (b < 0) b = G2 - 1; g = a * G2 + b; }
      const vi = V[i], di = Dv[i];
      bruta[g] += vi; dev[g] += di; qv[g] += QV[i]; qd[g] += QD[i]; peso[g] += col.w[i]; linhas[g]++;
      if (vi > 0) {
        if (bC) { const c = cc[i]; bC[g * wC + (c >>> 5)] |= 1 << (c & 31); }
        if (bP) { const q = pp[i]; bP[g * wP + (q >>> 5)] |= 1 << (q & 31); }
        if (bQ) { const q = pr[i]; bQ[g * wQ + (q >>> 5)] |= 1 << (q & 31); }
        if (flagPos) flagPos[g] = 1;
        if (flagSku) flagSku[g] = 1;
      }
      if (di > 0) {
        if (bD) { const c = cc[i]; bD[g * wC + (c >>> 5)] |= 1 << (c & 31); }
        if (flagDev) flagDev[g] = 1;
      }
    }
    const contar = (bits, w, g) => { let t = 0; for (let j = g * w, e = j + w; j < e; j++) { let v = bits[j]; if (v) { v = v - ((v >>> 1) & 0x55555555); v = (v & 0x33333333) + ((v >>> 2) & 0x33333333); t += (((v + (v >>> 4)) & 0x0F0F0F0F) * 0x01010101) >>> 24; } } return t; };
    let itens = [];
    for (let g = 0; g < nG; g++) {
      if (!linhas[g]) continue;
      const k1 = Math.floor(g / G2), k2 = g % G2;
      const l = { k: dd[1] ? [k1 === G1 - 1 ? -1 : k1, k2 === G2 - 1 ? -1 : k2] : (k1 === G1 - 1 ? -1 : k1), bruta: bruta[g] / 100, dev: dev[g] / 100, venda: (bruta[g] - dev[g]) / 100, qtd: qv[g] - qd[g], peso: peso[g], n: linhas[g] };
      if (dist.has("pos")) l.pos = flagPos ? flagPos[g] : contar(bC, wC, g);
      if (dist.has("skus")) l.skus = flagSku ? flagSku[g] : contar(bP, wP, g);
      if (dist.has("pos_dev")) l.pos_dev = flagDev ? flagDev[g] : contar(bD, wC, g);
      if (dist.has("pares")) l.pares = usaPares ? contar(bQ, wQ, g) : temCli ? contar(bP, wP, g) : contar(bC, wC, g);
      itens.push(l);
    }
    return this.finalizarAgrupar(itens, req, por, dd);
  }

  finalizarAgrupar(itens, req, por, dd) {
    if (req.busca && !dd[1]) {
      const termos = norm(req.busca).split(/\s+/).filter(Boolean), tx = this.textos[por[0]];
      if (tx) itens = itens.filter(l => l.k >= 0 && termos.every(t => tx[l.k].includes(t)));
    }
    if (req.minimo != null) itens = itens.filter(l => l.venda >= req.minimo);
    const ordenar = req.ordenar || (["ym", "ano", "mes"].includes(por[0]) ? "k" : "venda");
    const desc = req.desc != null ? !!req.desc : ordenar !== "k";
    const chave = ordenar === "k" ? (l) => (Array.isArray(l.k) ? l.k[0] * 100000 + l.k[1] : l.k) : (l) => l[ordenar] == null ? 0 : l[ordenar];
    itens.sort((a, b) => (desc ? chave(b) - chave(a) : chave(a) - chave(b)));
    const total = itens.length, off = req.offset || 0;
    if (req.limite) itens = itens.slice(off, off + req.limite);
    return { total_grupos: total, linhas: itens };
  }

  agruparOrdenado(idx, req, ef) {
    ef = ef || this.efetivos(null);
    const por = Array.isArray(req.por) ? req.por : [req.por];
    const dd = por.map(nome => { const x = this.DIM[nome]; if (!x) throw new Error("dimensão desconhecida: " + nome); return x; });
    const G1 = dd[0].n + 1, G2 = dd[1] ? dd[1].n + 1 : 1;     // +1: balde do "sem valor" (−1)
    const nG = G1 * G2;
    const col = this.col;
    const V = ef.V, Dv = ef.Dv, QV = ef.QV, QD = ef.QD;
    const f1 = col[dd[0].fonte], t1 = dd[0].tab;
    const f2 = dd[1] ? col[dd[1].fonte] : null, t2 = dd[1] ? dd[1].tab : null;
    const bruta = new Float64Array(nG), dev = new Float64Array(nG), qv = new Float64Array(nG), qd = new Float64Array(nG),
      peso = new Float64Array(nG), linhas = new Int32Array(nG);
    const n = idx.length;
    const dist = new Set(req.dist || []);
    const querDist = dist.size > 0;
    const gid = querDist ? new Int32Array(n) : null;
    for (let k = 0; k < n; k++) {
      const i = idx[k];
      let a = t1[f1[i]]; if (a < 0) a = G1 - 1;
      let g = a;
      if (f2) { let b = t2[f2[i]]; if (b < 0) b = G2 - 1; g = a * G2 + b; }
      bruta[g] += V[i]; dev[g] += Dv[i]; qv[g] += QV[i]; qd[g] += QD[i]; peso[g] += col.w[i]; linhas[g]++;
      if (gid) gid[k] = g;
    }
    let pos = null, skus = null, pares = null, posDev = null;
    if (querDist) {
      // ordena os índices por grupo (counting sort) para carimbar distintos
      const cont = new Int32Array(nG + 1);
      for (let k = 0; k < n; k++) cont[gid[k] + 1]++;
      for (let g = 0; g < nG; g++) cont[g + 1] += cont[g];
      const pos0 = cont.slice(0, nG);
      const ordem = new Int32Array(n);
      for (let k = 0; k < n; k++) ordem[pos0[gid[k]]++] = idx[k];
      const stC = new Int32Array(this.nC), stP = new Int32Array(this.nP), stQ = new Int32Array(this.nPares), stD = new Int32Array(this.nC);
      if (dist.has("pos")) pos = new Int32Array(nG);
      if (dist.has("skus")) skus = new Int32Array(nG);
      if (dist.has("pares")) pares = new Int32Array(nG);
      if (dist.has("pos_dev")) posDev = new Int32Array(nG);
      for (let g = 0; g < nG; g++) {
        const ini = cont[g], fim = cont[g + 1];
        if (ini === fim) continue;
        const marca = g + 1;
        for (let k = ini; k < fim; k++) {
          const i = ordem[k];
          if (V[i] > 0) {
            const ci = col.c[i], pi = col.p[i], q = this.pair[i];
            if (pos && stC[ci] !== marca) { stC[ci] = marca; pos[g]++; }
            if (skus && stP[pi] !== marca) { stP[pi] = marca; skus[g]++; }
            if (pares && stQ[q] !== marca) { stQ[q] = marca; pares[g]++; }
          }
          if (posDev && Dv[i] > 0) { const ci = col.c[i]; if (stD[ci] !== marca) { stD[ci] = marca; posDev[g]++; } }
        }
      }
    }

    // monta as linhas
    let itens = [];
    for (let g = 0; g < nG; g++) {
      if (!linhas[g]) continue;
      const k1 = Math.floor(g / G2), k2 = g % G2;
      const linha = {
        k: dd[1] ? [k1 === G1 - 1 ? -1 : k1, k2 === G2 - 1 ? -1 : k2] : (k1 === G1 - 1 ? -1 : k1),
        bruta: bruta[g] / 100, dev: dev[g] / 100, venda: (bruta[g] - dev[g]) / 100,
        qtd: qv[g] - qd[g], peso: peso[g], n: linhas[g],
      };
      if (pos) linha.pos = pos[g];
      if (skus) linha.skus = skus[g];
      if (pares) linha.pares = pares[g];
      if (posDev) linha.pos_dev = posDev[g];
      itens.push(linha);
    }
    // busca textual no rótulo (só 1 dimensão)
    if (req.busca && !dd[1]) {
      const termos = norm(req.busca).split(/\s+/).filter(Boolean);
      const tx = this.textos[por[0]];
      if (tx) itens = itens.filter(l => l.k >= 0 && termos.every(t => tx[l.k].includes(t)));
    }
    // classe ABC / filtros de valor
    if (req.minimo != null) itens = itens.filter(l => l.venda >= req.minimo);
    const ordenar = req.ordenar || (["ym", "ano", "mes"].includes(por[0]) ? "k" : "venda");
    const desc = req.desc != null ? !!req.desc : ordenar !== "k";
    const chave = ordenar === "k" ? (l) => (Array.isArray(l.k) ? l.k[0] * 100000 + l.k[1] : l.k) : (l) => l[ordenar] == null ? 0 : l[ordenar];
    itens.sort((a, b) => (desc ? chave(b) - chave(a) : chave(a) - chave(b)));
    const total = itens.length;
    const off = req.offset || 0;
    if (req.limite) itens = itens.slice(off, off + req.limite);
    // totais do conjunto filtrado (para %)
    return { total_grupos: total, linhas: itens };
  }

  /* carteira de clientes: período atual contra uma base. Retidos (compraram nos dois), novos (primeira compra na vida
     está no período atual), reativados (já tinham comprado antes, mas não na base) e perdidos (compraram na base e não agora).
     Também devolve a "ponte" da venda e as listas dos maiores de cada grupo. */
  carteira(A, B, efA, efB, req) {
    const col = this.col, nC = this.nC, cc = col.c;
    const vA = new Float64Array(nC), vB = new Float64Array(nC), pA = new Uint8Array(nC), pB = new Uint8Array(nC);
    const iA = A.idx, iB = B.idx;
    for (let k = 0; k < iA.length; k++) { const i = iA[k], c = cc[i]; vA[c] += efA.V[i] - efA.Dv[i]; if (efA.V[i] > 0) pA[c] = 1; }
    for (let k = 0; k < iB.length; k++) { const i = iB[k], c = cc[i]; vB[c] += efB.V[i] - efB.Dv[i]; if (efB.V[i] > 0) pB[c] = 1; }
    const seg = { retidos: [], novos: [], reativados: [], perdidos: [] };
    const sum = { retidos: { n: 0, a: 0, b: 0 }, novos: { n: 0, a: 0, b: 0 }, reativados: { n: 0, a: 0, b: 0 }, perdidos: { n: 0, a: 0, b: 0 } };
    for (let c = 0; c < nC; c++) {
      let nome = null;
      if (pA[c] && pB[c]) nome = "retidos";
      else if (pA[c]) nome = (this.cFirst[c] > 0 && this.cFirst[c] < 32767 && A.mOK[this.cFirst[c]]) ? "novos" : "reativados";
      else if (pB[c]) nome = "perdidos";
      else continue;
      const a = vA[c] / 100, b = vB[c] / 100;
      sum[nome].n++; sum[nome].a += a; sum[nome].b += b;
      seg[nome].push({ k: c, a: a, b: b });
    }
    const lim = req.limite || 300, ord = (f) => (x, y) => f(y) - f(x);
    seg.perdidos.sort(ord(x => x.b)); seg.novos.sort(ord(x => x.a)); seg.reativados.sort(ord(x => x.a));
    const retidos = seg.retidos;
    const emQueda = retidos.slice().sort((x, y) => (x.a - x.b) - (y.a - y.b)).slice(0, lim);
    const emAlta = retidos.slice().sort((x, y) => (y.a - y.b) - (x.a - x.b)).slice(0, lim);
    return {
      resumo: sum,
      base: { n: sum.retidos.n + sum.perdidos.n, venda: sum.retidos.b + sum.perdidos.b },
      atual: { n: sum.retidos.n + sum.novos.n + sum.reativados.n, venda: sum.retidos.a + sum.novos.a + sum.reativados.a },
      listas: { perdidos: seg.perdidos.slice(0, lim), novos: seg.novos.slice(0, lim), reativados: seg.reativados.slice(0, lim), emQueda, emAlta },
    };
  }

  /* curva ABC por produto ou cliente (regra do original: PARETO inclusivo; A < 80%, B < 95%) */
  abc(idx, req) {
    const por = req.por || "produto";
    const g = this.agrupar(idx, { por, ordenar: "venda", desc: true, dist: [] });
    const cortes = req.cortes || [80, 95];
    const linhas = g.linhas.filter(l => l.venda > 0);
    const total = linhas.reduce((s, l) => s + l.venda, 0);
    let acum = 0;
    const cls = [0, 0, 0], clsV = [0, 0, 0];
    const comClasse = linhas.map((l, pos) => {
      acum += l.venda;
      const pareto = total ? (acum / total) * 100 : 100;
      const c = pareto < cortes[0] ? 0 : pareto < cortes[1] ? 1 : 2;
      cls[c]++; clsV[c] += l.venda;
      return { k: l.k, venda: l.venda, pareto, classe: c, rank: pos + 1, bruta: l.bruta, dev: l.dev, qtd: l.qtd };
    });
    // curva (pontos de 1% dos itens) para o desenho do Pareto
    const nI = comClasse.length, curva = [];
    const passo = Math.max(1, Math.floor(nI / 100));
    for (let i = 0; i < nI; i += passo) curva.push([+(((i + 1) / nI) * 100).toFixed(2), +comClasse[i].pareto.toFixed(2)]);
    if (nI) curva.push([100, 100]);
    let lista = comClasse;
    if (req.classe != null) lista = lista.filter(l => l.classe === req.classe);
    if (req.busca) {
      const termos = norm(req.busca).split(/\s+/).filter(Boolean), tx = this.textos[por];
      if (tx) lista = lista.filter(l => termos.every(t => tx[l.k].includes(t)));
    }
    const totalLista = lista.length;
    const off = req.offset || 0;
    if (req.limite) lista = lista.slice(off, off + req.limite);
    return {
      total, itens: nI, cortes,
      classes: [0, 1, 2].map(c => ({ classe: "ABC"[c], itens: cls[c], venda: clsV[c] })),
      curva, total_lista: totalLista, linhas: lista,
    };
  }
}

module.exports = { Motor, norm };
