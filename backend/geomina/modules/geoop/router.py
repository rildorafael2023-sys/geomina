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
from geomina.modules.geoop.models import LayoutAnalise
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
    if ordem.startswith("valor:"):  # maior teor primeiro; sem valor no fim
        an = ordem[6:]
        todos = S.valores(db, mina_id, regs, [an], regra_ld)
        regs.sort(key=lambda r: (todos.get(r["chave"], {}).get(an, {}).get("y") is None, -(todos.get(r["chave"], {}).get(an, {}).get("y") or 0), r["codigo"] or ""))
    else:
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
    if r["furo_ref"] and r["prof_de_m"] is not None and r["prof_ate_m"] is not None:  # amostra de furo: posição na trajetória
        from geomina.espacial import trajetoria as T
        from geomina.modules.sondagem.models import Furo
        from geomina.modules.sondagem.router import _trajetoria
        from geomina.modules.topografia.router import _transformar_ponto
        f = db.get(Furo, uuid.UUID(r["furo_ref"]["id"]))
        t, _falha = _trajetoria(db, f)
        d, _tid, _motivo = _transformar_ponto(db, db.get(Mina, mina_id), f.srid, [0.0, 0.0, 0.0])
        if t is not None and d is not None:
            p = T.posicao(t, (r["prof_de_m"] + r["prof_ate_m"]) / 2)
            r["xyz_trajetoria"] = {"xyz": [round(float(p[i] + d[i]), 3) for i in range(3)], "estimada": t.estimada,
                                   "srid": db.get(Mina, mina_id).srid_trabalho}
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


# ------------------------------------------------------------------ layouts salvos
class LayoutEntrada(BaseModel):
    nome: str = Field(min_length=1, max_length=120)
    tipo: str = Field(pattern="^(galeria|sondagem|comparacao)$")
    config: dict
    compartilhado: bool = False


def _layout_saida(x: LayoutAnalise, u: Usuario, dono: str | None) -> dict:
    return {"id": x.id, "nome": x.nome, "tipo": x.tipo, "config": x.config, "compartilhado": x.compartilhado,
            "dono": dono, "meu": x.dono_id == u.id, "versao": x.versao}


@router.get("/minas/{mina_id}/layouts")
def listar_layouts(mina_id: uuid.UUID, tipo: str | None = None, u: Usuario = Depends(LER), db: Session = Depends(obter_sessao)) -> list[dict]:
    q = (select(LayoutAnalise, Usuario.nome).join(Usuario, Usuario.id == LayoutAnalise.dono_id)
         .where(LayoutAnalise.mina_id == mina_id, (LayoutAnalise.dono_id == u.id) | LayoutAnalise.compartilhado.is_(True))
         .order_by(LayoutAnalise.nome))
    if tipo:
        q = q.where(LayoutAnalise.tipo == tipo)
    return [_layout_saida(x, u, nome) for x, nome in db.execute(q)]


@router.post("/minas/{mina_id}/layouts", status_code=201)
def salvar_layout(mina_id: uuid.UUID, e: LayoutEntrada, u: Usuario = Depends(LER), db: Session = Depends(obter_sessao)) -> dict:
    """Salva (ou substitui, se o usuário já tiver um com o mesmo nome) a configuração da análise."""
    x = db.scalar(select(LayoutAnalise).where(LayoutAnalise.mina_id == mina_id, LayoutAnalise.dono_id == u.id,
                                              LayoutAnalise.tipo == e.tipo, LayoutAnalise.nome == e.nome))
    if x is None:
        x = LayoutAnalise(mina_id=mina_id, dono_id=u.id, nome=e.nome, tipo=e.tipo, config=e.config, compartilhado=e.compartilhado)
        db.add(x)
    else:
        x.config, x.compartilhado = e.config, e.compartilhado
    db.flush()
    return _layout_saida(x, u, u.nome)


@router.delete("/layouts/{layout_id}", status_code=204)
def excluir_layout(layout_id: uuid.UUID, u: Usuario = Depends(LER), db: Session = Depends(obter_sessao)) -> None:
    x = db.get(LayoutAnalise, layout_id)
    if x is None:
        raise ErroAplicacao(404, "nao_encontrado", "Layout não encontrado.")
    if x.dono_id != u.id:
        raise ErroAplicacao(403, "sem_permissao", "Só quem criou o layout pode excluí-lo.")
    db.delete(x)
    db.flush()


