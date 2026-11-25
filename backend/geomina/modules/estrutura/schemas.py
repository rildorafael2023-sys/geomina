from __future__ import annotations

import uuid
from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

Status = Literal["ativa", "paralisada", "encerrada"]
CODIGO = r"^[A-Za-z0-9][A-Za-z0-9 ._/\-]*$"


class MinaEntrada(BaseModel):
    codigo: str = Field(min_length=1, max_length=30, pattern=CODIGO)
    nome: str = Field(min_length=2, max_length=120)
    srid_trabalho: int
    declinacao_magnetica: float | None = Field(default=None, ge=-90, le=90)
    observacoes: str | None = None


class MinaAlteracao(BaseModel):
    versao: int
    nome: str | None = Field(default=None, min_length=2, max_length=120)
    declinacao_magnetica: float | None = Field(default=None, ge=-90, le=90)
    observacoes: str | None = None


class MinaSaida(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    codigo: str
    nome: str
    srid_trabalho: int
    crs_nome: str | None = None
    declinacao_magnetica: float | None
    observacoes: str | None
    ativo: bool
    versao: int


class TipoUnidadeEntrada(BaseModel):
    codigo: str = Field(min_length=2, max_length=30, pattern=r"^[A-Z0-9_]+$")
    nome: str = Field(min_length=2, max_length=60)
    pode_ser_raiz: bool = False
    possui_eixo: bool = False
    multinivel: bool = False
    e_nivel: bool = False
    e_frente: bool = False
    cor: str | None = Field(default=None, pattern=r"^#[0-9a-fA-F]{6}$")
    ordem: int = 0


class TipoUnidadeAlteracao(BaseModel):
    versao: int
    nome: str | None = Field(default=None, min_length=2, max_length=60)
    pode_ser_raiz: bool | None = None
    possui_eixo: bool | None = None
    multinivel: bool | None = None
    e_nivel: bool | None = None
    e_frente: bool | None = None
    cor: str | None = Field(default=None, pattern=r"^#[0-9a-fA-F]{6}$")
    ordem: int | None = None
    ativo: bool | None = None


class TipoUnidadeSaida(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    codigo: str
    nome: str
    pode_ser_raiz: bool
    possui_eixo: bool
    multinivel: bool
    e_nivel: bool
    e_frente: bool
    cor: str | None
    ordem: int
    ativo: bool
    versao: int
    filhos_permitidos: list[str] = []


class RegrasEntrada(BaseModel):
    """Conjunto completo de regras: código do tipo-pai → códigos dos tipos-filho permitidos."""

    regras: dict[str, list[str]]


class UnidadeEntrada(BaseModel):
    mina_id: uuid.UUID
    tipo: str = Field(description="código do tipo de unidade, ex.: GALERIA")
    pai_id: uuid.UUID | None = None
    codigo: str = Field(min_length=1, max_length=40, pattern=CODIGO)
    nome: str = Field(min_length=1, max_length=120)
    status: Status = "ativa"
    cota_referencia: float | None = Field(default=None, ge=-2000, le=9000)
    descricao: str | None = None
    niveis: list[uuid.UUID] = []


class UnidadeAlteracao(BaseModel):
    versao: int
    codigo: str | None = Field(default=None, min_length=1, max_length=40, pattern=CODIGO)
    nome: str | None = Field(default=None, min_length=1, max_length=120)
    status: Status | None = None
    cota_referencia: float | None = Field(default=None, ge=-2000, le=9000)
    descricao: str | None = None
    ativo: bool | None = None


class Mover(BaseModel):
    versao: int
    novo_pai_id: uuid.UUID | None


class NiveisEntrada(BaseModel):
    niveis: list[uuid.UUID]


class UnidadeResumo(BaseModel):
    id: uuid.UUID
    mina_id: uuid.UUID
    pai_id: uuid.UUID | None
    tipo: str
    tipo_nome: str
    codigo: str
    nome: str
    status: Status
    ativo: bool
    versao: int


class UnidadeDetalhe(UnidadeResumo):
    cota_referencia: float | None
    descricao: str | None
    caminho_nomes: list[str]
    niveis: list[UnidadeResumo]
    filhos: int
    criado_em: datetime
    atualizado_em: datetime | None


class AvancoEntrada(BaseModel):
    data: date
    distancia_m: float | None = Field(default=None, ge=0, le=100000)
    referencia: str | None = Field(default=None, max_length=120)
    avanco_m: float | None = Field(default=None, ge=0, le=1000)
    x: float | None = None
    y: float | None = None
    z: float | None = None
    observacao: str | None = None


class AvancoAlteracao(AvancoEntrada):
    versao: int


class AvancoSaida(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    frente_id: uuid.UUID
    data: date
    distancia_m: float | None
    referencia: str | None
    avanco_m: float | None
    x: float | None
    y: float | None
    z: float | None
    responsavel_id: uuid.UUID | None
    responsavel_nome: str | None = None
    observacao: str | None
    versao: int
    criado_em: datetime


class EventoHistorico(BaseModel):
    ocorrido_em: datetime
    tabela: str
    operacao: str
    descricao: str
    usuario: str | None
    antes: dict | None
    depois: dict | None
