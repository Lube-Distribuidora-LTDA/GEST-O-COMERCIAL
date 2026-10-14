@echo off
rem ===========================================================================
rem  Gestao Comercial - atualiza os dados AGORA: le o WinThor, a planilha do Trade e
rem  a pasta FOTOS_ION, e grava no banco (DATA WAREHOUSE, schema trade). Leva cerca
rem  de 1 minuto. O painel aberto troca para a versao nova em ate 1 minuto (ou ao
rem  clicar no botao de atualizar). A carga normal e a do agendamento (ver
rem  P:\INTEGRACAO BI\TRADE); este arquivo e para quando nao se quer esperar.
rem  Tambem deixa uma copia em web\dados, que o painel usa se o banco nao responder.
rem ===========================================================================
setlocal
cd /d "%~dp0etl"
rem --- onde esta o ENV (credenciais): a pasta etl, a pasta de integracao dos BIs, ou a instalacao da VM
if exist "%~dp0etl\ENV" goto :env_ok
for /d %%D in ("P:\INTEGRA*BI") do if exist "%%D\TRADE\1 - CONFIGURACAO\ENV" set "LUBE_ENV=%%D\TRADE\1 - CONFIGURACAO\ENV"
if not defined LUBE_ENV if exist "C:\BI\TRADE\ENV" set "LUBE_ENV=C:\BI\TRADE\ENV"
if not defined LUBE_ENV (
  echo.
  echo   Nao achei o ENV ^(credenciais^). Procurei em etl\ENV, P:\INTEGRACAO BI\TRADE\1 - CONFIGURACAO e C:\BI\TRADE.
  echo   Copie o etl\ENV.example para etl\ENV e preencha.
  echo.
  pause
  exit /b 1
)
:env_ok
python sync_trade.py --arquivos
if errorlevel 1 (
  echo.
  echo   A carga teve problema. As mensagens acima dizem o passo; a prova esta em trade.controle_carga.
) else (
  echo.
  echo   Pronto. Os dados novos ja estao no banco.
)
echo.
pause
