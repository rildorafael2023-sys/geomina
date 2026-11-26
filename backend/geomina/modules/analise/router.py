from __future__ import annotations

import uuid
from datetime import date

from fastapi import APIRouter, Depends, Query
from fastapi.responses import Response
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from geomina.core.dependencias import obter_sessao, requer
from geomina.modules.amostragem.models import Amostra
from geomina.modules.analise import longitudinal as L
from geomina.modules.auth.models import Usuario
from geomina.modules.estrutura.models import TipoUnidade, UnidadeOperacional
from geomina.modules.topografia.models import EixoVersao

router = APIRouter(tags=["análise"])
LER = requer("geoquimica:ler")


def _ids(v: str | None) -> list[uuid.UUID]:
    return [uuid.UUID(x) for x in v.split(",") if x] if v else []


def _filtros(litologias: str | None = None, alteracoes: str | None = None, mineralizacoes: str | None = None,
             estruturas: str | None = None, data_de: date | None = None, data_ate: date | None = None,
             responsaveis: str | None = None, tipos: str | None = None, campanhas: str | None = None,
             chainage_de: float | None = None, chainage_ate: float | None = None, teor_analito: str | None = None,
             teor_min: float | None = None, teor_max: float | None = None, incluir_duplicatas: bool = False) -> L.Filtros:
    return L.Filtros(_ids(litologias), _ids(alteracoes), _ids(mineralizacoes), _ids(estruturas), data_de, data_ate,
                     _ids(responsaveis), _ids(tipos), _ids(campanhas), chainage_de, chainage_ate, teor_analito or None,
                     teor_min, teor_max, incluir_duplicatas)


@router.get("/minas/{mina_id}/longitudinal/unidades")
def unidades_longitudinal(mina_id: uuid.UUID, _u: Usuario = Depends(LER), db: Session = Depends(obter_sessao)) -> list[dict]:
    """Galerias, travessas, rampas… (tipos com eixo) com o número de amostras com coordenadas nelas e nas unidades internas."""
    q = (select(UnidadeOperacional, TipoUnidade.nome, EixoVersao)
         .join(TipoUnidade, TipoUnidade.id == UnidadeOperacional.tipo_id)
         .outerjoin(EixoVersao, (EixoVersao.unidade_id == UnidadeOperacional.id) & EixoVersao.vigente.is_(True))
         .where(UnidadeOperacional.mina_id == mina_id, TipoUnidade.possui_eixo.is_(True)).order_by(UnidadeOperacional.caminho))
    contagem = dict(db.execute(select(UnidadeOperacional.caminho, func.count(Amostra.id)).join(Amostra, Amostra.unidade_id == UnidadeOperacional.id)
                               .where(UnidadeOperacional.mina_id == mina_id, Amostra.x.is_not(None), Amostra.estado != "cancelada")
                               .group_by(UnidadeOperacional.caminho)).all())
    out = []
    for u, t, e in db.execute(q):
        n = sum(c for cam, c in contagem.items() if cam.startswith(u.caminho))
        out.append({"id": u.id, "codigo": u.codigo, "nome": u.nome, "tipo": t, "caminho": u.caminho, "ativo": u.ativo, "amostras": n,
                    "eixo_versao": e.numero if e else None, "comprimento_eixo": round(e.comprimento_3d, 1) if e else None})
    return out


@router.get("/unidades/{unidade_id}/longitudinal")
def longitudinal(unidade_id: uuid.UUID, analitos: str = Query(..., description="códigos separados por vírgula, ex.: Cr,Be,MgO"),
                 regra_ld: str = "limite", referencia: str = "auto", inverter: bool = False, f: L.Filtros = Depends(_filtros),
                 _u: Usuario = Depends(LER), db: Session = Depends(obter_sessao)) -> dict:
    return L.serie(db, unidade_id, [a for a in analitos.split(",") if a], f, regra_ld, referencia, inverter)


@router.get("/unidades/{unidade_id}/longitudinal.csv")
def longitudinal_csv(unidade_id: uuid.UUID, analitos: str = Query(...), regra_ld: str = "limite", referencia: str = "auto",
                     inverter: bool = False, f: L.Filtros = Depends(_filtros), _u: Usuario = Depends(LER),
                     db: Session = Depends(obter_sessao)) -> Response:
    d = L.serie(db, unidade_id, [a for a in analitos.split(",") if a], f, regra_ld, referencia, inverter)
    nome = f"longitudinal_{d['unidade']['codigo']}.csv".replace(" ", "_")
    return Response(("﻿" + L.csv_serie(d)).encode("utf-8"), media_type="text/csv; charset=utf-8",
                    headers={"Content-Disposition": f'attachment; filename="{nome}"'})
