from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from geomina.core.dependencias import obter_sessao, requer
from geomina.core.erros import ErroAplicacao
from geomina.modules.auth.models import Usuario
from geomina.modules.estrutura import schemas as s
from geomina.modules.estrutura import service
from geomina.modules.estrutura.models import FrenteAvanco, Mina, TipoUnidade

router = APIRouter(tags=["estrutura da mina"])
LER = requer("estrutura:ler")
EDITAR = requer("estrutura:editar")
CONFIGURAR = requer("estrutura:configurar")
AVANCO = requer("avanco:registrar")


# ------------------------------------------------------------------ minas
@router.get("/minas", response_model=list[s.MinaSaida])
def listar_minas(_u: Usuario = Depends(LER), db: Session = Depends(obter_sessao)):
    return [service.mina_saida(m) for m in db.scalars(select(Mina).order_by(Mina.nome))]


@router.post("/minas", response_model=s.MinaSaida, status_code=201)
def criar_mina(d: s.MinaEntrada, _u: Usuario = Depends(CONFIGURAR), db: Session = Depends(obter_sessao)):
    return service.mina_saida(service.criar_mina(db, d))


@router.patch("/minas/{mina_id}", response_model=s.MinaSaida)
def alterar_mina(mina_id: uuid.UUID, d: s.MinaAlteracao, _u: Usuario = Depends(CONFIGURAR),
                 db: Session = Depends(obter_sessao)):
    m = db.get(Mina, mina_id)
    if m is None:
        raise ErroAplicacao(404, "nao_encontrado", "Mina não encontrada.")
    return service.mina_saida(service.alterar_mina(db, m, d))


@router.get("/minas/{mina_id}/unidades", response_model=list[s.UnidadeResumo])
def listar_unidades(mina_id: uuid.UUID, incluir_inativas: bool = True, nivel_id: uuid.UUID | None = None,
                    tipo: str | None = None, texto: str | None = None, _u: Usuario = Depends(LER),
                    db: Session = Depends(obter_sessao)):
    """Lista plana (a interface monta a árvore por pai_id). `nivel_id` inclui rampas vinculadas ao nível."""
    return service.listar(db, mina_id, incluir_inativas=incluir_inativas, nivel_id=nivel_id, tipo=tipo, texto=texto)


# ------------------------------------------------------------------ tipos e regras
@router.get("/tipos-unidade", response_model=list[s.TipoUnidadeSaida])
def listar_tipos(_u: Usuario = Depends(LER), db: Session = Depends(obter_sessao)):
    return service.tipos_saida(db)


@router.post("/tipos-unidade", status_code=201, response_model=list[s.TipoUnidadeSaida])
def criar_tipo(d: s.TipoUnidadeEntrada, _u: Usuario = Depends(CONFIGURAR), db: Session = Depends(obter_sessao)):
    service.criar_tipo(db, d)
    return service.tipos_saida(db)


@router.patch("/tipos-unidade/{tipo_id}", response_model=list[s.TipoUnidadeSaida])
def alterar_tipo(tipo_id: uuid.UUID, d: s.TipoUnidadeAlteracao, _u: Usuario = Depends(CONFIGURAR),
                 db: Session = Depends(obter_sessao)):
    t = db.get(TipoUnidade, tipo_id)
    if t is None:
        raise ErroAplicacao(404, "nao_encontrado", "Tipo de unidade não encontrado.")
    service.alterar_tipo(db, t, d)
    return service.tipos_saida(db)


@router.put("/regras-hierarquia", response_model=list[s.TipoUnidadeSaida])
def definir_regras(d: s.RegrasEntrada, _u: Usuario = Depends(CONFIGURAR), db: Session = Depends(obter_sessao)):
    service.definir_regras(db, d)
    return service.tipos_saida(db)


# ------------------------------------------------------------------ unidades
@router.post("/unidades", response_model=s.UnidadeDetalhe, status_code=201)
def criar_unidade(d: s.UnidadeEntrada, _u: Usuario = Depends(EDITAR), db: Session = Depends(obter_sessao)):
    return service.detalhe(db, service.criar_unidade(db, d))


@router.get("/unidades/{unidade_id}", response_model=s.UnidadeDetalhe)
def obter_unidade(unidade_id: uuid.UUID, _u: Usuario = Depends(LER), db: Session = Depends(obter_sessao)):
    return service.detalhe(db, service.buscar_unidade(db, unidade_id))


@router.patch("/unidades/{unidade_id}", response_model=s.UnidadeDetalhe)
def alterar_unidade(unidade_id: uuid.UUID, d: s.UnidadeAlteracao, _u: Usuario = Depends(EDITAR),
                    db: Session = Depends(obter_sessao)):
    return service.detalhe(db, service.alterar_unidade(db, service.buscar_unidade(db, unidade_id), d))


@router.post("/unidades/{unidade_id}/mover", response_model=s.UnidadeDetalhe)
def mover_unidade(unidade_id: uuid.UUID, d: s.Mover, _u: Usuario = Depends(EDITAR),
                  db: Session = Depends(obter_sessao)):
    return service.detalhe(db, service.mover_unidade(db, service.buscar_unidade(db, unidade_id), d))


@router.put("/unidades/{unidade_id}/niveis", response_model=s.UnidadeDetalhe)
def definir_niveis(unidade_id: uuid.UUID, d: s.NiveisEntrada, _u: Usuario = Depends(EDITAR),
                   db: Session = Depends(obter_sessao)):
    u = service.buscar_unidade(db, unidade_id)
    service.definir_niveis(db, u, d.niveis)
    return service.detalhe(db, u)


@router.delete("/unidades/{unidade_id}", status_code=204)
def excluir_unidade(unidade_id: uuid.UUID, _u: Usuario = Depends(EDITAR), db: Session = Depends(obter_sessao)):
    service.excluir_unidade(db, service.buscar_unidade(db, unidade_id))


@router.get("/unidades/{unidade_id}/historico", response_model=list[s.EventoHistorico])
def historico(unidade_id: uuid.UUID, _u: Usuario = Depends(LER), db: Session = Depends(obter_sessao)):
    return service.historico(db, service.buscar_unidade(db, unidade_id))


# ------------------------------------------------------------------ avanços de frente
@router.get("/unidades/{unidade_id}/avancos", response_model=list[s.AvancoSaida])
def listar_avancos(unidade_id: uuid.UUID, _u: Usuario = Depends(LER), db: Session = Depends(obter_sessao)):
    return service.listar_avancos(db, service.buscar_unidade(db, unidade_id))


@router.post("/unidades/{unidade_id}/avancos", response_model=s.AvancoSaida, status_code=201)
def registrar_avanco(unidade_id: uuid.UUID, d: s.AvancoEntrada, u: Usuario = Depends(AVANCO),
                     db: Session = Depends(obter_sessao)):
    a = service.registrar_avanco(db, service.buscar_unidade(db, unidade_id), d, u)
    o = s.AvancoSaida.model_validate(a)
    o.responsavel_nome = u.nome
    return o


@router.put("/avancos/{avanco_id}", response_model=s.AvancoSaida)
def alterar_avanco(avanco_id: uuid.UUID, d: s.AvancoAlteracao, _u: Usuario = Depends(AVANCO),
                   db: Session = Depends(obter_sessao)):
    a = db.get(FrenteAvanco, avanco_id)
    if a is None:
        raise ErroAplicacao(404, "nao_encontrado", "Avanço não encontrado.")
    return s.AvancoSaida.model_validate(service.alterar_avanco(db, a, d))
