"""Infraestrutura: migrações, saúde, backup."""

import sqlite3

import sqlalchemy as sa
from alembic import command

from geomina.migrar import _alembic, backup, migrar, revisao_alvo, revisao_atual


def test_migracao_do_zero_reversivel_e_reaplicavel(cfg):
    assert revisao_atual(cfg) is None
    migrar(cfg)
    assert revisao_atual(cfg) == revisao_alvo(cfg)
    eng = sa.create_engine(cfg.url_banco)
    tabelas = set(sa.inspect(eng).get_table_names())
    assert {"usuario", "papel", "permissao", "sessao", "auditoria", "arquivo", "parametro_sistema"} <= tabelas
    eng.dispose()
    command.downgrade(_alembic(cfg), "base")
    eng = sa.create_engine(cfg.url_banco)
    assert set(sa.inspect(eng).get_table_names()) == {"alembic_version"}
    eng.dispose()
    command.upgrade(_alembic(cfg), "head")
    assert revisao_atual(cfg) == revisao_alvo(cfg)


def test_dados_iniciais_papeis_e_instalacao(cfg):
    migrar(cfg)
    con = sqlite3.connect(cfg.caminho_banco)
    papeis = {r[0] for r in con.execute("select codigo from papel")}
    assert papeis == {"ADMIN", "REVISOR", "GEOLOGO", "TECNICO", "CONSULTA"}
    n_admin = con.execute(
        "select count(*) from papel_permissao pp join papel p on p.id=pp.papel_id where p.codigo='ADMIN'"
    ).fetchone()[0]
    assert n_admin == con.execute("select count(*) from permissao").fetchone()[0]
    assert con.execute("select valor from parametro_sistema where chave='instalacao_id'").fetchone()
    con.close()


def test_chaves_estrangeiras_ativas(app):
    with app.state.engine.connect() as c:
        assert c.exec_driver_sql("PRAGMA foreign_keys").scalar() == 1
        assert c.exec_driver_sql("PRAGMA journal_mode").scalar() == "wal"


def test_backup_gera_copia_consistente(cfg):
    migrar(cfg)
    destino = backup(cfg, "teste")
    con = sqlite3.connect(destino)
    assert con.execute("pragma integrity_check").fetchone()[0] == "ok"
    assert con.execute("select count(*) from papel").fetchone()[0] == 5
    con.close()


def test_saude(cfg, cliente):
    r = cliente.get("/api/v1/saude")
    assert r.status_code == 200
    d = r.json()
    assert d["status"] == "ok"
    assert d["rtree"] is True
    assert d["crs_disponiveis"] == {"29193": True, "31983": True}
    assert d["revisao_banco"] == revisao_alvo(cfg)


def test_servidor_so_escuta_localmente(cfg):
    assert cfg.host == "127.0.0.1"
