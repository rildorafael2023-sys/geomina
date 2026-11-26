"""Layouts salvos da Geoquímica Operacional (tracks, escalas, classes e filtros reutilizáveis)."""

from __future__ import annotations

import uuid

from sqlalchemy import JSON, Boolean, CheckConstraint, ForeignKey, String, UniqueConstraint, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from geomina.db import Base, EntidadeMixin


class LayoutAnalise(EntidadeMixin, Base):
    __tablename__ = "layout_analise"
    __auditavel__ = True
    __table_args__ = (
        CheckConstraint("tipo IN ('galeria','sondagem','comparacao')", name="tipo_layout_valido"),
        UniqueConstraint("mina_id", "dono_id", "tipo", "nome", name="layout_nome_unico"),
    )

    mina_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("mina.id", ondelete="RESTRICT"), nullable=False, index=True)
    dono_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("usuario.id", ondelete="RESTRICT"), nullable=False)
    nome: Mapped[str] = mapped_column(String(120), nullable=False)
    tipo: Mapped[str] = mapped_column(String(12), nullable=False)
    config: Mapped[dict] = mapped_column(JSON, nullable=False)
    compartilhado: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
