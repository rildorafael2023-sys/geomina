"""Parâmetros da instalação local."""

from __future__ import annotations

from sqlalchemy import String
from sqlalchemy.orm import Mapped, mapped_column

from geomina.db import Base


class ParametroSistema(Base):
    """Ex.: ``instalacao_id`` — identifica este computador (necessário à sincronização futura com tablets)."""

    __tablename__ = "parametro_sistema"
    chave: Mapped[str] = mapped_column(String(60), primary_key=True)
    valor: Mapped[str] = mapped_column(String(500), nullable=False)