# ------------------------------------------------------------------ comparação (estatística por grupo)
class Grupo(BaseModel):
    nome: str = Field(min_length=1, max_length=80)
    filtros: dict[str, list[str]] = {}
    texto: str | None = None
    data_de: date | None = None
    data_ate: date | None = None


class PedidoComparacao(BaseModel):
    grupos: list[Grupo] = Field(min_length=1, max_length=12)
    analitos: list[str] = Field(min_length=1, max_length=20)
    regra_ld: str = "limite"
    incluir_limite: bool = Field(False, description="incluir nas estatísticas os valores no limite (<LD/>LS) pela regra escolhida")


@router.post("/minas/{mina_id}/geoop/comparacao")
def comparar(mina_id: uuid.UUID, e: PedidoComparacao, _u: Usuario = Depends(LER), db: Session = Depends(obter_sessao)) -> dict:
    """Estatística por grupo e analito, com os valores de cada amostra (para histograma, boxplot e dispersão)."""
    if db.get(Mina, mina_id) is None:
        raise ErroAplicacao(404, "nao_encontrado", "Mina não encontrada.")
    from geomina.modules.geoop import estatistica as E
    regs = S.registros(db, mina_id)
    saida = []
    for g in e.grupos:
        filtros = {f: set(g.filtros.get(f, [])) for f in S.FACETAS}
        sel, _ = S.filtrar(db, mina_id, regs, filtros, g.texto, g.data_de, g.data_ate, None, e.regra_ld)
        vals = S.valores(db, mina_id, sel, e.analitos, e.regra_ld)
        por_an = {}
        for a in e.analitos:
            pontos, n_lim, n_sem = [], 0, 0
            for r in sel:
                v = vals.get(r["chave"], {}).get(a)
                if not v or v["y"] is None:
                    n_sem += 1
                    continue
                if v["situacao"] != "medido":
                    n_lim += 1
                    if not e.incluir_limite:
                        continue
                pontos.append({"chave": r["chave"], "codigo": r["codigo"], "y": v["y"], "texto": v["texto"], "limite": v["situacao"] != "medido"})
            unidade = next((vals[r["chave"]][a]["unidade"] for r in sel if a in vals.get(r["chave"], {})), None)
            por_an[a] = {"unidade": unidade, "estatistica": E.descrever([p["y"] for p in pontos]), "no_limite": n_lim, "sem_valor": n_sem,
                         "pontos": pontos}
        mapa = {a: {p["chave"]: p["y"] for p in por_an[a]["pontos"]} for a in e.analitos}
        chaves = [r["chave"] for r in sel]
        corr = {f"{a}|{b}": E.correlacao([mapa[a].get(k) for k in chaves], [mapa[b].get(k) for k in chaves])
                for i, a in enumerate(e.analitos) for b in e.analitos[i + 1:]}
        saida.append({"nome": g.nome, "filtros": {k: v for k, v in g.filtros.items() if v}, "texto": g.texto,
                      "data_de": g.data_de, "data_ate": g.data_ate, "amostras": len(sel), "analitos": por_an, "correlacao": corr})
    return {"grupos": saida, "regra_ld": e.regra_ld, "incluir_limite": e.incluir_limite,
            "observacao": "Estatísticas só com valores medidos" if not e.incluir_limite else "Valores no limite incluídos pela regra escolhida"}


# ------------------------------------------------------------------ visualização espacial
@router.get("/minas/{mina_id}/geoop/espacial")
def espacial(mina_id: uuid.UUID, request: Request, analitos: str = "", texto: str | None = None, data_de: date | None = None,
             data_ate: date | None = None, teor_analito: str | None = None, teor_min: float | None = None, teor_max: float | None = None,
             regra_ld: str = "limite", _u: Usuario = Depends(LER), db: Session = Depends(obter_sessao)) -> dict:
    return _cena(mina_id, request, db, analitos, texto, data_de, data_ate, teor_analito, teor_min, teor_max, regra_ld)


