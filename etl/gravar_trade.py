#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
TRADE — leitura e gravação do schema `trade` no DATA WAREHOUSE (Supabase).

O que mora lá (ver web/db/01-schema.sql):
  • ENTRADAS do ETL, que sobrevivem de uma carga para a outra: classificacao_produto (a planilha do
    Trade), produto_imagem (a pasta FOTOS_ION) e historico_indicador (a foto diária da ruptura);
  • SAÍDAS: bases pequenas (estoque, entradas, conta corrente) e o PACOTE do painel — o arquivo de
    venda colunar e os JSONs, comprimidos e guardados em pedaços na tabela `pacote`.

Regra do pacote: grava o que mudou da versão nova, PEDAÇO POR PEDAÇO, sem que ninguém a enxergue; só no
fim troca o ponteiro `pacote_versao` numa transação curta. Quem está lendo a versão antiga continua
lendo; quem abre depois lê a nova. A versão anterior é mantida de reserva.

Arquivo que não mudou desde a versão no ar (mesmo sha1) não é gravado de novo: a versão nova aponta para os
pedaços que já estão no banco (`versao_dados` em `pacote_versao.arquivos`). O venda.bin.gz (~25 MB) quase
nunca muda de uma carga para a outra no mesmo dia, e era ele que fazia o `publicar` levar minutos (e
estourar o limite de tempo do banco, em 2026-10-16).
"""
from __future__ import annotations

import gzip
import hashlib
import json
import logging
import time
from datetime import date, datetime, timezone

import psycopg2
import psycopg2.extras

from extrair_trade import DATA_INICIAL

log = logging.getLogger("bi")

SCHEMA = "trade"
REF_DW = "ivcnotrynogaljrvvyes"            # projeto DATA WAREHOUSE do Supabase
TAM_PARTE = 4 * 1024 * 1024                # pedaço do pacote: 4 MB

# Gravações grandes (bases, pacote): a conexão padrão corta cada comando aos 120 s (bi_comum), e o banco do Supabase
# às vezes engasga por minutos. Aqui o limite é folgado por transação (SET LOCAL, só vale nela) e cada gravação
# tem até 3 tentativas, com pausa. Cada tentativa é uma transação inteira: o que falhou é desfeito, nunca fica pela metade.
LIMITE_GRAVACAO = "900s"
TENTATIVAS_GRAVACAO = 3
PAUSAS_GRAVACAO = (5, 20)                  # segundos antes da 2ª e da 3ª tentativa
ESTATISTICA = {"repeticoes": 0}            # quantas gravações precisaram ser repetidas nesta carga


# ---------------------------------------------------------------------------
# Configuração
# ---------------------------------------------------------------------------
def carregar_env() -> str | None:
    """Acha o ENV e o carrega MANDANDO sobre variável de ambiente do sistema.

    O `load_dotenv` padrão não sobrescreve variável que já exista no Windows. Já houve máquina com
    SUPABASE_* de OUTRO projeto no ambiente, e a carga foi parar lá sem erro nenhum. Aqui o ENV vence;
    e o gravar_trade ainda confere o ref do projeto antes de escrever.
    """
    import os
    import sys
    from dotenv import load_dotenv
    pasta = os.path.dirname(os.path.abspath(sys.argv[0]))
    comum = os.path.dirname(pasta)
    candidatos = []
    if os.environ.get("LUBE_ENV"):
        candidatos.append(os.environ["LUBE_ENV"])
    for d in (pasta, comum, os.path.join(comum, "1 - CONFIGURACAO")):
        for nome in ("ENV", ".env", "env"):
            candidatos.append(os.path.join(d, nome))
    for c in candidatos:
        if os.path.isfile(c):
            load_dotenv(c, override=True)
            log.info("Configuração carregada de %s", c)
            return c
    log.warning("Nenhum ENV encontrado (procurei em %s) — só variáveis de ambiente.", ", ".join(candidatos[-3:]))
    return None


# ---------------------------------------------------------------------------
# Segurança: só grava no projeto certo
# ---------------------------------------------------------------------------
def verificar_projeto(cfg) -> None:
    """Aborta se a conexão não for do DATA WAREHOUSE.

    Já aconteceu de variável de ambiente do SISTEMA apontar para outro projeto do Supabase e o ETL
    gravar lá sem ninguém notar. O usuário do pooler é `postgres.<ref do projeto>`: conferir o ref
    custa nada e evita carga no banco errado.
    """
    if REF_DW not in (cfg.user or "") and REF_DW not in (cfg.host or ""):
        raise SystemExit(
            "O ENV aponta para outro projeto do Supabase (esperado o DATA WAREHOUSE, ref terminado em "
            f"...{REF_DW[-6:]}). Nada foi gravado. Confira SUPABASE_DB_USER no ENV e as variáveis de ambiente do sistema."
        )


def registrar(conn, consulta: str, destino: str | None, status: str, linhas: int | None, segundos: float,
              mensagem: str | None = None, esperadas: int | None = None) -> None:
    """Uma linha em trade.controle_carga: é ela, e não o log na tela, que responde "a carga entrou?"."""
    try:
        with conn.cursor() as cur:
            cur.execute(
                f"INSERT INTO {SCHEMA}.controle_carga (consulta, tabela_destino, status, linhas, linhas_esperadas, segundos, mensagem, executado_em) "
                "VALUES (%s,%s,%s,%s,%s,%s,%s,%s)",
                (consulta, destino, status, linhas, esperadas, round(segundos, 1), (mensagem or "")[:2000], datetime.now(timezone.utc)))
        conn.commit()
    except psycopg2.Error:
        conn.rollback()
        log.warning("Não consegui gravar o controle de carga de %s.", consulta)


def _tentar(conn, o_que: str, fn, tentativas: int = TENTATIVAS_GRAVACAO, limite: str = LIMITE_GRAVACAO):
    """Roda `fn(cur)` numa transação com limite de tempo folgado e confirma; se o banco cortar por tempo ou engasgar,
    desfaz e repete (até `tentativas`, com pausa). Devolve o que `fn` devolver.

    Só repete erro do tipo "o banco demorou / cortou" (OperationalError, que inclui QueryCanceled). Se a conexão caiu,
    ou se o erro é outro (dado inválido, tabela faltando), o erro sobe na hora: repetir não adianta e o passo vira ERRO,
    com a versão no ar intacta. `fn` tem que poder ser refeita do zero: a transação anterior foi desfeita.
    """
    for n in range(1, tentativas + 1):
        try:
            with conn.cursor() as cur:
                cur.execute(f"SET LOCAL statement_timeout = '{limite}'")
                resultado = fn(cur)
            conn.commit()
            return resultado
        except (psycopg2.OperationalError, psycopg2.InterfaceError) as exc:
            try:
                conn.rollback()
            except Exception:  # noqa: BLE001 — conexão morta: o rollback também falha
                pass
            if conn.closed or n >= tentativas:
                raise
            pausa = PAUSAS_GRAVACAO[min(n - 1, len(PAUSAS_GRAVACAO) - 1)]
            ESTATISTICA["repeticoes"] += 1
            log.warning("  %s: o banco demorou ou cortou (%s); tentativa %d de %d, repito em %d s",
                        o_que, type(exc).__name__, n, tentativas, pausa)
            time.sleep(pausa)
        except Exception:
            try:
                conn.rollback()
            except Exception:  # noqa: BLE001
                pass
            raise


# ---------------------------------------------------------------------------
# Classificação do Trade (planilha -> tabela)
# ---------------------------------------------------------------------------
def classificacao_do_banco(conn) -> dict:
    """Mesmo formato que extrair_trade.ler_classificacao(): codprod -> (depto, categoria, subcategoria, marca, promo 0/1)."""
    with conn.cursor() as cur:
        cur.execute(f"SELECT codprod, departamento, categoria, subcategoria, marca, promocional FROM {SCHEMA}.classificacao_produto")
        out = {int(c): (d or "", cat or "", sub or "", m or "", 1 if p else 0) for c, d, cat, sub, m, p in cur.fetchall()}
    conn.rollback()
    return out


def gravar_classificacao(conn, classif: dict, fonte: str) -> int:
    """Troca a tabela inteira pelo que a planilha tem hoje (TRUNCATE + INSERT numa transação só)."""
    linhas = [(int(c), v[0] or None, v[1] or None, v[2] or None, v[3] or None, bool(v[4]), fonte) for c, v in classif.items()]
    with conn.cursor() as cur:
        cur.execute(f"TRUNCATE {SCHEMA}.classificacao_produto")
        psycopg2.extras.execute_values(
            cur, f"INSERT INTO {SCHEMA}.classificacao_produto (codprod, departamento, categoria, subcategoria, marca, promocional, fonte) VALUES %s",
            linhas, page_size=5000)
    conn.commit()
    return len(linhas)


# ---------------------------------------------------------------------------
# Fotos (pasta FOTOS_ION -> tabela)
# ---------------------------------------------------------------------------
def imagens_do_banco(conn) -> dict:
    with conn.cursor() as cur:
        cur.execute(f"SELECT codprod, arquivo, bytes, modificado_em FROM {SCHEMA}.produto_imagem")
        out = {int(c): {"arquivo": a, "bytes": b, "modificado": m.isoformat() if m else None} for c, a, b, m in cur.fetchall()}
    conn.rollback()
    return out


def _assinatura_foto(v: dict) -> tuple:
    """(arquivo, bytes, segundo da modificação): o que diz se a foto mudou. A data vem do banco com o fuso da sessão e
    da pasta em UTC; comparar o instante, e não o texto, evita regravar tudo por diferença de fuso."""
    m = v.get("modificado")
    if m:
        try:
            m = int(datetime.fromisoformat(str(m)).timestamp())
        except ValueError:
            pass
    return (v.get("arquivo"), int(v.get("bytes") or 0), m)


def gravar_imagens(conn, mapa: dict, do_banco: dict | None = None) -> int:
    """Grava só a diferença entre a pasta e o banco (foto nova, trocada ou que saiu) e devolve quantas linhas mudaram.

    Até 2026-10-27 era TRUNCATE + INSERT a cada carga. Com a tarefa "Trade - Fotos" de 5 em 5 min e o painel lendo esta
    tabela para saber quem tem foto (os produtos sem imagem ao vivo), regravar tudo trancava a tabela e mudava o
    atualizado_em de todas as linhas: agora só muda a linha da foto que mudou, e é por ela que o painel percebe."""
    antes = imagens_do_banco(conn) if do_banco is None else do_banco
    novo = {int(c): v for c, v in mapa.items()}
    mudaram = [(c, v["arquivo"], v.get("bytes"), v.get("modificado")) for c, v in novo.items()
               if c not in antes or _assinatura_foto(antes[c]) != _assinatura_foto(v)]
    sairam = [c for c in antes if c not in novo]
    if not mudaram and not sairam:
        return 0
    with conn.cursor() as cur:
        if sairam:
            cur.execute(f"DELETE FROM {SCHEMA}.produto_imagem WHERE codprod = ANY(%s)", (sairam,))
        if mudaram:
            psycopg2.extras.execute_values(
                cur, f"INSERT INTO {SCHEMA}.produto_imagem (codprod, arquivo, bytes, modificado_em) VALUES %s "
                     "ON CONFLICT (codprod) DO UPDATE SET arquivo = EXCLUDED.arquivo, bytes = EXCLUDED.bytes, "
                     "modificado_em = EXCLUDED.modificado_em, atualizado_em = now()", mudaram, page_size=2000)
    conn.commit()
    return len(mudaram) + len(sairam)


# ---------------------------------------------------------------------------
# Miniaturas das fotos (para o painel da Vercel, que não enxerga a pasta)
# ---------------------------------------------------------------------------
def miniaturas_do_banco(conn) -> dict:
    """codprod -> (arquivo, bytes da origem, epoch da modificação da origem). Sem trazer a imagem."""
    with conn.cursor() as cur:
        cur.execute(f"SELECT codprod, arquivo, origem_bytes, extract(epoch FROM origem_modificado)::bigint FROM {SCHEMA}.produto_miniatura")
        out = {int(c): (a, b, e) for c, a, b, e in cur.fetchall()}
    conn.rollback()
    return out


def gravar_miniaturas(conn, linhas: list) -> int:
    """linhas: (codprod, arquivo, bytes_origem, modificado_iso, largura, altura, webp). Upsert por código."""
    dados = [(c, a, b, m, w, h, psycopg2.Binary(img)) for c, a, b, m, w, h, img in linhas]
    with conn.cursor() as cur:
        psycopg2.extras.execute_values(
            cur, f"INSERT INTO {SCHEMA}.produto_miniatura (codprod, arquivo, origem_bytes, origem_modificado, largura, altura, webp) VALUES %s "
                 "ON CONFLICT (codprod) DO UPDATE SET arquivo = EXCLUDED.arquivo, origem_bytes = EXCLUDED.origem_bytes, "
                 "origem_modificado = EXCLUDED.origem_modificado, largura = EXCLUDED.largura, altura = EXCLUDED.altura, "
                 "webp = EXCLUDED.webp, atualizado_em = now()", dados, page_size=40)
    conn.commit()
    return len(dados)


def apagar_miniaturas_sem_foto(conn, cods_com_foto: list) -> int:
    """Tira a miniatura de produto que não tem mais foto na pasta."""
    with conn.cursor() as cur:
        cur.execute(f"DELETE FROM {SCHEMA}.produto_miniatura WHERE codprod <> ALL(%s)", ([int(c) for c in cods_com_foto],))
        n = cur.rowcount
    conn.commit()
    return n


# ---------------------------------------------------------------------------
# Histórico dos indicadores
# ---------------------------------------------------------------------------
def historico_do_banco(conn) -> list:
    with conn.cursor() as cur:
        cur.execute(f"SELECT data, codcomprador, comprador, ativos, skus, rupturas, sem_venda, valor_parado, valor_parado_pf "
                    f"FROM {SCHEMA}.historico_indicador ORDER BY data, codcomprador")
        linhas = cur.fetchall()
    conn.rollback()
    return linhas


def gravar_historico(conn, hist_hoje: list) -> int:
    """A foto de hoje substitui a de hoje (rodar duas vezes no mesmo dia não duplica); as de outros dias ficam."""
    if not hist_hoje:
        return 0
    dia = hist_hoje[0][0]

    def _gravar(cur):
        cur.execute(f"DELETE FROM {SCHEMA}.historico_indicador WHERE data = %s", (dia,))
        psycopg2.extras.execute_values(
            cur, f"INSERT INTO {SCHEMA}.historico_indicador (data, codcomprador, comprador, ativos, skus, rupturas, sem_venda, valor_parado, valor_parado_pf) VALUES %s",
            hist_hoje)
    _tentar(conn, "histórico", _gravar)
    return len(hist_hoje)


# ---------------------------------------------------------------------------
# Bases pequenas
# ---------------------------------------------------------------------------
def _mes(mi: int) -> date:
    return date(DATA_INICIAL.year + mi // 12, mi % 12 + 1, 1)


def gravar_bases(conn, p) -> dict:
    """estoque, entradas e conta corrente: cada tabela é trocada por inteiro, tudo numa transação."""
    D = p.dims
    prod, comp = D["produtos"], D["compradores"]
    ec = p.est_cols

    est = []
    for r in p.est_out:
        d = dict(zip(ec, r))
        est.append((prod[d["p"]][0], p.ref, bool(d["ativo"]), bool(d["promo"]), bool(d["base"]), d["disp"], d["bloq"], d["total"],
                    d["avaria"], d["reserv"], d["preco"], d["valor_custo"], d["valor_pf"], d["venda56"], d["media"], d["cob"],
                    d["sug"], d["pend"], d["prim"], d["ult"], bool(d["img"]),
                    *[d[f"s{i}"] for i in range(9)], bool(d["rup"]), bool(d["sv"])))
    ent = [(prod[r[0]][0], _mes(r[1]), r[2], r[3]) for r in p.ent_out]
    ccf = []
    for r in p.cc["fornecedores"]:
        cod, nome, ic, deb, cre, saldo, verba, neg, ativo = r
        ccf.append((cod, nome, comp[ic][0] if ic >= 0 else None, deb, cre, saldo, verba, neg, bool(ativo)))
    usuarios = D["usuarios_cc"]
    lan = [(r[7], r[0], r[1], "D" if r[2] == 0 else "C", r[3], r[4], r[5], usuarios[r[6]], bool(r[8]), bool(r[9]))
           for r in p.cc["lancamentos"]]

    def _gravar(cur):
        cur.execute(f"TRUNCATE {SCHEMA}.fato_estoque_produto, {SCHEMA}.fato_entrada_mes, {SCHEMA}.fato_cc_fornecedor, "
                    f"{SCHEMA}.fato_cc_lancamento RESTART IDENTITY")
        psycopg2.extras.execute_values(
            cur, f"INSERT INTO {SCHEMA}.fato_estoque_produto (codprod, data_ref, ativo, promocional, base_ativa, disponivel, bloqueado, total, "
                 "avaria, reservado, preco_venda, valor_custo, valor_pf, venda_56d, media_semanal, cobertura_semanas, sugestao_compra, "
                 "pendente_entrega, primeira_entrada, ultima_entrada, tem_imagem, venda_s0, venda_s1, venda_s2, venda_s3, venda_s4, venda_s5, "
                 "venda_s6, venda_s7, venda_s8, ruptura, sem_venda) VALUES %s", est, page_size=2000)
        psycopg2.extras.execute_values(
            cur, f"INSERT INTO {SCHEMA}.fato_entrada_mes (codprod, mes, quantidade, valor) VALUES %s ON CONFLICT (codprod, mes) DO UPDATE "
                 "SET quantidade = EXCLUDED.quantidade, valor = EXCLUDED.valor", ent, page_size=5000)
        psycopg2.extras.execute_values(
            cur, f"INSERT INTO {SCHEMA}.fato_cc_fornecedor (codfornec, fornecedor, codcomprador, debito, credito, saldo, verba_media, "
                 "negociacao_media, ativo) VALUES %s", ccf, page_size=2000)
        psycopg2.extras.execute_values(
            cur, f"INSERT INTO {SCHEMA}.fato_cc_lancamento (transacao, data, codfornec, tipo, valor, historico, numverba, usuario, negociacao, estorno) "
                 "VALUES %s", lan, page_size=5000)
    _tentar(conn, "bases", _gravar)                # as tabelas são trocadas por inteiro: refazer do zero é seguro
    return {"fato_estoque_produto": len(est), "fato_entrada_mes": len(ent), "fato_cc_fornecedor": len(ccf), "fato_cc_lancamento": len(lan)}


# ---------------------------------------------------------------------------
# Pacote do painel
# ---------------------------------------------------------------------------
def versao_no_ar(conn) -> dict | None:
    with conn.cursor() as cur:
        cur.execute(f"SELECT versao, gerado_em, meta, arquivos FROM {SCHEMA}.pacote_versao WHERE id = 1")
        r = cur.fetchone()
    conn.rollback()
    if not r:
        return None
    return {"versao": r[0], "gerado_em": r[1], "meta": r[2], "arquivos": r[3]}


def _dados_reaproveitaveis(conn, anterior: dict | None, nome: str, info: dict) -> str | None:
    """Se o arquivo é igual ao da versão no ar (mesmo sha1, tamanho e nº de pedaços) E os pedaços estão mesmo no banco,
    devolve a versão onde eles moram; senão, None (grava de novo)."""
    ant = ((anterior or {}).get("arquivos") or {}).get(nome)
    if not ant or (ant.get("sha1"), ant.get("bytes"), ant.get("partes")) != (info["sha1"], info["bytes"], info["partes"]):
        return None
    onde = ant.get("versao_dados") or anterior["versao"]
    with conn.cursor() as cur:
        cur.execute(f"SELECT count(*), coalesce(sum(octet_length(dados)), 0) FROM {SCHEMA}.pacote WHERE versao = %s AND nome = %s", (onde, nome))
        n, tam = cur.fetchone()
    conn.rollback()
    return onde if n == info["partes"] and int(tam) == info["bytes"] else None


def _limpar_pacotes_velhos(conn, necessarios: set) -> int:
    """Apaga do banco os (versão, arquivo) que nem a versão nova nem a anterior (a reserva) usam. É "se der":
    roda DEPOIS de a versão nova estar no ar, e uma falha aqui só deixa o lixo para a próxima carga limpar."""
    apagados = 0
    try:
        with conn.cursor() as cur:
            cur.execute(f"SELECT DISTINCT versao, nome FROM {SCHEMA}.pacote")
            existentes = cur.fetchall()
        conn.rollback()
        for v, n in existentes:
            if (v, n) in necessarios:
                continue
            try:
                _tentar(conn, f"apagar {n} da versão {v}",
                        lambda cur, v=v, n=n: cur.execute(f"DELETE FROM {SCHEMA}.pacote WHERE versao = %s AND nome = %s", (v, n)), tentativas=2)
                apagados += 1
            except Exception as exc:  # noqa: BLE001
                log.warning("  não consegui apagar %s da versão %s agora (%s: %s); a próxima carga tenta de novo", n, v, type(exc).__name__, exc)
    except Exception as exc:  # noqa: BLE001
        try:
            conn.rollback()
        except Exception:  # noqa: BLE001
            pass
        log.warning("  limpeza das versões velhas do pacote adiada (%s: %s)", type(exc).__name__, exc)
    return apagados


def gravar_pacote(conn, blobs: dict, meta: dict) -> dict:
    """Grava o que mudou da versão nova e só então troca o ponteiro. Devolve {versao, arquivos, gravados, reaproveitados}.

    `arquivos[nome]` = {partes, bytes, sha1, versao_dados}: `versao_dados` é a versão cujos pedaços guardam esse arquivo
    (a própria versão nova, ou a que já estava no ar quando o arquivo não mudou). Quem lê usa `versao_dados`.
    """
    ESTATISTICA["repeticoes"] = 0
    versao = datetime.now().strftime("%Y%m%d-%H%M%S")
    anterior = versao_no_ar(conn)
    arquivos, gravados, reaproveitados = {}, [], []
    for nome, dados in blobs.items():
        gz = dados if nome.endswith(".gz") else gzip.compress(dados, compresslevel=6, mtime=0)
        partes = [gz[i:i + TAM_PARTE] for i in range(0, len(gz), TAM_PARTE)] or [b""]
        info = {"partes": len(partes), "bytes": len(gz), "sha1": hashlib.sha1(gz).hexdigest()}
        onde = _dados_reaproveitaveis(conn, anterior, nome, info)
        if onde:
            info["versao_dados"] = onde
            reaproveitados.append(nome)
            log.info("  pacote %-14s %7.1f MB igual ao no ar: reaproveitado (pedaços da versão %s)", nome, len(gz) / 1e6, onde)
        else:
            for n, parte in enumerate(partes):          # cada pedaço na sua transação: o banco não segura 25 MB de uma vez
                _tentar(conn, f"{nome}, pedaço {n + 1} de {len(partes)}",
                        lambda cur, n=n, parte=parte: cur.execute(
                            f"INSERT INTO {SCHEMA}.pacote (versao, nome, parte, dados) VALUES (%s,%s,%s,%s) "
                            "ON CONFLICT (versao, nome, parte) DO UPDATE SET dados = EXCLUDED.dados",
                            (versao, nome, n, psycopg2.Binary(parte))))
            info["versao_dados"] = versao
            gravados.append(nome)
            log.info("  pacote %-14s %7.1f MB gravado em %d pedaço(s)", nome, len(gz) / 1e6, len(partes))
        arquivos[nome] = info

    def _trocar(cur):                                   # a única coisa que o painel enxerga: uma linha, uma transação curta
        cur.execute(
            f"INSERT INTO {SCHEMA}.pacote_versao (id, versao, gerado_em, meta, arquivos, atualizado_em) VALUES (1,%s,%s,%s,%s,now()) "
            "ON CONFLICT (id) DO UPDATE SET versao = EXCLUDED.versao, gerado_em = EXCLUDED.gerado_em, meta = EXCLUDED.meta, "
            "arquivos = EXCLUDED.arquivos, atualizado_em = now()",
            (versao, datetime.now(timezone.utc), json.dumps(meta), json.dumps(arquivos)))    # o meta.gerado_em é hora local sem fuso, para exibir
    _tentar(conn, "trocar a versão no ar", _trocar)

    # fica o que a nova usa e o que a anterior usava (reserva); o resto vai embora, depois, sem derrubar a carga
    necessarios = {(i["versao_dados"], n) for n, i in arquivos.items()}
    for n, i in ((anterior or {}).get("arquivos") or {}).items():
        necessarios.add((i.get("versao_dados") or anterior["versao"], n))
    apagados = _limpar_pacotes_velhos(conn, necessarios)
    if ESTATISTICA["repeticoes"]:
        log.warning("  o banco engasgou: %d gravação(ões) precisaram ser repetidas, e deu certo", ESTATISTICA["repeticoes"])
    return {"versao": versao, "arquivos": arquivos, "gravados": gravados, "reaproveitados": reaproveitados, "apagados": apagados}


def ler_arquivo_do_pacote(conn, versao: str, nome: str) -> bytes:
    """Remonta um arquivo (gzip) do pacote. Usado nos testes; o servidor Node faz o mesmo em JavaScript.
    Se `versao` é a que está no ar, os pedaços podem morar em outra versão (`versao_dados`): segue o ponteiro."""
    with conn.cursor() as cur:
        cur.execute(f"SELECT arquivos FROM {SCHEMA}.pacote_versao WHERE id = 1 AND versao = %s", (versao,))
        r = cur.fetchone()
        onde = (((r[0] or {}).get(nome) or {}).get("versao_dados") if r else None) or versao
        cur.execute(f"SELECT dados FROM {SCHEMA}.pacote WHERE versao = %s AND nome = %s ORDER BY parte", (onde, nome))
        partes = [bytes(r[0]) for r in cur.fetchall()]
    conn.rollback()
    return b"".join(partes)


def contagens(conn) -> dict:
    """Linhas de cada tabela do schema, para o diagnóstico."""
    tabelas = ("classificacao_produto", "produto_imagem", "produto_miniatura", "historico_indicador", "fato_estoque_produto", "fato_entrada_mes",
               "fato_cc_fornecedor", "fato_cc_lancamento", "pacote_versao", "controle_carga")
    out = {}
    with conn.cursor() as cur:
        for t in tabelas:
            cur.execute(f"SELECT count(*) FROM {SCHEMA}.{t}")
            out[t] = cur.fetchone()[0]
        cur.execute(f"SELECT coalesce(sum(length(dados)),0) FROM {SCHEMA}.pacote")
        out["pacote_bytes"] = int(cur.fetchone()[0])
    conn.rollback()
    return out
