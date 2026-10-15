/* =============================================================================
 * componentes.js — peças de tela: painel (cartão com título), KPI com
 * comparação, seção, espera e erro.
 * ========================================================================== */
(function () {
"use strict";
var L = window.L;

L.secao = function (texto) { return L.h("div", { class: "sec-tit", text: texto }); };

/* miniatura do produto (índice p de D.produtos): quadradinho branco com a foto; passando o mouse, abre a foto maior.
   Produto sem foto fica com um quadradinho cinza, para as linhas não ficarem desalinhadas. */
var zoomFoto = null;
function fecharZoomFoto() { if (zoomFoto) { zoomFoto.remove(); zoomFoto = null; } }
L.fotoMini = function (p) {
  var e = L.ESTp && L.ESTp[p], d = L.D && L.D.produtos && L.D.produtos[p], cod = d ? d[0] : null;
  var box = L.h("span", { class: "foto-mini" });
  if (!(e && e.img) || cod == null) { box.classList.add("sem"); box.innerHTML = L.ic("imagem"); box.title = "Sem foto na pasta FOTOS_ION"; return box; }
  var url = "img/" + encodeURIComponent(cod);
  var im = L.h("img", { src: url, alt: "", loading: "lazy", decoding: "async" });
  im.addEventListener("error", function () { box.classList.add("sem"); box.innerHTML = L.ic("imagem"); box.onmouseenter = null; });
  box.appendChild(im);
  box.onmouseenter = function () {
    fecharZoomFoto();
    var r = box.getBoundingClientRect(), t = 232, esq = r.right + 12 + t > innerWidth ? r.left - 12 - t : r.right + 12, topo = Math.max(8, Math.min(innerHeight - t - 8, r.top + r.height / 2 - t / 2));
    zoomFoto = L.h("div", { class: "foto-zoom", style: { left: Math.max(8, esq) + "px", top: topo + "px" } }, L.h("img", { src: url, alt: "" }));
    document.body.appendChild(zoomFoto);
  };
  box.onmouseleave = fecharZoomFoto;
  return box;
};
window.addEventListener("scroll", fecharZoomFoto, true);
window.addEventListener("mousedown", fecharZoomFoto, true);
L.grade = function () { var g = L.h("div", { class: "grade" }); for (var i = 0; i < arguments.length; i++) L.add(g, arguments[i]); return g; };

/* painel: cfg { titulo, sub, classe, acoes, corpo, semPad, id } — devolve o elemento; el.corpo é onde o gráfico entra */
L.painel = function (cfg) {
  var cab = L.h("div", { class: "painel-cab" },
    L.h("div", { class: "painel-tit" }, L.h("h3", { text: cfg.titulo }), cfg.sub ? L.h("p", { text: cfg.sub }) : null),
    cfg.acoes ? L.h("div", { class: "painel-acoes" }, cfg.acoes) : null);
  var corpo = L.h("div", { class: "painel-corpo" + (cfg.semPad ? " sem-pad" : "") });
  if (cfg.corpo) L.add(corpo, cfg.corpo);
  var el = L.h("section", { class: "painel " + (cfg.classe || "c-12"), id: cfg.id || null }, cab, corpo);
  el.corpo = corpo; el.cab = cab;
  el.subtitulo = function (t) { var p = cab.querySelector(".painel-tit p"); if (!p) { p = L.h("p"); cab.querySelector(".painel-tit").appendChild(p); } p.textContent = t; };
  return el;
};
L.btnPainel = function (icone, texto, fn, titulo) {
  return L.h("button", { class: "mini-btn", type: "button", title: titulo || texto, onclick: fn, html: L.ic(icone) + (texto ? " " + L.esc(texto) : "") });
};

/* seta de variação: atual contra base. inverso: subir é ruim (devolução, ruptura). pp: diferença em pontos percentuais */
L.delta = function (cfg) {
  var atual = cfg.atual, base = cfg.base, pp = cfg.pp;
  var el = L.h("span", { class: "delta neutro" });
  var x = pp ? (atual != null && base != null ? (atual - base) * 100 : null) : (base ? atual / base - 1 : null);
  if (x == null || !isFinite(x)) { el.textContent = "—"; return el; }
  var valor = pp ? x / 100 : x;
  var sobe = valor > 0.0005, desce = valor < -0.0005;
  var bom = cfg.inverso ? desce : sobe, ruim = cfg.inverso ? sobe : desce;
  el.className = "delta " + (bom ? "up" : ruim ? "down" : "neutro");
  el.innerHTML = (sobe ? L.ic("setaCima") : desce ? L.ic("setaBaixo") : "") + (pp ? (valor > 0 ? "+" : valor < 0 ? "−" : "") + L.fNum(Math.abs(x), 1) + " p.p." : L.fDelta(valor, 1));
  return el;
};

/* linha de comparação de um KPI: “▲ 12,3% vs ano anterior (jan–out/2025)” — clicar abre o período comparado */
L.cmpKpi = function (cfg) {
  // cfg: { atual, aa, pa, cmp, fmt, inverso, pp }
  var linha = L.h("div", { class: "cmp-linha" });
  function item(chave, base, info, rot) {
    if (base == null || !info) return;
    var chip = L.delta({ atual: cfg.atual, base: base, inverso: cfg.inverso, pp: cfg.pp });
    var tx = L.h("small", { class: "link", text: "vs " + info.rot, title: rot + " · " + cfg.fmt(base) + " — clique para abrir esse período" });
    var go = function () { L.estado.filtros.mis = info.mis.slice(); delete L.estado.filtros.ano; delete L.estado.filtros.mes; L.setFiltro("mis", info.mis); L.toast("Período: " + info.rot); };
    tx.addEventListener("click", go); chip.style.cursor = "pointer"; chip.addEventListener("click", go);
    var mv = function (ev) { L.dica.mostrar(ev, { titulo: rot, linhas: [{ rot: info.rot, val: cfg.fmt(base) }, { rot: "Período atual", val: cfg.fmt(cfg.atual) }], clique: "Clique para abrir o período comparado" }); };
    chip.addEventListener("mousemove", mv); chip.addEventListener("mouseleave", L.dica.esconder);
    linha.appendChild(chip); linha.appendChild(tx);
  }
  if (cfg.cmp) {
    item("aa", cfg.aa, cfg.cmp.aa, "vs ano anterior");
    item("pa", cfg.pa, cfg.cmp.pa, "vs período anterior");
  }
  return linha;
};

/* cartão de indicador: cfg { icone, rot, valor, fmt, classe, leg, cmp:{...}, aoClicar, ajuda } */
L.kpi = function (cfg) {
  var num = L.h("div", { class: "val num" });
  var el = L.h(cfg.aoClicar ? "button" : "div", { class: "kpi" + (cfg.classe ? " " + cfg.classe : "") + (cfg.aoClicar ? " click" : ""), type: cfg.aoClicar ? "button" : null, title: cfg.ajuda || null },
    L.h("div", { class: "rot", html: L.ic(cfg.icone || "barras") + "<span>" + L.esc(cfg.rot) + "</span>" }), num);
  var leg = L.h("div", { class: "leg" });
  if (cfg.cmp) leg.appendChild(L.cmpKpi(Object.assign({ fmt: cfg.fmtCmp || cfg.fmt, atual: cfg.valor }, cfg.cmp)));
  if (cfg.leg) L.add(leg, cfg.leg);
  el.appendChild(leg);
  if (cfg.texto != null) num.textContent = cfg.texto;
  else if (cfg.valor == null || !isFinite(cfg.valor)) num.textContent = "—"; else L.contar(num, cfg.valor, cfg.fmt);
  if (cfg.aoClicar) el.addEventListener("click", cfg.aoClicar);
  return el;
};
L.kpis = function () { var g = L.h("div", { class: "kpis" }); for (var i = 0; i < arguments.length; i++) L.add(g, arguments[i]); return g; };

/* esperas: o caminhão da Lube (o mesmo desenho do portal) rodando, com painéis caindo no baú.
   Os painéis ficam ATRÁS do baú no desenho, então ao descer eles somem para dentro dele. */
var camUid = 0;
function caminhaoSVG() {
  var N = "#1E2B8C", R = "#EE1B24", C = "#00A0E9", u = "cam" + (++camUid);
  var marca = '<g transform="translate(20,0) skewX(-10)"><path fill="NAVY" d="M24 6h34v56h42c6 0 10 4 10 10v12c0 10-8 18-18 18H24C12 102 4 94 4 82V26C4 14 12 6 24 6Z"/><path fill="RED" d="M68 6h36c6 0 10 4 10 10v32c0 3-2 4-5 4H68Z"/></g>';
  var m = function (navy) { return marca.replace("NAVY", navy).replace("RED", R); };
  var listras = ""; for (var i = 0; i < 9; i++) listras += '<rect x="' + (34 + i * 44) + '" y="185" width="24" height="9" fill="' + (i % 2 ? R : "#FFFFFF") + '"/>';
  var rodas = [112, 202, 506].map(function (cx) {
    return '<circle cx="' + cx + '" cy="203" r="37" fill="#12161F"/><circle cx="' + cx + '" cy="203" r="17" fill="#98A2B3"/>' +
      '<g class="cam-raio"><path d="M' + (cx - 14) + " 203H" + (cx + 14) + "M" + (cx - 7) + " 191L" + (cx + 7) + " 215M" + (cx - 7) + " 215L" + (cx + 7) + ' 191" stroke="#5B6577" stroke-width="3" stroke-linecap="round" fill="none"/></g>' +
      '<circle cx="' + cx + '" cy="203" r="5" fill="#3b4558"/>';
  }).join("");
  // painel pequeno (cartão com barras e uma linha); x = onde cai, d = atraso, h = alturas das barras
  var painel = function (x, d, h) {
    return '<g transform="translate(' + x + ',0)"><g class="cam-painel" style="--d:' + d + 's">' +
      '<rect width="96" height="62" rx="9" style="fill:var(--s2);stroke:var(--ouro);stroke-width:1.6"/>' +
      '<rect x="9" y="9" width="34" height="5" rx="2.5" style="fill:var(--ouro)"/>' +
      '<rect x="10" y="' + (52 - h[0]) + '" width="10" height="' + h[0] + '" rx="2" style="fill:var(--azul-lt)"/>' +
      '<rect x="24" y="' + (52 - h[1]) + '" width="10" height="' + h[1] + '" rx="2" style="fill:var(--ouro)"/>' +
      '<rect x="38" y="' + (52 - h[2]) + '" width="10" height="' + h[2] + '" rx="2" style="fill:var(--verm-lt)"/>' +
      '<path d="M56 46L66 36L76 40L87 22" fill="none" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" style="stroke:var(--azul-lt)"/></g></g>';
  };
  var pulso = function (x, d) { return '<ellipse class="cam-pulso" cx="' + x + '" cy="64" rx="34" ry="6" fill="none" stroke-width="2" style="stroke:var(--ouro);--d:' + d + 's"/>'; };
  return '<svg viewBox="0 -96 700 420" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Caminhão da Lube carregando os painéis">' +
    '<defs><linearGradient id="' + u + 'b" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#3BC4F9"/><stop offset="55%" stop-color="' + C + '"/><stop offset="100%" stop-color="#0084C6"/></linearGradient>' +
    '<linearGradient id="' + u + 'c" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#FFFFFF"/><stop offset="70%" stop-color="#F0F3F8"/><stop offset="100%" stop-color="#C9D2E0"/></linearGradient></defs>' +
    // estrada: faixa escura com a pontilhada correndo para trás
    '<rect x="0" y="281" width="700" height="24" rx="8" fill="#0c1530" opacity=".85"/>' +
    '<line class="cam-estrada" x1="0" y1="293" x2="700" y2="293" stroke-width="3" stroke-dasharray="30 22" stroke-linecap="round" style="stroke:var(--ouro)"/>' +
    // painéis caindo (atrás do caminhão)
    '<g transform="translate(0,0)">' + painel(110, 0, [16, 28, 22]) + painel(250, 1.2, [24, 14, 30]) + painel(344, 2.4, [20, 32, 12]) + '</g>' +
    // vento vermelho atrás, como no portal
    '<g class="cam-vento"><line x1="-6" y1="150" x2="40" y2="150" stroke="' + R + '" stroke-width="3" stroke-linecap="round"/><line x1="-20" y1="176" x2="34" y2="176" stroke="' + R + '" stroke-width="3" stroke-linecap="round"/><line x1="-2" y1="202" x2="30" y2="202" stroke="' + R + '" stroke-width="3" stroke-linecap="round"/></g>' +
    '<g transform="translate(25,38)"><g class="cam-corpo">' +
      '<ellipse cx="325" cy="238" rx="300" ry="9" fill="rgba(0,0,0,.35)"/>' +
      '<rect x="18" y="26" width="404" height="158" fill="url(#' + u + 'b)"/><rect x="18" y="26" width="404" height="9" fill="#DCE3EC"/>' +
      '<rect x="18" y="184" width="404" height="22" fill="#14235F"/>' + listras + '<rect x="18" y="26" width="7" height="158" fill="rgba(255,255,255,.25)"/>' +
      '<g transform="translate(48,58) scale(0.58)">' + m(N) + '</g>' +
      '<text x="146" y="122" font-family="Archivo,Segoe UI,sans-serif" font-size="62" font-weight="900" font-style="italic" letter-spacing="-2" fill="' + N + '">Lube</text>' +
      '<rect x="148" y="132" width="186" height="9" fill="' + R + '"/>' +
      '<text x="150" y="162" font-family="Archivo,Segoe UI,sans-serif" font-size="24" font-weight="800" letter-spacing="1" fill="' + N + '">Distribuidora</text>' +
      '<path fill="url(#' + u + 'c)" d="M424 206V60c0-13 11-24 24-24h122c16 0 28 12 28 28v142Z"/>' +
      '<path fill="#0C1633" d="M492 116V72c0-5 4-9 9-9h62c5 0 9 4 9 9v44Z"/><rect x="434" y="66" width="44" height="50" rx="4" fill="#0C1633"/>' +
      '<rect x="424" y="150" width="16" height="30" fill="rgba(0,0,0,.12)"/>' +
      '<g transform="translate(436,146) scale(0.3)">' + m(N) + '</g>' +
      '<text x="472" y="176" font-family="Archivo,Segoe UI,sans-serif" font-size="22" font-weight="900" font-style="italic" fill="' + N + '">Lube</text>' +
      '<rect x="586" y="146" width="14" height="26" rx="3" fill="#FFC24D"/><rect x="424" y="196" width="180" height="18" fill="#232C42"/>' +
      '<rect x="18" y="206" width="406" height="12" fill="#1A2238"/><rect x="252" y="160" width="96" height="46" rx="10" fill="#AEB8C7"/><rect x="252" y="160" width="96" height="8" rx="4" fill="#D6DEE9"/>' +
      rodas +
    '</g></g>' +
    // brilho no topo do baú quando o painel entra
    pulso(110 + 48, 0) + pulso(250 + 48, 1.2) + pulso(344 + 48, 2.4) +
  '</svg>';
}
L.espera = function (texto) {
  var t0 = performance.now();
  var rel = L.h("div", { class: "relogio num", text: "0,0 s" });
  var cena = L.h("div", { class: "cam-cena", html: caminhaoSVG() });
  var el = L.h("div", { class: "espera" }, cena, L.h("div", { class: "espera-txt" }, L.h("div", { text: texto || "Calculando a visão…" }), rel));
  var id = setInterval(function () { if (!el.isConnected) return clearInterval(id); rel.textContent = L.fNum((performance.now() - t0) / 1000, 1) + " s"; }, 100);
  return el;
};
L.erroTela = function (msg, detalhe) {
  return L.h("div", { class: "vazio" }, L.h("b", { text: msg }), detalhe || "", L.h("div", { style: { marginTop: "14px" } }, L.h("button", { class: "btn pri", type: "button", text: "Tentar de novo", onclick: function () { L.emitir("filtros"); } })));
};
L.nota = function (texto) { return L.h("div", { class: "nota-rodape", html: L.ic("info") + "<span>" + L.esc(texto) + "</span>" }); };

/* tag de estado */
L.tag = function (texto, tipo) { return '<span class="tag ' + (tipo || "neutro") + '">' + L.esc(texto) + "</span>"; };

})();
