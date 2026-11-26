from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from geomina.core.dependencias import obter_sessao, requer, usuario_atual
from geomina.core.erros import ErroAplicacao
from geomina.modules.auth.models import Usuario
from geomina.modules.dicionarios.models import Dicionario, Termo, TermoSinonimo, normalizar

router = APIRouter(tags=["dicionários"])
CONFIGURAR = requer("dicionario:configurar")


class TermoSaida(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    codigo: str
    nome: str
    sigla: str | None
    descricao: str | None
    cor: str | None
    classe: str | None
    ordem: int
    ativo: bool
    versao: int
    sinonimos: list[str] = []


class DicionarioSaida(BaseModel):
    codigo: str
    nome: str
    descricao: str | None
    termos: list[TermoSaida]


class TermoEntrada(BaseModel):
    codigo: str = Field(min_length=1, max_length=30, pattern=r"^[A-Za-z0-9_]+$")
    nome: str = Field(min_length=1, max_length=120)
    sigla: str | None = Field(default=None, max_length=12)
    descricao: str | None = None
    cor: str | None = Field(default=None, pattern=r"^#[0-9a-fA-F]{6}$")
    classe: str | None = Field(default=None, pattern="^(planar|linear)$")
    ordem: int = 0


class TermoAlteracao(BaseModel):
    versao: int
    nome: str | None = Field(default=None, min_length=1, max_length=120)
    sigla: str | None = Field(default=None, max_length=12)
    descricao: str | None = None
    cor: str | None = Field(default=None, pattern=r"^#[0-9a-fA-F]{6}$")
    ordem: int | None = None
    ativo: bool | None = None


class Sinonimos(BaseModel):
    textos: list[str] = Field(max_length=100)


def _saida(db: Session) -> list[DicionarioSaida]:
    sins: dict[uuid.UUID, list[str]] = {}
    for x in db.scalars(select(TermoSinonimo).order_by(TermoSinonimo.texto)):
        sins.setdefault(x.termo_id, []).append(x.texto)
    termos: dict[uuid.UUID, list[TermoSaida]] = {}
    for t in db.scalars(select(Termo).order_by(Termo.ordem, Termo.nome)):
        o = TermoSaida.model_validate(t)
        o.sinonimos = sins.get(t.id, [])
        termos.setdefault(t.dicionario_id, []).append(o)
    return [DicionarioSaida(codigo=d.codigo, nome=d.nome, descricao=d.descricao, termos=termos.get(d.id, []))
            for d in db.scalars(select(Dicionario).order_by(Dicionario.nome))]


def _dicionario(db: Session, codigo: str) -> Dicionario:
    d = db.scalar(select(Dicionario).where(Dicionario.codigo == codigo.upper()))
    if d is None:
        raise ErroAplicacao(404, "nao_encontrado", f"Dicionário '{codigo}' não existe.")
    return d


@router.get("/dicionarios", response_model=list[DicionarioSaida])
def listar(_u: Usuario = Depends(usuario_atual), db: Session = Depends(obter_sessao)):
    return _saida(db)


@router.post("/dicionarios/{codigo}/termos", response_model=list[DicionarioSaida], status_code=201)
def criar_termo(codigo: str, e: TermoEntrada, _u: Usuario = Depends(CONFIGURAR), db: Session = Depends(obter_sessao)):
    d = _dicionario(db, codigo)
    if (d.codigo == "TIPO_ESTRUTURA") != (e.classe is not None):
        raise ErroAplicacao(422, "classe", "Tipos de estrutura exigem a classe (planar ou linear); outros termos não.")
    if db.scalar(select(Termo).where(Termo.dicionario_id == d.id, Termo.codigo == e.codigo)):
        raise ErroAplicacao(409, "duplicado", f"Já existe o código '{e.codigo}' neste dicionário.")
    if _reconhecer(db, d, e.nome):
        raise ErroAplicacao(409, "duplicado", f"'{e.nome}' já existe neste dicionário (ou é sinônimo de um termo).")
    db.add(Termo(dicionario_id=d.id, **e.model_dump()))
    db.flush()
    return _saida(db)


@router.patch("/termos/{termo_id}", response_model=list[DicionarioSaida])
def alterar_termo(termo_id: uuid.UUID, e: TermoAlteracao, _u: Usuario = Depends(CONFIGURAR),
                  db: Session = Depends(obter_sessao)):
    t = db.get(Termo, termo_id)
    if t is None:
        raise ErroAplicacao(404, "nao_encontrado", "Termo não encontrado.")
    if t.versao != e.versao:
        raise ErroAplicacao(409, "versao_desatualizada", "O termo foi alterado por outra operação. Recarregue.")
    for campo in e.model_fields_set - {"versao"}:
        setattr(t, campo, getattr(e, campo))
    db.flush()
    return _saida(db)


@router.put("/termos/{termo_id}/sinonimos", response_model=list[DicionarioSaida])
def definir_sinonimos(termo_id: uuid.UUID, e: Sinonimos, _u: Usuario = Depends(CONFIGURAR),
                      db: Session = Depends(obter_sessao)):
    t = db.get(Termo, termo_id)
    if t is None:
        raise ErroAplicacao(404, "nao_encontrado", "Termo não encontrado.")
    desejados = {normalizar(x): x.strip() for x in e.textos if x.strip()}
    for texto in desejados.values():
        outro = _reconhecer(db, db.get(Dicionario, t.dicionario_id), texto)
        if outro and outro.id != t.id:
            raise ErroAplicacao(409, "duplicado", f"'{texto}' já corresponde ao termo '{outro.nome}'.")
    for x in db.scalars(select(TermoSinonimo).where(TermoSinonimo.termo_id == t.id)):
        if x.texto_normalizado not in desejados:
            db.delete(x)
    existentes = set(db.scalars(select(TermoSinonimo.texto_normalizado).where(TermoSinonimo.termo_id == t.id)))
    for norm, texto in desejados.items():
        if norm not in existentes:
            db.add(TermoSinonimo(dicionario_id=t.dicionario_id, termo_id=t.id, texto=texto, texto_normalizado=norm))
    db.flush()
    return _saida(db)


def _reconhecer(db: Session, d: Dicionario, texto: str) -> Termo | None:
    """Encontra o termo pelo código, nome, sigla ou sinônimo, ignorando acentos, maiúsculas e espaços."""
    alvo = normalizar(texto)
    for t in db.scalars(select(Termo).where(Termo.dicionario_id == d.id)):
        if alvo in {normalizar(t.codigo), normalizar(t.nome), normalizar(t.sigla or "\0")}:
            return t
    sin = db.scalar(select(TermoSinonimo).where(TermoSinonimo.dicionario_id == d.id,
                                                TermoSinonimo.texto_normalizado == alvo))
    return db.get(Termo, sin.termo_id) if sin else None


@router.get("/dicionarios/{codigo}/reconhecer", response_model=TermoSaida | None)
def reconhecer(codigo: str, texto: str, _u: Usuario = Depends(usuario_atual), db: Session = Depends(obter_sessao)):
    t = _reconhecer(db, _dicionario(db, codigo), texto)
    return TermoSaida.model_validate(t) if t else None
