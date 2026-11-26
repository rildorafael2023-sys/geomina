"""Mapeamento geológico — ficha digital (Etapa 5, docs/FICHA_MAPEAMENTO.md).

Ficha (mapeamento) → intervalos da seção, medidas estruturais e amostras citadas.
Fluxo: rascunho → submetida → aprovada (ou devolvida ao rascunho). Ficha aprovada é imutável
(garantido por triggers); correção = "reabrir", que guarda o instantâneo aprovado em
``mapeamento_revisao`` e incrementa a revisão. Ficha cancelada nunca é apagada.
"""

from __future__ import annotations

import uuid
from datetime import date, datetime

from sqlalchemy import (
    JSON,
    CheckConstraint,
    Date,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
    Uuid,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from geomina.db import Base, DataHoraUTC, EntidadeMixin, agora

ESTADOS = ("rascunho", "submetido", "aprovado", "cancelado")


class Mapeamento(EntidadeMixin, Base):
    __tablename__ = "mapeamento"
    __auditavel__ = True
    __table_args__ = (
        UniqueConstraint("mina_id", "numero", name="mina_numero"),
        CheckConstraint("estado IN ('rascunho','submetido','aprovado','cancelado')", name="estado_valido"),
        CheckConstraint("distancia_m IS NULL OR distancia_m >= 0", name="distancia_nao_negativa"),
        CheckConstraint("(x IS NULL) = (y IS NULL)", name="xy_juntos"),
        CheckConstraint("z IS NULL OR x IS NOT NULL", name="z_exige_xy"),
        CheckConstraint("azimute_eixo IS NULL OR (azimute_eixo >= 0 AND azimute_eixo < 360)", name="azimute_valido"),
        CheckConstraint("largura_m IS NULL OR largura_m > 0", name="largura_positiva"),
        CheckConstraint("altura_m IS NULL OR altura_m > 0", name="altura_positiva"),
    )

    mina_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("mina.id", ondelete="RESTRICT"), nullable=False)
    numero: Mapped[str] = mapped_column(String(20), nullable=False)
    unidade_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("unidade_operacional.id", ondelete="RESTRICT"),
                                                  nullable=False, index=True)
    data: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    hora: Mapped[str | None] = mapped_column(String(5))
    geologo_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("usuario.id", ondelete="RESTRICT"), nullable=False,
                                                  index=True)
    acompanhantes: Mapped[str | None] = mapped_column(String(200))
    exposicao_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, ForeignKey("termo.id", ondelete="RESTRICT"))
    distancia_m: Mapped[float | None] = mapped_column(Float)
    referencia: Mapped[str | None] = mapped_column(String(120))
    x: Mapped[float | None] = mapped_column(Float)
    y: Mapped[float | None] = mapped_column(Float)
    z: Mapped[float | None] = mapped_column(Float)
    azimute_eixo: Mapped[float | None] = mapped_column(Float)
    largura_m: Mapped[float | None] = mapped_column(Float)
    altura_m: Mapped[float | None] = mapped_column(Float)
    norte_referencia: Mapped[str] = mapped_column(String(12), nullable=False, default="magnetico")
    declinacao: Mapped[float | None] = mapped_column(Float)
    descricao: Mapped[str | None] = mapped_column(Text)
    agua_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, ForeignKey("termo.id", ondelete="RESTRICT"))
    obs_geotecnicas: Mapped[str | None] = mapped_column(Text)
    estado: Mapped[str] = mapped_column(String(12), nullable=False, default="rascunho")
    revisao: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    submetido_em: Mapped[datetime | None] = mapped_column(DataHoraUTC())
    revisado_por: Mapped[uuid.UUID | None] = mapped_column(Uuid, ForeignKey("usuario.id", ondelete="RESTRICT"))
    revisado_em: Mapped[datetime | None] = mapped_column(DataHoraUTC())
    motivo: Mapped[str | None] = mapped_column(Text)  # devolução, reabertura ou cancelamento

    intervalos: Mapped[list[Intervalo]] = relationship(order_by="Intervalo.de_m", cascade="all, delete-orphan",
                                                       lazy="selectin")
    medidas: Mapped[list[MedidaEstrutural]] = relationship(order_by="MedidaEstrutural.ordem",
                                                           cascade="all, delete-orphan", lazy="selectin")
    amostras: Mapped[list[AmostraCitada]] = relationship(order_by="AmostraCitada.ordem", cascade="all, delete-orphan",
                                                         lazy="selectin")


class Intervalo(EntidadeMixin, Base):
    """Trecho da seção mapeada (de/até em metros, a partir do piso ou do início da parede)."""

    __tablename__ = "mapeamento_intervalo"
    __auditavel__ = True
    __table_args__ = (
        CheckConstraint("de_m >= 0 AND ate_m > de_m", name="intervalo_valido"),
        CheckConstraint("percentual IS NULL OR (percentual >= 0 AND percentual <= 100)", name="percentual_valido"),
    )

    mapeamento_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("mapeamento.id", ondelete="CASCADE"),
                                                     nullable=False, index=True)
    de_m: Mapped[float] = mapped_column(Float, nullable=False)
    ate_m: Mapped[float] = mapped_column(Float, nullable=False)
    litologia_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("termo.id", ondelete="RESTRICT"), nullable=False,
                                                    index=True)
    textura_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, ForeignKey("termo.id", ondelete="RESTRICT"))
    granulacao: Mapped[str | None] = mapped_column(String(40))
    cor: Mapped[str | None] = mapped_column(String(40))
    alteracao_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, ForeignKey("termo.id", ondelete="RESTRICT"),
                                                           index=True)
    intensidade_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, ForeignKey("termo.id", ondelete="RESTRICT"))
    mineralizacao_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, ForeignKey("termo.id", ondelete="RESTRICT"),
                                                               index=True)
    minerais: Mapped[str | None] = mapped_column(String(200))
    percentual: Mapped[float | None] = mapped_column(Float)
    contato_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, ForeignKey("termo.id", ondelete="RESTRICT"))
    descricao: Mapped[str | None] = mapped_column(Text)


