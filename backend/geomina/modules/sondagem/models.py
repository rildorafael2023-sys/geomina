"""Sondagem: furo (collar), survey e intervalos geológicos. As amostras de testemunho (BMT-TS) ligam-se ao furo por furo_id
e pela profundidade de/até já existente na amostra; os resultados continuam na tabela única de resultados."""

from __future__ import annotations

import uuid
from datetime import date

from sqlalchemy import JSON, CheckConstraint, Date, Float, ForeignKey, Integer, String, Text, UniqueConstraint, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from geomina.db import Base, EntidadeMixin


class Furo(EntidadeMixin, Base):
    __tablename__ = "furo"
    __auditavel__ = True
    __table_args__ = (
        UniqueConstraint("mina_id", "codigo", name="furo_codigo_unico"),
        CheckConstraint("azimute IS NULL OR (azimute >= 0 AND azimute < 360)", name="azimute_valido"),
        CheckConstraint("inclinacao IS NULL OR (inclinacao >= -90 AND inclinacao <= 90)", name="inclinacao_valida"),
        CheckConstraint("profundidade_final > 0", name="profundidade_positiva"),
        CheckConstraint("referencia_azimute IN ('quadricula','magnetico','geografico')", name="referencia_azimute_valida"),
    )

    mina_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("mina.id", ondelete="RESTRICT"), nullable=False, index=True)
    codigo: Mapped[str] = mapped_column(String(40, collation="NOCASE"), nullable=False)
    projeto: Mapped[str | None] = mapped_column(String(120))
    area: Mapped[str | None] = mapped_column(String(120))
    unidade_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, ForeignKey("unidade_operacional.id", ondelete="RESTRICT"))
    x: Mapped[float] = mapped_column(Float, nullable=False)
    y: Mapped[float] = mapped_column(Float, nullable=False)
    z: Mapped[float] = mapped_column(Float, nullable=False)
    srid: Mapped[int] = mapped_column(Integer, nullable=False)
    azimute: Mapped[float | None] = mapped_column(Float)
    inclinacao: Mapped[float | None] = mapped_column(Float)  # graus da horizontal; negativo = para baixo
    referencia_azimute: Mapped[str] = mapped_column(String(10), nullable=False, default="quadricula")
    declinacao: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    profundidade_planejada: Mapped[float | None] = mapped_column(Float)
    profundidade_final: Mapped[float] = mapped_column(Float, nullable=False)
    data_inicio: Mapped[date | None] = mapped_column(Date)
    data_fim: Mapped[date | None] = mapped_column(Date)
    responsavel: Mapped[str | None] = mapped_column(String(120))
    metodo: Mapped[str | None] = mapped_column(String(60))
    descricao: Mapped[str | None] = mapped_column(Text)
    importacao_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, ForeignKey("importacao.id", ondelete="RESTRICT"))


class SurveyFuro(EntidadeMixin, Base):
    __tablename__ = "survey_furo"
    __auditavel__ = True
    __table_args__ = (
        UniqueConstraint("furo_id", "profundidade", name="survey_profundidade_unica"),
        CheckConstraint("profundidade >= 0", name="survey_profundidade_valida"),
        CheckConstraint("azimute >= 0 AND azimute < 360", name="survey_azimute_valido"),
        CheckConstraint("inclinacao >= -90 AND inclinacao <= 90", name="survey_inclinacao_valida"),
    )

    furo_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("furo.id", ondelete="CASCADE"), nullable=False, index=True)
    profundidade: Mapped[float] = mapped_column(Float, nullable=False)
    azimute: Mapped[float] = mapped_column(Float, nullable=False)
    inclinacao: Mapped[float] = mapped_column(Float, nullable=False)
    metodo: Mapped[str | None] = mapped_column(String(60))


class IntervaloFuro(EntidadeMixin, Base):
    __tablename__ = "intervalo_furo"
    __auditavel__ = True
    __table_args__ = (CheckConstraint("ate_m > de_m AND de_m >= 0", name="intervalo_furo_valido"),)

    furo_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("furo.id", ondelete="CASCADE"), nullable=False, index=True)
    de_m: Mapped[float] = mapped_column(Float, nullable=False)
    ate_m: Mapped[float] = mapped_column(Float, nullable=False)
    litologia_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, ForeignKey("termo.id", ondelete="RESTRICT"))
    alteracao_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, ForeignKey("termo.id", ondelete="RESTRICT"))
    mineralizacao_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, ForeignKey("termo.id", ondelete="RESTRICT"))
    estruturas: Mapped[str | None] = mapped_column(String(300))
    descricao: Mapped[str | None] = mapped_column(Text)
    observacoes: Mapped[str | None] = mapped_column(Text)
    responsavel: Mapped[str | None] = mapped_column(String(120))
    data: Mapped[date | None] = mapped_column(Date)
    atributos: Mapped[dict | None] = mapped_column(JSON)


class FotoFuro(EntidadeMixin, Base):
    """Foto de testemunho (caixa) ligada ao furo e ao intervalo de profundidade. O arquivo é um documento da categoria foto."""

    __tablename__ = "foto_furo"
    __auditavel__ = True
    __table_args__ = (CheckConstraint("de_m IS NULL OR ate_m IS NULL OR ate_m > de_m", name="foto_furo_intervalo_valido"),)

    furo_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("furo.id", ondelete="CASCADE"), nullable=False, index=True)
    documento_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("documento.id", ondelete="RESTRICT"), nullable=False)
    de_m: Mapped[float | None] = mapped_column(Float)
    ate_m: Mapped[float | None] = mapped_column(Float)
    caixa: Mapped[str | None] = mapped_column(String(40))
    legenda: Mapped[str | None] = mapped_column(String(300))
