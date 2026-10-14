#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
TRADE — acesso a um compartilhamento de rede com credencial própria, para a TAREFA AGENDADA.

Por que existe: a tarefa roda numa sessão de logon sem login interativo. Ali a unidade P: não existe e a conta de domínio
do Júlio não vale no servidor de arquivos do WinThor (que só aceita o usuário do compartilhamento). O `cmdkey` não resolve: a tarefa
não usa a credencial guardada no cofre do Windows (testado em 2026-10-14, erro 1326 mesmo com a senha certa). Abrir a
conexão de dentro do processo, com usuário e senha explícitos, é o que o `net use /user:` faz no logon interativo.

A SENHA NÃO FICA EM TEXTO: o arquivo `fotos.cred` é o que o PowerShell gera com `ConvertFrom-SecureString`, uma
cifra do Windows (DPAPI) que só a MESMA conta, na MESMA máquina, consegue abrir. Não vai para o ENV, nem para o Git, nem para
a pasta de rede, e esta biblioteca nunca imprime nem registra a senha.

Só funciona no Windows; em outro sistema as funções devolvem erro e o chamador segue sem a credencial.
"""
from __future__ import annotations

import ctypes
import os
from ctypes import wintypes


class _NETRESOURCE(ctypes.Structure):
    _fields_ = [("dwScope", wintypes.DWORD), ("dwType", wintypes.DWORD), ("dwDisplayType", wintypes.DWORD),
                ("dwUsage", wintypes.DWORD), ("lpLocalName", wintypes.LPWSTR), ("lpRemoteName", wintypes.LPWSTR),
                ("lpComment", wintypes.LPWSTR), ("lpProvider", wintypes.LPWSTR)]


class _BLOB(ctypes.Structure):
    _fields_ = [("cbData", wintypes.DWORD), ("pbData", ctypes.POINTER(ctypes.c_char))]


def ler_senha_protegida(caminho) -> str:
    """Abre o arquivo gerado por `ConvertFrom-SecureString` (hex de um blob DPAPI com a senha em UTF-16) e devolve a senha."""
    if os.name != "nt":
        raise OSError("DPAPI só existe no Windows")
    with open(caminho, "r", encoding="utf-8-sig") as f:
        hexa = "".join(f.read().split())
    dados = bytes.fromhex(hexa)
    crypt32, kernel32 = ctypes.windll.crypt32, ctypes.windll.kernel32
    crypt32.CryptUnprotectData.argtypes = [ctypes.POINTER(_BLOB), ctypes.c_void_p, ctypes.c_void_p, ctypes.c_void_p,
                                           ctypes.c_void_p, wintypes.DWORD, ctypes.POINTER(_BLOB)]
    crypt32.CryptUnprotectData.restype = wintypes.BOOL
    kernel32.LocalFree.argtypes = [ctypes.c_void_p]
    buf = ctypes.create_string_buffer(dados, len(dados))
    entrada = _BLOB(len(dados), ctypes.cast(buf, ctypes.POINTER(ctypes.c_char)))
    saida = _BLOB()
    if not crypt32.CryptUnprotectData(ctypes.byref(entrada), None, None, None, None, 0, ctypes.byref(saida)):
        raise OSError(f"não consegui abrir a credencial protegida (só a conta e a máquina que a criaram conseguem): {ctypes.WinError()}")
    try:
        bruto = ctypes.string_at(saida.pbData, saida.cbData)
    finally:
        kernel32.LocalFree(saida.pbData)
    return bruto.decode("utf-16-le")


def conectar(remoto: str, usuario: str, senha: str) -> int:
    """Abre a conexão `remoto` (\\\\servidor\\compartilhamento) NESTA sessão, com usuário e senha explícitos. 0 = ok; senão, o código do Windows."""
    if os.name != "nt":
        return 120
    mpr = ctypes.windll.mpr
    mpr.WNetAddConnection2W.argtypes = [ctypes.POINTER(_NETRESOURCE), wintypes.LPCWSTR, wintypes.LPCWSTR, wintypes.DWORD]
    mpr.WNetAddConnection2W.restype = wintypes.DWORD
    nr = _NETRESOURCE()
    nr.dwType = 1                      # RESOURCETYPE_DISK
    nr.lpRemoteName = remoto
    return int(mpr.WNetAddConnection2W(ctypes.byref(nr), senha, usuario, 0))


def texto_do_erro(codigo: int) -> str:
    """Mensagem do Windows para um código de erro (1326 = usuário ou senha incorretos, 1219 = já há conexão com outro usuário...)."""
    try:
        return ctypes.FormatError(codigo).strip()
    except Exception:  # noqa: BLE001
        return f"erro {codigo}"
