#!/usr/bin/env python3
"""
sync_trade.py — orquestrador da Gestão Comercial (Trade).

Lê o WinThor (Oracle, SÓ LEITURA), a planilha de classificação do Trade e a pasta de fotos
(FOTOS_ION) e grava no Supabase (projeto DATA WAREHOUSE, schema `trade`) tudo o que o painel precisa:

    1. classificacao  planilha do Trade  -> trade.classificacao_produto   (se a planilha não está acessível, usa a do banco)
    2. imagens        pasta FOTOS_ION     -> trade.produto_imagem           (se a pasta não está acessível, usa a do banco)
    3. venda          Oracle (PCMOV)      -> na memória (2,9 milhões de linhas)
    4. oracle         estoque, entradas, conta corrente e cadastros          -> na memória
    5. pacote         monta o pacote, CONFERE contra o que está no ar e só então segue
    6. historico      foto de hoje da ruptura -> trade.historico_indicador
    7. bases          estoque / entradas / conta corrente -> trade.fato_*
    8. publicar       grava o pacote do painel e troca a versão no ar (trade.pacote, trade.pacote_versao)
    9. miniaturas     fotos reduzidas (WebP 288 px) -> trade.produto_miniatura: é o que o painel da Vercel mostra
                      (só o que mudou; com limite de tempo, para a tarefa agendada nunca estourar)

Cada passo registra uma linha em trade.controle_carga: é essa tabela, e não o log na tela, que responde
"a carga entrou?". Se um passo falhar, o painel continua com a versão anterior (nunca fica pela metade).

Como usar
---------
    python sync_trade.py                 # carga completa
    python sync_trade.py --usar-cache    # reaproveita a venda extraída antes (só para teste; não vale para o agendamento)
    python sync_trade.py --arquivos      # além do banco, grava a cópia em ../web/dados (fallback do servidor local)
    python sync_trade.py --sem-gravar    # roda tudo, confere e NÃO grava nada no banco (teste)
    python sync_trade.py --listar        # mostra os passos e sai
    python sync_trade.py --so-miniaturas --minutos-miniaturas 0   # só as fotos, sem Oracle e sem limite de tempo (1ª carga, à mão)

Agendamento (ver 3 - INSTALACAO\\instalar_e_agendar.ps1): a carga inteira só às 06:25 desde 2026-10-27 (o estoque, a
conta corrente e as entradas do dia vêm do AGENTE LUBE, ao vivo) e a tarefa "Trade - Fotos" (--so-miniaturas) de 5 em
5 min, com tranca própria. É a tranca do banco que impede duas máquinas de carregarem ao mesmo tempo.
"""
from __future__ import annotations

import argparse
import contextlib
import os
import sys
import time
from datetime import date
from pathlib import Path

import bi_comum as bi

log = bi.configurar_log("sync_trade.log")
bi.definir_schema("trade")          # o controle_carga e a tranca são deste sistema

import extrair_trade as et          # noqa: E402  (precisa vir depois do logging configurado)
import fotos                        # noqa: E402
import gravar_trade as gt           # noqa: E402

PASSOS = (
    ("classificacao", "planilha do Trade -> trade.classificacao_produto"),
    ("imagens", "pasta FOTOS_ION -> trade.produto_imagem"),
    ("venda", "Oracle: venda mensal por RCA x cliente x produto"),
    ("oracle", "Oracle: estoque, entradas, conta corrente e cadastros"),
    ("pacote", "monta o pacote e confere contra a versão no ar"),
    ("historico", "foto de hoje da ruptura -> trade.historico_indicador"),
    ("bases", "estoque, entradas e conta corrente -> trade.fato_*"),
    ("publicar", "grava o pacote do painel e troca a versão no ar"),
    ("miniaturas", "fotos em miniatura -> trade.produto_miniatura (o que a Vercel mostra)"),
)

# Conferência antes de publicar: uma carga que vem muito menor que a no ar é quase sempre defeito da
# origem (Oracle devolvendo pela metade, filial fora do filtro), e publicar isso apagaria o painel.
PISO_VENDA = 0.90       # linhas de venda >= 90% da versão no ar
PISO_ESTOQUE = 0.50     # produtos na base de estoque >= 50% da versão no ar


