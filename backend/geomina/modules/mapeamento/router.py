from __future__ import annotations

import uuid
from datetime import date

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from geomina.core.dependencias import obter_sessao, requer
from geomina.modules.auth.models import Usuario
from geomina.modules.mapeamento import schemas as s
from geomina.modules.mapeamento import service
from geomina.modules.mapeamento.regras import normalizar_codigo

router = APIRouter(tags=["mapeamento geológico"])
LER = requer("mapeamento:ler")
EDITAR = requer("mapeamento:editar")
APROVAR = requer("mapeamento:aprovar")


@router.get("/minas/{mina_id}/mapeamentos", response_model=list[s.FichaResumo])
def listar(mina_id: uuid.UUID, unidade_id: uuid.UUID | None = None, geologo_id: uuid.UUID | None = None,
           estado: s.Estado | None = None, de: date | None = None, ate: date | None = None,
           litologia_id: uuid.UUID | None = None, texto: str | None = None, _u: Usuario = Depends(LER),
           db: Session = Depends(obter_sessao)):
    return service.listar(db, mina_id, unidade_id=unidade_id, geologo_id=geologo_id, estado=estado, de=de, ate=ate,
                          litologia_id=litologia_id, texto=texto)


@router.post("/mapeamentos", response_model=s.FichaSaida, status_code=201)
def criar(d: s.FichaEntrada, u: Usuario = Depends(EDITAR), db: Session = Depends(obter_sessao)):
    return service.detalhe(db, service.criar(db, d, u), u)


@router.get("/mapeamentos/{ficha_id}", response_model=s.FichaSaida)
def obter(ficha_id: uuid.UUID, u: Usuario = Depends(LER), db: Session = Depends(obter_sessao)):
    return service.detalhe(db, service.buscar(db, ficha_id), u)


@router.put("/mapeamentos/{ficha_id}", response_model=s.FichaSaida)
def alterar(ficha_id: uuid.UUID, d: s.FichaAlteracao, u: Usuario = Depends(EDITAR),
            db: Session = Depends(obter_sessao)):
    return service.detalhe(db, service.alterar(db, service.buscar(db, ficha_id), d, u), u)


@router.delete("/mapeamentos/{ficha_id}", status_code=204)
def excluir(ficha_id: uuid.UUID, u: Usuario = Depends(EDITAR), db: Session = Depends(obter_sessao)):
    service.excluir(db, service.buscar(db, ficha_id), u)


@router.post("/mapeamentos/{ficha_id}/submeter", response_model=s.FichaSaida)
def submeter(ficha_id: uuid.UUID, u: Usuario = Depends(EDITAR), db: Session = Depends(obter_sessao)):
    m = service.buscar(db, ficha_id)
    service.submeter(db, m, u)
    return service.detalhe(db, m, u)


@router.post("/mapeamentos/{ficha_id}/aprovar", response_model=s.FichaSaida)
def aprovar(ficha_id: uuid.UUID, u: Usuario = Depends(APROVAR), db: Session = Depends(obter_sessao)):
    m = service.buscar(db, ficha_id)
    service.aprovar(db, m, u)
    return service.detalhe(db, m, u)


@router.post("/mapeamentos/{ficha_id}/devolver", response_model=s.FichaSaida)
def devolver(ficha_id: uuid.UUID, d: s.Motivo, u: Usuario = Depends(APROVAR), db: Session = Depends(obter_sessao)):
    m = service.buscar(db, ficha_id)
    service.devolver(db, m, d.motivo, u)
    return service.detalhe(db, m, u)


@router.post("/mapeamentos/{ficha_id}/reabrir", response_model=s.FichaSaida)
def reabrir(ficha_id: uuid.UUID, d: s.Motivo, u: Usuario = Depends(APROVAR), db: Session = Depends(obter_sessao)):
    m = service.buscar(db, ficha_id)
    service.reabrir(db, m, d.motivo, u)
    return service.detalhe(db, m, u)


@router.post("/mapeamentos/{ficha_id}/cancelar", response_model=s.FichaSaida)
def cancelar(ficha_id: uuid.UUID, d: s.Motivo, u: Usuario = Depends(EDITAR), db: Session = Depends(obter_sessao)):
    m = service.buscar(db, ficha_id)
    service.cancelar(db, m, d.motivo, u)
    return service.detalhe(db, m, u)


@router.get("/mapeamentos/{ficha_id}/revisoes", response_model=list[s.RevisaoSaida])
def revisoes(ficha_id: uuid.UUID, _u: Usuario = Depends(LER), db: Session = Depends(obter_sessao)):
    return service.revisoes(db, service.buscar(db, ficha_id))


@router.get("/codigos-amostra/verificar")
def verificar_codigo(codigo: str, _u: Usuario = Depends(LER)) -> dict:
    """Mostra como um código digitado será gravado (forma canônica) ou por que não é aceito."""
    c = normalizar_codigo(codigo)
    return {"original": c.original, "codigo": c.codigo, "sugestao": c.sugestao, "aviso": c.aviso}
