"""Banco de dados local (SQLite) — conexão, base declarativa e tipos comuns."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

from sqlalchemy import DateTime, Integer, MetaData, Uuid, create_engine, event
from sqlalchemy.engine import Engine
from sqlalchemy.orm import DeclarativeBase, Mapped, declared_attr, mapped_column, sessionmaker

CONVENCAO_NOMES = {
    "ix": "ix_%(column_0_label)s",
    "uq": "uq_%(table_name)s_%(column_0_name)s",
    "ck": "ck_%(table_name)s_%(constraint_name)s",
    "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
    "pk": "pk_%(table_name)s",
}


def agora() -> datetime:
    return datetime.now(UTC)


class Base(DeclarativeBase):
    metadata = MetaData(naming_convention=CONVENCAO_NOMES)


class EntidadeMixin:
    """Colunas padrão de toda entidade de domínio (ver BANCO_DE_DADOS.md §1)."""

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    criado_em: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=agora, nullable=False)
    criado_por: Mapped[uuid.UUID | None] = mapped_column(Uuid, nullable=True)
    atualizado_em: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), onupdate=agora)
    atualizado_por: Mapped[uuid.UUID | None] = mapped_column(Uuid, nullable=True)
    # Concorrência otimista: o SQLAlchemy incrementa e confere a cada UPDATE.
    versao: Mapped[int] = mapped_column(Integer, nullable=False, default=1)

    @declared_attr.directive
    def __mapper_args__(cls) -> dict:
        return {"version_id_col": cls.versao}


def _configurar_conexao(dbapi_conn, _record) -> None:
    cur = dbapi_conn.cursor()
    cur.execute("PRAGMA foreign_keys = ON")
    cur.execute("PRAGMA journal_mode = WAL")
    cur.execute("PRAGMA synchronous = NORMAL")
    cur.execute("PRAGMA busy_timeout = 5000")
    cur.close()


def criar_engine(url: str) -> Engine:
    engine = create_engine(url, connect_args={"check_same_thread": False})
    event.listen(engine, "connect", _configurar_conexao)
    return engine


def criar_fabrica_sessoes(engine: Engine) -> sessionmaker:
    return sessionmaker(bind=engine, expire_on_commit=False, autoflush=False)
