#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
TRADE — banco de imagens: lê a pasta FOTOS_ION do jeito que ela é.

A pasta é compartilhada com o WinThor (PCPRODUT.DIRFOTOPROD aponta para ela) e é mexida à mão por
muita gente, então o nome do arquivo não é sempre "<código>.png". Casos reais (2026-10-14, 8.572
entradas): "123.png", "123.PNG", "123 .png" (espaço antes do ponto), "123 (1).png", ".jpeg", mais
atalhos, desktop.ini e Thumbs.db. Este módulo transforma a pasta num mapa  código → arquivo,
escolhendo UM arquivo por produto quando há mais de um, sempre pelo mesmo critério.

Só LÊ a pasta. Nunca grava, renomeia nem apaga nada nela.

    python fotos.py                 # resumo da pasta encontrada
    python fotos.py "P:\\FOTOS_ION"  # resumo de outra pasta
"""
from __future__ import annotations

import os
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

# Onde procurar, em ordem. Tarefa agendada NÃO enxerga unidade mapeada (P:), então o caminho de rede
# (UNC) vem em seguida: é o mesmo lugar, só que sem depender de quem está logado.
CANDIDATAS = (
    r"P:\FOTOS_ION",
)
# O caminho de rede da pasta, o compartilhamento e o usuário dele vêm do ENV, nunca do código: este repositório é público.
#   TRADE_FOTOS            caminho de rede da pasta de fotos (para a tarefa agendada, que não tem o P:)
#   TRADE_FOTOS_SERVIDOR   o compartilhamento onde ela está, para abrir a conexão com usuário e senha
#   TRADE_FOTOS_USUARIO    o usuário desse compartilhamento
EXTENSOES = {".png": 0, ".jpg": 1, ".jpeg": 1, ".webp": 2}     # preferência quando há duas do mesmo código
_NOME = re.compile(r"^\s*(\d{1,9})(.*)$")


def _tentar(ordem: list, relatorio: list | None) -> Path | None:
    import stat
    for c in ordem:
        try:
            if stat.S_ISDIR(os.stat(c).st_mode):
                return Path(c)
            motivo = "existe mas não é pasta"
        except OSError as e:
            motivo = f"{e.strerror or e} (erro {getattr(e, 'winerror', None) or e.errno})"
        if relatorio is not None:
            relatorio.append((c, motivo))
    return None


def localizar_pasta(extra: str | None = None, relatorio: list | None = None) -> Path | None:
    """Primeira pasta que existe: a pedida (variável TRADE_FOTOS), depois P:\\ e por fim o caminho de rede.

    Se `relatorio` for uma lista, cada caminho que falhou entra nela como (caminho, motivo): é o que diz se foi
    "unidade não existe" (tarefa agendada não enxerga P:), "acesso negado" ou "rede fora", em vez de só "fora do ar".

    Se nada abriu e existe o arquivo `fotos.cred` (ao lado deste módulo, ou em TRADE_FOTOS_CREDENCIAL), abre a conexão com o
    compartilhamento COM usuário e senha e tenta de novo. É o que a tarefa agendada precisa: ela não tem o P: nem uma
    conta aceita pelo servidor. A senha vem cifrada pelo Windows (ver rede.py) e nunca aparece em log.
    """
    ordem = []
    for c in (extra, os.environ.get("TRADE_FOTOS")):
        if c:
            ordem.append(c)
    ordem.extend(CANDIDATAS)
    achada = _tentar(ordem, relatorio)
    if achada is not None:
        return achada

    cred = Path(os.environ.get("TRADE_FOTOS_CREDENCIAL") or (Path(__file__).resolve().parent / "fotos.cred"))
    if os.name != "nt":
        return None
    if not cred.is_file():
        if relatorio is not None:
            relatorio.append((str(cred), "arquivo da credencial não existe nesta máquina/pasta (fotos.cred é por conta e por máquina)"))
        return None
    servidor = os.environ.get("TRADE_FOTOS_SERVIDOR")
    usuario = os.environ.get("TRADE_FOTOS_USUARIO")
    if not servidor or not usuario:
        if relatorio is not None:
            relatorio.append((str(cred), "há credencial, mas faltam TRADE_FOTOS_SERVIDOR e TRADE_FOTOS_USUARIO no ENV"))
        return None
    try:
        import rede
        codigo = rede.conectar(servidor, usuario, rede.ler_senha_protegida(cred))
    except Exception as e:  # noqa: BLE001 — credencial de outra conta/máquina, arquivo corrompido...
        if relatorio is not None:
            relatorio.append((str(cred), f"não consegui usar a credencial protegida: {e}"))
        return None
    if codigo != 0 and relatorio is not None:
        relatorio.append((f"conexão com {servidor} como {usuario}", f"{rede.texto_do_erro(codigo)} (erro {codigo})"))
    achada = _tentar(ordem, None)
    if achada is None and codigo == 0 and relatorio is not None:
        relatorio.append((f"conexão com {servidor} como {usuario}", "abriu, mas a pasta de fotos não está lá"))
    return achada


def _pontuar(resto: str) -> int:
    """Quanto menor, mais "certo" o nome. `resto` é o que sobra depois do código, sem a extensão."""
    if resto == "":
        return 0                                   # 123.png
    if resto.strip() == "":
        return 1                                   # "123 .png"
    if re.fullmatch(r"\s*\(\d+\)\s*", resto):
        return 2                                   # "123 (1).png"
    return 3                                       # "123 frente.png" etc.


def indexar(pasta: Path) -> tuple[dict[int, dict], dict]:
    """Devolve ({codprod: {arquivo, bytes, modificado}}, estatísticas)."""
    melhor: dict[int, tuple[tuple, dict]] = {}
    est = {"entradas": 0, "imagens": 0, "ignoradas": 0, "repetidos": 0, "extensoes": {}}
    with os.scandir(pasta) as it:
        for e in it:
            est["entradas"] += 1
            try:
                if not e.is_file():
                    est["ignoradas"] += 1
                    continue
            except OSError:
                est["ignoradas"] += 1
                continue
            stem, ext = os.path.splitext(e.name)
            ext = ext.lower()
            if ext not in EXTENSOES:
                est["ignoradas"] += 1
                continue
            m = _NOME.match(stem)
            if not m:
                est["ignoradas"] += 1                # "Sem Título-1.png"
                continue
            cod = int(m.group(1))
            try:
                st = e.stat()
                tam, mod = st.st_size, st.st_mtime
            except OSError:
                tam, mod = 0, 0.0
            if tam <= 0:
                est["ignoradas"] += 1                # arquivo vazio não é foto
                continue
            est["imagens"] += 1
            est["extensoes"][ext] = est["extensoes"].get(ext, 0) + 1
            chave = (_pontuar(m.group(2)), EXTENSOES[ext], -mod, e.name)    # o mais novo desempata
            item = {"arquivo": e.name, "bytes": tam,
                    "modificado": datetime.fromtimestamp(mod, tz=timezone.utc).isoformat(timespec="seconds") if mod else None}
            atual = melhor.get(cod)
            if atual is None:
                melhor[cod] = (chave, item)
            else:
                est["repetidos"] += 1
                if chave < atual[0]:
                    melhor[cod] = (chave, item)
    est["produtos"] = len(melhor)
    return {cod: v[1] for cod, v in melhor.items()}, est


if __name__ == "__main__":
    pasta = localizar_pasta(sys.argv[1] if len(sys.argv) > 1 else None)
    if pasta is None:
        print("Nenhuma pasta de fotos encontrada.")
        sys.exit(1)
    mapa, est = indexar(pasta)
    print(f"pasta: {pasta}")
    print(f"entradas: {est['entradas']} · imagens: {est['imagens']} · produtos com foto: {est['produtos']} · "
          f"códigos com mais de um arquivo: {est['repetidos']} · ignoradas: {est['ignoradas']}")
    print("extensões:", est["extensoes"])
    for cod in sorted(mapa)[:3]:
        print(cod, mapa[cod])
