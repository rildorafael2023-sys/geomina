#!/usr/bin/env bash
# Gera o pacote de instalação offline do GeoMina.
# Uso: distribuicao/empacotar.sh [windows|linux] [pasta_saida]
set -euo pipefail
ALVO="${1:-windows}"
case "$ALVO" in
  windows) PLATAFORMAS=(--platform win_amd64) ;;
  linux) PLATAFORMAS=(--platform manylinux_2_28_x86_64 --platform manylinux_2_17_x86_64 --platform manylinux2014_x86_64) ;;
  *) echo "alvo inválido: $ALVO" >&2; exit 2 ;;
esac
SAIDA="${2:-$(pwd)/saida}"
RAIZ="$(cd "$(dirname "$0")/.." && pwd)"
VERSAO=$(grep -m1 '^version' "$RAIZ/backend/pyproject.toml" | cut -d'"' -f2)
NOME="GeoMina-$VERSAO-$ALVO"
DESTINO="$SAIDA/$NOME"
PIP="${PIP:-python3 -m pip}"

rm -rf "$DESTINO" && mkdir -p "$DESTINO/pacotes"
(cd "$RAIZ/frontend" && npm ci --no-fund --no-audit >/dev/null && npm run build >/dev/null)
$PIP wheel --no-deps -w "$DESTINO/pacotes" "$RAIZ/backend" >/dev/null
for PYV in 3.12 3.13; do
  $PIP download -d "$DESTINO/pacotes" --only-binary=:all: "${PLATAFORMAS[@]}" \
    --python-version "$PYV" "$DESTINO"/pacotes/geomina-*.whl setuptools -q
done
if [ "$ALVO" = "linux" ]; then
  cp "$RAIZ/distribuicao/instalar.bat" "$RAIZ/distribuicao/GeoMina.bat" "$RAIZ/distribuicao/LEIA-ME.txt" "$RAIZ/distribuicao/geomina.ico" "$DESTINO/"
  (cd "$SAIDA" && rm -f "$NOME.zip" && python3 -c "import shutil,sys; shutil.make_archive(sys.argv[1],'zip','.',sys.argv[1])" "$NOME")
  echo "$SAIDA/$NOME.zip"
  exit 0
fi

# ---- Windows: Python oficial embutido (pacote "python" do NuGet, assinado pela Python Software Foundation) com todas as
# bibliotecas já instaladas → instalador .exe (NSIS) que não precisa de Python nem de internet no computador de destino.
PY_VERSAO="${PY_VERSAO:-3.13.17}"
CACHE="${GEOMINA_CACHE:-$HOME/.cache/geomina}"
mkdir -p "$CACHE"
NUPKG="$CACHE/python.$PY_VERSAO.nupkg"
[ -f "$NUPKG" ] || curl -fsSL -o "$NUPKG" "https://api.nuget.org/v3-flatcontainer/python/$PY_VERSAO/python.$PY_VERSAO.nupkg"
APP="$DESTINO/app"
rm -rf "$APP" && mkdir -p "$APP"
(cd "$APP" && python3 -c "import zipfile,sys; z=zipfile.ZipFile(sys.argv[1]); [z.extract(n,'.') for n in z.namelist() if n.startswith('tools/')]" "$NUPKG" && mv tools python)
$PIP install --no-index --find-links "$DESTINO/pacotes" --target "$APP/python/Lib/site-packages" --upgrade \
  --platform win_amd64 --python-version "${PY_VERSAO%.*}" --implementation cp --only-binary=:all: geomina -q
find "$APP/python" -name "__pycache__" -type d -prune -exec rm -rf {} +
cp "$RAIZ/distribuicao/geomina.ico" "$RAIZ/distribuicao/GeoMina-diagnostico.bat" "$APP/"
cp "$RAIZ/distribuicao/LEIA-ME-windows.txt" "$APP/LEIA-ME.txt"
SETUP="$SAIDA/GeoMina-Setup-$VERSAO.exe"
makensis -V2 -DVERSAO="$VERSAO" -DORIGEM="$APP" -DSAIDA="$SETUP" "$RAIZ/distribuicao/geomina.nsi"
rm -rf "$DESTINO"
echo "$SETUP"