def _argumentos() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Sincroniza a Gestão Comercial (Oracle/WinThor -> Supabase).")
    p.add_argument("--usar-cache", action="store_true", help="Reaproveita a venda do cache local (teste).")
    p.add_argument("--guardar-cache", action="store_true", help="Guarda a venda extraída no cache local (~130 MB).")
    p.add_argument("--arquivos", action="store_true", help="Também grava o pacote em ../web/dados.")
    p.add_argument("--sem-gravar", action="store_true", help="Roda e confere, mas não grava nada no banco.")
    p.add_argument("--listar", action="store_true", help="Mostra os passos e sai.")
    p.add_argument("--so-miniaturas", action="store_true", help="Só indexa as fotos e gera as miniaturas (sem Oracle, sem pacote).")
    p.add_argument("--sem-miniaturas", action="store_true", help="Não gera miniaturas nesta carga.")
    p.add_argument("--minutos-miniaturas", type=float, default=10.0, help="Limite de tempo do passo das miniaturas, em minutos (0 = sem limite).")
    return p.parse_args()


def _fmt(n) -> str:
    return "-" if n is None else f"{n:,}".replace(",", ".")


def _quem() -> str:
    """Máquina e conta que estão rodando esta carga: no controle_carga, responde "onde isto rodou e com quem"."""
    import socket
    return f"máquina {socket.gethostname()}, conta {os.environ.get('USERDOMAIN', '?')}\\{os.environ.get('USERNAME', '?')}"


