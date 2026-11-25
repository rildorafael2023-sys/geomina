"""Serialização de geometrias 3D para o banco local (DT-017).

O SQLite não possui tipo geométrico. As geometrias são gravadas como WKB (padrão OGC,
o mesmo usado por GeoPackage e PostGIS), sempre preservando Z; o SRID fica em coluna
própria. A indexação espacial usa o módulo R*Tree do SQLite (caixas 3D).

Regras (RNF-05, RNF-06):
- nunca descartar Z;
- nunca inventar Z: geometria 2D é gravada como 2D e identificada como tal.
"""

from __future__ import annotations

from dataclasses import dataclass

import shapely
from shapely.geometry.base import BaseGeometry


class GeometriaInvalida(ValueError):
    pass


@dataclass(frozen=True)
class Caixa3D:
    minx: float
    maxx: float
    miny: float
    maxy: float
    minz: float | None
    maxz: float | None


def para_wkb(geom: BaseGeometry) -> bytes:
    if geom is None or geom.is_empty:
        raise GeometriaInvalida("geometria vazia")
    return shapely.to_wkb(geom, output_dimension=3 if geom.has_z else 2, include_srid=False)


def de_wkb(dados: bytes) -> BaseGeometry:
    return shapely.from_wkb(dados)


def possui_z(geom: BaseGeometry) -> bool:
    return bool(geom.has_z)


def caixa(geom: BaseGeometry) -> Caixa3D:
    coords = shapely.get_coordinates(geom, include_z=geom.has_z)
    if len(coords) == 0:
        raise GeometriaInvalida("geometria sem coordenadas")
    if geom.has_z:
        return Caixa3D(coords[:, 0].min(), coords[:, 0].max(), coords[:, 1].min(), coords[:, 1].max(),
                       coords[:, 2].min(), coords[:, 2].max())
    return Caixa3D(coords[:, 0].min(), coords[:, 0].max(), coords[:, 1].min(), coords[:, 1].max(), None, None)
