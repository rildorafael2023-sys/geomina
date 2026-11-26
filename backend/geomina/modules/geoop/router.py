from __future__ import annotations

import csv
import io
import uuid
from datetime import date

from fastapi import APIRouter, Depends, Query, Request
from fastapi.responses import Response
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from geomina.core.dependencias import obter_sessao, requer
from geomina.core.erros import ErroAplicacao
from geomina.modules.amostragem.models import Amostra
from geomina.modules.amostragem.router import serie_de
from geomina.modules.auth.models import Usuario
from geomina.modules.estrutura.models import Mina
from geomina.modules.geoop import servico as S
from geomina.modules.geoquimica.router import vincular_pendentes

router = APIRouter(tags=["geoquímica operacional"])
LER = requer("geoquimica:ler")
EDITAR = requer("amostra:editar")


def _filtros(request: Request) -> dict[str, set[str]]:
    return {f: {v for v in request.query_params.get(f, "").split(",") if v} for f in S.FACETAS}


def _consulta(request: Request, db: Session, mina_id: uuid.UUID, texto, data_de, data_ate, teor_analito, teor_min, teor_max, regra_ld):
    if db.get(Mina, mina_id) is None:
        raise ErroAplicacao(404, "nao_encontrado", "Mina não encontrada.")
    regs = S.registros(db, mina_id)
    teor = (teor_analito, teor_min, teor_max) if teor_analito else None
    return S.filtrar(db, mina_id, regs, _filtros(request), texto, data_de, data_ate, teor, regra_ld)


@router.get("/minas/{mina_id}/geoop/registros")
def listar(mina_id: uuid.UUID, request: Request, analitos: str = "", texto: str | None = None, data_de: date | None = None,
           data_ate: date | None = None, teor_analito: str | None = None, teor_min: float | None = None, teor_max: float | None = None,
           regra_ld: str = "limite", ordem: str = "codigo", pagina: int = Query(1, ge=1), tamanho: int = Query(200, ge=1, le=5000),
           _u: Usuario = Depends(LER), db: Session = Depends(obter_sessao)) -> dict:
    """Amostras analíticas da mina (cadastradas e só no laudo) com filtros encadeados.

    Facetas como parâmetros separados por vírgula: nivel, galeria, trecho, campanha, responsavel, litologia, alteracao,
    mineralizacao, tipo, laboratorio, certificado, status, serie, cadastro. A resposta traz as opções de cada faceta com a
    contagem calculada com os demais filtros (por isso escolher o nível restringe as galerias)."""
    regs, opcoes = _consulta(request, db, mina_id, texto, data_de, data_ate, teor_analito, teor_min, teor_max, regra_ld)
    chave_ordem = {"codigo": lambda r: (r["codigo"] or ""), "data": lambda r: (r["data"] or ""), "local": lambda r: (r["galeria"] or {}).get("codigo") or r["local"] or "~"}
    regs.sort(key=chave_ordem.get(ordem, chave_ordem["codigo"]))
    total = len(regs)
    pag = regs[(pagina - 1) * tamanho: pagina * tamanho]
    lista = [a for a in analitos.split(",") if a]
    vals = S.valores(db, mina_id, pag, lista, regra_ld)
    for r in pag:
        r["valores"] = vals.get(r["chave"], {})
    resumo = {k: sum(1 for r in regs if r["status"] == k) for k in S.STATUS}
    return {"total": total, "pagina": pagina, "tamanho": tamanho, "resumo_status": resumo, "opcoes": opcoes, "itens": pag,
            "status_rotulos": S.STATUS}


@router.get("/minas/{mina_id}/geoop/registros.csv")
def exportar(mina_id: uuid.UUID, request: Request, analitos: str = "", texto: str | None = None, data_de: date | None = None,
             data_ate: date | None = None, teor_analito: str | None = None, teor_min: float | None = None, teor_max: float | None = None,
             regra_ld: str = "limite", _u: Usuario = Depends(LER), db: Session = Depends(obter_sessao)) -> Response:
    regs, _ = _consulta(request, db, mina_id, texto, data_de, data_ate, teor_analito, teor_min, teor_max, regra_ld)
    regs.sort(key=lambda r: r["codigo"] or "")
    lista = [a for a in analitos.split(",") if a]
    vals = S.valores(db, mina_id, regs, lista, regra_ld)
    buf = io.StringIO()
    w = csv.writer(buf, delimiter=";")
    filtros_txt = "; ".join(f"{k}={','.join(sorted(v))}" for k, v in _filtros(request).items() if v)
    w.writerow([f"# GeoMina — amostras e resultados; filtros: {filtros_txt or 'nenhum'}; texto={texto or ''}; abaixo do limite: {regra_ld}"])
    w.writerow(["amostra", "cadastrada", "status", "nivel", "galeria", "trecho", "local", "x", "y", "z", "srid", "data", "campanha",
                "responsavel", "litologia", "alteracao", "mineralizacao", "laboratorio", "certificados"] + lista)
    num = lambda x: "" if x is None else str(x).replace(".", ",")  # noqa: E731
    nome = lambda d, k="nome": (d or {}).get(k) or ""  # noqa: E731
    for r in regs:
        v = vals.get(r["chave"], {})
        w.writerow([r["codigo"], "sim" if r["cadastrada"] else "não", S.STATUS[r["status"]], nome(r["nivel"], "codigo"), nome(r["galeria"], "codigo"),
                    nome(r["trecho"], "codigo"), r["local"] or "", num(r["x"]), num(r["y"]), num(r["z"]), r["srid"] or "", r["data"] or "",
                    nome(r["campanha"], "codigo"), nome(r["responsavel"]), nome(r["litologia"]), nome(r["alteracao"]), nome(r["mineralizacao"]),
                    ", ".join(r["laboratorios"].values()), ", ".join(r["certificados"].values())]
                   + [v.get(a, {}).get("texto", "") for a in lista])
    return Response(("﻿" + buf.getvalue()).encode("utf-8"), media_type="text/csv; charset=utf-8",
                    headers={"Content-Disposition": 'attachment; filename="geoquimica_amostras.csv"'})


