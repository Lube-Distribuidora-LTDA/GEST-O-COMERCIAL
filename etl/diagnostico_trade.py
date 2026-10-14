#!/usr/bin/env python3
"""
diagnostico_trade.py — confere, SEM GRAVAR NADA, se a Gestão Comercial (Trade) está de pé.

Responde, em uma tela só:
  - o ENV aponta para o DATA WAREHOUSE (e não para outro projeto do Supabase)?
  - o Oracle responde, e a venda de hoje tem linhas?
  - a pasta de fotos (FOTOS_ION) e a planilha de classificação do Trade estão acessíveis?
  - o schema trade existe, qual versão do pacote está no ar, de quando é, e as últimas cargas deram certo?
  - (--pacote) o pacote no banco está íntegro (sha1 de cada arquivo confere)?

    python diagnostico_trade.py
    python diagnostico_trade.py --pacote
"""
from __future__ import annotations

import os
import sys
from datetime import datetime, timezone

import bi_comum as bi

log = bi.configurar_log("diagnostico_trade.log")
bi.definir_schema("trade")

import extrair_trade as et   # noqa: E402
import fotos                 # noqa: E402
import gravar_trade as gt    # noqa: E402

PROBLEMAS: list[str] = []


def ok(msg: str) -> None:
    log.info("  [ok] %s", msg)


def ruim(msg: str) -> None:
    PROBLEMAS.append(msg)
    log.error("  [X]  %s", msg)


