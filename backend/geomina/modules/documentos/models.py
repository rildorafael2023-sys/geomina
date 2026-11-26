"""Documentos, croquis e fotografias (Etapas 6 e 7 — RF-DOC-01 a 09).

Documento (entidade lógica) → versões (cada uma aponta para um arquivo original imutável) →
vínculos com registros (unidade da mina, ficha de mapeamento; amostra na Etapa 8).
Nenhuma versão é apagada; um documento pode ser arquivado.
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
    String,
    Text,
    UniqueConstraint,
    Uuid,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from geomina.db import Base, DataHoraUTC, EntidadeMixin, agora

CATEGORIAS = ("croqui", "foto", "relatorio", "planilha", "gis", "topografia", "campo", "outro")


class Documento(EntidadeMixin, Base):
    __tablename__ = "documento"
    __auditavel__ = True
    __table_args__ = (
        CheckConstraint("categoria IN ('croqui','foto','relatorio','planilha','gis','topografia','campo','outro')",
                        name="categoria_valida"),
        CheckConstraint("(x IS NULL) = (y IS NULL)", name="xy_juntos"),
    )

    mina_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("mina.id", ondelete="RESTRICT"), nullable=False,
                                               index=True)
    categoria: Mapped[str] = mapped_column(String(12), nullable=False, index=True)
    titulo: Mapped[str] = mapped_column(String(200), nullable=False)
    descricao: Mapped[str | None] = mapped_column(Text)
    data_documento: Mapped[date | None] = mapped_column(Date, index=True)
    autor_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("usuario.id", ondelete="RESTRICT"), nullable=False)
    # Fotografias
    legenda: Mapped[str | None] = mapped_column(String(300))
    identificador: Mapped[str | None] = mapped_column(String(60))
    exif: Mapped[dict | None] = mapped_column(JSON)
    x: Mapped[float | None] = mapped_column(Float)
    y: Mapped[float | None] = mapped_column(Float)
    z: Mapped[float | None] = mapped_column(Float)
    # Documento criado a partir de outro (ex.: página de um PDF dividido)
    origem_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, ForeignKey("documento.id", ondelete="RESTRICT"))
    origem_pagina: Mapped[int | None] = mapped_column(Integer)
    arquivado: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    versoes: Mapped[list[DocumentoVersao]] = relationship(order_by="DocumentoVersao.numero", lazy="selectin")
    vinculos: Mapped[list[DocumentoVinculo]] = relationship(lazy="selectin", cascade="all, delete-orphan")


class DocumentoVersao(Base):
    __tablename__ = "documento_versao"
    __auditavel__ = True
    __table_args__ = (UniqueConstraint("documento_id", "numero", name="documento_numero"),)

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    documento_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("documento.id", ondelete="RESTRICT"),
                                                    nullable=False, index=True)
    numero: Mapped[int] = mapped_column(Integer, nullable=False)
    arquivo_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("arquivo.id", ondelete="RESTRICT"), nullable=False)
    nome_original: Mapped[str] = mapped_column(String(260), nullable=False)
    paginas: Mapped[int | None] = mapped_column(Integer)
    largura_px: Mapped[int | None] = mapped_column(Integer)
    altura_px: Mapped[int | None] = mapped_column(Integer)
    motivo: Mapped[str | None] = mapped_column(Text)
    criado_por: Mapped[uuid.UUID | None] = mapped_column(Uuid, ForeignKey("usuario.id", ondelete="RESTRICT"))
    criado_em: Mapped[datetime] = mapped_column(DataHoraUTC(), nullable=False, default=agora)


class DocumentoVinculo(Base):
    """Liga um documento a exatamente um registro (FKs reais, sem vínculo polimórfico)."""

    __tablename__ = "documento_vinculo"
    __auditavel__ = True
    __table_args__ = (
        CheckConstraint("(unidade_id IS NOT NULL) + (mapeamento_id IS NOT NULL) = 1", name="um_alvo"),
        UniqueConstraint("documento_id", "unidade_id", "mapeamento_id", name="vinculo_unico"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    documento_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("documento.id", ondelete="CASCADE"),
                                                    nullable=False, index=True)
    unidade_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, ForeignKey("unidade_operacional.id",
                                                                          ondelete="RESTRICT"), index=True)
    mapeamento_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, ForeignKey("mapeamento.id", ondelete="RESTRICT"),
                                                            index=True)
