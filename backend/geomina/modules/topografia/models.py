"""Topografia, transformações de coordenadas, eixos de galeria e posições ao longo do eixo (Etapa 10).

Geometrias em WKB (com Z) no sistema de trabalho da mina; o original fica em ``geom_original``
quando houve transformação. Índice espacial: tabela virtual R*Tree ``feicao_rtree`` (migração 0008).
"""

from __future__ import annotations

import uuid
from datetime import date, datetime

from sqlalchemy import (
    JSON,
    Boolean,
    CheckConstraint,
    Date,
    Float,
    ForeignKey,
    Integer,
    LargeBinary,
    String,
    Text,
    UniqueConstraint,
    Uuid,
)
from sqlalchemy.orm import Mapped, mapped_column

from geomina.db import Base, DataHoraUTC, EntidadeMixin, agora


class TransformacaoCoordenadas(EntidadeMixin, Base):
    __tablename__ = "transformacao_coordenadas"
    __auditavel__ = True
    __table_args__ = (CheckConstraint("metodo IN ('proj','translacao')", name="metodo_valido"),)

    mina_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("mina.id", ondelete="RESTRICT"), nullable=False)
    nome: Mapped[str] = mapped_column(String(120), nullable=False)
    srid_origem: Mapped[int] = mapped_column(Integer, nullable=False)
    srid_destino: Mapped[int] = mapped_column(Integer, nullable=False)
    metodo: Mapped[str] = mapped_column(String(12), nullable=False)
    parametros: Mapped[dict] = mapped_column(JSON, nullable=False)
    residuo_medio_m: Mapped[float | None] = mapped_column(Float)
    residuo_max_m: Mapped[float | None] = mapped_column(Float)
    pontos_calibracao: Mapped[int | None] = mapped_column(Integer)
    origem_calibracao: Mapped[str | None] = mapped_column(Text)
    aprovada: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    aprovada_por: Mapped[uuid.UUID | None] = mapped_column(Uuid, ForeignKey("usuario.id", ondelete="RESTRICT"))
    aprovada_em: Mapped[datetime | None] = mapped_column(DataHoraUTC())


class Levantamento(EntidadeMixin, Base):
    __tablename__ = "levantamento"
    __auditavel__ = True
    __table_args__ = (UniqueConstraint("mina_id", "codigo", name="mina_codigo_levantamento"),)

    mina_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("mina.id", ondelete="RESTRICT"), nullable=False)
    codigo: Mapped[str] = mapped_column(String(40, collation="NOCASE"), nullable=False)
    descricao: Mapped[str | None] = mapped_column(Text)
    data_levantamento: Mapped[date | None] = mapped_column(Date)
    responsavel: Mapped[str | None] = mapped_column(String(120))
    importacao_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("importacao.id", ondelete="RESTRICT"), nullable=False)
    camada: Mapped[str] = mapped_column(String(260), nullable=False)
    tipo_geometria: Mapped[str] = mapped_column(String(20), nullable=False)
    srid_original: Mapped[int] = mapped_column(Integer, nullable=False)
    transformacao_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, ForeignKey("transformacao_coordenadas.id", ondelete="RESTRICT"))
    feicoes: Mapped[int] = mapped_column(Integer, nullable=False)
    vertices: Mapped[int] = mapped_column(Integer, nullable=False)
    minx: Mapped[float] = mapped_column(Float, nullable=False)
    maxx: Mapped[float] = mapped_column(Float, nullable=False)
    miny: Mapped[float] = mapped_column(Float, nullable=False)
    maxy: Mapped[float] = mapped_column(Float, nullable=False)
    minz: Mapped[float | None] = mapped_column(Float)
    maxz: Mapped[float | None] = mapped_column(Float)
    arquivado: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)


