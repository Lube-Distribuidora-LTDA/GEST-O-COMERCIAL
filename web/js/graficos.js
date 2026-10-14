/* =============================================================================
 * graficos.js — gráficos SVG próprios da Gestão Comercial.
 *
 * Por que não uma biblioteca: o painel exige rótulo de dado em TODO gráfico, no
 * padrão brasileiro, sem um número em cima do outro. Aqui cada rótulo é medido:
 *   · cabe na horizontal → fica na horizontal; não cabe → gira (−90°);
 *   · segmento baixo demais → fica sem rótulo (o valor continua na dica);
 *   · rosca: o rótulo só aparece DENTRO da fatia, e só se o texto couber na
 *     espessura do anel e no comprimento do arco;
 *   · linhas: rótulos escolhidos de forma gulosa, sem encostar um no outro;
 *   · eixo e rótulo falam a mesma língua (barra "R$ 4,6 mil" → eixo "R$ 4 mil").
 * Todo elemento clicável tem data-i / data-s; a dica é um cartão, não o texto
 * nativo do navegador.
 * ========================================================================== */
(function () {
"use strict";
var L = window.L, G = L.graf = {};

var FONTE_N = '"JetBrains Mono", Consolas, monospace';

function ligar(box, cfg) {
  box.classList.add("graf");
  box.classList.toggle("interativo", !!cfg.aoClicar);
  var ultimo = null;
  function quente(alvo) {
    var todos = box.querySelectorAll("[data-i]");
    if (!alvo) { box.classList.remove("tem-hot"); for (var j = 0; j < todos.length; j++) todos[j].classList.remove("quente", "frio"); return; }
    box.classList.add("tem-hot");
    var g = alvo.getAttribute("data-g");
    for (var i = 0; i < todos.length; i++) {
      var t = todos[i], igual = t === alvo || (g != null && t.getAttribute("data-g") === g);
      t.classList.toggle("quente", igual); t.classList.toggle("frio", !igual && !t.classList.contains("alvo"));
    }
  }
  box.onmousemove = function (ev) {
    var t = ev.target.closest ? ev.target.closest("[data-i]") : null;
    if (!t || !box.contains(t)) { quente(null); L.dica.esconder(); ultimo = null; if (cfg.aoSair) cfg.aoSair(); return; }
    var i = +t.getAttribute("data-i"), s = t.getAttribute("data-s");
    s = s == null ? null : +s;
    if (ultimo !== t) { ultimo = t; if (!t.classList.contains("alvo")) quente(t); else if (cfg.aoEntrar) cfg.aoEntrar(i); }
    var d = cfg.dica ? cfg.dica(i, s) : null;
    if (d) { if (cfg.aoClicar && !d.semClique) d.clique = d.clique || "Clique para abrir o relatório"; L.dica.mostrar(ev, d); } else L.dica.esconder();
  };
  box.onmouseleave = function () { quente(null); L.dica.esconder(); ultimo = null; if (cfg.aoSair) cfg.aoSair(); };
  box.onclick = function (ev) {
    if (!cfg.aoClicar) return;
    var t = ev.target.closest ? ev.target.closest("[data-i]") : null;
    if (!t || !box.contains(t)) return;
    var s = t.getAttribute("data-s");
    cfg.aoClicar(+t.getAttribute("data-i"), s == null ? null : +s, ev);
  };
}
function vazio(box, msg) { box.className = "graf"; box.innerHTML = '<div class="vazio"><b>Sem dados</b>' + L.esc(msg || "Nada para mostrar com os filtros atuais.") + "</div>"; }
function f1(n) { return +n.toFixed(1); }
function maxAbs(a) { var m = 0; a.forEach(function (v) { if (v != null && Math.abs(v) > m) m = Math.abs(v); }); return m; }

/* --------------------------------------------------------------------------
 * COLUNAS — agrupadas, empilhadas ou 100%
 * ------------------------------------------------------------------------ */
G.colunas = function (box, cfg, animar) {
  var cats = cfg.categorias || [], S = cfg.series || [], nC = cats.length, nS = S.length;
  var W = box.clientWidth || 600, H = cfg.altura || 300;
  if (!nC || !nS) return vazio(box);
  var modo = cfg.modo || "agrupado", fmt = cfg.fmt || function (v) { return L.fNum(v, 0); };
  var C = L.cores();
  // valores por coluna
  var tot = [], max = 0, min = 0;
  for (var c = 0; c < nC; c++) {
    var pos = 0, neg = 0, soma = 0;
    S.forEach(function (s) { var v = s.valores[c]; if (v == null) return; soma += v; if (v >= 0) pos += v; else neg += v; if (modo === "agrupado") { if (v > max) max = v; if (v < min) min = v; } });
    tot.push(soma);
    if (modo === "empilhado") { if (pos > max) max = pos; if (neg < min) min = neg; }
  }
  if (modo === "pct") { max = 100; min = 0; }
  if (!(max > 0) && !(min < 0)) return vazio(box);
  var ticks = L.ticks(max, 4, min), tmax = ticks[ticks.length - 1], tmin = ticks[0];
  var fEx = cfg.fEixo || L.fEixo(ticks, modo === "pct" ? "pct" : cfg.tipo);
  var axW = Math.max.apply(null, ticks.map(function (t) { return L.medir(fEx(t), 11, 600); })) + 12;
  var padB = 30, padR = 6, padT = 24;
  var plotW = W - axW - padR, band = plotW / nC;
  var grpW = Math.min(band * (nS > 1 && modo === "agrupado" ? 0.84 : 0.62), cfg.larguraMax || 120);
  var barW = modo === "agrupado" ? grpW / nS : grpW, gap = modo === "agrupado" && nS > 1 ? Math.min(2, barW * 0.12) : 0;
  var bw = barW - gap;
  // rótulos: horizontal se TODOS cabem, senão girados
  var quer = cfg.rotulos !== false;
  var textos = [], horiz = true, maxRot = 0;
  if (quer) {
    for (c = 0; c < nC; c++) S.forEach(function (s, si) {
      var v = s.valores[c]; if (v == null || v === 0) return;
      var t = modo === "pct" ? (cfg.fmtPct || function (x) { return L.fNum(x, 0) + "%"; })(tot[c] ? v / tot[c] * 100 : 0) : fmt(v);
      if (modo === "empilhado" || modo === "pct") { return; }
      textos.push(t);
      var w = L.medir(t, 10.5, 700);
      if (w + 4 > (nS === 1 ? band * 0.94 : bw + gap)) horiz = false;
      if (w > maxRot) maxRot = w;
    });
    if (modo === "empilhado" && cfg.total !== false) {
      tot.forEach(function (t) { if (!t) return; var w = L.medir(fmt(t), 11, 800); if (w + 6 > band * 0.96) horiz = false; if (w > maxRot) maxRot = w; });
    }
  }
  if (quer && !horiz) padT = Math.min(maxRot + 12, 92);
  var plotH = H - padT - padB;
  var Y = function (v) { return padT + plotH - (v - tmin) / (tmax - tmin) * plotH; };
  var y0 = Y(0);
  var x0 = axW;
  var out = ['<svg width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + " " + H + '" role="img">'];
  // grade e eixo
  ticks.forEach(function (t) {
    var y = Y(t);
    out.push('<line class="grade-l" x1="' + axW + '" x2="' + (W - padR) + '" y1="' + f1(y) + '" y2="' + f1(y) + '"/>');
    out.push('<text class="eixo-t" x="' + (axW - 8) + '" y="' + f1(y + 4) + '" text-anchor="end">' + L.esc(fEx(t)) + "</text>");
  });
  out.push('<line class="eixo-l" x1="' + axW + '" x2="' + (W - padR) + '" y1="' + f1(y0) + '" y2="' + f1(y0) + '"/>');
  var corDe = cfg.corBarra || function (ci, si) { return S[si].cor || C.d[si % C.d.length]; };
  var animCls = animar === false ? "" : " entra";
  var textoSVG = [];
  for (c = 0; c < nC; c++) {
    var cx = x0 + band * c + band / 2, gx = cx - grpW / 2, empPos = 0, empNeg = 0;
    S.forEach(function (s, si) {
      var v = s.valores[c];
      if (v == null) return;
      var x, yTop, yBot, h;
      if (modo === "agrupado") {
        x = gx + si * barW + gap / 2;
        yTop = v >= 0 ? Y(v) : y0; yBot = v >= 0 ? y0 : Y(v);
      } else {
        var base = modo === "pct" ? (tot[c] ? v / tot[c] * 100 : 0) : v;
        x = gx;
        if (base >= 0) { yBot = Y(empPos); empPos += base; yTop = Y(empPos); } else { yTop = Y(empNeg); empNeg += base; yBot = Y(empNeg); }
      }
      h = Math.max(0, yBot - yTop);
      if (h < 0.4 && v !== 0) h = 0.8;
      var dly = animar === false ? "" : ' style="animation-delay:' + Math.min(c * 22 + si * 40, 600) + 'ms"';
      out.push('<rect class="barra' + animCls + '" data-i="' + c + '" data-s="' + si + '"' + (cfg.agrupaPorCat ? ' data-g="' + c + '"' : "") + ' x="' + f1(x) + '" y="' + f1(yTop) + '" width="' + f1(bw) + '" height="' + f1(h) + '" rx="' + Math.min(4, bw / 3) + '" fill="' + corDe(c, si) + '"' + dly + "/>");
      // rótulo do valor
      if (!quer || v === 0) return;
      if (modo === "agrupado") {
        var t = fmt(v), vy = v >= 0 ? yTop : yBot;
        if (horiz) textoSVG.push('<text class="rot-v" x="' + f1(x + bw / 2) + '" y="' + f1(v >= 0 ? vy - 6 : vy + 13) + '" text-anchor="middle" font-size="10.5">' + L.esc(t) + "</text>");
        else textoSVG.push('<text class="rot-v" transform="rotate(-90 ' + f1(x + bw / 2 + 3.5) + " " + f1(vy - 6) + ')" x="' + f1(x + bw / 2 + 3.5) + '" y="' + f1(vy - 6) + '" text-anchor="start" font-size="10.5">' + L.esc(t) + "</text>");
      } else {
        var seg = modo === "pct" ? (cfg.fmtPct || function (x) { return L.fNum(x, 0) + "%"; })(tot[c] ? v / tot[c] * 100 : 0) : fmt(v);
        var wt = L.medir(seg, 10, 700);
        if (h >= 15 && wt + 6 <= bw) {
          var corT = (s.corTexto) || "#fff";
          textoSVG.push('<text class="rot-in" x="' + f1(x + bw / 2) + '" y="' + f1(yTop + h / 2 + 3.5) + '" text-anchor="middle" font-size="10" fill="' + corT + '" style="fill:' + corT + '">' + L.esc(seg) + "</text>");
        }
      }
    });
    if (modo === "empilhado" && quer && cfg.total !== false && tot[c]) {
      var tt = fmt(tot[c]), ty = Y(empPos) - 6;
      if (horiz) textoSVG.push('<text class="rot-v" x="' + f1(cx) + '" y="' + f1(ty) + '" text-anchor="middle" font-size="11" font-weight="800">' + L.esc(tt) + "</text>");
      else textoSVG.push('<text class="rot-v" transform="rotate(-90 ' + f1(cx + 4) + " " + f1(ty) + ')" x="' + f1(cx + 4) + '" y="' + f1(ty) + '" text-anchor="start" font-size="11" font-weight="800">' + L.esc(tt) + "</text>");
    }
    // categoria
    var cat = typeof cats[c] === "object" ? cats[c].rot : cats[c];
    out.push('<text class="eixo-t" x="' + f1(cx) + '" y="' + (H - 9) + '" text-anchor="middle">' + L.esc(L.cortar(cat, band - 2, 11, 600, FONTE_N)) + "</text>");
  }
  // linha de referência (tracejada, rótulo em plaqueta à esquerda)
  (cfg.ref || []).forEach(function (r) {
    var y = Y(r.valor), t = r.rot, w = L.medir(t, 11, 800) + 14;
    out.push('<line class="ref-l" x1="' + axW + '" x2="' + (W - padR) + '" y1="' + f1(y) + '" y2="' + f1(y) + '"/>');
    out.push('<rect class="ref-p" x="' + (axW + 6) + '" y="' + f1(y - 10) + '" width="' + f1(w) + '" height="20" rx="6"/><text class="ref-t" x="' + (axW + 13) + '" y="' + f1(y + 4) + '">' + L.esc(t) + "</text>");
  });
  out.push(textoSVG.join(""));
  out.push("</svg>");
  box.innerHTML = out.join("");
  ligar(box, cfg);
  L.registrarGrafico(box, function (a) { G.colunas(box, cfg, a); });
};

/* --------------------------------------------------------------------------
 * BARRAS HORIZONTAIS — ranking com nome, barra e rótulo (valor + %)
 * ------------------------------------------------------------------------ */
G.barras = function (box, cfg, animar) {
  var it = cfg.itens || [];
  if (!it.length) return vazio(box, cfg.vazio);
  var W = box.clientWidth || 500, linhaH = cfg.linhaH || 30, H = it.length * linhaH + 4;
  var C = L.cores(), fmt = cfg.fmt || function (v) { return L.fNum(v, 0); };
  var total = cfg.total != null ? cfg.total : it.reduce(function (s, x) { return s + Math.max(0, x.valor); }, 0);
  var max = Math.max.apply(null, it.map(function (x) { return x.valor; })); if (!(max > 0)) max = 1;
  var rot = it.map(function (x) {
    var t = fmt(x.valor);
    if (cfg.pct !== false && total > 0) t += "  ·  " + L.fPct(x.valor / total, x.valor / total < 0.1 ? 1 : 1);
    return x.rotuloValor || t;
  });
  var wRot = Math.max.apply(null, rot.map(function (t) { return L.medir(t, 11, 700); })) + 10;
  var wNome = Math.min(cfg.nomeMax || W * 0.42, Math.max.apply(null, it.map(function (x) { return L.medir(x.rot, 12.5, 600, '"IBM Plex Sans", sans-serif'); })) + 12);
  var barX = wNome + 6, barW = Math.max(40, W - barX - wRot);
  var out = ['<svg width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + " " + H + '">'];
  it.forEach(function (x, i) {
    var y = i * linhaH + 2, bh = Math.min(18, linhaH - 10), w = Math.max(x.valor > 0 ? 2 : 0, x.valor / max * barW);
    var cor = x.cor || (cfg.cor ? (typeof cfg.cor === "function" ? cfg.cor(i, x) : cfg.cor) : C.d[0]);
    var nome = L.cortar(x.rot, wNome - 8, 12.5, 600, '"IBM Plex Sans", sans-serif');
    out.push('<g class="alvo" data-i="' + i + '"><rect x="0" y="' + y + '" width="' + W + '" height="' + linhaH + '" fill="transparent"/></g>');
    out.push('<text class="rot-nome" x="0" y="' + (y + linhaH / 2 + 4) + '">' + L.esc(nome) + "</text>");
    out.push('<rect x="' + barX + '" y="' + (y + (linhaH - bh) / 2) + '" width="' + f1(barW) + '" height="' + bh + '" rx="5" fill="var(--s3)" opacity=".5"/>');
    out.push('<rect class="barra' + (animar === false ? "" : " entra-h") + '" data-i="' + i + '" x="' + barX + '" y="' + (y + (linhaH - bh) / 2) + '" width="' + f1(w) + '" height="' + bh + '" rx="5" fill="' + cor + '"' + (animar === false ? "" : ' style="animation-delay:' + Math.min(i * 30, 500) + 'ms"') + "/>");
    out.push('<text class="rot-v" x="' + f1(barX + barW + 8) + '" y="' + (y + linhaH / 2 + 4) + '" font-size="11">' + L.esc(rot[i]) + "</text>");
  });
  out.push("</svg>");
  box.innerHTML = out.join("");
  ligar(box, cfg);
  L.registrarGrafico(box, function (a) { G.barras(box, cfg, a); });
};

/* --------------------------------------------------------------------------
 * BARRAS 100% — composição por linha (ex.: HB x sem HB por equipe)
 * ------------------------------------------------------------------------ */
G.barras100 = function (box, cfg, animar) {
  var linhas = cfg.linhas || [];
  if (!linhas.length) return vazio(box);
  var W = box.clientWidth || 500, lh = cfg.linhaH || 34, H = linhas.length * lh + 4, fmtP = cfg.fmtPct || function (x) { return L.fNum(x, 1) + "%"; };
  var wNome = Math.min(W * 0.36, Math.max.apply(null, linhas.map(function (l) { return L.medir(l.rot, 12.5, 600, '"IBM Plex Sans", sans-serif'); })) + 12);
  var wTot = Math.max.apply(null, linhas.map(function (l) { return L.medir(cfg.fmtTotal ? cfg.fmtTotal(l.partes) : "", 11, 700); })) + 12;
  var barX = wNome + 6, barW = Math.max(60, W - barX - wTot), out = ['<svg width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + " " + H + '">'];
  linhas.forEach(function (l, i) {
    var y = i * lh + 3, bh = lh - 10, soma = l.partes.reduce(function (s, p) { return s + Math.max(0, p.valor); }, 0) || 1, x = barX;
    out.push('<text class="rot-nome" x="0" y="' + (y + bh / 2 + 4) + '">' + L.esc(L.cortar(l.rot, wNome - 8, 12.5, 600, '"IBM Plex Sans", sans-serif')) + "</text>");
    l.partes.forEach(function (p, pi) {
      var w = Math.max(0, p.valor) / soma * barW; if (w <= 0) return;
      var pct = p.valor / soma * 100, t = fmtP(pct), cor = p.cor;
      out.push('<rect class="barra" data-i="' + i + '" data-s="' + pi + '" data-g="' + i + '" x="' + f1(x) + '" y="' + y + '" width="' + f1(Math.max(0, w - 1.5)) + '" height="' + bh + '" rx="4" fill="' + cor + '"/>');
      if (L.medir(t, 10.5, 700) + 8 <= w) out.push('<text class="rot-in" x="' + f1(x + w / 2) + '" y="' + (y + bh / 2 + 3.5) + '" text-anchor="middle" font-size="10.5" style="fill:' + (p.corTexto || "#fff") + '">' + L.esc(t) + "</text>");
      x += w;
    });
    if (cfg.fmtTotal) out.push('<text class="rot-v" x="' + f1(barX + barW + 8) + '" y="' + (y + bh / 2 + 4) + '" font-size="11">' + L.esc(cfg.fmtTotal(l.partes)) + "</text>");
  });
  out.push("</svg>");
  box.innerHTML = out.join("");
  ligar(box, cfg);
  L.registrarGrafico(box, function (a) { G.barras100(box, cfg, a); });
};

/* --------------------------------------------------------------------------
 * LINHAS — várias séries, com rótulos escolhidos sem sobreposição
 * ------------------------------------------------------------------------ */
G.linhas = function (box, cfg, animar) {
  var cats = cfg.categorias || [], S = cfg.series || [], nC = cats.length;
  var W = box.clientWidth || 600, H = cfg.altura || 280;
  if (!nC || !S.length) return vazio(box);
  var C = L.cores(), fmt = cfg.fmt || function (v) { return L.fNum(v, 0); };
  var max = -Infinity, min = Infinity;
  S.forEach(function (s) { s.valores.forEach(function (v) { if (v == null) return; if (v > max) max = v; if (v < min) min = v; }); });
  if (!isFinite(max)) return vazio(box);
  if (cfg.zero !== false) { min = Math.min(0, min); }
  var ticks = L.ticks(max, 4, min), tmax = ticks[ticks.length - 1], tmin = ticks[0];
  var fEx = cfg.fEixo || L.fEixo(ticks, cfg.tipo);
  var axW = Math.max.apply(null, ticks.map(function (t) { return L.medir(fEx(t), 11, 600); })) + 12;
  var padT = 26, padB = 30, padR = 14, plotW = W - axW - padR - 8, plotH = H - padT - padB, step = plotW / Math.max(1, nC - 1);
  var X = function (i) { return axW + 10 + (nC === 1 ? plotW / 2 : step * i); };
  var Y = function (v) { return padT + plotH - (v - tmin) / (tmax - tmin) * plotH; };
  var out = ['<svg width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + " " + H + '">'];
  ticks.forEach(function (t) {
    var y = Y(t);
    out.push('<line class="grade-l" x1="' + axW + '" x2="' + (W - padR) + '" y1="' + f1(y) + '" y2="' + f1(y) + '"/>');
    out.push('<text class="eixo-t" x="' + (axW - 8) + '" y="' + f1(y + 4) + '" text-anchor="end">' + L.esc(fEx(t)) + "</text>");
  });
  var salto = Math.max(1, Math.ceil(nC / Math.max(2, Math.floor(plotW / 54))));
  for (var i = 0; i < nC; i += salto) {
    var cat = typeof cats[i] === "object" ? cats[i].rot : cats[i];
    out.push('<text class="eixo-t" x="' + f1(X(i)) + '" y="' + (H - 9) + '" text-anchor="middle">' + L.esc(cat) + "</text>");
  }
  var ordem = S.map(function (s, k) { return k; }).sort(function (a, b) { return (S[b].destaque ? 1 : 0) - (S[a].destaque ? 1 : 0); });
  // áreas e linhas (o trecho "parcial" do mês em andamento vai tracejado)
  S.forEach(function (s, si) {
    var cor = s.cor || C.d[si % C.d.length], seg = [], atual = [], pp = s.parcial;
    s.valores.forEach(function (v, i) { if (v == null) { if (atual.length) seg.push(atual); atual = []; } else atual.push([X(i), Y(v), i]); });
    if (atual.length) seg.push(atual);
    seg.forEach(function (pts) {
      var solido = pp != null ? pts.filter(function (p) { return p[2] < pp; }) : pts;
      var cauda = pp != null ? pts.filter(function (p) { return p[2] >= pp - 1; }) : [];
      if (s.area && solido.length > 1) out.push('<path d="M' + solido.map(function (p) { return f1(p[0]) + " " + f1(p[1]); }).join("L") + "L" + f1(solido[solido.length - 1][0]) + " " + f1(Y(Math.max(tmin, 0))) + "L" + f1(solido[0][0]) + " " + f1(Y(Math.max(tmin, 0))) + 'Z" fill="' + cor + '" opacity=".11"/>');
      if (solido.length > 1) {
        var d = "M" + solido.map(function (p) { return f1(p[0]) + " " + f1(p[1]); }).join("L");
        var len = 0; for (var k = 1; k < solido.length; k++) len += Math.hypot(solido[k][0] - solido[k - 1][0], solido[k][1] - solido[k - 1][1]);
        out.push('<path class="' + (animar === false ? "" : "linha-d") + '" d="' + d + '" fill="none" stroke="' + cor + '" stroke-width="' + (s.destaque ? 3.2 : 2.2) + '" stroke-linecap="round" stroke-linejoin="round"' + (s.tracejado ? ' stroke-dasharray="5 5"' : "") + ' style="--len:' + Math.ceil(len) + '"/>');
      }
      if (cauda.length > 1) out.push('<path d="M' + cauda.map(function (p) { return f1(p[0]) + " " + f1(p[1]); }).join("L") + '" fill="none" stroke="' + cor + '" stroke-width="' + (s.destaque ? 3 : 2) + '" stroke-linecap="round" stroke-dasharray="3 5" opacity=".85"/>');
    });
  });
  // pontos
  S.forEach(function (s, si) {
    var cor = s.cor || C.d[si % C.d.length];
    s.valores.forEach(function (v, i) {
      if (v == null) return;
      var oco = s.parcial != null && i >= s.parcial;
      out.push('<circle class="ponto" data-c="' + i + '" cx="' + f1(X(i)) + '" cy="' + f1(Y(v)) + '" r="' + (s.destaque ? 3.8 : 3) + '" fill="' + (oco ? "var(--s1)" : cor) + '" stroke="' + (oco ? cor : "var(--s1)") + '" stroke-width="' + (oco ? 2 : 1.6) + '"/>');
    });
  });
  // referência
  (cfg.ref || []).forEach(function (r) {
    var y = Y(r.valor), t = r.rot, w = L.medir(t, 11, 800) + 14;
    out.push('<line class="ref-l" x1="' + axW + '" x2="' + (W - padR) + '" y1="' + f1(y) + '" y2="' + f1(y) + '"/><rect class="ref-p" x="' + (axW + 6) + '" y="' + f1(y - 10) + '" width="' + f1(w) + '" height="20" rx="6"/><text class="ref-t" x="' + (axW + 13) + '" y="' + f1(y + 4) + '">' + L.esc(t) + "</text>");
  });
  // rótulos de dados: gulosos, sem encostar
  if (cfg.rotulos !== false) {
    var caixas = [];
    var bate = function (b) { for (var j = 0; j < caixas.length; j++) { var c = caixas[j]; if (b.x < c.x + c.w + 6 && b.x + b.w + 6 > c.x && b.y < c.y + c.h + 3 && b.y + b.h + 3 > c.y) return true; } return false; };
    var pontos = [];
    S.forEach(function (s, si) { s.valores.forEach(function (v, i) { if (v != null) pontos.push([si, i, v]); }); });
    ordem.forEach(function (si) {
      var s = S[si], cor = s.cor || C.d[si % C.d.length];
      if (cfg.rotulos === "destaque" && !s.destaque) return;
      s.valores.forEach(function (v, i) {
        if (v == null) return;
        if (cfg.rotuloMin != null && Math.abs(v) < cfg.rotuloMin) return;
        var t = (s.fmt || fmt)(v) + (s.parcial != null && i >= s.parcial ? "*" : ""), w = L.medir(t, 10, 700) + 2, x = X(i) - w / 2, y;
        var tent = [Y(v) - 17, Y(v) + 7];
        for (var k = 0; k < tent.length; k++) {
          y = tent[k];
          var b = { x: Math.max(axW, Math.min(W - padR - w, x)), y: y, w: w, h: 11 };
          if (b.y < 2 || b.y + b.h > H - padB + 4) continue;
          if (!bate(b)) {
            caixas.push(b);
            out.push('<text class="rot-v" x="' + f1(b.x + w / 2) + '" y="' + f1(b.y + 9) + '" text-anchor="middle" font-size="10" style="fill:' + (s.destaque ? "var(--t1)" : cor) + '" font-weight="700">' + L.esc(t) + "</text>");
            break;
          }
        }
      });
    });
  }
  // alvos por categoria (hover) + linha-guia
  out.push('<line id="gl" x1="0" x2="0" y1="' + padT + '" y2="' + (padT + plotH) + '" stroke="var(--ouro)" stroke-width="1" stroke-dasharray="3 3" opacity="0"/>');
  for (i = 0; i < nC; i++) {
    var xa = nC === 1 ? axW : X(i) - step / 2;
    out.push('<rect class="alvo" data-i="' + i + '" x="' + f1(Math.max(axW, xa)) + '" y="' + padT + '" width="' + f1(nC === 1 ? plotW : step) + '" height="' + plotH + '" fill="transparent"/>');
  }
  out.push("</svg>");
  box.innerHTML = out.join("");
  var guia = box.querySelector("#gl");
  var cfg2 = Object.assign({}, cfg, {
    aoEntrar: function (i) { if (guia) { guia.setAttribute("x1", f1(X(i))); guia.setAttribute("x2", f1(X(i))); guia.setAttribute("opacity", ".8"); } box.querySelectorAll(".ponto").forEach(function (p) { p.setAttribute("r", +p.getAttribute("data-c") === i ? 6 : (p.getAttribute("r") > 3.5 ? 3.8 : 3)); }); },
    aoSair: function () { if (guia) guia.setAttribute("opacity", "0"); box.querySelectorAll(".ponto").forEach(function (p) { p.setAttribute("r", p.getAttribute("r") > 3.9 ? 3.8 : 3); }); },
  });
  ligar(box, cfg2);
  if (cfg.aoClicar) {
    // clique escolhe a série mais próxima do ponto clicado (várias séries no mesmo mês)
    box.onclick = function (ev) {
      var t = ev.target.closest ? ev.target.closest("[data-i]") : null;
      if (!t || !box.contains(t)) return;
      var i = +t.getAttribute("data-i"), svg = box.querySelector("svg"), y = ev.clientY - svg.getBoundingClientRect().top, melhor = null, dist = 1e9;
      S.forEach(function (s, si) { var v = s.valores[i]; if (v == null) return; var d = Math.abs(Y(v) - y); if (d < dist) { dist = d; melhor = si; } });
      cfg.aoClicar(i, melhor, ev);
    };
  }
  L.registrarGrafico(box, function (a) { G.linhas(box, cfg, a); });
};

/* --------------------------------------------------------------------------
 * ROSCA — rótulo sempre dentro da fatia (só se couber)
 * ------------------------------------------------------------------------ */
function arco(cx, cy, R, r, a0, a1) {
  var c0 = Math.cos(a0), s0 = Math.sin(a0), c1 = Math.cos(a1), s1 = Math.sin(a1), g = a1 - a0 > Math.PI ? 1 : 0;
  return "M" + f1(cx + R * c0) + " " + f1(cy + R * s0) + "A" + R + " " + R + " 0 " + g + " 1 " + f1(cx + R * c1) + " " + f1(cy + R * s1) +
         "L" + f1(cx + r * c1) + " " + f1(cy + r * s1) + "A" + r + " " + r + " 0 " + g + " 0 " + f1(cx + r * c0) + " " + f1(cy + r * s0) + "Z";
}
G.rosca = function (box, cfg, animar) {
  var fat = (cfg.fatias || []).filter(function (f) { return f.valor > 0; });
  var tot = fat.reduce(function (s, f) { return s + f.valor; }, 0);
  if (!tot) return vazio(box, cfg.vazio);
  var W = box.clientWidth || 300, tam = Math.min(W, cfg.altura || 280), H = tam, cx = W / 2, cy = H / 2;
  var R = tam / 2 - 6, r = R * (cfg.furo || 0.58), fmt = cfg.fmt || function (v) { return L.fNum(v, 0); };
  var out = ['<svg width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + " " + H + '">'], a = -Math.PI / 2, rotulos = [];
  fat.forEach(function (f, i) {
    var ang = f.valor / tot * Math.PI * 2, a1 = a + Math.min(ang, Math.PI * 2 - 0.0001);
    out.push('<path class="fatia" data-i="' + i + '" data-g="' + i + '" d="' + arco(cx, cy, R, r, a, a1) + '" fill="' + f.cor + '" stroke="var(--s1)" stroke-width="2"/>');
    // rótulo dentro da fatia
    var am = (a + a1) / 2, rm = (R + r) / 2, esp = R - r, arcoLen = ang * rm;
    var pct = f.valor / tot, t1 = fmt(f.valor), t2 = L.fPct(pct, pct < 0.1 ? 1 : 0);
    var tentativas = [[[t1, t2], 10, 26], [[t1], 9, 13], [[t2], 9, 13]];
    for (var k = 0; k < tentativas.length; k++) {
      var tx = tentativas[k][0], fs = tentativas[k][1], hh = tentativas[k][2];
      var w = Math.max.apply(null, tx.map(function (t) { return L.medir(t, fs, 800); }));
      var sa = Math.abs(Math.sin(am)), ca = Math.abs(Math.cos(am));
      var ocupaRadial = ca * w + sa * hh, ocupaArco = sa * w + ca * hh;
      if (ocupaRadial + 6 <= esp && ocupaArco + 6 <= arcoLen) {
        var px = cx + rm * Math.cos(am), py = cy + rm * Math.sin(am);
        var txt = tx.length === 2
          ? '<text class="rot-in" x="' + f1(px) + '" y="' + f1(py - 2) + '" text-anchor="middle" font-size="' + fs + '" style="fill:' + (f.corTexto || "#fff") + '">' + L.esc(tx[0]) + '</text><text class="rot-in" x="' + f1(px) + '" y="' + f1(py + 10) + '" text-anchor="middle" font-size="' + fs + '" style="fill:' + (f.corTexto || "#fff") + ';opacity:.85">' + L.esc(tx[1]) + "</text>"
          : '<text class="rot-in" x="' + f1(px) + '" y="' + f1(py + 3.5) + '" text-anchor="middle" font-size="' + fs + '" style="fill:' + (f.corTexto || "#fff") + '">' + L.esc(tx[0]) + "</text>";
        rotulos.push(txt);
        break;
      }
    }
    a = a1;
  });
  out.push(rotulos.join(""));
  if (cfg.centro) {
    var ft = Math.min(24, r / 2.2);
    while (ft > 10 && L.medir(cfg.centro.valor, ft, 800) > r * 1.65) ft -= 0.5;      // o número tem que caber dentro do furo
    var ft2 = Math.max(9, Math.min(11, ft * 0.5));
    out.push('<text x="' + cx + '" y="' + f1(cy + ft * 0.15) + '" text-anchor="middle" font-size="' + f1(ft) + '" font-weight="800" style="fill:var(--t1)">' + L.esc(cfg.centro.valor) + '</text><text x="' + cx + '" y="' + f1(cy + ft * 0.15 + ft2 + 6) + '" text-anchor="middle" font-size="' + f1(ft2) + '" style="fill:var(--t3);font-family:var(--f-txt);font-weight:600">' + L.esc(L.cortar(cfg.centro.titulo, r * 1.7, ft2, 600, '"IBM Plex Sans", sans-serif')) + "</text>");
  }
  out.push("</svg>");
  box.innerHTML = out.join("");
  var mapa = fat.map(function (f) { return f.idxOriginal != null ? f.idxOriginal : null; });
  var cfg2 = Object.assign({}, cfg, {
    dica: cfg.dica ? function (i, s) { return cfg.dica(fat[i].idxOriginal != null ? fat[i].idxOriginal : i, s, fat[i], tot); } : null,
    aoClicar: cfg.aoClicar ? function (i, s, ev) { cfg.aoClicar(fat[i].idxOriginal != null ? fat[i].idxOriginal : i, s, ev); } : null,
  });
  ligar(box, cfg2);
  L.registrarGrafico(box, function (a2) { G.rosca(box, cfg, a2); });
};

/* legenda em lista (valor e % de todas as fatias — nenhum número se perde) */
G.legendaLista = function (fatias, fmt, aoClicar) {
  var tot = fatias.reduce(function (s, f) { return s + Math.max(0, f.valor); }, 0) || 1;
  var el = L.h("div", { class: "leg-lista" });
  fatias.forEach(function (f, i) {
    var b = L.h("button", { class: "leg-item", type: "button" },
      L.h("i", { style: { background: f.cor } }), L.h("span", { class: "t", text: f.rot, title: f.rot }),
      L.h("span", { class: "lv", text: fmt(f.valor) }), L.h("span", { class: "lp", text: L.fPct(f.valor / tot, 1) }));
    if (aoClicar) b.addEventListener("click", function (ev) { aoClicar(i, ev); });
    el.appendChild(b);
  });
  return el;
};
G.legenda = function (itens) {
  return L.h("div", { class: "legenda" }, itens.map(function (x) { return L.h("span", { class: "leg-item" }, L.h("i", { style: { background: x.cor } }), x.rot); }));
};

/* --------------------------------------------------------------------------
 * MEDIDOR — arco de 180° com marca de referência
 * ------------------------------------------------------------------------ */
G.medidor = function (box, cfg, animar) {
  var W = box.clientWidth || 300, H = cfg.altura || 190, cx = W / 2, cy = H - 34, R = Math.min(W / 2 - 14, H - 54), r = R * 0.72;
  var max = Math.max(cfg.valor, cfg.ref) * 1.18 || 1, fmt = cfg.fmt || L.fAbrev;
  var ang = function (v) { return Math.PI + Math.min(1, v / max) * Math.PI; };
  var cor = cfg.valor >= cfg.ref ? L.cores().ok : L.cores().atencao;
  var out = ['<svg width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + " " + H + '">'];
  out.push('<path d="' + arco(cx, cy, R, r, Math.PI, 2 * Math.PI - 0.0001) + '" fill="var(--s3)"/>');
  out.push('<path class="fatia" d="' + arco(cx, cy, R, r, Math.PI, Math.max(Math.PI + 0.01, ang(cfg.valor))) + '" fill="' + (cfg.corValor || L.cores().ouro) + '"/>');
  var ar = ang(cfg.ref), x1 = cx + (r - 6) * Math.cos(ar), y1 = cy + (r - 6) * Math.sin(ar), x2 = cx + (R + 7) * Math.cos(ar), y2 = cy + (R + 7) * Math.sin(ar);
  out.push('<line x1="' + f1(x1) + '" y1="' + f1(y1) + '" x2="' + f1(x2) + '" y2="' + f1(y2) + '" stroke="var(--t1)" stroke-width="3" stroke-linecap="round"/>');
  var pct = cfg.ref ? cfg.valor / cfg.ref : null;
  out.push('<text x="' + cx + '" y="' + (cy - 12) + '" text-anchor="middle" font-size="' + Math.min(30, r / 1.7) + '" font-weight="800" style="fill:' + cor + '">' + L.esc(pct == null ? "—" : L.fPct(pct, 1)) + "</text>");
  out.push('<text x="' + cx + '" y="' + (cy + 6) + '" text-anchor="middle" font-size="11" style="fill:var(--t3);font-family:var(--f-txt);font-weight:600">' + L.esc(cfg.legenda || "do valor de referência") + "</text>");
  out.push('<text class="eixo-t" x="' + (cx - (R + r) / 2) + '" y="' + (cy + 20) + '" text-anchor="middle">' + L.esc(fmt(0, true)) + "</text>");
  out.push('<text class="rot-v" x="' + (cx + (R + r) / 2) + '" y="' + (cy + 20) + '" text-anchor="middle" font-size="11">' + L.esc(fmt(max / 1.18, true)) + "</text>");
  out.push("</svg>");
  box.innerHTML = out.join(""); box.classList.add("graf");
  L.registrarGrafico(box, function (a) { G.medidor(box, cfg, a); });
};

/* --------------------------------------------------------------------------
 * PARETO — curva acumulada com as faixas A / B / C
 * ------------------------------------------------------------------------ */
G.pareto = function (box, cfg, animar) {
  var pts = cfg.curva || [], cortes = cfg.cortes || [80, 95];
  if (!pts.length) return vazio(box);
  var W = box.clientWidth || 600, H = cfg.altura || 300, axW = 46, padT = 16, padB = 34, padR = 12;
  var pw = W - axW - padR, ph = H - padT - padB, C = L.cores();
  var X = function (x) { return axW + x / 100 * pw; }, Y = function (y) { return padT + ph - y / 100 * ph; };
  var out = ['<svg width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + " " + H + '">'];
  [0, 20, 40, 60, 80, 100].forEach(function (t) {
    out.push('<line class="grade-l" x1="' + axW + '" x2="' + (W - padR) + '" y1="' + f1(Y(t)) + '" y2="' + f1(Y(t)) + '"/><text class="eixo-t" x="' + (axW - 8) + '" y="' + f1(Y(t) + 4) + '" text-anchor="end">' + t + "%</text>");
    out.push('<text class="eixo-t" x="' + f1(X(t)) + '" y="' + (H - 12) + '" text-anchor="middle">' + t + "%</text>");
  });
  // x onde a curva cruza cada corte
  var xi = [0, 0, 100];
  cortes.forEach(function (cte, k) { for (var i = 0; i < pts.length; i++) if (pts[i][1] >= cte) { xi[k + 1] = pts[i][0]; break; } });
  if (cfg.fronteiras) { xi[1] = cfg.fronteiras[0]; xi[2] = cfg.fronteiras[1]; }
  var fx = [0, xi[1], xi[2], 100], cls = [C.ouro, C.d[0], C.d[7]], nomes = cfg.classes || ["A", "B", "C"];
  for (var k = 0; k < 3; k++) {
    out.push('<rect x="' + f1(X(fx[k])) + '" y="' + padT + '" width="' + f1(Math.max(0, X(fx[k + 1]) - X(fx[k]))) + '" height="' + ph + '" fill="' + cls[k] + '" opacity=".08"/>');
    var wcls = X(fx[k + 1]) - X(fx[k]);
    var rot = nomes[k] || "";
    if (wcls > 28) out.push('<text x="' + f1((X(fx[k]) + X(fx[k + 1])) / 2) + '" y="' + (padT + 22) + '" text-anchor="middle" font-size="22" font-weight="800" style="fill:' + cls[k] + '" opacity=".85">' + "ABC"[k] + "</text>");
  }
  cortes.forEach(function (cte) {
    out.push('<line class="ref-l" x1="' + axW + '" x2="' + (W - padR) + '" y1="' + f1(Y(cte)) + '" y2="' + f1(Y(cte)) + '"/>');
    var t = cte + "%", w = L.medir(t, 11, 800) + 12;
    out.push('<rect class="ref-p" x="' + (W - padR - w - 4) + '" y="' + f1(Y(cte) - 20) + '" width="' + f1(w) + '" height="18" rx="6"/><text class="ref-t" x="' + (W - padR - w + 2) + '" y="' + f1(Y(cte) - 7) + '">' + t + "</text>");
  });
  var d = "M" + pts.map(function (p) { return f1(X(p[0])) + " " + f1(Y(p[1])); }).join("L");
  out.push('<path d="' + d + 'L' + f1(X(100)) + " " + f1(Y(0)) + "L" + f1(X(0)) + " " + f1(Y(0)) + 'Z" fill="' + C.ouro + '" opacity=".1"/>');
  out.push('<path class="' + (animar === false ? "" : "linha-d") + '" d="' + d + '" fill="none" stroke="' + C.ouro + '" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" style="--len:2400"/>');
  // marcas de cada corte sobre a curva
  cortes.forEach(function (cte, k) {
    var x = xi[k + 1];
    out.push('<circle cx="' + f1(X(x)) + '" cy="' + f1(Y(cte)) + '" r="5" fill="var(--s1)" stroke="' + C.ouro + '" stroke-width="2.5"/>');
    var t = L.fPct100(x, 1) + " dos itens", w = L.medir(t, 11, 700) + 10;
    out.push('<text class="rot-v" x="' + f1(Math.min(W - padR - w / 2 - 4, Math.max(axW + w / 2, X(x)))) + '" y="' + f1(Y(cte) + 22) + '" text-anchor="middle" font-size="11">' + L.esc(t) + "</text>");
  });
  out.push('<text class="eixo-t" x="' + f1(axW + pw / 2) + '" y="' + (H - 0) + '" text-anchor="middle" style="font-family:var(--f-txt)">% acumulado dos itens (do maior para o menor)</text>');
  out.push("</svg>");
  box.innerHTML = out.join(""); box.classList.add("graf");
  L.registrarGrafico(box, function (a) { G.pareto(box, cfg, a); });
};

/* --------------------------------------------------------------------------
 * MINI — linha de tendência sem eixo (dentro de cartões)
 * ------------------------------------------------------------------------ */
G.mini = function (box, valores, cor, w, h) {
  w = w || 120; h = h || 34;
  var v = valores.filter(function (x) { return x != null; });
  if (v.length < 2) { box.innerHTML = ""; return; }
  var mx = Math.max.apply(null, v), mn = Math.min.apply(null, v), n = valores.length;
  var X = function (i) { return 2 + (w - 4) * i / (n - 1); }, Y = function (x) { return h - 3 - (mx === mn ? 0.5 : (x - mn) / (mx - mn)) * (h - 8); };
  var pts = []; valores.forEach(function (x, i) { if (x != null) pts.push(f1(X(i)) + " " + f1(Y(x))); });
  var last = valores.length - 1; while (valores[last] == null) last--;
  box.innerHTML = '<svg width="' + w + '" height="' + h + '" viewBox="0 0 ' + w + " " + h + '"><path d="M' + pts.join("L") + "L" + f1(X(last)) + " " + h + "L" + f1(X(0)) + " " + h + 'Z" fill="' + cor + '" opacity=".14"/><path d="M' + pts.join("L") + '" fill="none" stroke="' + cor + '" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><circle cx="' + f1(X(last)) + '" cy="' + f1(Y(valores[last])) + '" r="3" fill="' + cor + '"/></svg>';
};

/* --------------------------------------------------------------------------
 * MAPA DE CALOR (HTML) — ano x mês
 * ------------------------------------------------------------------------ */
G.calor = function (box, cfg) {
  var linhas = cfg.linhas, cols = cfg.colunas, fmt = cfg.fmt, all = [];
  linhas.forEach(function (l) { l.valores.forEach(function (v) { if (v != null) all.push(v); }); });
  var mx = Math.max.apply(null, all), mn = Math.min.apply(null, all);
  var tab = L.h("table", { class: "calor" });
  var th = L.h("tr", null, L.h("th", { text: "" })); cols.forEach(function (c) { th.appendChild(L.h("th", { text: c })); });
  tab.appendChild(L.h("thead", null, th));
  var tb = L.h("tbody");
  linhas.forEach(function (l, li) {
    var tr = L.h("tr", null, L.h("th", { text: l.rot }));
    l.valores.forEach(function (v, ci) {
      var p = v == null || mx === mn ? 0 : (v - mn) / (mx - mn);
      var td = L.h("td", { text: v == null ? "" : fmt(v), style: v == null ? {} : { background: "color-mix(in srgb, var(--ouro) " + Math.round(8 + p * 62) + "%, var(--s1))", color: p > 0.6 ? "#1b1303" : "var(--t1)" }, data: { i: li, s: ci } });
      if (cfg.aoClicar && v != null) td.addEventListener("click", function (ev) { cfg.aoClicar(li, ci, ev); });
      if (cfg.dica && v != null) { td.addEventListener("mousemove", function (ev) { L.dica.mostrar(ev, cfg.dica(li, ci)); }); td.addEventListener("mouseleave", L.dica.esconder); }
      tr.appendChild(td);
    });
    tb.appendChild(tr);
  });
  tab.appendChild(tb);
  L.limpar(box).appendChild(tab);
  box.classList.add("calor-box"); box.classList.toggle("interativo", !!cfg.aoClicar);
};


/* --------------------------------------------------------------------------
 * CASCATA (ponte) — total inicial, variações e total final, com conectores
 * ------------------------------------------------------------------------ */
G.cascata = function (box, cfg, animar) {
  var P = cfg.passos || [], n = P.length;
  if (!n) return vazio(box);
  var W = box.clientWidth || 600, H = cfg.altura || 320, C = L.cores(), fmt = cfg.fmt || function (v) { return L.fNum(v, 0); };
  var acum = 0, barras = [], max = 0, min = 0;
  P.forEach(function (p) {
    var de, ate;
    if (p.total) { de = 0; ate = p.valor; acum = p.valor; } else { de = acum; ate = acum + p.valor; acum = ate; }
    barras.push({ de: de, ate: ate, topo: Math.max(de, ate), base: Math.min(de, ate) });
    max = Math.max(max, de, ate); min = Math.min(min, de, ate);
  });
  var ticks = L.ticks(max, 4, min), tmax = ticks[ticks.length - 1], tmin = ticks[0], fEx = cfg.fEixo || L.fEixo(ticks, cfg.tipo);
  var axW = Math.max.apply(null, ticks.map(function (t) { return L.medir(fEx(t), 11, 600); })) + 12;
  var padT = 28, padB = 44, padR = 8, plotW = W - axW - padR, plotH = H - padT - padB, band = plotW / n, bw = Math.min(band * 0.62, 110);
  var Y = function (v) { return padT + plotH - (v - tmin) / (tmax - tmin) * plotH; };
  var out = ['<svg width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + " " + H + '">'];
  ticks.forEach(function (t) { out.push('<line class="grade-l" x1="' + axW + '" x2="' + (W - padR) + '" y1="' + f1(Y(t)) + '" y2="' + f1(Y(t)) + '"/><text class="eixo-t" x="' + (axW - 8) + '" y="' + f1(Y(t) + 4) + '" text-anchor="end">' + L.esc(fEx(t)) + "</text>"); });
  out.push('<line class="eixo-l" x1="' + axW + '" x2="' + (W - padR) + '" y1="' + f1(Y(0)) + '" y2="' + f1(Y(0)) + '"/>');
  var textos = [];
  P.forEach(function (p, i) {
    var b = barras[i], cx = axW + band * i + band / 2, x = cx - bw / 2;
    var cor = p.cor || (p.total ? C.d[0] : p.valor >= 0 ? C.ok : C.perigo);
    var yt = Y(b.topo), h = Math.max(1.5, Y(b.base) - yt);
    if (i < n - 1) { var nx = axW + band * (i + 1) + band / 2 - bw / 2; out.push('<line x1="' + f1(x + bw) + '" x2="' + f1(nx) + '" y1="' + f1(Y(b.ate)) + '" y2="' + f1(Y(b.ate)) + '" stroke="var(--eixo)" stroke-width="1.2" stroke-dasharray="3 3"/>'); }
    out.push('<rect class="barra' + (animar === false ? "" : " entra") + '" data-i="' + i + '" x="' + f1(x) + '" y="' + f1(yt) + '" width="' + f1(bw) + '" height="' + f1(h) + '" rx="5" fill="' + cor + '"' + (animar === false ? "" : ' style="animation-delay:' + (i * 70) + 'ms"') + "/>");
    var t = (p.total ? "" : p.valor > 0 ? "+" : p.valor < 0 ? "−" : "") + fmt(p.total ? p.valor : Math.abs(p.valor));
    var w = L.medir(t, 11, 800), ty = (p.total || p.valor >= 0) ? yt - 7 : yt + h + 15;
    textos.push('<text class="rot-v" x="' + f1(cx) + '" y="' + f1(ty) + '" text-anchor="middle" font-size="11" font-weight="800"' + (w > band ? ' transform="rotate(-18 ' + f1(cx) + " " + f1(ty) + ')"' : "") + ">" + L.esc(t) + "</text>");
    var linhas = String(p.rot).split("\n");
    linhas.forEach(function (ln, k) { out.push('<text class="eixo-t" x="' + f1(cx) + '" y="' + (H - 26 + k * 13) + '" text-anchor="middle">' + L.esc(L.cortar(ln, band - 4, 11, 600, FONTE_N)) + "</text>"); });
  });
  out.push(textos.join("")); out.push("</svg>");
  box.innerHTML = out.join("");
  ligar(box, cfg);
  L.registrarGrafico(box, function (a) { G.cascata(box, cfg, a); });
};

/* desenho adiado: um gráfico criado antes de o elemento entrar na página mede largura 0;
   por isso fica na fila e é desenhado quando a tela termina de ser montada (L.executarFila) */
L.fila = [];
L.executarFila = function () { var q = L.fila.splice(0); q.forEach(function (f) { try { f(); } catch (e) { console.error(e); } }); };
["colunas", "barras", "barras100", "linhas", "rosca", "medidor", "pareto", "cascata"].forEach(function (nome) {
  var f = G[nome];
  G[nome] = function (box) {
    var args = arguments;
    if (!box.isConnected || !box.clientWidth) { L.fila.push(function () { f.apply(G, args); }); return; }
    return f.apply(G, args);
  };
});

})();
