"""Dicionários configuráveis (RF-MAP-03): litologias, alterações, estruturas, minerais etc.

Os termos são dados, não código: o usuário cria, renomeia, inativa. Um termo inativo continua
válido nos registros antigos, mas não é oferecido para registros novos. Sinônimos permitem
reconhecer grafias diferentes em importações ("Gnaisse Pelitico", "gnaisse pelítico" …).
"""

from __future__ import annotations

import unicodedata
import uuid

from sqlalchemy import Boolean, CheckConstraint, ForeignKey, Integer, String, Text, UniqueConstraint, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from geomina.db import Base, EntidadeMixin


def normalizar(texto: str) -> str:
    """Forma de comparação: sem acentos, minúsculas, espaços e hífens padronizados."""
    t = unicodedata.normalize("NFKD", texto)
    t = "".join(c for c in t if not unicodedata.combining(c)).lower()
    t = " ".join(t.replace("–", "-").split())
    return t.replace(" - ", "-").replace(" -", "-").replace("- ", "-")


class Dicionario(EntidadeMixin, Base):
    __tablename__ = "dicionario"
    __auditavel__ = True

    codigo: Mapped[str] = mapped_column(String(30), unique=True, nullable=False)
    nome: Mapped[str] = mapped_column(String(80), nullable=False)
    descricao: Mapped[str | None] = mapped_column(Text)


class Termo(EntidadeMixin, Base):
    __tablename__ = "termo"
    __auditavel__ = True
    __table_args__ = (
        UniqueConstraint("dicionario_id", "codigo", name="dicionario_codigo"),
        CheckConstraint("classe IS NULL OR classe IN ('planar','linear')", name="classe_valida"),
    )

    dicionario_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("dicionario.id", ondelete="RESTRICT"),
                                                     nullable=False, index=True)
    codigo: Mapped[str] = mapped_column(String(30, collation="NOCASE"), nullable=False)
    nome: Mapped[str] = mapped_column(String(120), nullable=False)
    sigla: Mapped[str | None] = mapped_column(String(12))
    descricao: Mapped[str | None] = mapped_column(Text)
    cor: Mapped[str | None] = mapped_column(String(9))
    # Só para tipos de estrutura: medida de plano (direção de mergulho/mergulho) ou de linha (caimento)
    classe: Mapped[str | None] = mapped_column(String(10))
    ordem: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    ativo: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)


class TermoSinonimo(Base):
    __tablename__ = "termo_sinonimo"
    __auditavel__ = True
    __table_args__ = (UniqueConstraint("dicionario_id", "texto_normalizado", name="dicionario_texto"),)

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    dicionario_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("dicionario.id", ondelete="CASCADE"),
                                                     nullable=False)
    termo_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("termo.id", ondelete="CASCADE"), nullable=False,
                                                index=True)
    texto: Mapped[str] = mapped_column(String(160), nullable=False)
    texto_normalizado: Mapped[str] = mapped_column(String(160), nullable=False)