class MedidaEstrutural(EntidadeMixin, Base):
    """Planos: direção de mergulho/mergulho. Linhas: rumo do caimento/caimento.
    O valor digitado e a convenção usada ficam guardados; nenhuma correção de norte é aplicada
    automaticamente (o norte de referência e a declinação ficam registrados na ficha)."""

    __tablename__ = "medida_estrutural"
    __auditavel__ = True
    __table_args__ = (
        CheckConstraint("classe IN ('planar','linear')", name="classe_valida"),
        CheckConstraint("dip_dir IS NULL OR (dip_dir >= 0 AND dip_dir < 360)", name="dip_dir_valido"),
        CheckConstraint("dip IS NULL OR (dip >= 0 AND dip <= 90)", name="dip_valido"),
        CheckConstraint("trend IS NULL OR (trend >= 0 AND trend < 360)", name="trend_valido"),
        CheckConstraint("plunge IS NULL OR (plunge >= 0 AND plunge <= 90)", name="plunge_valido"),
        CheckConstraint("classe <> 'planar' OR (dip_dir IS NOT NULL AND dip IS NOT NULL)", name="planar_completo"),
        CheckConstraint("classe <> 'linear' OR (trend IS NOT NULL AND plunge IS NOT NULL)", name="linear_completo"),
    )

    mapeamento_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("mapeamento.id", ondelete="CASCADE"),
                                                     nullable=False, index=True)
    ordem: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    tipo_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("termo.id", ondelete="RESTRICT"), nullable=False,
                                               index=True)
    classe: Mapped[str] = mapped_column(String(10), nullable=False)
    dip_dir: Mapped[float | None] = mapped_column(Float)
    dip: Mapped[float | None] = mapped_column(Float)
    trend: Mapped[float | None] = mapped_column(Float)
    plunge: Mapped[float | None] = mapped_column(Float)
    convencao: Mapped[str] = mapped_column(String(20), nullable=False, default="dipdir_dip")
    valor_digitado: Mapped[dict | None] = mapped_column(JSON)
    familia: Mapped[str | None] = mapped_column(String(20))
    espessura_m: Mapped[float | None] = mapped_column(Float)
    preenchimento: Mapped[str | None] = mapped_column(String(120))
    movimento: Mapped[str | None] = mapped_column(String(60))
    intervalo_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, ForeignKey("mapeamento_intervalo.id",
                                                                            ondelete="SET NULL"))
    observacao: Mapped[str | None] = mapped_column(Text)


class AmostraCitada(EntidadeMixin, Base):
    """Amostra coletada na ficha. O cadastro completo da amostra é da Etapa 8; a ligação é pelo código."""

    __tablename__ = "mapeamento_amostra"
    __auditavel__ = True
    __table_args__ = (
        UniqueConstraint("mapeamento_id", "codigo", name="mapeamento_codigo"),
        CheckConstraint("de_m IS NULL OR de_m >= 0", name="de_valido"),
        CheckConstraint("ate_m IS NULL OR de_m IS NULL OR ate_m > de_m", name="ate_valido"),
    )

    mapeamento_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("mapeamento.id", ondelete="CASCADE"),
                                                     nullable=False, index=True)
    ordem: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    codigo: Mapped[str] = mapped_column(String(30, collation="NOCASE"), nullable=False, index=True)
    tipo: Mapped[str | None] = mapped_column(String(40))
    de_m: Mapped[float | None] = mapped_column(Float)
    ate_m: Mapped[float | None] = mapped_column(Float)
    destino_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, ForeignKey("termo.id", ondelete="RESTRICT"))
    leitura_campo: Mapped[str | None] = mapped_column(String(200))  # ex.: XRF portátil — não laboratorial
    observacao: Mapped[str | None] = mapped_column(Text)


class MapeamentoRevisao(Base):
    """Instantâneo completo da ficha no momento em que foi aprovada (antes de ser reaberta)."""

    __tablename__ = "mapeamento_revisao"
    __table_args__ = (UniqueConstraint("mapeamento_id", "revisao", name="mapeamento_revisao_unica"),)

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    mapeamento_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("mapeamento.id", ondelete="RESTRICT"),
                                                     nullable=False, index=True)
    revisao: Mapped[int] = mapped_column(Integer, nullable=False)
    conteudo: Mapped[dict] = mapped_column(JSON, nullable=False)
    aprovado_por: Mapped[uuid.UUID | None] = mapped_column(Uuid)
    aprovado_em: Mapped[datetime | None] = mapped_column(DataHoraUTC())
    reaberto_por: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("usuario.id", ondelete="RESTRICT"), nullable=False)
    reaberto_em: Mapped[datetime] = mapped_column(DataHoraUTC(), nullable=False, default=agora)
    motivo: Mapped[str] = mapped_column(Text, nullable=False)