class FeicaoTopografica(Base):
    __tablename__ = "feicao_topografica"
    __auditavel__ = False  # dezenas de milhares por levantamento: rastreadas pela importação; imutáveis (trigger)

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    levantamento_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("levantamento.id", ondelete="RESTRICT"), nullable=False,
                                                       index=True)
    indice_origem: Mapped[int] = mapped_column(Integer, nullable=False)
    tipo: Mapped[str] = mapped_column(String(20), nullable=False)
    dimensao: Mapped[int] = mapped_column(Integer, nullable=False)
    camada_cad: Mapped[str | None] = mapped_column(String(254), index=True)
    entidade_cad: Mapped[str | None] = mapped_column(String(30))
    z_suspeito: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    atributos: Mapped[dict | None] = mapped_column(JSON)
    geom: Mapped[bytes] = mapped_column(LargeBinary, nullable=False)
    geom_original: Mapped[bytes | None] = mapped_column(LargeBinary)
    minx: Mapped[float] = mapped_column(Float, nullable=False)
    maxx: Mapped[float] = mapped_column(Float, nullable=False)
    miny: Mapped[float] = mapped_column(Float, nullable=False)
    maxy: Mapped[float] = mapped_column(Float, nullable=False)
    minz: Mapped[float | None] = mapped_column(Float)
    maxz: Mapped[float | None] = mapped_column(Float)


class EixoVersao(Base):
    """Eixo de uma galeria/travessa/rampa. Versões nunca são alteradas; uma é a vigente."""

    __tablename__ = "eixo_versao"
    __auditavel__ = True
    __table_args__ = (
        UniqueConstraint("unidade_id", "numero", name="unidade_numero_eixo"),
        CheckConstraint("origem IN ('pontos','feicao')", name="origem_valida"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    unidade_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("unidade_operacional.id", ondelete="RESTRICT"), nullable=False,
                                                  index=True)
    numero: Mapped[int] = mapped_column(Integer, nullable=False)
    geom: Mapped[bytes] = mapped_column(LargeBinary, nullable=False)
    vertices: Mapped[int] = mapped_column(Integer, nullable=False)
    comprimento_3d: Mapped[float] = mapped_column(Float, nullable=False)
    comprimento_2d: Mapped[float] = mapped_column(Float, nullable=False)
    origem: Mapped[str] = mapped_column(String(10), nullable=False)
    feicao_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, ForeignKey("feicao_topografica.id", ondelete="RESTRICT"))
    inicio_descricao: Mapped[str | None] = mapped_column(String(120))  # onde está o chainage 0 (ex.: "entrada pela Rampa Sul")
    observacao: Mapped[str | None] = mapped_column(Text)
    vigente: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    criado_por: Mapped[uuid.UUID | None] = mapped_column(Uuid, ForeignKey("usuario.id", ondelete="RESTRICT"))
    criado_em: Mapped[datetime] = mapped_column(DataHoraUTC(), nullable=False, default=agora)


class PosicaoEixo(Base):
    """Chainage calculado de um registro sobre uma versão de eixo (histórico preservado por versão)."""

    __tablename__ = "posicao_eixo"
    __table_args__ = (
        CheckConstraint("(amostra_id IS NOT NULL) + (mapeamento_id IS NOT NULL) + (avanco_id IS NOT NULL) = 1", name="um_objeto"),
        UniqueConstraint("eixo_versao_id", "amostra_id", "mapeamento_id", "avanco_id", name="posicao_unica"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    eixo_versao_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("eixo_versao.id", ondelete="RESTRICT"), nullable=False,
                                                      index=True)
    amostra_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, ForeignKey("amostra.id", ondelete="RESTRICT"), index=True)
    mapeamento_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, ForeignKey("mapeamento.id", ondelete="RESTRICT"), index=True)
    avanco_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, ForeignKey("frente_avanco.id", ondelete="RESTRICT"), index=True)
    chainage_m: Mapped[float] = mapped_column(Float, nullable=False)
    afastamento_m: Mapped[float] = mapped_column(Float, nullable=False)
    ambigua: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    alternativa_m: Mapped[float | None] = mapped_column(Float)
    transformacao_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, ForeignKey("transformacao_coordenadas.id", ondelete="RESTRICT"))
    calculado_em: Mapped[datetime] = mapped_column(DataHoraUTC(), nullable=False, default=agora)
