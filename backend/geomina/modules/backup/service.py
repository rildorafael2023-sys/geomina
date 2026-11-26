"""Backup e restauração do aplicativo local (Etapa 4 — RNF-12).

Tipos de backup (todos em <dados>/backups):
- ``completo``  — zip com o banco (cópia consistente) + todos os arquivos originais + manifesto;
- ``diario``    — zip só com o banco, criado automaticamente na abertura se o último tiver mais de 24 h
                  (mantidos os 14 mais recentes);
- ``semanal``   — zip completo (banco + arquivos originais) criado automaticamente a cada 7 dias
                  (mantidos os 4 mais recentes);
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
MANTER_SEMANAIS = 4
TIPOS = ("completo", "diario", "semanal", "antes-restauracao")
ARQ_AGENDA = "agenda.json"   # em <dados>/backups: preferências do backup automático
ARQ_ESTADO = "estado.json"   # em <dados>/backups: resultado da última execução
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
    """Compatibilidade: executa o backup automático e devolve o backup diário criado, se houve."""
    r = backup_agendado(cfg)
    return cfg.pasta_backups / r["diario"]["nome"] if r.get("diario", {}).get("criado") else None


# ------------------------------------------------------------------ backup automático (E19)
def ler_agenda(cfg: Config) -> dict:
    padrao = {"semanal_completo": True, "pasta_copia": None}
    try:
        return {**padrao, **json.loads((cfg.pasta_backups / ARQ_AGENDA).read_text("utf-8"))}
    except (OSError, json.JSONDecodeError):
        return padrao


def gravar_agenda(cfg: Config, semanal_completo: bool, pasta_copia: str | None) -> dict:
    cfg.preparar_pastas()
    pasta_copia = (pasta_copia or "").strip() or None
    if pasta_copia:
        destino = Path(pasta_copia).expanduser()
        if not destino.is_dir():
            raise BackupInvalido(f"A pasta '{pasta_copia}' não existe ou não está conectada.")
        if destino.resolve() == cfg.pasta_backups.resolve() or cfg.dados.resolve() in [destino.resolve(), *destino.resolve().parents]:
            raise BackupInvalido("Escolha uma pasta fora da pasta de dados do GeoMina (de preferência outro disco ou pendrive).")
    agenda = {"semanal_completo": bool(semanal_completo), "pasta_copia": pasta_copia}
    _gravar_json(cfg.pasta_backups / ARQ_AGENDA, agenda)
    return agenda


def ler_estado(cfg: Config) -> dict:
    try:
        return json.loads((cfg.pasta_backups / ARQ_ESTADO).read_text("utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}


def _gravar_json(caminho: Path, dados: dict) -> None:
    tmp = caminho.with_suffix(".tmp")
    tmp.write_text(json.dumps(dados, ensure_ascii=False, indent=2, default=str), "utf-8")
    os.replace(tmp, caminho)


def testar_restauracao(cfg: Config, caminho: Path) -> dict:
    """Teste de restauração sem tocar no banco em uso: extrai o banco do backup numa pasta temporária, confere hash,
    integridade, revisão e as contagens do manifesto, e confere o hash de cada arquivo original guardado no zip."""
    inicio = datetime.now(UTC)
    try:
        m = validar_para_restaurar(cfg, caminho)
        with tempfile.TemporaryDirectory(dir=cfg.dados) as tmp, zipfile.ZipFile(caminho) as z:
            z.extract(NOME_BANCO, tmp)
            contagens = _contagens(Path(tmp) / NOME_BANCO)
            if m.get("contagens") and contagens != m["contagens"]:
                raise BackupInvalido("As quantidades de registros no banco do backup não conferem com o manifesto.")
            arquivos = 0
            for info in z.infolist():
                if info.filename.startswith("arquivos/objetos/") and not info.is_dir():
                    h = hashlib.sha256()
                    with z.open(info) as f:
                        while b := f.read(1 << 20):
                            h.update(b)
                    # os objetos são guardados pelo próprio hash (…/aa/bb/<sha256>)
                    if h.hexdigest() != Path(info.filename).name.split(".")[0]:
                        raise BackupInvalido(f"Arquivo original corrompido dentro do backup: {info.filename}")
                    arquivos += 1
            if m.get("com_arquivos") and arquivos != m.get("arquivos", arquivos):
                raise BackupInvalido("Faltam arquivos originais dentro do backup.")
        return {"ok": True, "testado_em": inicio.isoformat(), "registros": sum(contagens.values()), "arquivos": arquivos,
                "detalhe": f"{sum(contagens.values())} registros e {arquivos} arquivo(s) conferidos"}
    except (BackupInvalido, zipfile.BadZipFile, OSError, sqlite3.Error) as e:
        return {"ok": False, "testado_em": inicio.isoformat(), "detalhe": str(e)}


def _podar_copias(destino: Path, tipo: str, manter: int) -> None:
    for antigo in sorted(destino.glob(f"geomina-*-{tipo}.zip"), reverse=True)[manter:]:
        antigo.unlink(missing_ok=True)


def backup_agendado(cfg: Config, agora_: datetime | None = None) -> dict:
    """Executado ao abrir o aplicativo e a cada hora enquanto ele está aberto.
    - diário (só o banco) se o último tiver mais de 24 h; mantém 14;
    - semanal completo (banco + arquivos originais) se o último tiver mais de 7 dias; mantém 4;
    - cada backup novo passa pelo teste de restauração e, se houver pasta de cópia, é copiado para ela (com conferência
      do hash) — a pasta de cópia guarda a mesma quantidade de backups.
    O resultado fica em backups/estado.json (mostrado na tela Backup)."""
    if not cfg.caminho_banco.exists():
        return {}
    agora_ = agora_ or _agora()
    agenda = ler_agenda(cfg)
    estado = ler_estado(cfg)
    resultado: dict = {}
    planos = [("diario", timedelta(hours=24), False, MANTER_DIARIOS)]
    if agenda["semanal_completo"]:
        planos.append(("semanal", timedelta(days=7), True, MANTER_SEMANAIS))
    for tipo, intervalo, com_arquivos, manter in planos:
        existentes = [b for b in listar(cfg) if b.tipo == tipo]
        if existentes and agora_ - existentes[0].criado_em < intervalo:
            continue
        with _trava:
            criado = criar_backup(cfg, tipo, com_arquivos=com_arquivos)
        for antigo in [b for b in listar(cfg) if b.tipo == tipo][manter:]:
            (cfg.pasta_backups / antigo.nome).unlink(missing_ok=True)
        item = {"nome": criado.name, "criado": True, "criado_em": agora_.isoformat(), "teste": testar_restauracao(cfg, criado)}
        if agenda["pasta_copia"]:
            try:
                final = copiar_para(criado, agenda["pasta_copia"])
                _podar_copias(final.parent, tipo, manter)
                item["copia"] = {"ok": True, "destino": str(final)}
            except (BackupInvalido, OSError) as e:
                item["copia"] = {"ok": False, "destino": agenda["pasta_copia"], "erro": str(e)}
                log.warning("Cópia do backup %s para %s falhou: %s", criado.name, agenda["pasta_copia"], e)
        if not item["teste"]["ok"]:
            log.error("Teste de restauração do backup %s FALHOU: %s", criado.name, item["teste"]["detalhe"])
        resultado[tipo] = estado[tipo] = item
    if resultado:
        estado["verificado_em"] = agora_.isoformat()
        _gravar_json(cfg.pasta_backups / ARQ_ESTADO, estado)
    return resultado


def agendar(cfg: Config, parar: threading.Event, intervalo_s: float = 3600) -> threading.Thread:
    """Roda o backup automático agora e depois a cada `intervalo_s`, em segundo plano, até `parar` ser sinalizado."""
    def _laco():
        while not parar.is_set():
            try:
                backup_agendado(cfg)
            except Exception:  # noqa: BLE001 — falha no backup automático não derruba o aplicativo (fica no log)
                log.exception("Falha no backup automático")
            t.primeira_execucao.set()
            parar.wait(intervalo_s)
    t = threading.Thread(target=_laco, name="backup-automatico", daemon=True)
    t.primeira_execucao = threading.Event()  # type: ignore[attr-defined]
    t.start()
    return t


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
