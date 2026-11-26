"""Painel inicial e consulta da auditoria (Etapa 4 — RF-DASH-01 a 03, RF-SEG-03).

Todos os números vêm de consultas ao banco no momento da requisição. Cada bloco só é
retornado se o usuário tiver permissão sobre o módulo correspondente.
"""

from __future__ import annotations

import uuid
from datetime import date, datetime, timedelta

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy import String, and_, cast, func, or_, select, true
from sqlalchemy.orm import Session

from geomina.core.auditoria import Auditoria
from geomina.core.dependencias import obter_sessao, requer, usuario_atual
from geomina.db import agora
from geomina.modules.amostragem.models import Amostra
from geomina.modules.arquivos.models import Arquivo
from geomina.modules.auth.models import Usuario
from geomina.modules.estrutura.models import FrenteAvanco, Mina, TipoUnidade, UnidadeOperacional
from geomina.modules.geoquimica.models import Resultado
from geomina.modules.mapeamento.models import Mapeamento

router = APIRouter(tags=["painel e auditoria"])

# Tabelas cujas alterações aparecem em "Atividades recentes" para qualquer usuário.
TABELAS_PUBLICAS = ("mina", "unidade_operacional", "frente_avanco", "unidade_nivel", "arquivo", "mapeamento", "amostra",
                    "lote_envio", "documento", "certificado")
NOMES_TABELAS = {
    "mina": "Mina", "unidade_operacional": "Unidade", "frente_avanco": "Avanço de frente",
    "unidade_nivel": "Vínculo de nível", "arquivo": "Arquivo", "usuario": "Usuário", "tipo_unidade": "Tipo de unidade",
    "regra_hierarquia": "Regra de hierarquia", "sistema": "Sistema", "mapeamento": "Ficha de mapeamento",
    "mapeamento_intervalo": "Intervalo de ficha", "medida_estrutural": "Medida estrutural",
    "mapeamento_amostra": "Amostra de ficha", "amostra": "Amostra", "lote_envio": "Lote de envio", "importacao": "Importação", "certificado": "Certificado de laboratório",
    "documento": "Documento", "documento_versao": "Versão de documento", "documento_vinculo": "Vínculo de documento",
    "termo": "Termo de dicionário", "termo_sinonimo": "Sinônimo",
}
OPERACOES = {"I": "inclusão", "U": "alteração", "D": "exclusão", "B": "backup", "R": "restauração"}


class Contagem(BaseModel):
    codigo: str
    nome: str
    cor: str | None
    ativas: int
    inativas: int


class UltimoAvanco(BaseModel):
    frente_id: uuid.UUID
    frente: str
    data: date
    distancia_m: float | None
    referencia: str | None
    avanco_m: float | None
    responsavel: str | None


class Atividade(BaseModel):
    id: int
    ocorrido_em: datetime
    tabela: str
    tabela_nome: str
    operacao: str
    operacao_nome: str
    resumo: str
    usuario: str | None


class Painel(BaseModel):
    gerado_em: datetime
    mina: str | None
    unidades_por_tipo: list[Contagem] | None
    frentes: dict[str, int] | None
    avancos_30_dias: dict[str, float] | None
    ultimos_avancos: list[UltimoAvanco] | None
    atividades: list[Atividade]
    arquivos: dict[str, int] | None
    usuarios_ativos: int | None
    fichas: dict[str, int] | None = None
    amostras: dict[str, int] | None = None


def _resumo(a: Auditoria) -> str:
    d = a.depois or a.antes or {}
    if a.tabela == "sistema":
        if a.operacao == "B":
            return f"Backup {d.get('arquivo', '')}"
        return f"Restauração de {d.get('restaurado', '')}"
    for chave in ("numero", "codigo", "login", "nome_original", "titulo", "nome_arquivo", "nome"):
        if d.get(chave):
            return str(d[chave])
    if a.tabela == "frente_avanco":
        partes = []
        if d.get("data"):
            ano, mes, dia = str(d["data"]).split("-")
            partes.append(f"{dia}/{mes}/{ano}")
        if d.get("avanco_m") is not None:
            partes.append(f"+{d['avanco_m']:g} m".replace(".", ","))
        return " · ".join(partes)
    return ""


def _atividade(a: Auditoria, nome: str | None) -> Atividade:
    return Atividade(id=a.id, ocorrido_em=a.ocorrido_em, tabela=a.tabela,
                     tabela_nome=NOMES_TABELAS.get(a.tabela, a.tabela),
                     operacao=a.operacao, operacao_nome=OPERACOES.get(a.operacao, a.operacao), resumo=_resumo(a),
                     usuario=nome)


