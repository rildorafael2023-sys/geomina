"""Configuração do aplicativo local.

Todos os dados (banco SQLite, arquivos originais, backups) ficam numa única pasta
de dados no computador do usuário. Nada é enviado para a rede.
"""

from __future__ import annotations

import os
import sys
from functools import cached_property
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

VERSAO_APP = "0.18.0"


def pasta_dados_padrao() -> Path:
    """Pasta de dados padrão por sistema operacional."""
    if sys.platform.startswith("win"):
        base = os.environ.get("LOCALAPPDATA") or str(Path.home() / "AppData" / "Local")
        return Path(base) / "GeoMina"
    if sys.platform == "darwin":
        return Path.home() / "Library" / "Application Support" / "GeoMina"
    base = os.environ.get("XDG_DATA_HOME") or str(Path.home() / ".local" / "share")
    return Path(base) / "geomina"


class Config(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="GEOMINA_", extra="ignore")

    dados: Path = pasta_dados_padrao()
    # Somente a própria máquina: o servidor nunca escuta em interfaces de rede.
    host: str = "127.0.0.1"
    porta: int = 8765
    sessao_horas: int = 12
    tamanho_max_upload_mb: int = 500
    backup_diario: bool = True

    @cached_property
    def caminho_banco(self) -> Path:
        return self.dados / "geomina.db"

    @cached_property
    def pasta_arquivos(self) -> Path:
        return self.dados / "arquivos"

    @cached_property
    def pasta_backups(self) -> Path:
        return self.dados / "backups"

    def preparar_pastas(self) -> None:
        for p in (self.dados, self.pasta_arquivos, self.pasta_backups):
            p.mkdir(parents=True, exist_ok=True)

    @property
    def url_banco(self) -> str:
        return f"sqlite:///{self.caminho_banco.as_posix()}"
