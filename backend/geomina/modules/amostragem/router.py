from __future__ import annotations

import uuid
from datetime import date

from fastapi import APIRouter, Depends, File, Request, UploadFile
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import case, func, insert, or_, select
from sqlalchemy.orm import Session

from geomina.core.dependencias import obter_sessao, requer
from geomina.core.erros import ErroAplicacao
from geomina.modules.amostragem import planilha
from geomina.modules.amostragem.models import Amostra, Campanha, Importacao, LoteEnvio, TipoAmostra, lote_envio_amostra
from geomina.modules.arquivos.models import Arquivo
from geomina.modules.auth.models import Usuario
from geomina.modules.dicionarios.models import Dicionario, Termo
from geomina.modules.dicionarios.router import _reconhecer
from geomina.modules.documentos.router import _gravar_arquivo
from geomina.modules.estrutura.models import Mina, UnidadeOperacional
from geomina.modules.estrutura.service import validar_crs
from geomina.modules.mapeamento.models import Mapeamento
from geomina.modules.mapeamento.regras import normalizar_codigo

router = APIRouter(tags=["amostragem"])
LER = requer("amostra:ler")
EDITAR = requer("amostra:editar")
IMPORTAR = requer("amostra:importar")


def serie_de(codigo: str) -> str:
    for s in ("BS-RP", "BMT-TS", "BE"):
        if codigo.startswith(s):
            return s
    raise ErroAplicacao(422, "codigo_amostra", f"Código {codigo} fora das séries BS-RP, BMT-TS e BE.")


# ------------------------------------------------------------------ esquemas
class AmostraEntrada(BaseModel):
    codigo: str = Field(min_length=1, max_length=40)
    papel_controle: str = Field(default="normal", pattern="^(normal|padrao|branco|dup_campo|dup_preparacao|dup_pulpa)$")
    amostra_original_codigo: str | None = None
    padrao_codigo: str | None = Field(default=None, max_length=40)
    tipo_id: uuid.UUID | None = None
    metodo: str | None = Field(default=None, max_length=60)
    campanha_id: uuid.UUID | None = None
    data_coleta: date | None = None
    unidade_id: uuid.UUID | None = None
    local_descricao: str | None = Field(default=None, max_length=200)
    mapeamento_id: uuid.UUID | None = None
    secao_de_m: float | None = Field(default=None, ge=0)
    secao_ate_m: float | None = Field(default=None, gt=0)
    distancia_m: float | None = Field(default=None, ge=0)
    referencia: str | None = Field(default=None, max_length=120)
    x: float | None = None
    y: float | None = None
    z: float | None = None
    srid: int | None = None
    furo: str | None = Field(default=None, max_length=40)
    prof_de_m: float | None = Field(default=None, ge=0)
    prof_ate_m: float | None = Field(default=None, gt=0)
    litologia_id: uuid.UUID | None = None
    alteracao_id: uuid.UUID | None = None
    mineralizacao_id: uuid.UUID | None = None
    destino_id: uuid.UUID | None = None
    massa_kg: float | None = Field(default=None, gt=0)
    descricao: str | None = None
    observacoes: str | None = None


class AmostraAlteracao(AmostraEntrada):
    versao: int


