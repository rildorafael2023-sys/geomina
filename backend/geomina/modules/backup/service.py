"""Backup e restauração do aplicativo local (Etapa 4 — RNF-12).

Tipos de backup (todos em <dados>/backups):
- ``completo``  — zip com o banco (cópia consistente) + todos os arquivos originais + manifesto;
- ``diario``    — zip só com o banco, criado automaticamente na abertura se o último tiver mais de 24 h
                  (mantidos os 14 mais recentes);
- ``antes-restauracao`` — zip completo criado automaticamente antes de qualquer restauração;
- ``antes-migracao``    — cópia .db criada antes de atualizar o banco (migrar.py).

Restauração: valida o zip (manifesto, hash e integridade do banco, revisão do esquema), faz um
backup "antes-restauracao" e copia o banco do backup para o banco em uso pela API de backup do
SQLite (sem trocar arquivos com conexões abertas). Os arquivos originais do backup que faltarem
são acrescentados (são endereçados por hash: nunca há conflito). Migrações pendentes são
aplicadas em seguida, e o evento é registrado na auditoria do banco restaurado.
"""

from __future__ import annotations

import hashlib
import json
import logging
import os
import shutil
import sqlite3
import subprocess
import sys
import tempfile
import threading
import zipfile
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from pathlib import Path

from geomina.config import VERSAO_APP, Config
from geomina.migrar import migrar, revisao_alvo

log = logging.getLogger("geomina.backup")

MANIFESTO = "manifesto.json"
NOME_BANCO = "geomina.db"
MANTER_DIARIOS = 14
TIPOS = ("completo", "diario", "antes-restauracao")
_trava = threading.Lock()


class BackupInvalido(Exception):
    pass


@dataclass
class InfoBackup:
    nome: str
    tipo: str
    criado_em: datetime
    tamanho: int
    versao_app: str | None
    revisao_banco: str | None
    com_arquivos: bool
    usuario: str | None


def _agora() -> datetime:
    return datetime.now(UTC)


def _sha256(caminho: Path) -> str:
    h = hashlib.sha256()
    with open(caminho, "rb") as f:
        while bloco := f.read(1024 * 1024):
            h.update(bloco)
    return h.hexdigest()


def _copiar_banco(origem: Path, destino: Path) -> None:
    """Cópia consistente com a API de backup do SQLite (segura com o aplicativo em uso)."""
    src = sqlite3.connect(origem)
    try:
        dst = sqlite3.connect(destino)
        with dst:
            src.backup(dst)
        dst.close()
    finally:
        src.close()


def _revisao(banco: Path) -> str | None:
    con = sqlite3.connect(banco)
    try:
        return con.execute("SELECT version_num FROM alembic_version").fetchone()[0]
    except sqlite3.Error:
        return None
    finally:
        con.close()


def _contagens(banco: Path) -> dict[str, int]:
    con = sqlite3.connect(banco)
    try:
        tabelas = [r[0] for r in con.execute(
            "SELECT name FROM sqlite_master WHERE type='table' "
            "AND name NOT LIKE 'sqlite_%' AND name <> 'alembic_version'")]
        return {t: con.execute(f'SELECT count(*) FROM "{t}"').fetchone()[0] for t in sorted(tabelas)}
    finally:
        con.close()


def criar_backup(cfg: Config, tipo: str, usuario: str | None = None, com_arquivos: bool = True) -> Path:
    if tipo not in TIPOS:
        raise ValueError(tipo)
    cfg.preparar_pastas()
    momento = _agora()
    nome = f"geomina-{momento.astimezone():%Y%m%d-%H%M%S}-{tipo}.zip"
    destino = cfg.pasta_backups / nome
    with tempfile.TemporaryDirectory(dir=cfg.dados) as tmp:
        copia = Path(tmp) / NOME_BANCO
        _copiar_banco(cfg.caminho_banco, copia)
        con = sqlite3.connect(copia)
        ok = con.execute("PRAGMA integrity_check").fetchone()[0]
        con.close()
        if ok != "ok":
            raise BackupInvalido(f"O banco em uso não passou na verificação de integridade: {ok}")
        objetos = sorted((cfg.pasta_arquivos / "objetos").rglob("*")) if com_arquivos else []
        objetos = [p for p in objetos if p.is_file()]
        manifesto = {
            "formato": 1,
            "tipo": tipo,
            "criado_em": momento.isoformat(),
            "versao_app": VERSAO_APP,
            "revisao_banco": _revisao(copia),
            "sha256_banco": _sha256(copia),
            "com_arquivos": com_arquivos,
            "arquivos": len(objetos),
            "usuario": usuario,
            "contagens": _contagens(copia),
        }
        parcial = destino.with_suffix(".zip.parcial")
        with zipfile.ZipFile(parcial, "w", compression=zipfile.ZIP_DEFLATED, allowZip64=True) as z:
            z.writestr(MANIFESTO, json.dumps(manifesto, ensure_ascii=False, indent=2))
            z.write(copia, NOME_BANCO)
            for p in objetos:
                # originais já comprimidos (jpg, pdf) não ganham com nova compressão
                z.write(p, "arquivos/" + p.relative_to(cfg.pasta_arquivos).as_posix(), compress_type=zipfile.ZIP_STORED)
        os.replace(parcial, destino)
    log.info("Backup %s criado: %s", tipo, destino)
    return destino


def ler_manifesto(caminho: Path) -> dict:
    try:
        with zipfile.ZipFile(caminho) as z:
            return json.loads(z.read(MANIFESTO))
    except (zipfile.BadZipFile, KeyError, json.JSONDecodeError, OSError) as e:
        raise BackupInvalido(f"'{caminho.name}' não é um backup do GeoMina válido.") from e