def _cena(mina_id, request, db, analitos, texto, data_de, data_ate, teor_analito, teor_min, teor_max, regra_ld) -> dict:
    """Amostras da seleção com posição no sistema da mina: frente = ponto (X/Y/Z medidos); furo = segmento de/até sobre a
    trajetória. Conversão de sistema só com transformação aprovada; nada sem posição é inventado (lista à parte)."""
    import numpy as np

    from geomina.espacial import trajetoria as T
    from geomina.modules.sondagem.models import Furo
    from geomina.modules.sondagem.router import _trajetoria
    from geomina.modules.topografia.router import _transformar_ponto
    mina = db.get(Mina, mina_id)
    regs, _ = _consulta(request, db, mina_id, texto, data_de, data_ate, teor_analito, teor_min, teor_max, regra_ld)
    lista = [a for a in analitos.split(",") if a]
    vals = S.valores(db, mina_id, regs, lista, regra_ld)
    desloc_cache: dict = {}

    def desloc(srid: int):
        if srid not in desloc_cache:
            d, _t, motivo = _transformar_ponto(db, mina, srid, [0.0, 0.0, 0.0])
            desloc_cache[srid] = (np.array(d) if d is not None else None, motivo)
        return desloc_cache[srid]
    furos = {f.id: f for f in db.scalars(select(Furo).where(Furo.mina_id == mina_id))}
    trajs = {}
    for fid, f in furos.items():
        t, falha = _trajetoria(db, f)
        d, motivo = desloc(f.srid)
        trajs[fid] = (t, d, falha or motivo)
    ams = {a.id: a for a in db.scalars(select(Amostra).where(Amostra.mina_id == mina_id))}
    pontos, segmentos, sem_pos = [], [], []
    for r in regs:
        base = {"chave": r["chave"], "codigo": r["codigo"], "valores": vals.get(r["chave"], {}), "status": r["status"],
                "litologia": r["litologia"], "galeria": (r["galeria"] or {}).get("codigo")}
        a = ams.get(uuid.UUID(r["amostra_id"])) if r["amostra_id"] else None
        if a is not None and a.furo_id and a.prof_de_m is not None and a.prof_ate_m is not None and a.furo_id in trajs:
            t, d, motivo = trajs[a.furo_id]
            if t is None or d is None:
                sem_pos.append({"codigo": r["codigo"], "motivo": motivo})
                continue
            p0, p1 = T.posicao(t, a.prof_de_m) + d, T.posicao(t, a.prof_ate_m) + d
            segmentos.append({**base, "furo": furos[a.furo_id].codigo, "de": a.prof_de_m, "ate": a.prof_ate_m, "estimada": t.estimada,
                              "xyz0": p0.round(3).tolist(), "xyz1": p1.round(3).tolist()})
        elif a is not None and a.x is not None and a.y is not None:
            d, motivo = desloc(a.srid or mina.srid_trabalho)
            if d is None:
                sem_pos.append({"codigo": r["codigo"], "motivo": motivo})
                continue
            if a.z is None:
                sem_pos.append({"codigo": r["codigo"], "motivo": "sem cota (Z): não é posicionada em 3D"})
                continue
            pontos.append({**base, "xyz": (np.array([a.x, a.y, a.z]) + d).round(3).tolist()})
        else:
            sem_pos.append({"codigo": r["codigo"], "motivo": "sem coordenadas nem furo/profundidade" if r["cadastrada"] else "só no laudo (não cadastrada)"})
    trajetorias = []
    for fid, (t, d, _motivo) in trajs.items():
        if t is not None and d is not None:
            trajetorias.append({"id": str(fid), "codigo": furos[fid].codigo, "estimada": t.estimada, "motivo": t.motivo,
                                "pontos": (T.densificar(t, 5.0) + d).round(3).tolist()})
    todos = [p["xyz"] for p in pontos] + [s["xyz0"] for s in segmentos] + [q for t in trajetorias for q in t["pontos"][:1]]
    origem = [round(float(np.mean([p[i] for p in todos]))) for i in range(3)] if todos else [0, 0, 0]
    unidades = {}
    for v in vals.values():
        for an, x in v.items():
            unidades.setdefault(an, x["unidade"])
    return {"srid": mina.srid_trabalho, "origem": origem, "pontos": pontos, "segmentos": segmentos, "trajetorias": trajetorias,
            "sem_posicao": sem_pos, "unidades": unidades, "total": len(regs)}


