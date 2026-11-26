"""Processamento de imagens e PDF: miniaturas, pré-visualizações, EXIF, páginas.

Os derivados (miniatura, prévia PNG de TIFF) são regeneráveis e ficam em
``arquivos/derivados``, separados dos originais (que nunca são alterados).
"""

from __future__ import annotations

import io
from datetime import date, datetime
from pathlib import Path

from PIL import ExifTags, Image, ImageOps, UnidentifiedImageError
from pypdf import PdfReader, PdfWriter

Image.MAX_IMAGE_PIXELS = 300_000_000  # croquis escaneados em alta resolução

EXTENSOES = {
    "application/pdf": {".pdf"},
    "image/jpeg": {".jpg", ".jpeg"},
    "image/png": {".png"},
    "image/tiff": {".tif", ".tiff"},
}
PERMITIDOS = {
    "croqui": {"application/pdf", "image/jpeg", "image/png", "image/tiff"},
    "foto": {"image/jpeg", "image/png", "image/tiff"},
}


class MidiaInvalida(ValueError):
    pass


def validar_tipo(categoria: str, mime: str, nome: str) -> None:
    """O tipo detectado pelo conteúdo deve ser aceito na categoria e combinar com a extensão."""
    permitidos = PERMITIDOS.get(categoria)
    if permitidos is not None and mime not in permitidos:
        raise MidiaInvalida(f"Arquivo do tipo {mime} não é aceito como {categoria} (use PDF, JPG, PNG ou TIFF).")
    ext = Path(nome).suffix.lower()
    if mime in EXTENSOES and ext not in EXTENSOES[mime]:
        raise MidiaInvalida(f"A extensão '{ext}' não corresponde ao conteúdo do arquivo ({mime}).")


def info_imagem(caminho: Path) -> tuple[int, int]:
    with Image.open(caminho) as im:
        return im.size


def paginas_pdf(caminho: Path) -> int:
    try:
        return len(PdfReader(str(caminho)).pages)
    except Exception as e:  # PDF corrompido ou protegido
        raise MidiaInvalida("Não foi possível ler o PDF (arquivo corrompido ou protegido).") from e


def miniatura(caminho: Path, destino: Path, tamanho: int = 360) -> Path:
    if destino.exists():
        return destino
    destino.parent.mkdir(parents=True, exist_ok=True)
    try:
        with Image.open(caminho) as im:
            im = ImageOps.exif_transpose(im)  # respeita a orientação da câmera
            im.thumbnail((tamanho, tamanho))
            im.convert("RGB").save(destino, "JPEG", quality=82)
    except (UnidentifiedImageError, OSError) as e:
        raise MidiaInvalida("Não foi possível gerar a miniatura desta imagem.") from e
    return destino


def previa_png(caminho: Path, destino: Path, lado_max: int = 2400, pagina: int = 0) -> Path:
    """Navegadores não exibem TIFF: gera uma prévia PNG (primeira página por padrão)."""
    if destino.exists():
        return destino
    destino.parent.mkdir(parents=True, exist_ok=True)
    with Image.open(caminho) as im:
        im.seek(pagina)
        im = im.copy()
        im.thumbnail((lado_max, lado_max))
        im.save(destino, "PNG", optimize=True)
    return destino


def _racional(v) -> float:
    try:
        return float(v)
    except (TypeError, ValueError, ZeroDivisionError):
        return float(v[0]) / float(v[1])


def ler_exif(caminho: Path) -> dict:
    """Subconjunto útil do EXIF: data/hora, câmera, orientação e GPS (se houver)."""
    try:
        with Image.open(caminho) as im:
            exif = im.getexif()
    except (UnidentifiedImageError, OSError):
        return {}
    if not exif:
        return {}
    tags = {ExifTags.TAGS.get(k, str(k)): v for k, v in exif.items()}
    sub = exif.get_ifd(ExifTags.IFD.Exif)
    tags.update({ExifTags.TAGS.get(k, str(k)): v for k, v in sub.items()})
    r: dict = {}
    for chave in ("DateTimeOriginal", "DateTime", "Make", "Model", "Orientation"):
        if chave in tags:
            r[chave] = str(tags[chave]).strip("\x00 ")
    gps = exif.get_ifd(ExifTags.IFD.GPSInfo)
    if gps:
        g = {ExifTags.GPSTAGS.get(k, str(k)): v for k, v in gps.items()}
        try:
            def graus(valor, ref):
                d, m, s = (_racional(x) for x in valor)
                v = d + m / 60 + s / 3600
                return -v if ref in ("S", "W") else v
            r["gps_lat"] = round(graus(g["GPSLatitude"], g.get("GPSLatitudeRef", "N")), 7)
            r["gps_lon"] = round(graus(g["GPSLongitude"], g.get("GPSLongitudeRef", "E")), 7)
            if "GPSAltitude" in g:
                r["gps_alt"] = round(_racional(g["GPSAltitude"]), 2)
        except (KeyError, TypeError, ValueError, ZeroDivisionError):
            pass
    return r


def data_exif(exif: dict) -> date | None:
    for chave in ("DateTimeOriginal", "DateTime"):
        if chave in exif:
            try:
                return datetime.strptime(exif[chave][:19], "%Y:%m:%d %H:%M:%S").date()
            except ValueError:
                continue
    return None


def separar_paginas(caminho: Path) -> list[bytes]:
    """Uma cópia PDF por página (o original fica intacto)."""
    leitor = PdfReader(str(caminho))
    saida = []
    for pagina in leitor.pages:
        w = PdfWriter()
        w.add_page(pagina)
        buf = io.BytesIO()
        w.write(buf)
        saida.append(buf.getvalue())
    return saida
