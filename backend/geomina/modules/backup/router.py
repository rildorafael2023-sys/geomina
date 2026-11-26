from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends, Request
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field
from sqlalchemy import insert
from sqlalchemy.orm import Session

from geomina.core.auditoria import Auditoria
from geomina.core.dependencias import obter_sessao, requer
from geomina.core.erros import ErroAplicacao
from geomina.core.seguranca import verificar_senha
from geomina.db import agora
from geomina.modules.auth.models import Usuario
from geomina.modules.backup import service

router = APIRouter(prefix="/backups", tags=["backup"])
BACKUP = requer("sistema:backup")


class BackupSaida(BaseModel):
    nome: str
    tipo: str
    criado_em: datetime
    tamanho: int
    versao_app: str | None
    revisao_banco: str | None
    com_arquivos: bool
    usuario: str | None


class NovoBackup(BaseModel):
    copiar_para: str | None = Field(default=None, max_length=500,
                                    description="pasta adicional (ex.: pendrive E:\\) onde gravar uma cópia")


class NovoBackupSaida(BaseModel):
    backup: BackupSaida
    copia: str | None


class Restaurar(BaseModel):
    nome: str
    senha: str = Field(min_length=1)
    confirmacao: str = Field(description='deve ser exatamente "RESTAURAR"')


class RestauracaoSaida(BaseModel):
    restaurado: str
    backup_de_seguranca: str
    criado_em: str
    revisao_banco: str | None


def _erro(e: service.BackupInvalido) -> ErroAplicacao:
    return ErroAplicacao(422, "backup_invalido", str(e))


def _info(cfg, nome: str) -> BackupSaida:
    return next(BackupSaida(**vars(b)) for b in service.listar(cfg) if b.nome == nome)


@router.get("", response_model=list[BackupSaida])
def listar(request: Request, _u: Usuario = Depends(BACKUP)):
    return [BackupSaida(**vars(b)) for b in service.listar(request.app.state.config)]


@router.post("", response_model=NovoBackupSaida, status_code=201)
def criar(d: NovoBackup, request: Request, u: Usuario = Depends(BACKUP), db: Session = Depends(obter_sessao)):
    cfg = request.app.state.config
    db.commit()  # garante que nada pendente desta requisição fique fora da cópia
    try:
        caminho = service.criar_backup(cfg, "completo", usuario=u.nome, com_arquivos=True)
        copia = service.copiar_para(caminho, d.copiar_para) if d.copiar_para else None
    except service.BackupInvalido as e:
        raise _erro(e) from e
    db.execute(insert(Auditoria).values(tabela="sistema", registro_id="backup", operacao="B", antes=None,
                                        depois={"arquivo": caminho.name, "copia": str(copia) if copia else None},
                                        usuario_id=u.id, origem="aplicativo", ocorrido_em=agora()))
    return NovoBackupSaida(backup=_info(cfg, caminho.name), copia=str(copia) if copia else None)


@router.get("/{nome}/download")
def baixar(nome: str, request: Request, _u: Usuario = Depends(BACKUP)):
    try:
        caminho = service.caminho_seguro(request.app.state.config, nome)
    except service.BackupInvalido as e:
        raise ErroAplicacao(404, "nao_encontrado", str(e)) from e
    return FileResponse(caminho, filename=nome, media_type="application/octet-stream")


@router.post("/abrir-pasta")
def abrir_pasta(request: Request, _u: Usuario = Depends(BACKUP)) -> dict:
    pasta = request.app.state.config.pasta_backups
    return {"pasta": str(pasta), "aberta": service.abrir_pasta(pasta)}


@router.post("/restaurar", response_model=RestauracaoSaida)
def restaurar(d: Restaurar, request: Request, u: Usuario = Depends(BACKUP), db: Session = Depends(obter_sessao)):
    """Substitui TODOS os dados atuais pelos do backup (após um backup de segurança automático)."""
    db.close()  # libera a conexão desta requisição antes de substituir o banco
    if d.confirmacao != "RESTAURAR":
        raise ErroAplicacao(422, "confirmacao", 'Digite RESTAURAR para confirmar.')
    if not verificar_senha(d.senha, u.senha_hash):
        raise ErroAplicacao(422, "senha_incorreta", "Senha incorreta.")
    app = request.app
    cfg = app.state.config
    try:
        caminho = service.caminho_seguro(cfg, d.nome)
        if caminho.suffix != ".zip":
            raise service.BackupInvalido("Só backups .zip podem ser restaurados pela interface.")
        app.state.restaurando = True
        try:
            m, seguranca = service.restaurar(cfg, caminho, app.state.engine, u.nome)
        finally:
            app.state.restaurando = False
            from geomina.modules.geoop.servico import limpar_cache
            limpar_cache()
    except service.BackupInvalido as e:
        raise _erro(e) from e
    # Registra a restauração na auditoria do banco restaurado (o usuário pode não existir nele).
    with app.state.engine.begin() as c:
        c.execute(insert(Auditoria).values(
            tabela="sistema", registro_id="restauracao", operacao="R", antes={"backup_de_seguranca": seguranca.name},
            depois={"restaurado": caminho.name, "por": f"{u.nome} ({u.login})"}, usuario_id=None,
            origem="restauracao", ocorrido_em=agora()))
    return RestauracaoSaida(restaurado=caminho.name, backup_de_seguranca=seguranca.name, criado_em=m["criado_em"],
                            revisao_banco=m.get("revisao_banco"))