@router.get("/painel", response_model=Painel)
def painel(u: Usuario = Depends(usuario_atual), db: Session = Depends(obter_sessao)):
    perms = u.permissoes()
    p = Painel(gerado_em=agora(), mina=None, unidades_por_tipo=None, frentes=None, avancos_30_dias=None,
               ultimos_avancos=None, atividades=[], arquivos=None, usuarios_ativos=None)

    if "estrutura:ler" in perms:
        mina = db.scalar(select(Mina).order_by(Mina.criado_em))
        p.mina = f"{mina.codigo} — {mina.nome}" if mina else None
        linhas = db.execute(
            select(TipoUnidade.codigo, TipoUnidade.nome, TipoUnidade.cor,
                   func.count(UnidadeOperacional.id).filter(UnidadeOperacional.ativo.is_(True)),
                   func.count(UnidadeOperacional.id).filter(UnidadeOperacional.ativo.is_(False)))
            .outerjoin(UnidadeOperacional, UnidadeOperacional.tipo_id == TipoUnidade.id)
            .group_by(TipoUnidade.id).order_by(TipoUnidade.ordem))
        p.unidades_por_tipo = [Contagem(codigo=c, nome=n, cor=cor, ativas=a, inativas=i) for c, n, cor, a, i in linhas
                               if a or i]
        frentes = db.execute(
            select(UnidadeOperacional.status, func.count()).join(TipoUnidade)
            .where(TipoUnidade.e_frente.is_(True), UnidadeOperacional.ativo.is_(True))
            .group_by(UnidadeOperacional.status)).all()
        p.frentes = {s: n for s, n in frentes}
        desde = date.today() - timedelta(days=30)
        qtd, total = db.execute(select(func.count(), func.coalesce(func.sum(FrenteAvanco.avanco_m), 0.0))
                                .where(FrenteAvanco.data >= desde)).one()
        p.avancos_30_dias = {"registros": qtd, "metros": round(float(total), 2)}
        ult = db.execute(
            select(FrenteAvanco, UnidadeOperacional.codigo, Usuario.nome)
            .join(UnidadeOperacional, UnidadeOperacional.id == FrenteAvanco.frente_id)
            .outerjoin(Usuario, Usuario.id == FrenteAvanco.responsavel_id)
            .order_by(FrenteAvanco.data.desc(), FrenteAvanco.criado_em.desc()).limit(8))
        p.ultimos_avancos = [UltimoAvanco(frente_id=a.frente_id, frente=cod, data=a.data, distancia_m=a.distancia_m,
                                          referencia=a.referencia, avanco_m=a.avanco_m, responsavel=nome)
                             for a, cod, nome in ult]

    if "mapeamento:ler" in perms:
        p.fichas = {e: n for e, n in db.execute(select(Mapeamento.estado, func.count()).group_by(Mapeamento.estado))}

    if "amostra:ler" in perms:
        p.amostras = {e: n for e, n in db.execute(select(Amostra.estado, func.count()).group_by(Amostra.estado))}
        com_resultado = select(Resultado.amostra_id).where(Resultado.amostra_id.is_not(None))
        p.amostras["aguardando_resultado"] = db.scalar(select(func.count()).select_from(Amostra).where(
            Amostra.estado == "enviada", Amostra.id.not_in(com_resultado))) or 0
        p.amostras["com_resultado"] = db.scalar(select(func.count(func.distinct(Resultado.amostra_id)))) or 0

    if "arquivo:ler" in perms:
        n, tam = db.execute(select(func.count(), func.coalesce(func.sum(Arquivo.tamanho), 0))).one()
        p.arquivos = {"quantidade": n, "bytes": int(tam)}
    if "usuario:gerenciar" in perms:
        p.usuarios_ativos = db.scalar(select(func.count()).select_from(Usuario).where(Usuario.ativo.is_(True)))

    q = select(Auditoria, Usuario.nome).outerjoin(Usuario, Usuario.id == Auditoria.usuario_id)
    if "auditoria:ler" not in perms:
        q = q.where(Auditoria.tabela.in_(TABELAS_PUBLICAS))
    p.atividades = [_atividade(a, nome) for a, nome in db.execute(q.order_by(Auditoria.id.desc()).limit(12))]
    return p


class PaginaAuditoria(BaseModel):
    total: int
    itens: list[dict]


@router.get("/auditoria", response_model=PaginaAuditoria)
def consultar_auditoria(
    tabela: str | None = None,
    operacao: str | None = Query(default=None, pattern="^[IUDBR]$"),
    usuario_id: uuid.UUID | None = None,
    de: date | None = None,
    ate: date | None = None,
    texto: str | None = Query(default=None, max_length=100),
    pagina: int = Query(default=1, ge=1),
    tamanho: int = Query(default=50, ge=1, le=200),
    _u: Usuario = Depends(requer("auditoria:ler")),
    db: Session = Depends(obter_sessao),
):
    filtros = []
    if tabela:
        filtros.append(Auditoria.tabela == tabela)
    if operacao:
        filtros.append(Auditoria.operacao == operacao)
    if usuario_id:
        filtros.append(Auditoria.usuario_id == usuario_id)
    if de:
        # datas informadas no horário local do computador; o banco guarda UTC
        filtros.append(Auditoria.ocorrido_em >= datetime(de.year, de.month, de.day).astimezone())
    if ate:
        fim = ate + timedelta(days=1)
        filtros.append(Auditoria.ocorrido_em < datetime(fim.year, fim.month, fim.day).astimezone())
    if texto:
        padrao = f"%{texto}%"
        filtros.append(or_(cast(Auditoria.depois, String).like(padrao), cast(Auditoria.antes, String).like(padrao),
                           Auditoria.registro_id.like(padrao)))
    cond = and_(*filtros) if filtros else true()
    total = db.scalar(select(func.count()).select_from(Auditoria).where(cond)) or 0
    linhas = db.execute(select(Auditoria, Usuario.nome).outerjoin(Usuario, Usuario.id == Auditoria.usuario_id)
                        .where(cond).order_by(Auditoria.id.desc()).offset((pagina - 1) * tamanho).limit(tamanho))
    itens = []
    for a, nome in linhas:
        item = _atividade(a, nome).model_dump()
        item.update(registro_id=a.registro_id, origem=a.origem, antes=a.antes, depois=a.depois)
        itens.append(item)
    return PaginaAuditoria(total=total, itens=itens)


@router.get("/auditoria/tabelas")
def tabelas_auditadas(_u: Usuario = Depends(requer("auditoria:ler")), db: Session = Depends(obter_sessao)):
    usadas = db.scalars(select(Auditoria.tabela).distinct()).all()
    return [{"valor": t, "rotulo": NOMES_TABELAS.get(t, t)} for t in sorted(usadas)]