def listar(cfg: Config) -> list[InfoBackup]:
    cfg.preparar_pastas()
    itens: list[InfoBackup] = []
    for p in cfg.pasta_backups.iterdir():
        if p.suffix == ".zip":
            try:
                m = ler_manifesto(p)
            except BackupInvalido:
                continue
            itens.append(InfoBackup(p.name, m["tipo"], datetime.fromisoformat(m["criado_em"]), p.stat().st_size,
                                    m.get("versao_app"), m.get("revisao_banco"), m.get("com_arquivos", False),
                                    m.get("usuario")))
        elif p.suffix == ".db" and "antes-migracao" in p.name:
            itens.append(InfoBackup(p.name, "antes-migracao",
                                    datetime.fromtimestamp(p.stat().st_mtime, UTC), p.stat().st_size,
                                    None, _revisao(p), False, None))
    return sorted(itens, key=lambda i: i.criado_em, reverse=True)


def caminho_seguro(cfg: Config, nome: str) -> Path:
    p = (cfg.pasta_backups / nome).resolve()
    if p.parent != cfg.pasta_backups.resolve() or not p.is_file():
        raise BackupInvalido("Backup não encontrado.")
    return p


def backup_diario_se_necessario(cfg: Config) -> Path | None:
    """Chamado na abertura do aplicativo. Retorna o backup criado, se houve."""
    if not cfg.caminho_banco.exists():
        return None
    diarios = [b for b in listar(cfg) if b.tipo == "diario"]
    if diarios and _agora() - diarios[0].criado_em < timedelta(hours=24):
        return None
    with _trava:
        criado = criar_backup(cfg, "diario", com_arquivos=False)
    for antigo in [b for b in listar(cfg) if b.tipo == "diario"][MANTER_DIARIOS:]:
        (cfg.pasta_backups / antigo.nome).unlink(missing_ok=True)
    return criado


def copiar_para(origem: Path, pasta_destino: str) -> Path:
    destino = Path(pasta_destino).expanduser()
    if not destino.is_dir():
        raise BackupInvalido(f"A pasta '{pasta_destino}' não existe (verifique se o pendrive/disco está conectado).")
    final = destino / origem.name
    shutil.copy2(origem, final)
    if _sha256(final) != _sha256(origem):
        final.unlink(missing_ok=True)
        raise BackupInvalido("A cópia gravada no destino não confere com o original.")
    return final


def abrir_pasta(pasta: Path) -> bool:
    """Abre a pasta no explorador de arquivos do computador (o servidor roda na própria máquina)."""
    try:
        if sys.platform.startswith("win"):
            os.startfile(pasta)  # type: ignore[attr-defined]
        elif sys.platform == "darwin":
            subprocess.Popen(["open", str(pasta)])
        else:
            return False
        return True
    except OSError:
        return False


def validar_para_restaurar(cfg: Config, caminho: Path) -> dict:
    m = ler_manifesto(caminho)
    alvo_max = revisao_alvo(cfg)  # a revisão mais nova que este aplicativo conhece
    rev = m.get("revisao_banco")
    if rev is None or rev > alvo_max:
        raise BackupInvalido(
            f"Este backup foi feito por uma versão mais nova do GeoMina (banco {rev}). Atualize o aplicativo antes.")
    with tempfile.TemporaryDirectory() as tmp, zipfile.ZipFile(caminho) as z:
        z.extract(NOME_BANCO, tmp)
        banco = Path(tmp) / NOME_BANCO
        if _sha256(banco) != m.get("sha256_banco"):
            raise BackupInvalido("O banco dentro do backup está corrompido (hash não confere).")
        con = sqlite3.connect(banco)
        ok = con.execute("PRAGMA integrity_check").fetchone()[0]
        con.close()
        if ok != "ok":
            raise BackupInvalido(f"O banco dentro do backup não passou na verificação de integridade: {ok}")
    return m


def restaurar(cfg: Config, caminho: Path, engine, usuario: str) -> tuple[dict, Path]:
    """Substitui o conteúdo do banco em uso pelo do backup. Retorna (manifesto, backup de segurança)."""
    with _trava:
        m = validar_para_restaurar(cfg, caminho)
        seguranca = criar_backup(cfg, "antes-restauracao", usuario=usuario, com_arquivos=True)
        with tempfile.TemporaryDirectory(dir=cfg.dados) as tmp, zipfile.ZipFile(caminho) as z:
            z.extract(NOME_BANCO, tmp)
            # arquivos originais: acrescenta os que faltam (endereçados por hash, nunca sobrescreve)
            for info in z.infolist():
                if info.filename.startswith("arquivos/objetos/") and not info.is_dir():
                    rel = info.filename[len("arquivos/"):]
                    final = (cfg.pasta_arquivos / rel).resolve()
                    if cfg.pasta_arquivos.resolve() not in final.parents:
                        raise BackupInvalido("Caminho inválido dentro do backup.")
                    if not final.exists():
                        final.parent.mkdir(parents=True, exist_ok=True)
                        with z.open(info) as origem, open(final, "wb") as destino:
                            shutil.copyfileobj(origem, destino)
                        os.chmod(final, 0o444)
            engine.dispose()  # fecha as conexões do aplicativo antes de sobrescrever
            _copiar_banco(Path(tmp) / NOME_BANCO, cfg.caminho_banco)
        migrar(cfg)  # backup de versão anterior: aplica as migrações pendentes
        engine.dispose()
    log.warning("Banco restaurado a partir de %s por %s (segurança: %s)", caminho.name, usuario, seguranca.name)
    return m, seguranca
