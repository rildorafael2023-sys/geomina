"""Amostragem (Etapa 8 — RF-AMO-01 a 09).

Séries de código informadas pelo usuário: BS-RP (amostragem de mina), BMT-TS (testemunho de
sondagem), BE (amostras antigas). As coordenadas guardam o sistema em que foram medidas (``srid``);
nenhuma conversão é feita sem ação explícita do usuário.
"""

from __future__ import annotations

import uuid
from datetime import date

from sqlalchemy import (
    JSON,
    Boolean,
    CheckConstraint,
    Column,
    Date,
    Float,
    ForeignKey,
    Integer,
    String,
    Table,
    Text,
    UniqueConstraint,
    Uuid,
)
from sqlalchemy.orm import Mapped, mapped_column

from geomina.db import Base, EntidadeMixin

PAPEIS_CONTROLE = ("normal", "padrao", "branco", "dup_campo", "dup_preparacao", "dup_pulpa")


class TipoAmostra(EntidadeMixin, Base):
    __tablename__ = "tipo_amostra"
    __auditavel__ = True
    __table_args__ = (CheckConstraint("geometria IN ('ponto','intervalo','ambos')", name="geometria_valida"),)

    codigo: Mapped[str] = mapped_column(String(30, collation="NOCASE"), unique=True, nullable=False)
    nome: Mapped[str] = mapped_column(String(80), nullable=False)
    geometria: Mapped[str] = mapped_column(String(10), nullable=False, default="ambos")
    ativo: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)


class Campanha(EntidadeMixin, Base):
    __tablename__ = "campanha"
    __auditavel__ = True
    __table_args__ = (UniqueConstraint("mina_id", "codigo", name="mina_codigo_campanha"),)

    mina_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("mina.id", ondelete="RESTRICT"), nullable=False)
    codigo: Mapped[str] = mapped_column(String(30, collation="NOCASE"), nullable=False)
    nome: Mapped[str] = mapped_column(String(120), nullable=False)
    inicio: Mapped[date | None] = mapped_column(Date)
    fim: Mapped[date | None] = mapped_column(Date)
    objetivo: Mapped[str | None] = mapped_column(Text)


class Amostra(EntidadeMixin, Base):
    __tablename__ = "amostra"
    __auditavel__ = True
    __table_args__ = (
        UniqueConstraint("mina_id", "codigo", name="mina_codigo_amostra"),
        CheckConstraint("papel_controle IN ('normal','padrao','branco','dup_campo','dup_preparacao','dup_pulpa')",
                        name="papel_valido"),
        CheckConstraint("estado IN ('coletada','enviada','cancelada')", name="estado_valido"),
        CheckConstraint("papel_controle NOT LIKE 'dup%' OR amostra_original_id IS NOT NULL",
                        name="duplicata_exige_original"),
        CheckConstraint("papel_controle <> 'padrao' OR padrao_codigo IS NOT NULL", name="padrao_exige_codigo"),
        CheckConstraint("amostra_original_id IS NULL OR amostra_original_id <> id", name="original_diferente"),
        CheckConstraint("(x IS NULL) = (y IS NULL)", name="xy_juntos"),
        CheckConstraint("x IS NULL OR srid IS NOT NULL", name="coordenada_exige_srid"),
        CheckConstraint("secao_de_m IS NULL OR secao_ate_m IS NULL OR secao_ate_m > secao_de_m", name="secao_valida"),
        CheckConstraint("prof_de_m IS NULL OR prof_ate_m IS NULL OR prof_ate_m > prof_de_m", name="profundidade_valida"),
        CheckConstraint("massa_kg IS NULL OR massa_kg > 0", name="massa_positiva"),
    )

    mina_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("mina.id", ondelete="RESTRICT"), nullable=False)
    codigo: Mapped[str] = mapped_column(String(30, collation="NOCASE"), nullable=False)
    serie: Mapped[str] = mapped_column(String(10), nullable=False, index=True)  # BS-RP, BMT-TS, BE
    papel_controle: Mapped[str] = mapped_column(String(16), nullable=False, default="normal")
    amostra_original_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, ForeignKey("amostra.id", ondelete="RESTRICT"))
    padrao_codigo: Mapped[str | None] = mapped_column(String(40))  # material de referência (CRM)
    tipo_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, ForeignKey("tipo_amostra.id", ondelete="RESTRICT"))
    metodo: Mapped[str | None] = mapped_column(String(60))
    campanha_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, ForeignKey("campanha.id", ondelete="RESTRICT"))
    data_coleta: Mapped[date | None] = mapped_column(Date, index=True)
    geologo_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, ForeignKey("usuario.id", ondelete="RESTRICT"))
    responsavel_nome: Mapped[str | None] = mapped_column(String(120))  # dados históricos sem usuário
    unidade_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, ForeignKey("unidade_operacional.id", ondelete="RESTRICT"),
                                                         index=True)
    local_descricao: Mapped[str | None] = mapped_column(String(200))  # ex.: "Lado esquerdo Rampa Sul Descendente"
    mapeamento_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, ForeignKey("mapeamento.id", ondelete="RESTRICT"),
                                                            index=True)
    ponto_campo: Mapped[str | None] = mapped_column(String(40))
    secao_de_m: Mapped[float | None] = mapped_column(Float)
    secao_ate_m: Mapped[float | None] = mapped_column(Float)
    distancia_m: Mapped[float | None] = mapped_column(Float)
    referencia: Mapped[str | None] = mapped_column(String(120))
    x: Mapped[float | None] = mapped_column(Float)
    y: Mapped[float | None] = mapped_column(Float)
    z: Mapped[float | None] = mapped_column(Float)
    srid: Mapped[int | None] = mapped_column(Integer)
    furo: Mapped[str | None] = mapped_column(String(40))  # testemunho de sondagem
    prof_de_m: Mapped[float | None] = mapped_column(Float)
    prof_ate_m: Mapped[float | None] = mapped_column(Float)
    litologia_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, ForeignKey("termo.id", ondelete="RESTRICT"), index=True)
    alteracao_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, ForeignKey("termo.id", ondelete="RESTRICT"))
    mineralizacao_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, ForeignKey("termo.id", ondelete="RESTRICT"))
    destino_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, ForeignKey("termo.id", ondelete="RESTRICT"))
    massa_kg: Mapped[float | None] = mapped_column(Float)
    descricao: Mapped[str | None] = mapped_column(Text)
    observacoes: Mapped[str | None] = mapped_column(Text)
    estado: Mapped[str] = mapped_column(String(12), nullable=False, default="coletada")
    importacao_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, ForeignKey("importacao.id", ondelete="RESTRICT"))
    linha_origem: Mapped[int | None] = mapped_column(Integer)


