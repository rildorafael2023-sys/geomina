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
cp "$RAIZ/distribuicao/instalar.bat" "$RAIZ/distribuicao/GeoMina.bat" "$RAIZ/distribuicao/LEIA-ME.txt" "$DESTINO/"
(cd "$SAIDA" && rm -f "$NOME.zip" && python3 -c "import shutil,sys; shutil.make_archive(sys.argv[1],'zip','.',sys.argv[1])" "$NOME")
echo "$SAIDA/$NOME.zip"
