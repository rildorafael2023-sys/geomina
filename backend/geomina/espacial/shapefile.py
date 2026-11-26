"""Leitor próprio de shapefile (.shp/.shx/.dbf/.prj/.cpg), inclusive de dentro de um .zip.

Por que próprio: controle total sobre o Z. Cada vértice é lido com X, Y e Z exatamente como gravados.
A faixa de Z do cabeçalho não é usada (no levantamento real ela vem como -1,8e308).
Tipos: Point/PolyLine/Polygon/MultiPoint (2D), …M, …Z. MultiPatch (31) é recusado explicitamente.
"""

from __future__ import annotations

import struct
import zipfile
from dataclasses import dataclass, field
from pathlib import PurePosixPath

import numpy as np
import pyproj

NOMES = {0: "Nula", 1: "Point", 3: "PolyLine", 5: "Polygon", 8: "MultiPoint", 11: "PointZ", 13: "PolyLineZ",
         15: "PolygonZ", 18: "MultiPointZ", 21: "PointM", 23: "PolyLineM", 25: "PolygonM", 28: "MultiPointM", 31: "MultiPatch"}
COM_Z = {11, 13, 15, 18}


class ShapefileInvalido(ValueError):
    pass


@dataclass
class Feicao:
    indice: int  # posição no arquivo (0 = primeiro registro)
    tipo: int
    partes: list[np.ndarray] = field(default_factory=list)  # cada parte: array (n, 3) ou (n, 2)
    atributos: dict = field(default_factory=dict)

    @property
    def vazia(self) -> bool:
        return not self.partes or all(len(p) == 0 for p in self.partes)


@dataclass
class Camada:
    nome: str
    tipo: int
    feicoes: list[Feicao]
    campos: list[tuple[str, str]]
    prj: str | None
    encoding: str


LIMITE_MEMBRO = 2 * 2**30  # 2 GB por arquivo dentro do zip (proteção contra zip malformado)

def listar_camadas(dados_zip: bytes) -> list[str]:
    with zipfile.ZipFile(_bytes_io(dados_zip)) as z:
        return sorted(n for n in z.namelist() if n.lower().endswith(".shp") and not n.startswith("__MACOSX"))


def _bytes_io(b: bytes):
    import io
    return io.BytesIO(b)


def ler_do_zip(dados_zip: bytes, membro_shp: str) -> Camada:
    with zipfile.ZipFile(_bytes_io(dados_zip)) as z:
        nomes = {n.lower(): n for n in z.namelist()}
        base = membro_shp[:-4]

        def ler(ext, obrigatorio=True):
            n = nomes.get((base + ext).lower())
            if n is None:
                if obrigatorio:
                    raise ShapefileInvalido(f"Falta o arquivo {PurePosixPath(base).name}{ext} no zip.")
                return None
            info = z.getinfo(n)
            if info.file_size > LIMITE_MEMBRO:
                raise ShapefileInvalido(f"{PurePosixPath(n).name} tem mais de {LIMITE_MEMBRO // 2**20} MB descompactado.")
            if info.compress_size and info.file_size / info.compress_size > 1000:
                raise ShapefileInvalido(f"{PurePosixPath(n).name}: taxa de compressão suspeita (arquivo malformado).")
            return z.read(n)
        return ler_bytes(PurePosixPath(base).name, ler(".shp"), ler(".dbf"), ler(".prj", False), ler(".cpg", False))