def main() -> int:
    com_pacote = "--pacote" in sys.argv
    log.info("=" * 70)
    log.info("DIAGNOSTICO - Gestao Comercial (Trade)  (nao grava nada)")
    log.info("=" * 70)

    # ---- configuracao ----------------------------------------------------
    log.info("1. Configuracao")
    if gt.carregar_env() is None:
        ruim("nenhum ENV encontrado")
    try:
        cfg_ora = bi.OracleConfig.from_env()
        cfg_pg = bi.SupabaseConfig.from_env()
    except SystemExit as exc:
        ruim(str(exc))
        return 1
    try:
        gt.verificar_projeto(cfg_pg)
        ok("o ENV aponta para o projeto DATA WAREHOUSE")
    except SystemExit as exc:
        ruim(str(exc))
        return 1
    sistema = [k for k in os.environ if k.startswith("SUPABASE_") and k not in ("SUPABASE_DB_HOST", "SUPABASE_DB_PORT", "SUPABASE_DB_NAME", "SUPABASE_DB_USER", "SUPABASE_DB_PASSWORD")]
    if sistema:
        ok("variaveis SUPABASE_* do sistema existem (" + ", ".join(sorted(sistema)) + ") e NAO sao usadas por este ETL")

    # ---- Oracle ----------------------------------------------------------
    log.info("2. Oracle (WinThor, so leitura)")
    try:
        with bi.conectar_oracle(cfg_ora) as ora:
            cur = ora.cursor()
            cur.execute("SELECT COUNT(*) FROM pcmov WHERE codoper IN ('S','ED') AND dtcancel IS NULL AND dtmov >= TRUNC(SYSDATE) - 1 AND dtmov < TRUNC(SYSDATE)")
            n = cur.fetchone()[0]
            (ok if n > 0 else ruim)(f"movimentos de venda de ontem: {n:,}".replace(",", "."))
            cur.execute("SELECT COUNT(*) FROM pcprodut WHERE dtexclusao IS NULL AND revenda = 'S'")
            ok(f"produtos de revenda ativos no cadastro: {cur.fetchone()[0]:,}".replace(",", "."))
    except Exception as exc:  # noqa: BLE001
        ruim(f"Oracle nao respondeu: {type(exc).__name__}: {exc}")

    # ---- fotos e planilha -------------------------------------------------
    log.info("3. Fotos e classificacao")
    motivos: list = []
    pasta = fotos.localizar_pasta(relatorio=motivos)
    if pasta is None:
        ruim("pasta de fotos FOTOS_ION nao acessivel: " + "; ".join(f"{c} -> {m}" for c, m in motivos))
    else:
        mapa, est = fotos.indexar(pasta)
        ok(f"fotos: {pasta} - {est['produtos']:,} produtos com foto, {est['repetidos']} codigos com mais de um arquivo".replace(",", "."))
    cred = os.path.join(os.path.dirname(os.path.abspath(__file__)), "fotos.cred")
    if os.path.isfile(cred):
        ok("credencial das fotos (fotos.cred) presente: a tarefa agendada consegue abrir o compartilhamento")
    else:
        log.info("  [--] sem fotos.cred: a tarefa agendada nao acessa a pasta de fotos (o passo imagens fica em AVISO); ver LEIA-ME")
    import miniaturas as mi
    (ok if mi.disponivel() else log.info)("Pillow presente: a carga gera as miniaturas das fotos" if mi.disponivel()
                                          else "  [--] sem Pillow: as miniaturas das fotos nao sao atualizadas (python -m pip install pillow)")
    plan = et.achar_planilha_classificacao()
    if plan is None:
        ruim("planilha de classificacao do Trade nao encontrada (a carga usa a copia que ja esta no banco)")
    else:
        ok(f"planilha do Trade: {plan} (editada em {datetime.fromtimestamp(plan.stat().st_mtime):%Y-%m-%d})")

    # ---- banco -------------------------------------------------------------
    log.info("4. Banco (DATA WAREHOUSE, schema trade)")
    try:
        with bi.conectar_supabase(cfg_pg) as pg:
            with pg.cursor() as cur:
                cur.execute("SELECT to_regclass('trade.pacote_versao') IS NOT NULL")
                existe = cur.fetchone()[0]
            pg.rollback()
            if not existe:
                ruim("o schema trade nao existe (rode web/db/01-schema.sql)")
                return 1
            ok("schema trade existe")
            c = gt.contagens(pg)
            for k in ("classificacao_produto", "produto_imagem", "produto_miniatura", "historico_indicador", "fato_estoque_produto", "fato_entrada_mes",
                      "fato_cc_fornecedor", "fato_cc_lancamento"):
                (ok if c[k] > 0 else ruim)(f"{k}: {c[k]:,} linhas".replace(",", "."))
            v = gt.versao_no_ar(pg)
            if not v:
                ruim("nao ha pacote no ar (rode sync_trade.py)")
            else:
                idade_h = (datetime.now(timezone.utc) - v["gerado_em"] if v["gerado_em"].tzinfo else datetime.now() - v["gerado_em"]).total_seconds() / 3600
                msg = f"pacote no ar: {v['versao']} (gerado {v['gerado_em'].astimezone():%Y-%m-%d %H:%M}, ha {idade_h:.1f} h), {v['meta'].get('linhas_venda', 0):,} linhas de venda".replace(",", ".")
                (ok if idade_h < 30 else ruim)(msg + ("" if idade_h < 30 else " - MAIS DE 30 HORAS: a carga agendada parou?"))
                ok(f"pacote guardado: {c['pacote_bytes'] / 1e6:.1f} MB (versao no ar + a anterior de reserva)")
                if com_pacote:
                    import gzip, hashlib
                    for nome, info in v["arquivos"].items():
                        blob = gt.ler_arquivo_do_pacote(pg, v["versao"], nome)
                        bom = hashlib.sha1(blob).hexdigest() == info["sha1"] and len(blob) == info["bytes"]
                        if bom and not nome.endswith(".gz"):
                            gzip.decompress(blob)
                        (ok if bom else ruim)(f"pacote/{nome}: {info['partes']} parte(s), {info['bytes'] / 1e6:.1f} MB - " + ("integro" if bom else "CORROMPIDO"))
            with pg.cursor() as cur:
                cur.execute("SELECT consulta, status, linhas, segundos, executado_em, left(coalesce(mensagem,''), 80) FROM trade.controle_carga ORDER BY id DESC LIMIT 8")
                ult = cur.fetchall()
            pg.rollback()
            log.info("   ultimas linhas de trade.controle_carga (a prova de que a carga entrou):")
            for consulta, status, linhas, seg, quando, msg in reversed(ult):
                log.info("     %s  %-14s %-6s %10s linhas  %6.1fs  %s", quando.astimezone().strftime("%d/%m %H:%M"), consulta, status,
                         "-" if linhas is None else f"{linhas:,}".replace(",", "."), float(seg or 0), msg)
            if any(u[1] == "ERRO" for u in ult[:8]):
                ruim("ha passo com ERRO entre os ultimos registros do controle_carga")
    except Exception as exc:  # noqa: BLE001
        ruim(f"Supabase nao respondeu: {type(exc).__name__}: {exc}")

    log.info("=" * 70)
    if PROBLEMAS:
        log.error("%d PROBLEMA(S):", len(PROBLEMAS))
        for p in PROBLEMAS:
            log.error("  - %s", p)
        return 1
    log.info("TUDO CERTO.")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception:
        log.exception("Erro inesperado no diagnostico.")
        sys.exit(1)
