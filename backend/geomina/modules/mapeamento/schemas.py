from __future__ import annotations

import uuid
from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, Field

Estado = Literal["rascunho", "submetido", "aprovado", "cancelado"]


class IntervaloEntrada(BaseModel):
    id: uuid.UUID | None = None
    de_m: float = Field(ge=0, le=1000)
    ate_m: float = Field(gt=0, le=1000)
    litologia_id: uuid.UUID
    textura_id: uuid.UUID | None = None
    granulacao: str | None = Field(default=None, max_length=40)
    cor: str | None = Field(default=None, max_length=40)
    alteracao_id: uuid.UUID | None = None
    intensidade_id: uuid.UUID | None = None
    mineralizacao_id: uuid.UUID | None = None
    minerais: str | None = Field(default=None, max_length=200)
    percentual: float | None = Field(default=None, ge=0, le=100)
    contato_id: uuid.UUID | None = None
    descricao: str | None = None


class MedidaEntrada(BaseModel):
    id: uuid.UUID | None = None
    tipo_id: uuid.UUID
    convencao: Literal["dipdir_dip", "strike_rhr_dip", "trend_plunge"] = "dipdir_dip"
    valor_a: float = Field(description="direção de mergulho, rumo (RHR) ou rumo do caimento")
    valor_b: float = Field(description="mergulho ou caimento")
    familia: str | None = Field(default=None, max_length=20)
    espessura_m: float | None = Field(default=None, ge=0, le=1000)
    preenchimento: str | None = Field(default=None, max_length=120)
    movimento: str | None = Field(default=None, max_length=60)
    intervalo_indice: int | None = Field(default=None, ge=0, description="posição do intervalo na lista enviada")
    observacao: str | None = None


class AmostraEntrada(BaseModel):
    id: uuid.UUID | None = None
    codigo: str = Field(min_length=1, max_length=40)
    tipo: str | None = Field(default=None, max_length=40)
    de_m: float | None = Field(default=None, ge=0, le=1000)
    ate_m: float | None = Field(default=None, gt=0, le=1000)
    destino_id: uuid.UUID | None = None
    leitura_campo: str | None = Field(default=None, max_length=200)
    observacao: str | None = None


class FichaEntrada(BaseModel):
    unidade_id: uuid.UUID
    data: date
    hora: str | None = Field(default=None, pattern=r"^([01]\d|2[0-3]):[0-5]\d$")
    acompanhantes: str | None = Field(default=None, max_length=200)
    exposicao_id: uuid.UUID | None = None
    distancia_m: float | None = Field(default=None, ge=0, le=100000)
    referencia: str | None = Field(default=None, max_length=120)
    x: float | None = None
    y: float | None = None
    z: float | None = None
    azimute_eixo: float | None = Field(default=None, ge=0, lt=360)
    largura_m: float | None = Field(default=None, gt=0, le=100)
    altura_m: float | None = Field(default=None, gt=0, le=100)
    norte_referencia: Literal["magnetico", "quadricula", "verdadeiro"] = "magnetico"
    declinacao: float | None = Field(default=None, ge=-90, le=90)
    descricao: str | None = None
    agua_id: uuid.UUID | None = None
    obs_geotecnicas: str | None = None
    intervalos: list[IntervaloEntrada] = []
    medidas: list[MedidaEntrada] = []
    amostras: list[AmostraEntrada] = []


class FichaAlteracao(FichaEntrada):
    versao: int


class Motivo(BaseModel):
    motivo: str = Field(min_length=3, max_length=2000)


class TermoRef(BaseModel):
    id: uuid.UUID
    codigo: str
    nome: str
    sigla: str | None
    cor: str | None


class IntervaloSaida(IntervaloEntrada):
    id: uuid.UUID


class MedidaSaida(BaseModel):
    id: uuid.UUID
    tipo_id: uuid.UUID
    classe: str
    dip_dir: float | None
    dip: float | None
    trend: float | None
    plunge: float | None
    convencao: str
    valor_digitado: dict | None
    familia: str | None
    espessura_m: float | None
    preenchimento: str | None
    movimento: str | None
    intervalo_id: uuid.UUID | None
    observacao: str | None


class AmostraSaida(BaseModel):
    id: uuid.UUID
    codigo: str
    tipo: str | None
    de_m: float | None
    ate_m: float | None
    destino_id: uuid.UUID | None
    leitura_campo: str | None
    observacao: str | None


class FichaResumo(BaseModel):
    id: uuid.UUID
    numero: str
    data: date
    unidade_id: uuid.UUID
    unidade: str
    geologo: str
    estado: Estado
    revisao: int
    litologias: list[str]
    medidas: int
    amostras: int


class FichaSaida(BaseModel):
    id: uuid.UUID
    mina_id: uuid.UUID
    numero: str
    unidade_id: uuid.UUID
    unidade: str
    unidade_caminho: list[str]
    data: date
    hora: str | None
    geologo_id: uuid.UUID
    geologo: str
    acompanhantes: str | None
    exposicao_id: uuid.UUID | None
    distancia_m: float | None
    referencia: str | None
    x: float | None
    y: float | None
    z: float | None
    crs: str | None
    azimute_eixo: float | None
    largura_m: float | None
    altura_m: float | None
    norte_referencia: str
    declinacao: float | None
    descricao: str | None
    agua_id: uuid.UUID | None
    obs_geotecnicas: str | None
    estado: Estado
    revisao: int
    versao: int
    submetido_em: datetime | None
    revisado_por: str | None
    revisado_em: datetime | None
    motivo: str | None
    criado_em: datetime
    atualizado_em: datetime | None
    intervalos: list[IntervaloSaida]
    medidas: list[MedidaSaida]
    amostras: list[AmostraSaida]
    termos: dict[str, TermoRef]
    avisos: list[str]
    pode_editar: bool
    pode_aprovar: bool


class RevisaoSaida(BaseModel):
    revisao: int
    aprovado_em: datetime | None
    reaberto_em: datetime
    reaberto_por: str | None
    motivo: str
    conteudo: dict
