; Instalador do GeoMina para Windows (NSIS).
; Gerado por distribuicao/empacotar.sh windows — não precisa de Python nem de internet no computador de destino.
; Instala para o usuário atual (não pede administrador): %LOCALAPPDATA%\Programs\GeoMina.
; Os DADOS ficam em %LOCALAPPDATA%\GeoMina e nunca são apagados pelo instalador nem pelo desinstalador.

Unicode true
!ifndef VERSAO
  !error "defina VERSAO (makensis -DVERSAO=x.y.z -DORIGEM=pasta -DSAIDA=arquivo.exe)"
!endif

Name "GeoMina ${VERSAO}"
OutFile "${SAIDA}"
InstallDir "$LOCALAPPDATA\Programs\GeoMina"
RequestExecutionLevel user
SetCompressor /SOLID lzma
Icon "${ORIGEM}\geomina.ico"
UninstallIcon "${ORIGEM}\geomina.ico"
BrandingText "GeoMina ${VERSAO} — aplicativo local, sem internet"
ShowInstDetails show

!include "MUI2.nsh"
!define MUI_ICON "${ORIGEM}\geomina.ico"
!define MUI_UNICON "${ORIGEM}\geomina.ico"
!define MUI_WELCOMEPAGE_TITLE "Instalar o GeoMina ${VERSAO}"
!define MUI_WELCOMEPAGE_TEXT "O GeoMina roda somente neste computador e não usa internet.$\r$\n$\r$\nSe já houver uma versão instalada, ela será atualizada. Os dados (banco, fotos, croquis, laudos e backups) ficam em %LOCALAPPDATA%\GeoMina e são mantidos. Antes de atualizar o banco, o próprio GeoMina faz um backup automático.$\r$\n$\r$\nFeche o GeoMina antes de continuar."
!define MUI_FINISHPAGE_RUN "$INSTDIR\python\pythonw.exe"
!define MUI_FINISHPAGE_RUN_PARAMETERS "-m geomina"
!define MUI_FINISHPAGE_RUN_TEXT "Abrir o GeoMina agora"
!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_LANGUAGE "PortugueseBR"

Section "GeoMina"
  SetOutPath "$INSTDIR"
  ; versão anterior: o Python e as bibliotecas são trocados inteiros (evita sobras de versões antigas)
  IfFileExists "$INSTDIR\python\*.*" 0 copiar
  tentar_remover:
    ClearErrors
    RMDir /r "$INSTDIR\python"
    IfFileExists "$INSTDIR\python\python.exe" 0 copiar
      MessageBox MB_RETRYCANCEL|MB_ICONEXCLAMATION "O GeoMina parece estar aberto. Feche todas as janelas do GeoMina e clique em Repetir." IDRETRY tentar_remover
      Abort "Instalação cancelada: o GeoMina estava aberto."
  copiar:
  File /r "${ORIGEM}\python"
  File "${ORIGEM}\geomina.ico"
  File "${ORIGEM}\LEIA-ME.txt"
  File "${ORIGEM}\GeoMina-diagnostico.bat"

  CreateShortcut "$DESKTOP\GeoMina.lnk" "$INSTDIR\python\pythonw.exe" "-m geomina" "$INSTDIR\geomina.ico" 0 SW_SHOWNORMAL "" "GeoMina - gestão de dados geológicos"
  CreateDirectory "$SMPROGRAMS\GeoMina"
  CreateShortcut "$SMPROGRAMS\GeoMina\GeoMina.lnk" "$INSTDIR\python\pythonw.exe" "-m geomina" "$INSTDIR\geomina.ico" 0 SW_SHOWNORMAL "" "GeoMina - gestão de dados geológicos"
  CreateShortcut "$SMPROGRAMS\GeoMina\GeoMina (diagnóstico).lnk" "$INSTDIR\GeoMina-diagnostico.bat" "" "$INSTDIR\geomina.ico"
  CreateShortcut "$SMPROGRAMS\GeoMina\Pasta de dados e backups.lnk" "$LOCALAPPDATA\GeoMina"
  CreateShortcut "$SMPROGRAMS\GeoMina\Leia-me.lnk" "$INSTDIR\LEIA-ME.txt"
  CreateShortcut "$SMPROGRAMS\GeoMina\Desinstalar o GeoMina.lnk" "$INSTDIR\Desinstalar.exe"

  WriteUninstaller "$INSTDIR\Desinstalar.exe"
  !define CHAVE "Software\Microsoft\Windows\CurrentVersion\Uninstall\GeoMina"
  WriteRegStr HKCU "${CHAVE}" "DisplayName" "GeoMina"
  WriteRegStr HKCU "${CHAVE}" "DisplayVersion" "${VERSAO}"
  WriteRegStr HKCU "${CHAVE}" "Publisher" "GeoMina"
  WriteRegStr HKCU "${CHAVE}" "DisplayIcon" "$INSTDIR\geomina.ico"
  WriteRegStr HKCU "${CHAVE}" "InstallLocation" "$INSTDIR"
  WriteRegStr HKCU "${CHAVE}" "UninstallString" '"$INSTDIR\Desinstalar.exe"'
  WriteRegDWORD HKCU "${CHAVE}" "NoModify" 1
  WriteRegDWORD HKCU "${CHAVE}" "NoRepair" 1
SectionEnd

Section "Uninstall"
  Delete "$DESKTOP\GeoMina.lnk"
  RMDir /r "$SMPROGRAMS\GeoMina"
  RMDir /r "$INSTDIR\python"
  Delete "$INSTDIR\geomina.ico"
  Delete "$INSTDIR\LEIA-ME.txt"
  Delete "$INSTDIR\GeoMina-diagnostico.bat"
  Delete "$INSTDIR\Desinstalar.exe"
  RMDir "$INSTDIR"
  DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\GeoMina"
  MessageBox MB_ICONINFORMATION "O GeoMina foi removido. Os dados e backups continuam em $LOCALAPPDATA\GeoMina (apague essa pasta só se tiver certeza)."
SectionEnd
