"""Perfil da frente de uma amostra: trechos da seção (metro a metro, com a litologia) e os teores do laudo de cada trecho.

A frente é o ponto de amostragem (``ponto_campo``): todas as amostras do mesmo ponto aparecem juntas. Os trechos vêm,
nesta ordem, do perfil gravado (planilha de campo ou edição na tela), da ficha de mapeamento ligada à amostra ou,
na falta dos dois, do intervalo de seção de cada amostra.
"""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from geomina.core.dependencias import obter_sessao, requer
from geomina.core.erros import ErroAplicacao
from geomina.modules.amostragem.models import Amostra, FrenteIntervalo
from geomina.modules.auth.models import Usuario
from geomina.modules.dicionarios.models import Termo
from geomina.modules.estrutura.models import UnidadeOperacional
from geomina.modules.geoquimica.models import Analito, Certificado, Resultado
from geomina.modules.mapeamento.models import Intervalo, Mapeamento
from geomina.modules.mapeamento.regras import normalizar_codigo

router = APIRouter(tags=["amostragem"])
LER = requer("amostra:ler")
EDITAR = requer("amostra:editar")


class TrechoEntrada(BaseModel):
    de_m: float = Field(ge=0)
    ate_m: float = Field(gt=0)
    litologia_id: uuid.UUID | None = None
    descricao: str | None = None
    amostra_codigo: str | None = Field(default=None, description="amostra que cobre o trecho (vazio = trecho não amostrado)")


class PerfilEntrada(BaseModel):
    intervalos: list[TrechoEntrada]


def _termo(db: Session, termo_id: uuid.UUID | None, cache: dict) -> dict | None:
    if termo_id is None:
        return None
    if termo_id not in cache:
        t = db.get(Termo, termo_id)
        cache[termo_id] = {"id": str(t.id), "nome": t.nome, "cor": t.cor, "sigla": t.sigla} if t else None
    return cache[termo_id]


def _amostra(db: Session, amostra_id: uuid.UUID) -> Amostra:
    a = db.get(Amostra, amostra_id)
    if a is None:
        raise ErroAplicacao(404, "nao_encontrado", "Amostra não encontrada.")
    return a


def _da_frente(db: Session, a: Amostra) -> list[Amostra]:
    """Amostras da mesma frente (mesmo ponto; sem ponto, a mesma ficha; sem os dois, só a própria amostra)."""
    q = select(Amostra).where(Amostra.mina_id == a.mina_id, Amostra.estado != "cancelada")
    if a.ponto_campo:
        q = q.where(Amostra.ponto_campo == a.ponto_campo)
    elif a.mapeamento_id:
        q = q.where(Amostra.mapeamento_id == a.mapeamento_id)
    else:
        return [a]
    lista = [x for x in db.scalars(q) if x.papel_controle == "normal" or x.id == a.id]
    if a not in lista:
        lista.append(a)
    return sorted(lista, key=lambda x: (x.secao_de_m if x.secao_de_m is not None else 1e9, x.codigo))


def _cobre(amostras: list[Amostra], de: float, ate: float) -> Amostra | None:
    meio = (de + ate) / 2
    for x in amostras:
        if x.secao_de_m is not None and x.secao_ate_m is not None and x.secao_de_m <= meio <= x.secao_ate_m:
            return x
    return None


