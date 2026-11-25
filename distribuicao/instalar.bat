@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo ============================================
echo  GeoMina - instalacao (nao usa internet)
echo ============================================
set "PY="
where py >nul 2>nul && set "PY=py -3"
if not defined PY where python >nul 2>nul && set "PY=python"
if not defined PY (
  echo Python nao encontrado. Instale o Python 3.12 ou 3.13 ^(python.org^) marcando "Add python.exe to PATH".
  pause
  exit /b 1
)
%PY% --version
%PY% -m venv .venv || goto erro
.venv\Scripts\python -m pip install --no-index --find-links pacotes geomina || goto erro
echo.
echo Instalacao concluida. Para abrir, use GeoMina.bat
pause
exit /b 0
:erro
echo.
echo FALHA na instalacao. Envie a mensagem acima para o suporte.
pause
exit /b 1