# ------------------------------------------------------------------ exportações (Excel, GeoJSON, GeoPackage)
def _analitos_validos(db: Session, analitos: str) -> list[str]:
    """Só códigos de analitos que existem no cadastro (vindos dos laudos): o nome vira coluna no GeoPackage/Excel."""
    from geomina.modules.geoquimica.models import Analito
    pedidos = [a for a in analitos.split(",") if a]
    existentes = set(db.scalars(select(Analito.codigo).where(Analito.codigo.in_(pedidos)))) if pedidos else set()
    return [a for a in pedidos if a in existentes]


def _filtros_texto(request: Request) -> str:
    q = request.query_params
    partes = [f"{k}={v}" for k, v in q.items() if v and k not in ("analitos", "regra_ld", "pagina", "tamanho", "ordem")]
    return "; ".join(partes) or "nenhum (todas as amostras)"


def _anexo(conteudo: bytes, nome: str, tipo: str) -> Response:
    return Response(conteudo, media_type=tipo, headers={"Content-Disposition": f'attachment; filename="{nome}"'})


@router.get("/minas/{mina_id}/geoop/registros.xlsx")
def exportar_xlsx(mina_id: uuid.UUID, request: Request, analitos: str = "", texto: str | None = None, data_de: date | None = None,
                  data_ate: date | None = None, teor_analito: str | None = None, teor_min: float | None = None, teor_max: float | None = None,
                  regra_ld: str = "limite", u: Usuario = Depends(LER), db: Session = Depends(obter_sessao)) -> Response:
    from geomina.modules.geoop import exportacao as X
    regs, _ = _consulta(request, db, mina_id, texto, data_de, data_ate, teor_analito, teor_min, teor_max, regra_ld)
    regs.sort(key=lambda r: r["codigo"] or "")
    lista = _analitos_validos(db, analitos)
    mina = db.get(Mina, mina_id)
    meta = {"mina": f"{mina.codigo} — {mina.nome}", "srid": mina.srid_trabalho, "filtros": _filtros_texto(request), "regra_ld": regra_ld, "usuario": u.nome}
    return _anexo(X.xlsx(regs, S.valores(db, mina_id, regs, lista, regra_ld), lista, meta, S.STATUS), "geoquimica_amostras.xlsx",
                  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")


@router.get("/minas/{mina_id}/geoop/espacial.geojson")
def exportar_geojson(mina_id: uuid.UUID, request: Request, analitos: str = "", texto: str | None = None, data_de: date | None = None,
                     data_ate: date | None = None, teor_analito: str | None = None, teor_min: float | None = None, teor_max: float | None = None,
                     regra_ld: str = "limite", _u: Usuario = Depends(LER), db: Session = Depends(obter_sessao)) -> Response:
    from geomina.modules.geoop import exportacao as X
    lista = _analitos_validos(db, analitos)
    c = _cena(mina_id, request, db, ",".join(lista), texto, data_de, data_ate, teor_analito, teor_min, teor_max, regra_ld)
    return _anexo(X.geojson(c, lista, _filtros_texto(request)), "geoquimica_amostras.geojson", "application/geo+json")


@router.get("/minas/{mina_id}/geoop/espacial.gpkg")
def exportar_gpkg(mina_id: uuid.UUID, request: Request, analitos: str = "", texto: str | None = None, data_de: date | None = None,
                  data_ate: date | None = None, teor_analito: str | None = None, teor_min: float | None = None, teor_max: float | None = None,
                  regra_ld: str = "limite", _u: Usuario = Depends(LER), db: Session = Depends(obter_sessao)) -> Response:
    from geomina.modules.geoop import exportacao as X
    lista = _analitos_validos(db, analitos)
    c = _cena(mina_id, request, db, ",".join(lista), texto, data_de, data_ate, teor_analito, teor_min, teor_max, regra_ld)
    return _anexo(X.gpkg(c, lista, _filtros_texto(request)), "geoquimica_amostras.gpkg", "application/geopackage+sqlite3")