class AmostraSaida(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    mina_id: uuid.UUID
    codigo: str
    serie: str
    papel_controle: str
    amostra_original_id: uuid.UUID | None
    amostra_original_codigo: str | None = None
    padrao_codigo: str | None
    tipo_id: uuid.UUID | None
    metodo: str | None
    campanha_id: uuid.UUID | None
    data_coleta: date | None
    geologo_id: uuid.UUID | None
    responsavel: str | None = None
    unidade_id: uuid.UUID | None
    unidade: str | None = None
    local_descricao: str | None
    mapeamento_id: uuid.UUID | None
    ficha: str | None = None
    ponto_campo: str | None
    secao_de_m: float | None
    secao_ate_m: float | None
    distancia_m: float | None
    referencia: str | None
    x: float | None
    y: float | None
    z: float | None
    srid: int | None
    furo: str | None
    prof_de_m: float | None
    prof_ate_m: float | None
    litologia_id: uuid.UUID | None
    litologia: str | None = None
    alteracao_id: uuid.UUID | None
    mineralizacao_id: uuid.UUID | None
    destino_id: uuid.UUID | None
    massa_kg: float | None
    descricao: str | None
    observacoes: str | None
    estado: str
    lotes: list[str] = []
    importacao_id: uuid.UUID | None
    linha_origem: int | None
    versao: int


class LoteEntrada(BaseModel):
    codigo: str = Field(min_length=1, max_length=30)
    laboratorio: str = Field(min_length=2, max_length=120)
    observacao: str | None = None
    amostras: list[str] = Field(default=[], description="códigos")


class LoteSaida(BaseModel):
    id: uuid.UUID
    codigo: str
    laboratorio: str
    data_envio: date | None
    estado: str
    observacao: str | None
    amostras: list[str]
    versao: int


class Envio(BaseModel):
    data_envio: date


class Codigos(BaseModel):
    codigos: list[str]


class Confirmacao(BaseModel):
    srid: int | None = Field(default=None, description="sistema das coordenadas da planilha; vazio = não importar XYZ")
    aceitar_sugestoes: bool = False
    repetidos: str = Field(default="primeira", pattern="^(primeira|ignorar)$")
    litologias: dict[str, uuid.UUID | None] = {}
    campanha_id: uuid.UUID | None = None


class CampanhaEntrada(BaseModel):
    codigo: str = Field(min_length=1, max_length=30)
    nome: str = Field(min_length=2, max_length=120)
    inicio: date | None = None
    fim: date | None = None
    objetivo: str | None = None


# ------------------------------------------------------------------ utilidades
def _saida(db: Session, a: Amostra) -> AmostraSaida:
    o = AmostraSaida.model_validate(a)
    if a.amostra_original_id:
        o.amostra_original_codigo = db.scalar(select(Amostra.codigo).where(Amostra.id == a.amostra_original_id))
    if a.unidade_id:
        o.unidade = db.scalar(select(UnidadeOperacional.codigo).where(UnidadeOperacional.id == a.unidade_id))
    if a.mapeamento_id:
        o.ficha = db.scalar(select(Mapeamento.numero).where(Mapeamento.id == a.mapeamento_id))
    if a.litologia_id:
        o.litologia = db.scalar(select(Termo.nome).where(Termo.id == a.litologia_id))
    o.responsavel = db.scalar(select(Usuario.nome).where(Usuario.id == a.geologo_id)) if a.geologo_id else a.responsavel_nome
    o.lotes = list(db.scalars(select(LoteEnvio.codigo).join(lote_envio_amostra, lote_envio_amostra.c.lote_id == LoteEnvio.id)
                              .where(lote_envio_amostra.c.amostra_id == a.id)))
    return o


def _buscar(db: Session, amostra_id: uuid.UUID) -> Amostra:
    a = db.get(Amostra, amostra_id)
    if a is None:
        raise ErroAplicacao(404, "nao_encontrado", "Amostra não encontrada.")
    return a


def _canonico(texto: str) -> str:
    c = normalizar_codigo(texto)
    if c.codigo is None:
        raise ErroAplicacao(422, "codigo_amostra", c.aviso, {"sugestao": c.sugestao})
    return c.codigo


def _aplicar(db: Session, a: Amostra, e: AmostraEntrada) -> None:
    dados = e.model_dump(exclude={"codigo", "amostra_original_codigo", "versao"})
    for k, v in dados.items():
        setattr(a, k, v)
    a.codigo = _canonico(e.codigo)
    a.serie = serie_de(a.codigo)
    if e.amostra_original_codigo:
        orig = db.scalar(select(Amostra).where(Amostra.mina_id == a.mina_id, Amostra.codigo == _canonico(e.amostra_original_codigo)))
        if orig is None:
            raise ErroAplicacao(422, "original_inexistente", f"Amostra original {e.amostra_original_codigo} não cadastrada.")
        a.amostra_original_id = orig.id
    else:
        a.amostra_original_id = None
    if e.x is not None:
        if e.srid is None:
            raise ErroAplicacao(422, "srid_obrigatorio", "Informe o sistema de coordenadas das coordenadas da amostra.")
        validar_crs(e.srid)


def _lote_saida(db: Session, lote: LoteEnvio) -> LoteSaida:
    codigos = list(db.scalars(select(Amostra.codigo).join(lote_envio_amostra, lote_envio_amostra.c.amostra_id == Amostra.id)
                              .where(lote_envio_amostra.c.lote_id == lote.id).order_by(Amostra.codigo)))
    return LoteSaida(id=lote.id, codigo=lote.codigo, laboratorio=lote.laboratorio, data_envio=lote.data_envio,
                     estado=lote.estado, observacao=lote.observacao, amostras=codigos, versao=lote.versao)


def _por_codigos(db: Session, mina_id: uuid.UUID, codigos: list[str]) -> list[Amostra]:
    canon = [_canonico(c) for c in codigos]
    achadas = {a.codigo.upper(): a for a in db.scalars(select(Amostra).where(Amostra.mina_id == mina_id, Amostra.codigo.in_(canon)))}
    faltam = [c for c in canon if c.upper() not in achadas]
    if faltam:
        raise ErroAplicacao(422, "amostras_inexistentes", f"Amostras não cadastradas: {', '.join(faltam)}.", faltam)
    return [achadas[c.upper()] for c in canon]


# ------------------------------------------------------------------ cadastro
@router.get("/tipos-amostra")
def tipos(_u: Usuario = Depends(LER), db: Session = Depends(obter_sessao)) -> list[dict]:
    return [{"id": t.id, "codigo": t.codigo, "nome": t.nome, "geometria": t.geometria}
            for t in db.scalars(select(TipoAmostra).where(TipoAmostra.ativo.is_(True)).order_by(TipoAmostra.nome))]


@router.get("/minas/{mina_id}/campanhas")
def campanhas(mina_id: uuid.UUID, _u: Usuario = Depends(LER), db: Session = Depends(obter_sessao)) -> list[dict]:
    return [{"id": c.id, "codigo": c.codigo, "nome": c.nome, "inicio": c.inicio, "fim": c.fim}
            for c in db.scalars(select(Campanha).where(Campanha.mina_id == mina_id).order_by(Campanha.codigo))]


@router.post("/minas/{mina_id}/campanhas", status_code=201)
def criar_campanha(mina_id: uuid.UUID, e: CampanhaEntrada, _u: Usuario = Depends(EDITAR), db: Session = Depends(obter_sessao)):
    c = Campanha(mina_id=mina_id, **e.model_dump())
    db.add(c)
    db.flush()
    return {"id": c.id, "codigo": c.codigo, "nome": c.nome}


@router.post("/minas/{mina_id}/amostras", response_model=AmostraSaida, status_code=201)
def criar(mina_id: uuid.UUID, e: AmostraEntrada, u: Usuario = Depends(EDITAR), db: Session = Depends(obter_sessao)):
    if db.get(Mina, mina_id) is None:
        raise ErroAplicacao(404, "nao_encontrado", "Mina não encontrada.")
    codigo = _canonico(e.codigo)
    if db.scalar(select(Amostra.id).where(Amostra.mina_id == mina_id, Amostra.codigo == codigo)):
        raise ErroAplicacao(409, "duplicado", f"A amostra {codigo} já está cadastrada.")
    a = Amostra(mina_id=mina_id, geologo_id=u.id)
    _aplicar(db, a, e)
    db.add(a)
    db.flush()
    return _saida(db, a)


@router.get("/minas/{mina_id}/amostras", response_model=list[AmostraSaida])
def listar(mina_id: uuid.UUID, serie: str | None = None, estado: str | None = None, papel: str | None = None,
           unidade_id: uuid.UUID | None = None, mapeamento_id: uuid.UUID | None = None, campanha_id: uuid.UUID | None = None,
           litologia_id: uuid.UUID | None = None, de: date | None = None, ate: date | None = None,
           texto: str | None = None, limite: int = 2000, _u: Usuario = Depends(LER), db: Session = Depends(obter_sessao)):
    q = select(Amostra).where(Amostra.mina_id == mina_id)
    if serie:
        q = q.where(Amostra.serie == serie)
    if estado:
        q = q.where(Amostra.estado == estado)
    if papel:
        q = q.where(Amostra.papel_controle == papel)
    if unidade_id:
        base = db.get(UnidadeOperacional, unidade_id)
        q = q.where(Amostra.unidade_id.in_(select(UnidadeOperacional.id).where(UnidadeOperacional.caminho.like(base.caminho + "%"))))
    if mapeamento_id:
        q = q.where(Amostra.mapeamento_id == mapeamento_id)
    if campanha_id:
        q = q.where(Amostra.campanha_id == campanha_id)
    if litologia_id:
        q = q.where(Amostra.litologia_id == litologia_id)
    if de:
        q = q.where(Amostra.data_coleta >= de)
    if ate:
        q = q.where(Amostra.data_coleta <= ate)
    if texto:
        p = f"%{texto.replace(' ', '%')}%"
        q = q.where(or_(Amostra.codigo.ilike(p), Amostra.descricao.ilike(p), Amostra.local_descricao.ilike(p),
                        Amostra.ponto_campo.ilike(p)))
    return [_saida(db, a) for a in db.scalars(q.order_by(Amostra.codigo).limit(min(limite, 5000)))]


@router.get("/minas/{mina_id}/amostras/proximo-codigo")
def proximo_codigo(mina_id: uuid.UUID, serie: str = "BS-RP", _u: Usuario = Depends(LER), db: Session = Depends(obter_sessao)):
    if serie not in ("BS-RP", "BMT-TS"):
        raise ErroAplicacao(422, "serie", "Séries com numeração: BS-RP e BMT-TS.")
    maior = 0
    for c in db.scalars(select(Amostra.codigo).where(Amostra.mina_id == mina_id, Amostra.serie == serie)):
        n = normalizar_codigo(c)
        digitos = "".join(ch for ch in (n.codigo or "")[len(serie) + 1:] if ch.isdigit())
        maior = max(maior, int(digitos or 0))
    return {"serie": serie, "codigo": f"{serie}-{maior + 1}"}


@router.get("/amostras/{amostra_id}", response_model=AmostraSaida)
def obter(amostra_id: uuid.UUID, _u: Usuario = Depends(LER), db: Session = Depends(obter_sessao)):
    return _saida(db, _buscar(db, amostra_id))


@router.put("/amostras/{amostra_id}", response_model=AmostraSaida)
def alterar(amostra_id: uuid.UUID, e: AmostraAlteracao, _u: Usuario = Depends(EDITAR), db: Session = Depends(obter_sessao)):
    a = _buscar(db, amostra_id)
    if a.versao != e.versao:
        raise ErroAplicacao(409, "versao_desatualizada", "A amostra foi alterada por outra operação. Recarregue.")
    if a.estado != "coletada" and _canonico(e.codigo) != a.codigo:
        raise ErroAplicacao(422, "codigo_bloqueado", "O código de uma amostra já enviada ao laboratório não pode mudar.")
    _aplicar(db, a, e)
    db.flush()
    return _saida(db, a)


@router.get("/minas/{mina_id}/amostras/sem-local")
def sem_local(mina_id: uuid.UUID, _u: Usuario = Depends(LER), db: Session = Depends(obter_sessao)) -> list[dict]:
    """Amostras ainda não ligadas a uma unidade da mina, agrupadas pelo texto de local que vieram (ex.: da planilha de campo)."""
    q = (select(Amostra.local_descricao, func.count(), func.sum(case((Amostra.x.is_not(None), 1), else_=0)), func.min(Amostra.codigo),
                func.max(Amostra.codigo))
         .where(Amostra.mina_id == mina_id, Amostra.unidade_id.is_(None), Amostra.estado != "cancelada",
                Amostra.serie != "BMT-TS")  # testemunho de sondagem é ligado ao furo, não a uma galeria
         .group_by(Amostra.local_descricao).order_by(func.count().desc()))
    return [{"local": loc, "amostras": n, "com_coordenadas": int(xy or 0), "exemplo": f"{c1} … {c2}" if c1 != c2 else c1}
            for loc, n, xy, c1, c2 in db.execute(q)]


class LigarLocal(BaseModel):
    unidade_id: uuid.UUID
    local: str | None = Field(default=None, description="texto de local exatamente como na amostra; vazio = sem texto de local")
    locais: list[str | None] | None = Field(default=None, description="vários textos de local (variações de escrita do mesmo lugar)")
    codigos: list[str] | None = None


@router.post("/minas/{mina_id}/amostras/ligar-unidade")
def ligar_unidade(mina_id: uuid.UUID, e: LigarLocal, _u: Usuario = Depends(EDITAR), db: Session = Depends(obter_sessao)) -> dict:
    """Liga em lote à unidade escolhida as amostras sem unidade com um dado texto de local (ou uma lista de códigos).

    Cada amostra é alterada pelo ORM (registro no histórico de alterações, versão incrementada)."""
    un = db.get(UnidadeOperacional, e.unidade_id)
    if un is None or un.mina_id != mina_id:
        raise ErroAplicacao(404, "nao_encontrado", "Unidade não encontrada nesta mina.")
    q = select(Amostra).where(Amostra.mina_id == mina_id, Amostra.unidade_id.is_(None), Amostra.estado != "cancelada")
    if e.codigos:
        q = q.where(Amostra.codigo.in_([_canonico(c) for c in e.codigos]))
    elif e.locais is not None:
        textos = [x for x in e.locais if x]
        q = q.where(or_(Amostra.local_descricao.in_(textos), Amostra.local_descricao.is_(None)) if None in e.locais or "" in e.locais
                    else Amostra.local_descricao.in_(textos))
    else:
        q = q.where(Amostra.local_descricao.is_(None) if not e.local else Amostra.local_descricao == e.local)
    n = 0
    for a in db.scalars(q):
        a.unidade_id = un.id
        n += 1
    db.flush()
    return {"ligadas": n, "unidade": un.codigo}


@router.post("/amostras/{amostra_id}/cancelar", response_model=AmostraSaida)
def cancelar(amostra_id: uuid.UUID, _u: Usuario = Depends(EDITAR), db: Session = Depends(obter_sessao)):
    a = _buscar(db, amostra_id)
    a.estado = "cancelada"
    db.flush()
    return _saida(db, a)


# ------------------------------------------------------------------ lotes de envio
@router.get("/minas/{mina_id}/lotes", response_model=list[LoteSaida])
def lotes(mina_id: uuid.UUID, _u: Usuario = Depends(LER), db: Session = Depends(obter_sessao)):
    return [_lote_saida(db, x) for x in db.scalars(select(LoteEnvio).where(LoteEnvio.mina_id == mina_id)
                                                   .order_by(LoteEnvio.criado_em.desc()))]


@router.post("/minas/{mina_id}/lotes", response_model=LoteSaida, status_code=201)
def criar_lote(mina_id: uuid.UUID, e: LoteEntrada, u: Usuario = Depends(EDITAR), db: Session = Depends(obter_sessao)):
    lote = LoteEnvio(mina_id=mina_id, codigo=e.codigo, laboratorio=e.laboratorio, observacao=e.observacao, responsavel_id=u.id)
    db.add(lote)
    db.flush()
    _incluir(db, lote, e.amostras)
    return _lote_saida(db, lote)


def _incluir(db: Session, lote: LoteEnvio, codigos: list[str]) -> None:
    for a in _por_codigos(db, lote.mina_id, codigos):
        if a.estado == "cancelada":
            raise ErroAplicacao(422, "amostra_cancelada", f"A amostra {a.codigo} está cancelada.")
        ja = db.scalar(select(func.count()).select_from(lote_envio_amostra)
                       .where(lote_envio_amostra.c.lote_id == lote.id, lote_envio_amostra.c.amostra_id == a.id))
        if not ja:
            db.execute(insert(lote_envio_amostra).values(lote_id=lote.id, amostra_id=a.id))
    db.flush()


@router.post("/lotes/{lote_id}/amostras", response_model=LoteSaida)
def incluir_no_lote(lote_id: uuid.UUID, e: Codigos, _u: Usuario = Depends(EDITAR), db: Session = Depends(obter_sessao)):
    lote = db.get(LoteEnvio, lote_id)
    if lote is None:
        raise ErroAplicacao(404, "nao_encontrado", "Lote não encontrado.")
    _incluir(db, lote, e.codigos)
    return _lote_saida(db, lote)


@router.post("/lotes/{lote_id}/enviar", response_model=LoteSaida)
def enviar_lote(lote_id: uuid.UUID, e: Envio, _u: Usuario = Depends(EDITAR), db: Session = Depends(obter_sessao)):
    lote = db.get(LoteEnvio, lote_id)
    if lote is None:
        raise ErroAplicacao(404, "nao_encontrado", "Lote não encontrado.")
    saida = _lote_saida(db, lote)
    if lote.estado == "enviado":
        raise ErroAplicacao(422, "ja_enviado", "O lote já foi enviado.")
    if not saida.amostras:
        raise ErroAplicacao(422, "lote_vazio", "Inclua amostras antes de enviar o lote.")
    lote.estado, lote.data_envio = "enviado", e.data_envio
    for a in _por_codigos(db, lote.mina_id, saida.amostras):
        if a.estado == "coletada":
            a.estado = "enviada"
    db.flush()
    return _lote_saida(db, lote)


# ------------------------------------------------------------------ amostras a partir da ficha
@router.post("/mapeamentos/{ficha_id}/gerar-amostras", response_model=list[AmostraSaida], status_code=201)
def gerar_da_ficha(ficha_id: uuid.UUID, u: Usuario = Depends(EDITAR), db: Session = Depends(obter_sessao)):
    """Cadastra as amostras citadas na ficha que ainda não existem, herdando local, data e litologia."""
    m = db.get(Mapeamento, ficha_id)
    if m is None:
        raise ErroAplicacao(404, "nao_encontrado", "Ficha não encontrada.")
    criadas = []
    for c in m.amostras:
        if db.scalar(select(Amostra.id).where(Amostra.mina_id == m.mina_id, Amostra.codigo == c.codigo)):
            continue
        lito = None
        if c.de_m is not None and c.ate_m is not None:
            sobreposicao = [(min(c.ate_m, i.ate_m) - max(c.de_m, i.de_m), i.litologia_id) for i in m.intervalos]
            melhor = max(sobreposicao, default=(0, None))
            lito = melhor[1] if melhor[0] > 0 else None
        a = Amostra(mina_id=m.mina_id, codigo=c.codigo, serie=serie_de(c.codigo), geologo_id=m.geologo_id,
                    unidade_id=m.unidade_id, mapeamento_id=m.id, data_coleta=m.data, secao_de_m=c.de_m,
                    secao_ate_m=c.ate_m, distancia_m=m.distancia_m, referencia=m.referencia, litologia_id=lito,
                    destino_id=c.destino_id, observacoes=c.leitura_campo and f"Leitura de campo: {c.leitura_campo}")
        if m.x is not None:
            a.x, a.y, a.z, a.srid = m.x, m.y, m.z, db.get(Mina, m.mina_id).srid_trabalho
        db.add(a)
        criadas.append(a)
    db.flush()
    return [_saida(db, a) for a in criadas]


# ------------------------------------------------------------------ importação de planilha
def _analisar(db: Session, mina_id: uuid.UUID, caminho, nome: str) -> dict:
    try:
        campos, linhas = planilha.ler_tabela(caminho, nome)
    except planilha.PlanilhaInvalida as e:
        raise ErroAplicacao(422, "planilha_invalida", str(e)) from e
    except Exception as e:  # arquivo corrompido
        raise ErroAplicacao(422, "planilha_invalida", "Não foi possível ler a planilha.") from e
    dic_lito = db.scalar(select(Dicionario).where(Dicionario.codigo == "LITOLOGIA"))
    dic_dest = db.scalar(select(Dicionario).where(Dicionario.codigo == "DESTINO_AMOSTRA"))
    existentes = {c.upper() for c in db.scalars(select(Amostra.codigo).where(Amostra.mina_id == mina_id))}
    vistos: set[str] = set()
    resultado, nao_reconhecidas = [], {}
    ponto = None
    for ln in linhas:
        v = ln.valores
        ponto = v.get("ponto") or ponto
        bruto = v.get("codigo")
        if bruto is None or str(bruto).strip().lower() in ("x", "-", "—"):
            continue
        c = normalizar_codigo(str(bruto))
        msgs = []
        status = "ok"
        codigo = c.codigo
        if c.codigo is None and c.sugestao:
            status, codigo = "sugestao", c.sugestao
            msgs.append(c.aviso)
        elif c.codigo is None:
            status = "erro"
            msgs.append(c.aviso)
        elif c.aviso:
            msgs.append(c.aviso)
        if codigo and codigo.upper() in vistos:
            status = "repetido"
            msgs.append("Código repetido na planilha.")
        elif codigo and codigo.upper() in existentes:
            status = "existente"
            msgs.append("Amostra já cadastrada no GeoMina.")
        if codigo:
            vistos.add(codigo.upper())
        intervalo = planilha.intervalo(v.get("intervalo")) or (
            (planilha.numero(v.get("de")), planilha.numero(v.get("ate"))) if v.get("de") is not None else None)
        if v.get("intervalo") and not intervalo:
            msgs.append(f"Intervalo '{v['intervalo']}' não reconhecido.")
        x, y, z = (planilha.numero(v.get(k)) for k in ("x", "y", "z"))
        if (v.get("x") and x is None) or (v.get("y") and y is None):
            msgs.append("Coordenada ilegível.")
        data = planilha.data_valor(v.get("data"))
        if v.get("data") and data is None:
            msgs.append(f"Data '{v['data']}' não reconhecida.")
        lito_txt = v.get("litologia")
        lito = _reconhecer(db, dic_lito, str(lito_txt)) if lito_txt else None
        if lito_txt and lito is None:
            nao_reconhecidas[str(lito_txt).strip()] = nao_reconhecidas.get(str(lito_txt).strip(), 0) + 1
        destino = _reconhecer(db, dic_dest, str(v["destino"])) if v.get("destino") else None
        resultado.append({
            "linha": ln.numero, "original": str(bruto), "codigo": codigo, "sugestao": c.sugestao, "status": status,
            "mensagens": msgs, "ponto": str(ponto) if ponto is not None else None, "local": v.get("local"),
            "de": intervalo[0] if intervalo else None, "ate": intervalo[1] if intervalo else None,
            "litologia_texto": str(lito_txt).strip() if lito_txt else None,
            "litologia_id": str(lito.id) if lito else None, "litologia": lito.nome if lito else None,
            "descricao": v.get("descricao") or v.get("designacao"), "data": data.isoformat() if data else None,
            "x": x, "y": y, "z": z if x is not None else None, "destino_id": str(destino.id) if destino else None,
            "furo": v.get("furo"), "observacoes": v.get("observacoes"),
        })
    resumo = {s: sum(1 for r in resultado if r["status"] == s) for s in ("ok", "sugestao", "erro", "repetido", "existente")}
    return {"campos": campos, "total": len(resultado), "resumo": resumo, "linhas": resultado,
            "litologias_nao_reconhecidas": nao_reconhecidas, "com_coordenadas": sum(1 for r in resultado if r["x"] is not None)}


@router.post("/minas/{mina_id}/amostras/importacoes", status_code=201)
def analisar(mina_id: uuid.UUID, request: Request, arquivo: UploadFile = File(...), u: Usuario = Depends(IMPORTAR),
             db: Session = Depends(obter_sessao)) -> dict:
    """Fase 1: guarda o arquivo original e devolve a prévia. Nada é gravado em amostras."""
    nome = (arquivo.filename or "planilha").replace("\\", "/").rsplit("/", 1)[-1]
    a = _gravar_arquivo(request, db, arquivo.file, nome, u)
    rel = _analisar(db, mina_id, request.app.state.armazenamento.caminho(a.chave), nome)
    imp = Importacao(mina_id=mina_id, tipo="amostras", arquivo_id=a.id, nome_arquivo=nome, relatorio=rel, importado_por=u.id)
    db.add(imp)
    db.flush()
    return {"id": imp.id, "nome_arquivo": nome, **rel}


@router.post("/importacoes/{imp_id}/confirmar-amostras")
def confirmar(imp_id: uuid.UUID, e: Confirmacao, u: Usuario = Depends(IMPORTAR), db: Session = Depends(obter_sessao)) -> dict:
    """Fase 2: grava as amostras aceitas conforme as decisões do usuário."""
    imp = db.get(Importacao, imp_id)
    if imp is None or imp.tipo != "amostras":
        raise ErroAplicacao(404, "nao_encontrado", "Importação não encontrada.")
    if imp.estado != "analisada":
        raise ErroAplicacao(422, "importacao_encerrada", "Esta importação já foi confirmada ou descartada.")
    if e.srid is not None:
        validar_crs(e.srid)
    existentes = {c.upper() for c in db.scalars(select(Amostra.codigo).where(Amostra.mina_id == imp.mina_id))}
    gravadas, ignoradas = 0, []
    ja: set[str] = set()
    for r in imp.relatorio["linhas"]:
        codigo = r["codigo"]
        motivo = None
        if r["status"] == "erro":
            motivo = "código inválido"
        elif r["status"] == "sugestao" and not e.aceitar_sugestoes:
            motivo = "sugestão de código não aceita"
        elif codigo.upper() in existentes:
            motivo = "já cadastrada"
        elif codigo.upper() in ja:
            motivo = "repetida na planilha"
        elif r["status"] == "repetido" and e.repetidos == "ignorar":
            motivo = "repetida na planilha"
        if motivo:
            ignoradas.append({"linha": r["linha"], "codigo": r["original"], "motivo": motivo})
            continue
        lito = r["litologia_id"] or (e.litologias.get(r["litologia_texto"]) if r["litologia_texto"] else None)
        obs = [r["observacoes"]] if r["observacoes"] else []
        if r["litologia_texto"] and not lito:
            obs.append(f"Litologia na planilha: {r['litologia_texto']}")
        if r["x"] is not None and e.srid is None:
            obs.append(f"Coordenadas na planilha (sistema não declarado, não importadas): {r['x']} {r['y']} {r['z']}")
        if r["status"] == "sugestao":
            obs.append(f"Código original na planilha: {r['original']}")
        a = Amostra(mina_id=imp.mina_id, codigo=codigo, serie=serie_de(codigo), campanha_id=e.campanha_id,
                    data_coleta=date.fromisoformat(r["data"]) if r["data"] else None, local_descricao=r["local"],
                    ponto_campo=r["ponto"], secao_de_m=r["de"], secao_ate_m=r["ate"],
                    litologia_id=uuid.UUID(str(lito)) if lito else None,
                    destino_id=uuid.UUID(r["destino_id"]) if r["destino_id"] else None, descricao=r["descricao"],
                    furo=r["furo"], observacoes="\n".join(obs) or None, importacao_id=imp.id, linha_origem=r["linha"])
        if r["x"] is not None and e.srid is not None:
            a.x, a.y, a.z, a.srid = r["x"], r["y"], r["z"], e.srid
        db.add(a)
        ja.add(codigo.upper())
        gravadas += 1
    imp.estado = "confirmada"
    imp.opcoes = e.model_dump(mode="json")
    imp.relatorio = {**imp.relatorio, "gravadas": gravadas, "ignoradas": ignoradas}
    db.flush()
    return {"gravadas": gravadas, "ignoradas": ignoradas}


@router.delete("/importacoes/{imp_id}", status_code=204)
def descartar(imp_id: uuid.UUID, _u: Usuario = Depends(IMPORTAR), db: Session = Depends(obter_sessao)):
    imp = db.get(Importacao, imp_id)
    if imp is None or imp.estado != "analisada":
        raise ErroAplicacao(422, "importacao_encerrada", "Só importações não confirmadas podem ser descartadas.")
    imp.estado = "descartada"
    db.flush()


@router.get("/minas/{mina_id}/importacoes")
def historico(mina_id: uuid.UUID, _u: Usuario = Depends(LER), db: Session = Depends(obter_sessao)) -> list[dict]:
    return [{"id": i.id, "tipo": i.tipo, "nome_arquivo": i.nome_arquivo, "estado": i.estado, "criado_em": i.criado_em,
             "total": (i.relatorio or {}).get("total"), "gravadas": (i.relatorio or {}).get("gravadas"),
             "arquivo_sha256": db.scalar(select(Arquivo.sha256).where(Arquivo.id == i.arquivo_id))}
            for i in db.scalars(select(Importacao).where(Importacao.mina_id == mina_id).order_by(Importacao.criado_em.desc()))]
