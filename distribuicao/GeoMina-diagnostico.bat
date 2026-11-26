@echo off
rem Modo diagnostico: abre o GeoMina mostrando as mensagens nesta janela.
rem Para o uso normal, use o icone GeoMina na area de trabalho ou no menu Iniciar.
chcp 65001 >nul
cd /d "%~dp0"
"%~dp0python\python.exe" -m geomina %*
pause
