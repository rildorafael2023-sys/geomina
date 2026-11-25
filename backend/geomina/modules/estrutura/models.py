"""Estrutura operacional da mina (Etapa 3 — RF-EST-01 a RF-EST-07).

Modelo em árvore genérica (ANALISE_CRITICA A1):
- ``tipo_unidade`` configurável (Nível, Galeria, Travessa, Rampa, Frente…);
- ``regra_hierarquia`` define quais tipos podem conter quais;
- ``unidade_operacional`` com ``pai_id`` e ``caminho`` materializado (``/id/id/…/``);
- ``unidade_nivel`` liga unidades multinível (rampas, chaminés) a vários níveis;
- ``frente_avanco`` registra o histórico de posição das frentes.

As regras de integridade (mesma mina, tipo permitido, ausência de ciclos, caminho) são
garantidas por triggers do banco (migração 0002), não só pela API.
"""

from __future__ import annotations

import uuid
from datetime import date

from sqlalchemy import (
    Boolean,
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

from geomina.db import Base, EntidadeMixin

STATUS_UNIDADE = ("ativa", "paralisada", "encerrada")


class Mina(EntidadeMixin, Base):
    __tablename__ = "mina"
    __auditavel__ = True
    __table_args__ = (CheckConstraint("srid_trabalho > 0", name="srid_positivo"),)

    codigo: Mapped[str] = mapped_column(String(30, collation="NOCASE"), unique=True, nullable=False)
    nome: Mapped[str] = mapped_column(String(120), nullable=False)
    srid_trabalho: Mapped[int] = mapped_column(Integer, nullable=False)
    declinacao_magnetica: Mapped[float | None] = mapped_column(Float)  # graus, + leste
    observacoes: Mapped[str | None] = mapped_column(Text)
    ativo: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)


class TipoUnidade(EntidadeMixin, Base):
    __tablename__ = "tipo_unidade"
    __auditavel__ = True

    codigo: Mapped[str] = mapped_column(String(30, collation="NOCASE"), unique=True, nullable=False)
    nome: Mapped[str] = mapped_column(String(60), nullable=False)
    pode_ser_raiz: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    possui_eixo: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    multinivel: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    e_nivel: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    e_frente: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    cor: Mapped[str | None] = mapped_column(String(9))
    ordem: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    ativo: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)


class RegraHierarquia(Base):
    __tablename__ = "regra_hierarquia"
    __auditavel__ = True

    tipo_pai_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("tipo_unidade.id", ondelete="CASCADE"),
                                                   primary_key=True)
    tipo_filho_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("tipo_unidade.id", ondelete="CASCADE"),
                                                     primary_key=True)


class UnidadeOperacional(EntidadeMixin, Base):
    __tablename__ = "unidade_operacional"
    __auditavel__ = True
    __table_args__ = (
        UniqueConstraint("mina_id", "codigo", name="mina_codigo"),
        CheckConstraint("status IN ('ativa','paralisada','encerrada')", name="status_valido"),
        CheckConstraint("pai_id IS NULL OR pai_id <> id", name="nao_e_pai_de_si"),
    )

    mina_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("mina.id", ondelete="RESTRICT"), nullable=False,
                                               index=True)
    tipo_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("tipo_unidade.id", ondelete="RESTRICT"),
                                               nullable=False)
    pai_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, ForeignKey("unidade_operacional.id",
                                                                      ondelete="RESTRICT"), index=True)
    codigo: Mapped[str] = mapped_column(String(40, collation="NOCASE"), nullable=False)
    nome: Mapped[str] = mapped_column(String(120), nullable=False)
    # Mantido por trigger: "/<id raiz>/…/<id>/" (ids em hexadecimal, como gravados pelo banco)
    caminho: Mapped[str | None] = mapped_column(String(2000), index=True)
    status: Mapped[str] = mapped_column(String(12), nullable=False, default="ativa")
    cota_referencia: Mapped[float | None] = mapped_column(Float)
    descricao: Mapped[str | None] = mapped_column(Text)
    ativo: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    tipo: Mapped[TipoUnidade] = relationship(lazy="joined")


class UnidadeNivel(Base):
    __tablename__ = "unidade_nivel"
    __auditavel__ = True

    unidade_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("unidade_operacional.id", ondelete="CASCADE"),
                                                  primary_key=True)
    nivel_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("unidade_operacional.id", ondelete="RESTRICT"),
                                                primary_key=True)


class FrenteAvanco(EntidadeMixin, Base):
    """Posição da frente numa data. A distância é medida a partir de uma referência informada
    (ex.: "entrada da travessa", "estação T-12"). Coordenadas são opcionais e nunca estimadas."""

    __tablename__ = "frente_avanco"
    __auditavel__ = True
    __table_args__ = (
        CheckConstraint("distancia_m IS NULL OR distancia_m >= 0", name="distancia_nao_negativa"),
        CheckConstraint("avanco_m IS NULL OR avanco_m >= 0", name="avanco_nao_negativo"),
        CheckConstraint("distancia_m IS NOT NULL OR avanco_m IS NOT NULL OR x IS NOT NULL",
                        name="alguma_medida"),
        CheckConstraint("(x IS NULL) = (y IS NULL)", name="xy_juntos"),
        CheckConstraint("z IS NULL OR x IS NOT NULL", name="z_exige_xy"),
    )

    frente_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("unidade_operacional.id", ondelete="RESTRICT"),
                                                 nullable=False, index=True)
    data: Mapped[date] = mapped_column(Date, nullable=False)
    distancia_m: Mapped[float | None] = mapped_column(Float)
    referencia: Mapped[str | None] = mapped_column(String(120))
    avanco_m: Mapped[float | None] = mapped_column(Float)
    x: Mapped[float | None] = mapped_column(Float)
    y: Mapped[float | None] = mapped_column(Float)
    z: Mapped[float | None] = mapped_column(Float)
    responsavel_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, ForeignKey("usuario.id", ondelete="RESTRICT"))
    observacao: Mapped[str | None] = mapped_column(Text)
