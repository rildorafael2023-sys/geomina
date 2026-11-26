from __future__ import annotations

import io
import uuid
from datetime import date, datetime
from typing import Literal

from fastapi import APIRouter, Depends, File, Form, Request, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from geomina.core.armazenamento import ArquivoGrandeDemais, detectar_mime
from geomina.core.dependencias import obter_sessao, requer
from geomina.core.erros import ErroAplicacao
from geomina.db import agora
from geomina.modules.arquivos.models import Arquivo
from geomina.modules.auth.models import Usuario
from geomina.modules.documentos import midia
from geomina.modules.documentos.models import Documento, DocumentoVersao, DocumentoVinculo
from geomina.modules.estrutura.models import UnidadeOperacional
from geomina.modules.mapeamento.models import Mapeamento

router = APIRouter(tags=["documentos, croquis e fotos"])
LER = requer("arquivo:ler")
ENVIAR = requer("arquivo:enviar")
Categoria = Literal["croqui", "foto", "relatorio", "planilha", "gis", "topografia", "campo", "outro"]


class VersaoSaida(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    numero: int
    nome_original: str
    paginas: int | None
    largura_px: int | None
    altura_px: int | None
    motivo: str | None
    criado_em: datetime
    mime: str = ""
    tamanho: int = 0
    sha256: str = ""


class VinculoSaida(BaseModel):
    id: uuid.UUID
    tipo: Literal["unidade", "mapeamento"]
    alvo_id: uuid.UUID
    rotulo: str
    removivel: bool


class DocumentoSaida(BaseModel):
    id: uuid.UUID
    mina_id: uuid.UUID
    categoria: str
    titulo: str
    descricao: str | None
    data_documento: date | None
    autor: str
    legenda: str | None
    identificador: str | None
    exif: dict | None
    x: float | None
    y: float | None
    z: float | None
    origem_id: uuid.UUID | None
    origem_pagina: int | None
    arquivado: bool
    paginas_separadas: bool = False
    versao: int
    criado_em: datetime
    versoes: list[VersaoSaida]
    vinculos: list[VinculoSaida]


class Alteracao(BaseModel):
    versao: int
    titulo: str | None = Field(default=None, min_length=1, max_length=200)
    descricao: str | None = None
    data_documento: date | None = None
    legenda: str | None = Field(default=None, max_length=300)
    identificador: str | None = Field(default=None, max_length=60)
    x: float | None = None
    y: float | None = None
    z: float | None = None
    arquivado: bool | None = None


class NovoVinculo(BaseModel):
    unidade_id: uuid.UUID | None = None
    mapeamento_id: uuid.UUID | None = None


# ------------------------------------------------------------------ utilidades
def _buscar(db: Session, doc_id: uuid.UUID) -> Documento:
    d = db.get(Documento, doc_id)
    if d is None:
        raise ErroAplicacao(404, "nao_encontrado", "Documento não encontrado.")
    return d


def _saida(db: Session, d: Documento) -> DocumentoSaida:
    arquivos = {a.id: a for a in db.scalars(select(Arquivo).where(Arquivo.id.in_([v.arquivo_id for v in d.versoes])))}
    vinc = []
    for v in d.vinculos:
        if v.unidade_id:
            u = db.get(UnidadeOperacional, v.unidade_id)
            vinc.append(VinculoSaida(id=v.id, tipo="unidade", alvo_id=u.id, rotulo=f"{u.codigo} — {u.nome}",
                                     removivel=True))
        else:
            m = db.get(Mapeamento, v.mapeamento_id)
            vinc.append(VinculoSaida(id=v.id, tipo="mapeamento", alvo_id=m.id, rotulo=f"Ficha {m.numero}",
                                     removivel=m.estado == "rascunho"))
    versoes = []
    for v in d.versoes:
        o = VersaoSaida.model_validate(v)
        a = arquivos[v.arquivo_id]
        o.mime, o.tamanho, o.sha256 = a.mime, a.tamanho, a.sha256
        versoes.append(o)
    autor = db.get(Usuario, d.autor_id)
    return DocumentoSaida(
        id=d.id, mina_id=d.mina_id, categoria=d.categoria, titulo=d.titulo, descricao=d.descricao,
        data_documento=d.data_documento, autor=autor.nome if autor else "?", legenda=d.legenda,
        identificador=d.identificador, exif=d.exif, x=d.x, y=d.y, z=d.z, origem_id=d.origem_id,
        origem_pagina=d.origem_pagina, arquivado=d.arquivado,
        paginas_separadas=db.scalar(select(Documento.id).where(Documento.origem_id == d.id).limit(1)) is not None,
        versao=d.versao, criado_em=d.criado_em,
        versoes=versoes, vinculos=vinc)


def _gravar_arquivo(request: Request, db: Session, conteudo, nome: str, u: Usuario) -> Arquivo:
    cfg, arm = request.app.state.config, request.app.state.armazenamento
    inicio = conteudo.read(16)
    conteudo.seek(0)
    try:
        r = arm.gravar(conteudo, limite_bytes=cfg.tamanho_max_upload_mb * 1024 * 1024)
    except ArquivoGrandeDemais as e:
        raise ErroAplicacao(413, "arquivo_grande", f"Arquivo acima de {cfg.tamanho_max_upload_mb} MB.") from e
    a = db.scalar(select(Arquivo).where(Arquivo.sha256 == r.sha256))
    if a is None:
        a = Arquivo(sha256=r.sha256, tamanho=r.tamanho, mime=detectar_mime(inicio, nome), nome_original=nome[-260:],
                    chave=r.chave, enviado_por=u.id)
        db.add(a)
        db.flush()
    return a


def _nova_versao(request: Request, db: Session, d: Documento, a: Arquivo, nome: str, motivo: str | None,
                 u: Usuario) -> DocumentoVersao:
    try:
        midia.validar_tipo(d.categoria, a.mime, nome)
    except midia.MidiaInvalida as e:
        raise ErroAplicacao(422, "tipo_invalido", str(e)) from e
    caminho = request.app.state.armazenamento.caminho(a.chave)
    v = DocumentoVersao(documento_id=d.id, numero=len(d.versoes) + 1, arquivo_id=a.id, nome_original=nome[-260:],
                        motivo=motivo, criado_por=u.id)
    try:
        if a.mime == "application/pdf":
            v.paginas = midia.paginas_pdf(caminho)
        elif a.mime.startswith("image/"):
            v.largura_px, v.altura_px = midia.info_imagem(caminho)
            if d.categoria == "foto" and v.numero == 1:
                d.exif = midia.ler_exif(caminho) or None
                if d.data_documento is None and d.exif:
                    d.data_documento = midia.data_exif(d.exif)
    except (midia.MidiaInvalida, OSError) as e:
        raise ErroAplicacao(422, "arquivo_ilegivel", str(e) or "Arquivo de imagem/PDF ilegível.") from e
    db.add(v)
    db.flush()
    db.refresh(d)
    return v


def _vincular(db: Session, d: Documento, unidade_id: uuid.UUID | None, mapeamento_id: uuid.UUID | None) -> None:
    if (unidade_id is None) == (mapeamento_id is None):
        raise ErroAplicacao(422, "vinculo_invalido", "Informe uma unidade da mina ou uma ficha de mapeamento.")
    if unidade_id:
        u = db.get(UnidadeOperacional, unidade_id)
        if u is None or u.mina_id != d.mina_id:
            raise ErroAplicacao(422, "vinculo_invalido", "Unidade inexistente ou de outra mina.")
    else:
        m = db.get(Mapeamento, mapeamento_id)
        if m is None or m.mina_id != d.mina_id:
            raise ErroAplicacao(422, "vinculo_invalido", "Ficha inexistente ou de outra mina.")
    if any(v.unidade_id == unidade_id and v.mapeamento_id == mapeamento_id for v in d.vinculos):
        return
    d.vinculos.append(DocumentoVinculo(unidade_id=unidade_id, mapeamento_id=mapeamento_id))
    db.flush()


# ------------------------------------------------------------------ rotas
@router.post("/documentos", response_model=list[DocumentoSaida], status_code=201)
def enviar(request: Request, arquivos: list[UploadFile] = File(...), categoria: Categoria = Form(...),
           mina_id: uuid.UUID = Form(...), titulo: str | None = Form(None), descricao: str | None = Form(None),
           data_documento: date | None = Form(None), legenda: str | None = Form(None),
           unidade_id: uuid.UUID | None = Form(None), mapeamento_id: uuid.UUID | None = Form(None),
           u: Usuario = Depends(ENVIAR), db: Session = Depends(obter_sessao)):
    """Envia um ou vários arquivos; cada arquivo vira um documento (versão 1)."""
    if len(arquivos) > 200:
        raise ErroAplicacao(422, "muitos_arquivos", "Envie no máximo 200 arquivos por vez.")
    criados = []
    for arq in arquivos:
        nome = (arq.filename or "sem_nome").replace("\\", "/").rsplit("/", 1)[-1]
        a = _gravar_arquivo(request, db, arq.file, nome, u)
        t = (titulo if titulo and len(arquivos) == 1 else nome.rsplit(".", 1)[0])[:200]
        d = Documento(mina_id=mina_id, categoria=categoria, titulo=t, descricao=descricao, data_documento=data_documento,
                      legenda=legenda, autor_id=u.id)
        db.add(d)
        db.flush()
        _nova_versao(request, db, d, a, nome, None, u)
        if unidade_id or mapeamento_id:
            _vincular(db, d, unidade_id, mapeamento_id)
        criados.append(d)
    return [_saida(db, d) for d in criados]


@router.get("/minas/{mina_id}/documentos", response_model=list[DocumentoSaida])
def listar(mina_id: uuid.UUID, categoria: Categoria | None = None, unidade_id: uuid.UUID | None = None,
           mapeamento_id: uuid.UUID | None = None, de: date | None = None, ate: date | None = None,
           autor_id: uuid.UUID | None = None, texto: str | None = None, arquivados: bool = False,
           _u: Usuario = Depends(LER), db: Session = Depends(obter_sessao)):
    q = select(Documento).where(Documento.mina_id == mina_id)
    if not arquivados:
        q = q.where(Documento.arquivado.is_(False))
    if categoria:
        q = q.where(Documento.categoria == categoria)
    if unidade_id:
        base = db.get(UnidadeOperacional, unidade_id)
        if base is None:
            raise ErroAplicacao(404, "nao_encontrado", "Unidade não encontrada.")
        sub = select(UnidadeOperacional.id).where(UnidadeOperacional.caminho.like(base.caminho + "%"))
        fichas = select(Mapeamento.id).where(Mapeamento.unidade_id.in_(sub))
        q = q.where(Documento.id.in_(select(DocumentoVinculo.documento_id).where(
            or_(DocumentoVinculo.unidade_id.in_(sub), DocumentoVinculo.mapeamento_id.in_(fichas)))))
    if mapeamento_id:
        q = q.where(Documento.id.in_(select(DocumentoVinculo.documento_id)
                                     .where(DocumentoVinculo.mapeamento_id == mapeamento_id)))
    if de:
        q = q.where(Documento.data_documento >= de)
    if ate:
        q = q.where(Documento.data_documento <= ate)
    if autor_id:
        q = q.where(Documento.autor_id == autor_id)
    if texto:
        p = f"%{texto}%"
        q = q.where(or_(Documento.titulo.ilike(p), Documento.descricao.ilike(p), Documento.legenda.ilike(p),
                        Documento.identificador.ilike(p)))
    docs = db.scalars(q.order_by(Documento.data_documento.desc().nulls_last(), Documento.criado_em.desc()).limit(1000))
    return [_saida(db, d) for d in docs]


@router.get("/documentos/{doc_id}", response_model=DocumentoSaida)
def obter(doc_id: uuid.UUID, _u: Usuario = Depends(LER), db: Session = Depends(obter_sessao)):
    return _saida(db, _buscar(db, doc_id))


@router.patch("/documentos/{doc_id}", response_model=DocumentoSaida)
def alterar(doc_id: uuid.UUID, e: Alteracao, _u: Usuario = Depends(ENVIAR), db: Session = Depends(obter_sessao)):
    d = _buscar(db, doc_id)
    if d.versao != e.versao:
        raise ErroAplicacao(409, "versao_desatualizada", "O documento foi alterado por outra operação. Recarregue.")
    campos = e.model_fields_set - {"versao"}
    if {"x", "y"} & campos and (e.x is None) != (e.y is None):
        raise ErroAplicacao(422, "coordenadas_incompletas", "Informe X e Y juntos.")
    for c in campos:
        setattr(d, c, getattr(e, c))
    db.flush()
    return _saida(db, d)


@router.post("/documentos/{doc_id}/versoes", response_model=DocumentoSaida, status_code=201)
def nova_versao(doc_id: uuid.UUID, request: Request, arquivo: UploadFile = File(...),
                motivo: str = Form(..., min_length=3), u: Usuario = Depends(ENVIAR), db: Session = Depends(obter_sessao)):
    d = _buscar(db, doc_id)
    nome = (arquivo.filename or "sem_nome").replace("\\", "/").rsplit("/", 1)[-1]
    a = _gravar_arquivo(request, db, arquivo.file, nome, u)
    if d.versoes and d.versoes[-1].arquivo_id == a.id:
        raise ErroAplicacao(409, "versao_igual", "O arquivo é idêntico à versão atual.")
    _nova_versao(request, db, d, a, nome, motivo, u)
    d.atualizado_em = agora()  # avança a versão do documento
    db.flush()
    return _saida(db, d)


@router.post("/documentos/{doc_id}/vinculos", response_model=DocumentoSaida)
def vincular(doc_id: uuid.UUID, e: NovoVinculo, _u: Usuario = Depends(ENVIAR), db: Session = Depends(obter_sessao)):
    d = _buscar(db, doc_id)
    _vincular(db, d, e.unidade_id, e.mapeamento_id)
    return _saida(db, d)


@router.delete("/documentos/vinculos/{vinculo_id}", status_code=204)
def desvincular(vinculo_id: uuid.UUID, _u: Usuario = Depends(ENVIAR), db: Session = Depends(obter_sessao)):
    v = db.get(DocumentoVinculo, vinculo_id)
    if v is None:
        raise ErroAplicacao(404, "nao_encontrado", "Vínculo não encontrado.")
    if v.mapeamento_id and db.get(Mapeamento, v.mapeamento_id).estado != "rascunho":
        raise ErroAplicacao(422, "ficha_bloqueada",
                            "A ficha não está em rascunho: anexos não podem ser retirados (reabra a ficha para isso).")
    db.delete(v)
    db.flush()


@router.post("/documentos/{doc_id}/dividir", response_model=list[DocumentoSaida], status_code=201)
def dividir(doc_id: uuid.UUID, request: Request, u: Usuario = Depends(ENVIAR), db: Session = Depends(obter_sessao)):
    """Cria um documento por página de um PDF (ex.: fichas escaneadas em lote). O PDF original é mantido."""
    d = _buscar(db, doc_id)
    v = d.versoes[-1]
    a = db.get(Arquivo, v.arquivo_id)
    if a.mime != "application/pdf" or (v.paginas or 0) < 2:
        raise ErroAplicacao(422, "nao_divisivel", "Só PDFs com mais de uma página podem ser divididos.")
    if db.scalar(select(Documento.id).where(Documento.origem_id == d.id)):
        raise ErroAplicacao(409, "ja_dividido", "Este PDF já foi dividido em páginas.")
    paginas = midia.separar_paginas(request.app.state.armazenamento.caminho(a.chave))
    base = v.nome_original.rsplit(".", 1)[0]
    criados = []
    for k, conteudo in enumerate(paginas, start=1):
        nome = f"{base}_p{k:02d}.pdf"
        arq = _gravar_arquivo(request, db, io.BytesIO(conteudo), nome, u)
        novo = Documento(mina_id=d.mina_id, categoria=d.categoria, titulo=f"{d.titulo} — pág. {k}",
                         descricao=d.descricao, data_documento=d.data_documento, autor_id=u.id, origem_id=d.id,
                         origem_pagina=k)
        db.add(novo)
        db.flush()
        _nova_versao(request, db, novo, arq, nome, f"Página {k} de {d.titulo}", u)
        for vin in d.vinculos:
            _vincular(db, novo, vin.unidade_id, vin.mapeamento_id)
        criados.append(novo)
    return [_saida(db, x) for x in criados]


@router.get("/documentos/{doc_id}/versoes/{numero}/arquivo")
def baixar(doc_id: uuid.UUID, numero: int, request: Request,
           tipo: Literal["original", "previa", "miniatura"] = "original",
           _u: Usuario = Depends(LER), db: Session = Depends(obter_sessao)):
    d = _buscar(db, doc_id)
    v = next((x for x in d.versoes if x.numero == numero), None)
    if v is None:
        raise ErroAplicacao(404, "nao_encontrado", "Versão não encontrada.")
    a = db.get(Arquivo, v.arquivo_id)
    arm = request.app.state.armazenamento
    original = arm.caminho(a.chave)
    derivados = request.app.state.config.pasta_arquivos / "derivados"
    try:
        if tipo == "miniatura" and a.mime.startswith("image/"):
            return FileResponse(midia.miniatura(original, derivados / f"{a.sha256}-mini.jpg"), media_type="image/jpeg")
        if tipo == "previa" and a.mime == "image/tiff":
            return FileResponse(midia.previa_png(original, derivados / f"{a.sha256}-previa.png"), media_type="image/png")
    except (midia.MidiaInvalida, OSError) as e:
        raise ErroAplicacao(422, "sem_previa", "Não foi possível gerar a prévia deste arquivo.") from e
    if tipo == "miniatura":
        raise ErroAplicacao(404, "sem_miniatura", "Este tipo de arquivo não tem miniatura.")
    disposicao = "inline" if tipo == "previa" else "attachment"
    return FileResponse(original, media_type=a.mime, filename=v.nome_original, content_disposition_type=disposicao)

