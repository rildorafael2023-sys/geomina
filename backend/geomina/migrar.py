"""Aplicação automática das migrações do banco local, com backup prévio."""

from __future__ import annotations

import logging
import sqlite3
from datetime import datetime
from pathlib import Path

from alembic import command
from alembic.config import Config as AlembicConfig
from alembic.runtime.migration import MigrationContext
from alembic.script import ScriptDirectory
from sqlalchemy import create_engine

from geomina.config import Config

log = logging.getLogger("geomina.migrar")
PASTA_MIGRACOES = Path(__file__).parent / "migrations"


def _alembic(cfg: Config) -> AlembicConfig:
    ac = AlembicConfig()
    ac.set_main_option("script_location", str(PASTA_MIGRACOES))
    ac.set_main_option("sqlalchemy.url", cfg.url_banco)
    return ac


def revisao_atual(cfg: Config) -> str | None:
    if not cfg.caminho_banco.exists():
        return None
    eng = create_engine(cfg.url_banco)
    with eng.connect() as c:
        rev = MigrationContext.configure(c).get_current_revision()
    eng.dispose()
    return rev


def revisao_alvo(cfg: Config) -> str:
    return ScriptDirectory.from_config(_alembic(cfg)).get_current_head()


def backup(cfg: Config, motivo: str) -> Path:
    """Cópia consistente do banco usando a API de backup do SQLite."""
    cfg.preparar_pastas()
    destino = cfg.pasta_backups / f"geomina-{datetime.now():%Y%m%d-%H%M%S}-{motivo}.db"
    origem = sqlite3.connect(cfg.caminho_banco)
    try:
        alvo = sqlite3.connect(destino)
        with alvo:
            origem.backup(alvo)
        alvo.close()
    finally:
        origem.close()
    return destino


def migrar(cfg: Config) -> str:
    cfg.preparar_pastas()
    atual, alvo = revisao_atual(cfg), revisao_alvo(cfg)
    if atual == alvo:
        return alvo
    if atual is not None:
        caminho = backup(cfg, f"antes-migracao-{atual}")
        log.info("Backup antes da migração: %s", caminho)
    command.upgrade(_alembic(cfg), "head")
    return alvo