lote_envio_amostra = Table(
    "lote_envio_amostra",
    Base.metadata,
    Column("lote_id", Uuid, ForeignKey("lote_envio.id", ondelete="CASCADE"), primary_key=True),
    Column("amostra_id", Uuid, ForeignKey("amostra.id", ondelete="RESTRICT"), primary_key=True),
)


class LoteEnvio(EntidadeMixin, Base):
    """Cadeia de custódia: grupo de amostras enviado a um laboratório."""

    __tablename__ = "lote_envio"
    __auditavel__ = True
    __table_args__ = (
        UniqueConstraint("mina_id", "codigo", name="mina_codigo_lote"),
        CheckConstraint("estado IN ('aberto','enviado')", name="estado_lote_valido"),
    )

    mina_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("mina.id", ondelete="RESTRICT"), nullable=False)
    codigo: Mapped[str] = mapped_column(String(30, collation="NOCASE"), nullable=False)
    laboratorio: Mapped[str] = mapped_column(String(120), nullable=False)
    data_envio: Mapped[date | None] = mapped_column(Date)
    responsavel_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, ForeignKey("usuario.id", ondelete="RESTRICT"))
    observacao: Mapped[str | None] = mapped_column(Text)
    estado: Mapped[str] = mapped_column(String(10), nullable=False, default="aberto")


class Importacao(EntidadeMixin, Base):
    """Importação em duas fases (prévia → confirmação), com o arquivo original e o relatório guardados."""

    __tablename__ = "importacao"
    __auditavel__ = True
    __table_args__ = (
        CheckConstraint("tipo IN ('amostras','resultados','topografia')", name="tipo_importacao_valido"),
        CheckConstraint("estado IN ('analisada','confirmada','descartada')", name="estado_importacao_valido"),
    )

    mina_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("mina.id", ondelete="RESTRICT"), nullable=False)
    tipo: Mapped[str] = mapped_column(String(12), nullable=False)
    arquivo_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("arquivo.id", ondelete="RESTRICT"), nullable=False)
    nome_arquivo: Mapped[str] = mapped_column(String(260), nullable=False)
    opcoes: Mapped[dict | None] = mapped_column(JSON)
    relatorio: Mapped[dict | None] = mapped_column(JSON)
    estado: Mapped[str] = mapped_column(String(12), nullable=False, default="analisada")
    importado_por: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("usuario.id", ondelete="RESTRICT"), nullable=False)