@router.get("/minas/{mina_id}/geoop/registros/{chave}")
def registro(mina_id: uuid.UUID, chave: str, _u: Usuario = Depends(LER), db: Session = Depends(obter_sessao)) -> dict:
    """Um registro (cadastrado ou só no laudo) com TODOS os resultados do laudo, inclusive controles do laboratório ligados a ele."""
    regs = S.registros(db, mina_id)
    r = next((x for x in regs if x["chave"] == chave), None)
    if r is None and chave.startswith("laudo:"):  # o código só do laudo foi cadastrado depois (conciliação): segue a amostra
        r = next((x for x in regs if (x["codigo"] or "").upper() == chave[6:].upper()), None)
    if r is None:
        raise ErroAplicacao(404, "nao_encontrado", "Amostra não encontrada.")
    from geomina.modules.geoquimica.models import Analito, Certificado, MetodoAnalitico, Resultado
    q = (select(Resultado, Analito.codigo, Analito.tipo, MetodoAnalitico.codigo, Certificado.codigo).join(Analito).join(MetodoAnalitico)
         .join(Certificado).where(Certificado.mina_id == mina_id).order_by(Analito.tipo, Analito.ordem, Certificado.codigo))
    if r["amostra_id"]:
        q = q.where(Resultado.amostra_id == uuid.UUID(r["amostra_id"]))
    else:
        cod = r["codigo"]
        q = q.where(Resultado.amostra_id.is_(None), (Resultado.codigo_canonico == cod) | (Resultado.codigo_laboratorio == cod))
    r["resultados"] = [{"analito": an, "tipo_analito": ta, "metodo": me, "certificado": ce, "tipo_linha": x.tipo_linha,
                        "valor": x.valor_texto if x.qualificador != "=" else f"{x.valor_num:g}", "unidade": x.unidade,
                        "qualificador": x.qualificador, "preferido": x.preferido} for x, an, ta, me, ce in db.execute(q)]
    return r


# ------------------------------------------------------------------ conciliação
@router.get("/minas/{mina_id}/geoop/conciliacao")
def ver_conciliacao(mina_id: uuid.UUID, _u: Usuario = Depends(LER), db: Session = Depends(obter_sessao)) -> dict:
    return S.conciliacao(db, mina_id)


class Codigos(BaseModel):
    codigos: list[str] = Field(min_length=1)


@router.post("/minas/{mina_id}/geoop/conciliacao/subamostras")
def criar_subamostras(mina_id: uuid.UUID, e: Codigos, u: Usuario = Depends(EDITAR), db: Session = Depends(obter_sessao)) -> dict:
    """Cria as sub-amostras do laudo (ex.: BS-RP-428A) herdando local, coordenadas, unidade, ficha, data e campanha do ponto
    (BS-RP-428). A litologia NÃO é herdada (cada sub-amostra é um intervalo diferente da parede)."""
    propostas = {s["codigo"]: s for s in S.conciliacao(db, mina_id)["subamostras"]}
    criadas = []
    for cod in e.codigos:
        s = propostas.get(cod)
        if s is None:
            raise ErroAplicacao(422, "nao_e_subamostra", f"{cod} não é uma sub-amostra pendente com ponto cadastrado.")
        p = db.get(Amostra, uuid.UUID(s["pai"]["id"]))
        a = Amostra(mina_id=mina_id, codigo=cod, serie=serie_de(cod), unidade_id=p.unidade_id, local_descricao=p.local_descricao,
                    x=p.x, y=p.y, z=p.z, srid=p.srid, data_coleta=p.data_coleta, campanha_id=p.campanha_id, tipo_id=p.tipo_id,
                    metodo=p.metodo, geologo_id=p.geologo_id, responsavel_nome=p.responsavel_nome, mapeamento_id=p.mapeamento_id,
                    ponto_campo=p.ponto_campo, observacoes=f"Sub-amostra do ponto {p.codigo}, criada a partir do laudo ({', '.join(s['certificados'])}) "
                                                           f"por {u.nome}. Litologia e intervalo da parede a informar.")
        db.add(a)
        criadas.append(cod)
    db.flush()
    v = vincular_pendentes(mina_id, u, db)
    return {"criadas": criadas, "resultados_ligados": v["vinculados"]}


@router.post("/minas/{mina_id}/geoop/conciliacao/cadastrar")
def cadastrar_do_laudo(mina_id: uuid.UUID, e: Codigos, u: Usuario = Depends(EDITAR), db: Session = Depends(obter_sessao)) -> dict:
    """Cadastra amostras que só existem no laudo (sem local nem coordenadas, a completar) e liga os resultados."""
    pendentes = {s["codigo"] for s in S.conciliacao(db, mina_id)["nao_cadastradas"]}
    for cod in e.codigos:
        if cod not in pendentes:
            raise ErroAplicacao(422, "nao_pendente", f"{cod} não está entre as amostras só no laudo.")
        db.add(Amostra(mina_id=mina_id, codigo=cod, serie=serie_de(cod), geologo_id=None, estado="enviada",
                       observacoes=f"Cadastrada a partir do laudo por {u.nome}: local, coordenadas e geologia a completar."))
    db.flush()
    v = vincular_pendentes(mina_id, u, db)
    return {"criadas": list(e.codigos), "resultados_ligados": v["vinculados"]}
