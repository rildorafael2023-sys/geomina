from __future__ import annotations

import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, Request, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel, ConfigDict
from sqlalchemy import select
from sqlalchemy.orm import Session

from geomina.core.armazenamento import ArquivoCorrompido, ArquivoGrandeDemais, detectar_mime
from geomina.core.dependencias import obter_sessao, requer
from geomina.core.erros import ErroAplicacao
from geomina.modules.arquivos.models import Arquivo
from geomina.modules.auth.models import Usuario

router = APIRouter(prefix="/arquivos", tags=["arquivos"])


class ArquivoSaida(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    sha256: str
    tamanho: int
    mime: str
    nome_original: str
    enviado_em: datetime
    ja_existia: bool = False


@router.post("", response_model=ArquivoSaida, status_code=201)
def enviar(arquivo: UploadFile, request: Request, u: Usuario = Depends(requer("arquivo:enviar")),
           db: Session = Depends(obter_sessao)):
    cfg = request.app.state.config
    arm = request.app.state.armazenamento
    nome = (arquivo.filename or "sem_nome")[-260:]
    inicio = arquivo.file.read(16)
    arquivo.file.seek(0)
    try:
        r = arm.gravar(arquivo.file, limite_bytes=cfg.tamanho_max_upload_mb * 1024 * 1024)
    except ArquivoGrandeDemais as e:
        raise ErroAplicacao(413, "arquivo_grande", f"Arquivo acima do limite de {cfg.tamanho_max_upload_mb} MB.") from e
    existente = db.scalar(select(Arquivo).where(Arquivo.sha256 == r.sha256))
    if existente:
        saida = ArquivoSaida.model_validate(existente)
        saida.ja_existia = True
        return saida
    a = Arquivo(sha256=r.sha256, tamanho=r.tamanho, mime=detectar_mime(inicio, nome), nome_original=nome,
                chave=r.chave, enviado_por=u.id)
    db.add(a)
    db.flush()
    return ArquivoSaida.model_validate(a)


@router.get("/{arquivo_id}", response_model=ArquivoSaida)
def metadados(arquivo_id: uuid.UUID, _u: Usuario = Depends(requer("arquivo:ler")),
              db: Session = Depends(obter_sessao)):
    a = db.get(Arquivo, arquivo_id)
    if a is None:
        raise ErroAplicacao(404, "nao_encontrado", "Arquivo não encontrado.")
    return a


@router.get("/{arquivo_id}/conteudo")
def conteudo(arquivo_id: uuid.UUID, request: Request, verificar: bool = False,
             _u: Usuario = Depends(requer("arquivo:ler")), db: Session = Depends(obter_sessao)):
    a = db.get(Arquivo, arquivo_id)
    if a is None:
        raise ErroAplicacao(404, "nao_encontrado", "Arquivo não encontrado.")
    arm = request.app.state.armazenamento
    if verificar:
        try:
            arm.verificar(a.chave, a.sha256)
        except (ArquivoCorrompido, FileNotFoundError) as e:
            raise ErroAplicacao(500, "arquivo_corrompido", "O arquivo armazenado não confere com o original.") from e
    return FileResponse(arm.caminho(a.chave), media_type=a.mime, filename=a.nome_original)
