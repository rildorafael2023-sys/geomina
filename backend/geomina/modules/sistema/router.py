from __future__ import annotations

import sqlite3

import pyproj
from fastapi import APIRouter, Depends, Header, Request
from sqlalchemy import text
from sqlalchemy.orm import Session

from geomina.config import VERSAO_APP
from geomina.core.dependencias import obter_sessao
from geomina.core.erros import ErroAplicacao

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


def _cabecalho_geomina(x_geomina: str | None = Header(default=None)) -> None:
    # Exigir um cabeçalho próprio impede que outras páginas abertas no navegador disparem estas
    # rotas (um cabeçalho personalizado obriga a uma verificação CORS que o servidor não concede).
    if x_geomina != "1":
        raise ErroAplicacao(400, "cabecalho_ausente", "Requisição inválida.")


@router.post("/sistema/presenca", status_code=204, dependencies=[Depends(_cabecalho_geomina)])
def presenca(request: Request) -> None:
    """Sinal de vida enviado periodicamente pela interface aberta."""
    request.app.state.presenca.sinal()


@router.post("/sistema/fechando", status_code=204, dependencies=[Depends(_cabecalho_geomina)])
def fechando(request: Request) -> None:
    """A janela está sendo fechada ou recarregada; se nenhum sinal chegar em seguida, o aplicativo encerra."""
    request.app.state.presenca.fechando()
