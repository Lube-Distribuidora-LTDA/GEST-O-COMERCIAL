#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
TRADE — miniaturas das fotos de produto, guardadas no banco para o painel da Vercel.

A Vercel não enxerga a pasta de fotos (rede interna), então o ETL, que enxerga, grava uma miniatura WebP de
cada foto em `trade.produto_miniatura` e a função `api/img.js` serve de lá. 288 px no maior lado, qualidade 80:
~11 KB por foto (~97 MB para 8.441 fotos), o suficiente para o relatório do produto em tela cheia e em retina.

Incremental: só gera de novo a foto nova ou que mudou (nome, tamanho ou data do arquivo de origem). Tem orçamento
de tempo, para a carga agendada (limite de 30 min na tarefa) nunca estourar: o que não deu tempo fica para a
próxima rodada, e a primeira carga completa (uns 8.600 PNGs, 4,3 GB) é feita à mão, sem limite.

Só LÊ a pasta de fotos. Pillow é opcional: sem ele o passo termina em AVISO e a carga segue.
"""
from __future__ import annotations

import io
import logging
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime
from pathlib import Path

LADO = 288
QUALIDADE = 80
LOTE = 48                 # fotos por vez: lê, reduz, grava e confere o relógio
log = logging.getLogger("bi")


def disponivel() -> bool:
    try:
        from PIL import features
        return bool(features.check("webp"))
    except Exception:  # noqa: BLE001
        return False


def gerar(caminho) -> tuple[bytes, int, int]:
    """Lê a foto, reduz para caber em LADO x LADO e devolve (webp, largura, altura). Mantém a transparência."""
    from PIL import Image
    Image.MAX_IMAGE_PIXELS = 250_000_000          # há PNG de 35 MB: o padrão (89 Mpx) reclama, e foto de produto não é bomba
    with Image.open(caminho) as im:
        im.load()
        im = im.convert("RGBA") if ("A" in im.mode or im.mode == "P") else im.convert("RGB")
        im.thumbnail((LADO, LADO), Image.LANCZOS)
        buf = io.BytesIO()
        im.save(buf, "WEBP", quality=QUALIDADE, method=4)
        return buf.getvalue(), im.width, im.height


def _epoch(iso: str | None) -> int:
    if not iso:
        return 0
    try:
        return int(datetime.fromisoformat(iso).timestamp())
    except ValueError:
        return 0


def pendentes(mapa: dict, no_banco: dict) -> list[int]:
    """Códigos cuja miniatura falta ou está velha. `no_banco`: codprod -> (arquivo, bytes, epoch da modificação)."""
    out = []
    for cod, v in mapa.items():
        atual = no_banco.get(int(cod))
        if (atual is None or atual[0] != v["arquivo"] or atual[1] != v.get("bytes")
                or abs((atual[2] or 0) - _epoch(v.get("modificado"))) > 1):
            out.append(int(cod))
    return sorted(out)


def processar(pasta: Path, mapa: dict, cods: list[int], gravar, orcamento_s: float | None = None, trabalhadores: int = 4) -> dict:
    """Gera as miniaturas de `cods` e entrega cada lote a `gravar(linhas)`. Para quando o orçamento de tempo acaba."""
    t0 = time.time()
    feitas = falhas = 0
    exemplos: list[str] = []

    def uma(cod: int):
        v = mapa[cod]
        webp, w, h = gerar(Path(pasta) / Path(v["arquivo"]).name)       # .name: o nome vem do banco e não pode sair da pasta
        return (cod, v["arquivo"], v.get("bytes"), v.get("modificado"), w, h, webp)

    with ThreadPoolExecutor(max_workers=trabalhadores) as pool:
        for i in range(0, len(cods), LOTE):
            if orcamento_s is not None and time.time() - t0 > orcamento_s:
                break
            lote = cods[i:i + LOTE]
            linhas = []
            for cod, fut in [(c, pool.submit(uma, c)) for c in lote]:
                try:
                    linhas.append(fut.result())
                except Exception as e:  # noqa: BLE001 — foto corrompida ou ilegível: segue com as outras
                    falhas += 1
                    if len(exemplos) < 5:
                        exemplos.append(f"{cod}: {type(e).__name__}: {e}")
            if linhas:
                gravar(linhas)
                feitas += len(linhas)
            if (i // LOTE) % 20 == 19:
                log.info("  miniaturas: %s de %s (%.0fs)", f"{feitas:,}".replace(",", "."), f"{len(cods):,}".replace(",", "."), time.time() - t0)
    return {"feitas": feitas, "falhas": falhas, "restantes": len(cods) - feitas - falhas, "segundos": time.time() - t0, "exemplos": exemplos}
