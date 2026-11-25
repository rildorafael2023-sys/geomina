@echo off
rem Modo diagnostico: abre o GeoMina mostrando as mensagens nesta janela.
rem Para o uso normal, use o icone GeoMina na area de trabalho.
chcp 65001 >nul
cd /d "%~dp0"
if not exist .venv\Scripts\python.exe (
  echo Execute instalar.bat primeiro.
  pause
  exit /b 1
)
.venv\Scripts\python -m geomina %*
pause
