@echo off
rem ===========================================================================
rem  Gestao Comercial - liga o painel nesta maquina e abre o navegador.
rem  Os dados vem do banco (DATA WAREHOUSE, schema trade); as fotos, da pasta FOTOS_ION.
rem  Feche esta janela para desligar. So esta maquina enxerga o painel.
rem  Para mostrar a outra pessoa na rede, use "INICIAR PARA A REDE.bat".
rem ===========================================================================
setlocal
cd /d "%~dp0web"
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
if not exist "node_modules" (
  echo   Primeira vez nesta maquina: instalando as bibliotecas do painel...
  call npm install --omit=dev --no-audit --no-fund
)
start "" http://localhost:8700
echo.
echo   Gestao Comercial em http://localhost:8700
echo   ^(a pagina abre sozinha quando os dados terminarem de carregar, uns 10 segundos^)
echo.
node servidor_local.js
pause
