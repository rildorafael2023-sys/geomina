from __future__ import annotations

import sqlite3

import pyproj
from fastapi import APIRouter, Depends, Request
from sqlalchemy import text
from sqlalchemy.orm import Session

from geomina.config import VERSAO_APP
from geomina.core.dependencias import obter_sessao

router = APIRouter(tags=["sistema"])

# Sistemas de coordenadas confirmados pelo usuário em 2026-11-25.
CRS_DA_MINA = {29193: "SAD69 / UTM zone 23S", 31983: "SIRGAS 2000 / UTM zone 23S"}


def _rtree_disponivel(db: Session) -> bool:
    try:
        db.execute(text("CREATE VIRTUAL TABLE temp._teste_rtree USING rtree(id, a, b)"))
        db.execute(text("DROP TABLE temp._teste_rtree"))
        return True
    except Exception:
        return False


@router.get("/saude")
def saude(request: Request, db: Session = Depends(obter_sessao)) -> dict:
    """Situação do aplicativo local. Não exige login (não expõe dados da mina)."""
    revisao = db.execute(text("SELECT version_num FROM alembic_version")).scalar()
    crs = {}
    for codigo, esperado in CRS_DA_MINA.items():
        try:
            crs[str(codigo)] = pyproj.CRS.from_epsg(codigo).name == esperado
        except pyproj.exceptions.CRSError:
            crs[str(codigo)] = False
    return {
        "status": "ok",
        "versao_app": VERSAO_APP,
        "revisao_banco": revisao,
        "sqlite": sqlite3.sqlite_version,
        "rtree": _rtree_disponivel(db),
        "proj": pyproj.proj_version_str,
        "crs_disponiveis": crs,
        "pasta_dados": str(request.app.state.config.dados),
        "modo": "local (somente este computador)",
    }
