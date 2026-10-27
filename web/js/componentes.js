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

/* cartão "Hoje até agora" (a venda de hoje do AGENTE LUBE): hoje contra o mesmo dia da semana passada até a mesma
   hora — a forma justa de comparar um dia que ainda não acabou (decisão do Júlio, 2026-10-27). h = pedido "hoje". */
L.cartaoHoje = function (h) {
  var SEM = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];
  var fBR0 = function (v) { return L.fBRL(v, 0); };
  var diaDe = function (s) { return new Date(s + "T12:00:00"); };
  var lido = L.HOJE && L.HOJE.mudou_em ? new Date(L.HOJE.mudou_em).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : "";
  var leg = L.h("div", { style: { display: "flex", flexDirection: "column", gap: "6px" } },
    L.h("span", { text: L.fInt(h.pos) + (h.pos === 1 ? " cliente" : " clientes") + " · venda lida do WinThor às " + lido }));
  if (h.semana) {
    var linha = L.h("div", { class: "cmp-linha" });
    linha.appendChild(L.delta({ atual: h.hoje_hora, base: h.semana.ate_hora }));
    linha.appendChild(L.h("small", { text: "vs " + SEM[diaDe(h.semana.dia).getDay()] + " passada (" + L.fData(h.semana.dia).slice(0, 5) + ") até as " +
      h.hora + "h59: " + fBR0(h.semana.ate_hora) + " · o dia inteiro: " + fBR0(h.semana.dia_inteiro) }));
    leg.appendChild(linha);
  } else if (h.so_rca) {
    leg.appendChild(L.h("small", { text: "A comparação com a semana passada sai só com filtros de RCA, equipe e estado (a venda por hora não tem cliente nem produto)." }));
  }
  return L.kpis(L.kpi({ icone: "relogio", rot: "Hoje até agora · " + SEM[diaDe(h.dia).getDay()] + ", " + L.fData(h.dia).slice(0, 5), valor: h.venda, fmt: fBR0,
    classe: "heroi", leg: leg, ajuda: "Venda líquida de hoje, lida do WinThor pelo agente de 30 em 30 segundos. Ela já entra nos totais das telas; as porcentagens contra o ano e o período anterior usam só os dias fechados." }));
};

/* esperas: o caminhão da Lube (a mesma foto do Painel Corporativo, assets/caminhao-lube.webp do portal) correndo na estrada,
   com painéis caindo no baú. Os painéis ficam ATRÁS da foto no desenho, então ao descer eles somem para dentro do baú. */
function caminhaoSVG() {
  var R = "#EE1B24";
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
  var pulso = function (x, d) { return '<ellipse class="cam-pulso" cx="' + x + '" cy="41" rx="34" ry="6" fill="none" stroke-width="2" style="stroke:var(--ouro);--d:' + d + 's"/>'; };
  return '<svg viewBox="0 -96 700 420" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Caminhão da Lube carregando os painéis">' +
    // estrada: faixa escura com a pontilhada correndo para trás
    '<rect x="0" y="281" width="700" height="24" rx="8" fill="#0c1530" opacity=".85"/>' +
    '<line class="cam-estrada" x1="0" y1="293" x2="700" y2="293" stroke-width="3" stroke-dasharray="30 22" stroke-linecap="round" style="stroke:var(--ouro)"/>' +
    // painéis caindo (atrás do caminhão)
    painel(110, 0, [16, 28, 22]) + painel(250, 1.2, [24, 14, 30]) + painel(344, 2.4, [20, 32, 12]) +
    // vento vermelho atrás, como no portal
    '<g class="cam-vento"><line x1="-6" y1="120" x2="40" y2="120" stroke="' + R + '" stroke-width="3" stroke-linecap="round"/><line x1="-20" y1="168" x2="34" y2="168" stroke="' + R + '" stroke-width="3" stroke-linecap="round"/><line x1="-2" y1="216" x2="30" y2="216" stroke="' + R + '" stroke-width="3" stroke-linecap="round"/></g>' +
    '<ellipse cx="350" cy="286" rx="290" ry="7" fill="rgba(0,0,0,.4)"/>' +
    // a foto do portal: 1200 x 486, exibida em 600 x 243 (rodas apoiadas na estrada)
    '<g class="cam-corpo"><image href="caminhao-lube.webp" x="50" y="41" width="600" height="243" preserveAspectRatio="xMidYMid meet"/></g>' +
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
