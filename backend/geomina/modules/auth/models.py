"""Usuários, papéis e permissões (RF-SEG-01, RF-SEG-02)."""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import Boolean, Column, ForeignKey, String, Table, Uuid
from sqlalchemy.orm import Mapped, mapped_column, relationship

from geomina.db import Base, DataHoraUTC, EntidadeMixin, agora

papel_permissao = Table(
    "papel_permissao",
    Base.metadata,
    Column("papel_id", Uuid, ForeignKey("papel.id", ondelete="CASCADE"), primary_key=True),
    Column("permissao_id", Uuid, ForeignKey("permissao.id", ondelete="CASCADE"), primary_key=True),
)

usuario_papel = Table(
    "usuario_papel",
    Base.metadata,
    Column("usuario_id", Uuid, ForeignKey("usuario.id", ondelete="CASCADE"), primary_key=True),
    Column("papel_id", Uuid, ForeignKey("papel.id", ondelete="RESTRICT"), primary_key=True),
)


class Permissao(Base):
    __tablename__ = "permissao"
    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    codigo: Mapped[str] = mapped_column(String(60), unique=True, nullable=False)
    descricao: Mapped[str] = mapped_column(String(200), nullable=False)


class Papel(Base):
    __tablename__ = "papel"
    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    codigo: Mapped[str] = mapped_column(String(30), unique=True, nullable=False)
    nome: Mapped[str] = mapped_column(String(80), nullable=False)
    descricao: Mapped[str | None] = mapped_column(String(300))
    permissoes: Mapped[list[Permissao]] = relationship(secondary=papel_permissao, lazy="selectin")


class Usuario(EntidadeMixin, Base):
    __tablename__ = "usuario"
    __auditavel__ = True
    __audit_ocultar__ = ("senha_hash",)

    login: Mapped[str] = mapped_column(String(40, collation="NOCASE"), unique=True, nullable=False)
    nome: Mapped[str] = mapped_column(String(120), nullable=False)
    email: Mapped[str | None] = mapped_column(String(160))
    senha_hash: Mapped[str] = mapped_column(String(200), nullable=False)
    ativo: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    trocar_senha: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    ultimo_acesso: Mapped[datetime | None] = mapped_column(DataHoraUTC())

    papeis: Mapped[list[Papel]] = relationship(secondary=usuario_papel, lazy="selectin")

    def permissoes(self) -> set[str]:
        return {p.codigo for papel in self.papeis for p in papel.permissoes}


class Sessao(Base):
    """Sessão de login. O token só existe no cliente; aqui fica apenas o hash."""

    __tablename__ = "sessao"
    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    usuario_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("usuario.id", ondelete="CASCADE"),
                                                  nullable=False, index=True)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    criado_em: Mapped[datetime] = mapped_column(DataHoraUTC(), nullable=False, default=agora)
    expira_em: Mapped[datetime] = mapped_column(DataHoraUTC(), nullable=False)
    revogado_em: Mapped[datetime | None] = mapped_column(DataHoraUTC())