@router.get("/amostras/{amostra_id}/perfil-frente")
def perfil_frente(amostra_id: uuid.UUID, _u: Usuario = Depends(LER), db: Session = Depends(obter_sessao)) -> dict:
    a = _amostra(db, amostra_id)
    amostras = _da_frente(db, a)
    por_id = {x.id: x for x in amostras}
    termos: dict = {}
    trechos: list[dict] = []
    origem = None
    if a.ponto_campo:
        for t in db.scalars(select(FrenteIntervalo).where(FrenteIntervalo.mina_id == a.mina_id, FrenteIntervalo.ponto == a.ponto_campo)
                            .order_by(FrenteIntervalo.de_m, FrenteIntervalo.ate_m)):
            dono = por_id.get(t.amostra_id) if t.amostra_id else None
            if t.amostra_id and dono is None:  # amostra de controle ou de outro ponto citada no perfil
                dono = db.get(Amostra, t.amostra_id)
                if dono is not None:
                    amostras.append(dono)
                    por_id[dono.id] = dono
            trechos.append({"de": t.de_m, "ate": t.ate_m, "litologia": _termo(db, t.litologia_id, termos), "litologia_texto": t.litologia_texto,
                            "descricao": t.descricao, "amostra_id": dono.id if dono else None})
        origem = "perfil" if trechos else None
    ficha = db.get(Mapeamento, a.mapeamento_id) if a.mapeamento_id else None
    if not trechos and ficha is not None:
        for i in db.scalars(select(Intervalo).where(Intervalo.mapeamento_id == ficha.id).order_by(Intervalo.de_m)):
            trechos.append({"de": i.de_m, "ate": i.ate_m, "litologia": _termo(db, i.litologia_id, termos), "litologia_texto": None,
                            "descricao": i.descricao, "amostra_id": None})
        origem = "ficha" if trechos else None
    if not trechos:
        for x in amostras:
            if x.secao_de_m is not None and x.secao_ate_m is not None:
                trechos.append({"de": x.secao_de_m, "ate": x.secao_ate_m, "litologia": _termo(db, x.litologia_id, termos),
                                "litologia_texto": None, "descricao": x.descricao, "amostra_id": x.id})
        origem = "amostras" if trechos else "sem_trechos"
        trechos.sort(key=lambda t: (t["de"], t["ate"]))
    for t in trechos:
        if t["amostra_id"] is None:
            dono = _cobre(amostras, t["de"], t["ate"])
            t["amostra_id"] = dono.id if dono else None
        dono = por_id.get(t["amostra_id"]) if t["amostra_id"] else None
        t["espessura"] = round(t["ate"] - t["de"], 3)
        t["amostra"] = dono.codigo if dono else None
        t["amostra_id"] = str(dono.id) if dono else None

    # teores: resultado preferido de cada analito (linha SMP do laudo)
    analitos: dict[str, dict] = {}
    valores: dict[uuid.UUID, dict] = {}
    certificados: dict[uuid.UUID, set] = {}
    ids = [x.id for x in amostras]
    if ids:
        q = (select(Resultado, Analito, Certificado.codigo).join(Analito, Analito.id == Resultado.analito_id)
             .join(Certificado, Certificado.id == Resultado.certificado_id)
             .where(Resultado.amostra_id.in_(ids), Resultado.preferido.is_(True)))
        for r, an, cert in db.execute(q):
            chave = f"{an.codigo} ({r.unidade})"
            analitos.setdefault(chave, {"chave": chave, "codigo": an.codigo, "unidade": r.unidade, "ordem": (an.tipo, an.ordem, an.codigo)})
            valores.setdefault(r.amostra_id, {})[chave] = {"texto": r.valor_texto if r.qualificador != "=" else f"{r.valor_num:g}",
                                                           "valor": r.valor_num, "qualificador": r.qualificador}
            certificados.setdefault(r.amostra_id, set()).add(cert)
    colunas = [{k: v for k, v in x.items() if k != "ordem"} for x in sorted(analitos.values(), key=lambda x: x["ordem"])]

    unidade = db.get(UnidadeOperacional, a.unidade_id) if a.unidade_id else None
    return {
        "amostra": {"id": str(a.id), "codigo": a.codigo},
        "frente": {"ponto": a.ponto_campo, "local": f"{unidade.codigo} — {unidade.nome}" if unidade else a.local_descricao,
                   "data": a.data_coleta, "ficha": ficha.numero if ficha else None, "origem": origem},
        "intervalos": trechos,
        "amostras": [{"id": str(x.id), "codigo": x.codigo, "de": x.secao_de_m, "ate": x.secao_ate_m,
                      "litologia": _termo(db, x.litologia_id, termos), "estado": x.estado, "papel_controle": x.papel_controle,
                      "valores": valores.get(x.id, {}), "certificados": sorted(certificados.get(x.id, set()))} for x in amostras],
        "analitos": colunas,
        "comprimento": max((t["ate"] for t in trechos), default=0),
    }


@router.put("/amostras/{amostra_id}/perfil-frente")
def gravar_perfil(amostra_id: uuid.UUID, e: PerfilEntrada, u: Usuario = Depends(EDITAR), db: Session = Depends(obter_sessao)) -> dict:
    """Substitui os trechos da frente da amostra. Sem ponto de campo, o código da amostra passa a ser o ponto."""
    a = _amostra(db, amostra_id)
    trechos = sorted(e.intervalos, key=lambda t: (t.de_m, t.ate_m))
    for t in trechos:
        if t.ate_m <= t.de_m:
            raise ErroAplicacao(422, "intervalo_invalido", f"Trecho {t.de_m:g}–{t.ate_m:g} m: o 'até' precisa ser maior que o 'de'.")
    for t1, t2 in zip(trechos, trechos[1:], strict=False):
        if t2.de_m < t1.ate_m - 1e-9:
            raise ErroAplicacao(422, "sobreposicao", f"Os trechos {t1.de_m:g}–{t1.ate_m:g} m e {t2.de_m:g}–{t2.ate_m:g} m se sobrepõem.")
    donos: dict[str, Amostra] = {}
    for t in trechos:
        if t.amostra_codigo and t.amostra_codigo.strip():
            c = normalizar_codigo(t.amostra_codigo)
            cod = c.codigo or c.sugestao
            x = db.scalar(select(Amostra).where(Amostra.mina_id == a.mina_id, Amostra.codigo == cod)) if cod else None
            if x is None:
                raise ErroAplicacao(422, "amostra_inexistente", f"Amostra {t.amostra_codigo} não cadastrada.")
            donos[t.amostra_codigo] = x
    if not a.ponto_campo:
        a.ponto_campo = a.codigo
    ponto = a.ponto_campo
    for x in db.scalars(select(FrenteIntervalo).where(FrenteIntervalo.mina_id == a.mina_id, FrenteIntervalo.ponto == ponto)):
        db.delete(x)
    db.flush()
    for t in trechos:
        dono = donos.get(t.amostra_codigo) if t.amostra_codigo else None
        if dono is not None and not dono.ponto_campo:
            dono.ponto_campo = ponto
        db.add(FrenteIntervalo(mina_id=a.mina_id, ponto=ponto, amostra_id=dono.id if dono else None, de_m=t.de_m, ate_m=t.ate_m,
                               litologia_id=t.litologia_id, descricao=t.descricao, criado_por=u.id))
    db.flush()
    return perfil_frente(amostra_id, u, db)