def main() -> int:
    args = _argumentos()
    if args.listar:
        print()
        for i, (nome, desc) in enumerate(PASSOS, 1):
            print(f"{i}. {nome:14s} {desc}")
        print()
        return 0

    gt.carregar_env()
    try:
        cfg_ora = bi.OracleConfig.from_env()
        cfg_pg = bi.SupabaseConfig.from_env()
        gt.verificar_projeto(cfg_pg)
    except SystemExit as exc:
        log.error("Configuração inválida: %s", exc)
        return 1
    log.info("Senha do Supabase carregada do ENV (comprimento: %d caracteres).", len(cfg_pg.password))
    if args.sem_gravar:
        log.warning("MODO --sem-gravar: nada vai ser escrito no banco.")

    resultados: list[tuple[str, str, int | None, float, str]] = []
    # Só as fotos (a tarefa "Trade - Fotos", de 5 em 5 min desde 2026-10-27): o controle_carga leva "fotos_imagens" e
    # "fotos_miniaturas", para o Guardião, que confere a carga grande pelos nomes "imagens" e "miniaturas", não tomar
    # a rodada das fotos por uma carga pela metade.
    prefixo = "fotos_" if args.so_miniaturas else ""

    def passo(conn_pg, nome: str, destino: str | None, fn, esperadas: int | None = None):
        """Roda um passo, cronometra, registra em controle_carga. Devolve (ok, valor)."""
        relogio = bi.cronometro()
        log.info("=" * 70)
        log.info("[%s] %s", nome, dict(PASSOS)[nome])
        try:
            linhas, aviso, valor = fn()
            seg = relogio()
            status = "AVISO" if aviso else "OK"
            log.info("  %s — %s linhas em %.1fs%s", status, _fmt(linhas), seg, f" — {aviso}" if aviso else "")
            resultados.append((nome, status, linhas, seg, aviso or ""))
            if not args.sem_gravar:
                gt.registrar(conn_pg, prefixo + nome, destino, status, linhas, seg, aviso, esperadas)
            return True, valor
        except Exception as exc:  # noqa: BLE001 — um passo que falha não pode deixar o banco pela metade
            try:
                conn_pg.rollback()
            except Exception:  # noqa: BLE001
                pass
            seg = relogio()
            log.exception("  FALHOU: %s", nome)
            resultados.append((nome, "ERRO", None, seg, f"{type(exc).__name__}: {exc}"))
            if not args.sem_gravar:
                gt.registrar(conn_pg, prefixo + nome, destino, "ERRO", None, seg, f"{type(exc).__name__}: {exc}", esperadas)
            return False, None

    try:
        so_fotos = args.so_miniaturas
        ora_ctx = contextlib.nullcontext() if so_fotos else bi.conectar_oracle(cfg_ora)       # só as fotos não precisa do Oracle
        # As fotos têm tranca própria: a rodada de 5 em 5 min nunca pode fazer a carga grande ser pulada. As duas mexem
        # em produto_imagem e produto_miniatura, mas só pela diferença e com upsert: rodar junto não estraga nada.
        with ora_ctx as conn_ora, bi.conectar_supabase(cfg_pg) as pg, bi.tranca_de_carga(pg, "fotos" if so_fotos else "carga"):
            no_ar = gt.versao_no_ar(pg)
            meta_no_ar = (no_ar or {}).get("meta") or {}
            classif = fonte_classif = cru = ora = pacote = None
            ok_v = ok_o = False

            # ---- 1. classificação ------------------------------------------------
            def f_classif():
                motivos: list = []
                arq = et.achar_planilha_classificacao(relatorio=motivos)
                do_banco = gt.classificacao_do_banco(pg)
                if arq is None:
                    return len(do_banco), (f"planilha do Trade fora do ar ({'; '.join(f'{c}: {m}' for c, m in motivos)}; {_quem()}): "
                                           "usei a classificação que já estava no banco"), (do_banco, "banco")
                try:
                    novo = et.ler_classificacao()
                except Exception as exc:  # noqa: BLE001 — planilha visível mas ilegível (permissão, aberta e travada por alguém)
                    return len(do_banco), f"não consegui ler a planilha do Trade ({type(exc).__name__}: {exc}): usei a classificação que já estava no banco", (do_banco, "banco")
                if not novo or (do_banco and len(novo) < 0.5 * len(do_banco)):
                    return len(do_banco), f"planilha veio com {len(novo)} produtos (no banco: {len(do_banco)}): mantive a do banco", (do_banco, "banco")
                if not args.sem_gravar:
                    gt.gravar_classificacao(pg, novo, f"planilha {arq.name}")
                return len(novo), None, (novo, f"planilha {arq.name}")
            ok, val = passo(pg, "classificacao", f"{gt.SCHEMA}.classificacao_produto", f_classif) if not so_fotos else (False, None)
            classif, fonte_classif = val if ok else (None, None)

            # ---- 2. imagens ---------------------------------------------------------
            def f_imagens():
                motivos: list = []
                pasta = fotos.localizar_pasta(relatorio=motivos)
                do_banco = gt.imagens_do_banco(pg)
                if pasta is None:
                    return len(do_banco), (f"pasta FOTOS_ION fora do ar ({'; '.join(f'{c}: {m}' for c, m in motivos)}; {_quem()}): "
                                           "usei o mapa de fotos que já estava no banco"), (do_banco, "banco")
                try:
                    mapa, est = fotos.indexar(pasta)
                except Exception as exc:  # noqa: BLE001 — pasta visível mas ilegível (permissão da conta da tarefa, rede caiu no meio)
                    return len(do_banco), f"não consegui ler a pasta FOTOS_ION ({type(exc).__name__}: {exc}): usei o mapa que já estava no banco", (do_banco, "banco")
                log.info("  %s: %s fotos de produtos, %s códigos com mais de um arquivo, %s entradas ignoradas",
                         pasta, _fmt(est["produtos"]), est["repetidos"], est["ignoradas"])
                if do_banco and len(mapa) < 0.5 * len(do_banco):
                    return len(do_banco), f"a pasta listou só {len(mapa)} fotos (no banco: {len(do_banco)}): mantive o mapa do banco", (do_banco, "banco")
                if not args.sem_gravar:
                    n = gt.gravar_imagens(pg, mapa, do_banco)
                    log.info("  %s foto(s) nova(s), trocada(s) ou que saíram da pasta", _fmt(n))
                return len(mapa), None, (mapa, str(pasta))
            ok, val = passo(pg, "imagens", f"{gt.SCHEMA}.produto_imagem", f_imagens)
            imagens, fonte_imagens = val if ok else (None, None)

            # ---- 3. venda ---------------------------------------------------------------
            def f_venda():
                if args.usar_cache and et.CACHE.is_file():
                    cru = et.ler_cache()
                else:
                    cru = et.extrair_venda(conn_ora)
                    if args.guardar_cache:
                        et.salvar_cache(cru)
                return len(cru["m"]), None, cru
            ok_v, cru = passo(pg, "venda", None, f_venda, meta_no_ar.get("linhas_venda")) if not so_fotos else (False, None)

            # ---- 4. Oracle (resto) ------------------------------------------------------
            ok_o, ora = passo(pg, "oracle", None, lambda: (None, None, et.ler_oracle(conn_ora))) if ok_v else (False, None)

            # ---- 5. pacote (monta e confere) ---------------------------------------------
            if ok_v and ok_o and classif is not None and imagens is not None:
                def f_pacote():
                    p = et.construir(cru, ora, classif, imagens, ref=date.today(),
                                     fontes={"classificacao": fonte_classif, "fotos": fonte_imagens, "modo": "banco", "executou": _quem()})
                    # conferência contra a versão no ar
                    prob = []
                    ant = (meta_no_ar.get("linhas_venda") or 0)
                    if ant and p.n_venda < PISO_VENDA * ant:
                        prob.append(f"venda veio com {_fmt(p.n_venda)} linhas e a versão no ar tem {_fmt(ant)} (< {int(PISO_VENDA * 100)}%)")
                    ant_e = (meta_no_ar.get("contagens") or {}).get("estoque") or 0
                    if ant_e and len(p.est_out) < PISO_ESTOQUE * ant_e:
                        prob.append(f"estoque veio com {_fmt(len(p.est_out))} produtos e a versão no ar tem {_fmt(ant_e)}")
                    if not p.est_out or not p.n_venda:
                        prob.append("pacote vazio")
                    if prob:
                        raise RuntimeError("conferência reprovou, a versão no ar foi mantida: " + "; ".join(prob))
                    return p.n_venda, None, p
                ok_p, pacote = passo(pg, "pacote", None, f_pacote, meta_no_ar.get("linhas_venda"))
            elif not so_fotos:
                log.warning("Pulei o pacote: falta algum passo anterior.")
                resultados.append(("pacote", "PULADO", None, 0.0, "passo anterior falhou"))

            # ---- 6, 7, 8. gravar ----------------------------------------------------------
            if pacote is not None and not args.sem_gravar:
                ok_h, hist = passo(pg, "historico", f"{gt.SCHEMA}.historico_indicador",
                                   lambda: (gt.gravar_historico(pg, pacote.hist_hoje), None, gt.historico_do_banco(pg)))
                if ok_h:
                    ok_b, _ = passo(pg, "bases", f"{gt.SCHEMA}.fato_*", lambda: (lambda c: (sum(c.values()), None, c))(gt.gravar_bases(pg, pacote)))
                    def f_publicar():
                        blobs = et.serializar(pacote, et.historico_json(hist))
                        if args.arquivos:
                            et.gravar_arquivos(blobs)
                            log.info("  cópia local gravada em %s", et.SAIDA)
                        res = gt.gravar_pacote(pg, blobs, pacote.meta | {"bytes": {k: len(v) for k, v in blobs.items()}})
                        return len(blobs), None, res
                    ok_pub, pub = passo(pg, "publicar", f"{gt.SCHEMA}.pacote", f_publicar)
                    if ok_pub:
                        log.info("Versão no ar: %s (%d arquivo(s) gravado(s), %d reaproveitado(s) da versão anterior)",
                                 pub["versao"], len(pub["gravados"]), len(pub["reaproveitados"]))
            elif pacote is not None:
                log.info("--sem-gravar: pacote montado e conferido (%s linhas de venda, %s produtos em estoque); nada foi gravado.",
                         _fmt(pacote.n_venda), _fmt(len(pacote.est_out)))

            # ---- 9. miniaturas (por último: nada do que o painel mostra espera por fotos) -----------------
            if not args.sem_miniaturas and imagens is not None:
                def f_miniaturas():
                    import miniaturas as mi
                    if fonte_imagens == "banco":
                        return 0, "pasta de fotos fora do ar: miniaturas não atualizadas (valem as que já estão no banco)", None
                    if not mi.disponivel():
                        return 0, "falta o Pillow (python -m pip install pillow): miniaturas não atualizadas", None
                    pend = mi.pendentes(imagens, gt.miniaturas_do_banco(pg))
                    log.info("  %s foto(s) com miniatura nova ou desatualizada, de %s", _fmt(len(pend)), _fmt(len(imagens)))
                    if args.sem_gravar:
                        return len(pend), None, None
                    limite = None if args.minutos_miniaturas <= 0 else args.minutos_miniaturas * 60
                    r = mi.processar(Path(fonte_imagens), imagens, pend, lambda linhas: gt.gravar_miniaturas(pg, linhas), limite)
                    removidas = gt.apagar_miniaturas_sem_foto(pg, list(imagens))
                    avisos = []
                    if r["restantes"]:
                        avisos.append(f"faltam {_fmt(r['restantes'])} miniaturas (acabou o tempo; entram nas próximas cargas)")
                    if r["falhas"]:
                        avisos.append(f"{r['falhas']} foto(s) não puderam ser reduzidas, ex.: " + " | ".join(r["exemplos"][:3]))
                    if removidas:
                        log.info("  %s miniatura(s) de produto sem foto removida(s)", removidas)
                    return r["feitas"], "; ".join(avisos) or None, r
                passo(pg, "miniaturas", f"{gt.SCHEMA}.produto_miniatura", f_miniaturas)

            _resumo(resultados)

    except bi.CargaJaRodando as aviso:
        # Não é erro: é a tranca fazendo o trabalho dela.
        log.warning("%s", aviso)
        if not args.sem_gravar:
            _registrar_pulada(cfg_pg, "fotos" if args.so_miniaturas else "carga")
        return 0
    except Exception:
        log.exception("Não consegui nem abrir as conexões — nada foi carregado.")
        return 1

    falhas = [r for r in resultados if r[1] in ("ERRO", "PULADO")]
    if falhas:
        log.error("%d passo(s) com problema: %s", len(falhas), ", ".join(r[0] for r in falhas))
        return 1
    log.info("Todos os passos foram concluídos.")
    return 0


