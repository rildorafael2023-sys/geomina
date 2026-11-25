"""Trilha de auditoria (RNF-03)."""

import pytest
from sqlalchemy import select, text
from sqlalchemy.exc import DatabaseError

from geomina.core.auditoria import Auditoria
from tests.conftest import cab, criar_usuario


def _registros(app, tabela):
    with app.state.fabrica_sessoes() as db:
        return list(db.scalars(select(Auditoria).where(Auditoria.tabela == tabela).order_by(Auditoria.id)))


def test_insercao_e_alteracao_auditadas_com_usuario(app, cliente, admin, token_admin):
    u, _ = criar_usuario(cliente, token_admin, "geologo1", ["GEOLOGO"])
    cliente.patch(f"/api/v1/usuarios/{u['id']}", headers=cab(token_admin),
                  json={"versao": u["versao"], "nome": "Nome Corrigido"})
    regs = [r for r in _registros(app, "usuario") if r.registro_id == u["id"]]
    ops = [r.operacao for r in regs]
    assert ops[0] == "I"
    alteracao = next(r for r in regs if r.operacao == "U" and "nome" in (r.depois or {}))
    assert alteracao.antes["nome"] == "Geologo1"
    assert alteracao.depois["nome"] == "Nome Corrigido"
    assert str(alteracao.usuario_id) == admin["usuario"]["id"]


def test_senha_nunca_aparece_na_auditoria(app, cliente, token_admin):
    criar_usuario(cliente, token_admin, "geologo2", ["GEOLOGO"])
    for r in _registros(app, "usuario"):
        for d in (r.antes or {}, r.depois or {}):
            if "senha_hash" in d:
                assert d["senha_hash"] == "***"


def test_instalacao_registra_origem(app, admin):
    r = _registros(app, "usuario")[0]
    assert r.operacao == "I" and r.origem == "instalacao"


def test_auditoria_imutavel_no_banco(app, admin):
    with app.state.engine.begin() as c, pytest.raises(DatabaseError, match="não podem ser alterados"):
        c.execute(text("UPDATE auditoria SET tabela='x'"))
    with app.state.engine.begin() as c, pytest.raises(DatabaseError, match="não podem ser excluídos"):
        c.execute(text("DELETE FROM auditoria"))
