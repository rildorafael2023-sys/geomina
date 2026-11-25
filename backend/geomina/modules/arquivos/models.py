"""Arquivos originais imutáveis (RF-DOC-01, RNF-04)."""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import BigInteger, DateTime, ForeignKey, Integer, String, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from geomina.db import Base, agora


class Arquivo(Base):
    """Conteúdo binário identificado pelo SHA-256. Nunca é alterado nem sobrescrito.

    A entidade lógica (documento, versões, vínculos) chega na Etapa 6; aqui está só o
    conteúdo endereçado por hash, que todos os módulos de importação usarão.
    """

    __tablename__ = "arquivo"
    __auditavel__ = True

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    sha256: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    tamanho: Mapped[int] = mapped_column(BigInteger().with_variant(Integer, "sqlite"), nullable=False)
    mime: Mapped[str] = mapped_column(String(120), nullable=False)
    nome_original: Mapped[str] = mapped_column(String(260), nullable=False)
    chave: Mapped[str] = mapped_column(String(200), nullable=False)
    enviado_por: Mapped[uuid.UUID | None] = mapped_column(Uuid, ForeignKey("usuario.id", ondelete="RESTRICT"))
    enviado_em: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=agora)

