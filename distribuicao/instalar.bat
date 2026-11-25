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
.venv\Scripts\python -m pip install --no-index --find-links pacotes --upgrade geomina || goto erro
echo.
echo Criando atalho "GeoMina" na area de trabalho...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$d=[Environment]::GetFolderPath('Desktop'); $s=(New-Object -ComObject WScript.Shell).CreateShortcut((Join-Path $d 'GeoMina.lnk')); $s.TargetPath=(Join-Path '%CD%' '.venv\Scripts\pythonw.exe'); $s.Arguments='-m geomina'; $s.WorkingDirectory='%CD%'; $s.IconLocation=(Join-Path '%CD%' 'geomina.ico'); $s.Description='GeoMina - gestao de dados geologicos'; $s.Save()" || echo Nao foi possivel criar o atalho. Use o arquivo GeoMina.bat.
echo.
echo Instalacao concluida. Abra o GeoMina pelo icone na area de trabalho.
pause
exit /b 0
:erro
echo.
echo FALHA na instalacao. Envie a mensagem acima para o suporte.
pause
exit /b 1