def ler_bytes(nome: str, shp: bytes, dbf: bytes, prj: bytes | None, cpg: bytes | None) -> Camada:
    if len(shp) < 100 or struct.unpack(">i", shp[:4])[0] != 9994:
        raise ShapefileInvalido("Arquivo .shp inválido (assinatura).")
    tipo = struct.unpack("<i", shp[32:36])[0]
    if tipo == 31:
        raise ShapefileInvalido("MultiPatch (superfícies 3D) ainda não é suportado.")
    if tipo not in NOMES:
        raise ShapefileInvalido(f"Tipo de geometria {tipo} desconhecido.")
    encoding = (cpg.decode("ascii", "ignore").strip() if cpg else "") or "latin-1"
    encoding = {"65001": "utf-8", "utf8": "utf-8", "1252": "cp1252", "ansi 1252": "cp1252"}.get(encoding.lower(), encoding.lower())
    campos, registros = _dbf(dbf, encoding)
    feicoes, o, i = [], 100, 0
    while o + 8 <= len(shp):
        _, tam = struct.unpack(">ii", shp[o:o + 8])
        rec = shp[o + 8:o + 8 + tam * 2]
        o += 8 + tam * 2
        f = _registro(i, rec)
        f.atributos = registros[i] if i < len(registros) else {}
        feicoes.append(f)
        i += 1
    return Camada(nome, tipo, feicoes, campos, prj.decode("latin-1", "ignore") if prj else None, encoding)


def _registro(i: int, rec: bytes) -> Feicao:
    t = struct.unpack("<i", rec[:4])[0]
    if t == 0:
        return Feicao(i, 0)
    if t in (1, 11, 21):
        x, y = struct.unpack("<2d", rec[4:20])
        pt = np.array([[x, y, struct.unpack("<d", rec[20:28])[0]]]) if t == 11 else np.array([[x, y]])
        return Feicao(i, t, [pt])
    if t in (8, 18, 28):
        n = struct.unpack("<i", rec[36:40])[0]
        xy = np.frombuffer(rec[40:40 + 16 * n], "<f8").reshape(-1, 2)
        if t == 18:
            z = np.frombuffer(rec[40 + 16 * n + 16:40 + 16 * n + 16 + 8 * n], "<f8")
            return Feicao(i, t, [np.column_stack([xy, z])])
        return Feicao(i, t, [xy.copy()])
    np_, n = struct.unpack("<ii", rec[36:44])
    inicios = list(struct.unpack(f"<{np_}i", rec[44:44 + 4 * np_])) + [n]
    p0 = 44 + 4 * np_
    xy = np.frombuffer(rec[p0:p0 + 16 * n], "<f8").reshape(-1, 2)
    if t in COM_Z:
        zo = p0 + 16 * n + 16
        z = np.frombuffer(rec[zo:zo + 8 * n], "<f8")
        pts = np.column_stack([xy, z])
    else:
        pts = xy.copy()
    return Feicao(i, t, [pts[inicios[k]:inicios[k + 1]] for k in range(np_)])


def _dbf(b: bytes, encoding: str) -> tuple[list[tuple[str, str]], list[dict]]:
    n, hlen, rlen = struct.unpack("<IHH", b[4:12])
    campos, o = [], 32
    while b[o] != 0x0D:
        campos.append((b[o:o + 11].split(b"\0")[0].decode("latin-1"), chr(b[o + 11]), b[o + 16]))
        o += 32
    regs = []
    for i in range(n):
        r = b[hlen + i * rlen:hlen + (i + 1) * rlen]
        p, d = 1, {}
        for nome, tipo, tam in campos:
            bruto = r[p:p + tam].decode(encoding, "replace").strip()
            p += tam
            if tipo in ("N", "F") and bruto:
                try:
                    d[nome] = float(bruto)
                except ValueError:
                    d[nome] = bruto
            else:
                d[nome] = bruto or None
        regs.append(d)
    return [(c[0], c[1]) for c in campos], regs


def crs_do_prj(prj: str | None) -> tuple[int | None, str | None]:
    """(EPSG, nome) a partir do .prj. EPSG None = não identificado com segurança."""
    if not prj:
        return None, None
    try:
        crs = pyproj.CRS.from_wkt(prj)
    except pyproj.exceptions.CRSError:
        return None, None
    return crs.to_epsg(min_confidence=70), crs.name