def _registrar_pulada(cfg_pg, grupo: str = "carga") -> None:
    """A carga foi pulada porque outra já estava rodando. Isso não deixava rastro nenhum no banco (em 2026-10-16 a das
    12:25 simplesmente não apareceu, e ninguém soube dizer por quê): agora vira uma linha AVISO no controle_carga,
    com a máquina e a conta. Registrar o aviso nunca derruba nada."""
    try:
        with bi.conectar_supabase(cfg_pg) as pg:
            gt.registrar(pg, grupo, None, "AVISO", 0, 0.0, f"{grupo} pulada: já havia outra rodando ({_quem()})")
    except Exception:  # noqa: BLE001
        log.warning("Não consegui registrar no banco que a carga foi pulada.")


def _resumo(resultados) -> None:
    log.info("=" * 70)
    log.info("RESUMO DA CARGA")
    log.info("%-14s %-7s %12s %9s  %s", "PASSO", "STATUS", "LINHAS", "TEMPO", "OBS")
    for nome, status, linhas, seg, obs in resultados:
        log.info("%-14s %-7s %12s %8.1fs  %s", nome, status, _fmt(linhas), seg, obs[:90])
    log.info("=" * 70)


if __name__ == "__main__":
    try:
        codigo = main()
    except Exception:
        log.exception("Erro inesperado — veja o traceback acima / no sync_trade.log.")
        codigo = 1
    sys.exit(codigo)
