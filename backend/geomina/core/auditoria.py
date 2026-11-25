"""Trilha de auditoria (RNF-03, RF-SEG-03).

Toda inserção, alteração e exclusão de entidades marcadas com ``__auditavel__ = True``
gera um registro em ``auditoria`` com os valores antes/depois, o usuário e a origem.

Implementação na camada ORM (o SQLite não tem triggers genéricos nem variáveis de sessão);
a imutabilidade da tabela é garantida no banco por triggers (ver migração 0001).
Limitação documentada: alterações feitas diretamente no arquivo .db, fora do aplicativo,
não são capturadas — por isso o arquivo de banco fica na pasta de dados do usuário.
"""

from __future__ import annotations

import enum
import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Any

from sqlalchemy import JSON, BigInteger, Integer, String, Uuid, event, insert, inspect
from sqlalchemy.orm import Mapped, Session, mapped_column

from geomina.db import Base, DataHoraUTC, agora

OCULTO = "***"


class Auditoria(Base):
    __tablename__ = "auditoria"

    id: Mapped[int] = mapped_column(BigInteger().with_variant(Integer, "sqlite"), primary_key=True)
    tabela: Mapped[str] = mapped_column(String(80), nullable=False, index=True)
    registro_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    operacao: Mapped[str] = mapped_column(String(1), nullable=False)  # I, U, D
    antes: Mapped[dict | None] = mapped_column(JSON)
    depois: Mapped[dict | None] = mapped_column(JSON)
    usuario_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, index=True)
    origem: Mapped[str] = mapped_column(String(20), nullable=False, default="aplicativo")
    ocorrido_em: Mapped[datetime] = mapped_column(DataHoraUTC(), nullable=False, default=agora)


def _valor_json(v: Any) -> Any:
    if v is None or isinstance(v, (bool, int, float, str)):
        return v
    if isinstance(v, uuid.UUID):
        return str(v)
    if isinstance(v, (datetime, date)):
        return v.isoformat()
    if isinstance(v, Decimal):
        return str(v)
    if isinstance(v, enum.Enum):
        return v.value
    if isinstance(v, (bytes, bytearray, memoryview)):
        return f"<binário {len(bytes(v))} bytes>"
    if isinstance(v, (dict, list)):
        return v
    return str(v)


def _ocultos(obj: Any) -> set[str]:
    return set(getattr(obj, "__audit_ocultar__", ()))


def _instantaneo(obj: Any, usar_valores_anteriores: bool = False) -> dict:
    estado = inspect(obj)
    ocultar = _ocultos(obj)
    dados = {}
    for attr in estado.mapper.column_attrs:
        nome = attr.key
        if usar_valores_anteriores:
            hist = estado.attrs[nome].history
            valor = hist.deleted[0] if hist.deleted else estado.attrs[nome].value
        else:
            valor = estado.attrs[nome].value
        dados[nome] = OCULTO if nome in ocultar else _valor_json(valor)
    return dados


def _diferencas(obj: Any) -> tuple[dict, dict]:
    estado = inspect(obj)
    ocultar = _ocultos(obj)
    antes, depois = {}, {}
    for attr in estado.mapper.column_attrs:
        hist = estado.attrs[attr.key].history
        if not hist.has_changes():
            continue
        a = hist.deleted[0] if hist.deleted else None
        d = hist.added[0] if hist.added else None
        if attr.key in ocultar:
            a, d = OCULTO, OCULTO
        antes[attr.key] = _valor_json(a)
        depois[attr.key] = _valor_json(d)
    return antes, depois


def _auditavel(obj: Any) -> bool:
    return bool(getattr(type(obj), "__auditavel__", False))


def _id_registro(obj: Any) -> str:
    pk = inspect(obj).identity
    if pk is None:
        pk = tuple(getattr(obj, c.key) for c in inspect(type(obj)).primary_key)
    return ",".join(str(p) for p in pk)


def registrar_listeners(fabrica_sessoes) -> None:
    """Liga a auditoria às sessões criadas pela fábrica."""

    @event.listens_for(fabrica_sessoes, "before_flush")
    def _preencher_autoria(session: Session, _ctx, _instances) -> None:
        usuario_id = session.info.get("usuario_id")
        for obj in session.new:
            if hasattr(obj, "criado_por") and getattr(obj, "criado_por", None) is None:
                obj.criado_por = usuario_id
        for obj in session.dirty:
            if hasattr(obj, "atualizado_por") and session.is_modified(obj, include_collections=False):
                obj.atualizado_por = usuario_id

    @event.listens_for(fabrica_sessoes, "after_flush")
    def _auditar(session: Session, _ctx) -> None:
        usuario_id = session.info.get("usuario_id")
        origem = session.info.get("origem", "aplicativo")
        linhas = []
        for obj in session.new:
            if _auditavel(obj):
                linhas.append(dict(tabela=obj.__tablename__, registro_id=_id_registro(obj), operacao="I",
                                   antes=None, depois=_instantaneo(obj)))
        for obj in session.dirty:
            if _auditavel(obj) and session.is_modified(obj, include_collections=False):
                antes, depois = _diferencas(obj)
                if depois:
                    linhas.append(dict(tabela=obj.__tablename__, registro_id=_id_registro(obj), operacao="U",
                                       antes=antes, depois=depois))
        for obj in session.deleted:
            if _auditavel(obj):
                linhas.append(dict(tabela=obj.__tablename__, registro_id=_id_registro(obj), operacao="D",
                                   antes=_instantaneo(obj, usar_valores_anteriores=True), depois=None))
        if linhas:
            momento = agora()
            for linha in linhas:
                linha.update(usuario_id=usuario_id, origem=origem, ocorrido_em=momento)
            session.connection().execute(insert(Auditoria), linhas)
