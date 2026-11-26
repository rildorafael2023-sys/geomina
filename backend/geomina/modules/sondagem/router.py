from __future__ import annotations

import uuid
from datetime import date

import numpy as np
from fastapi import APIRouter, Depends, File, Form, Request, UploadFile
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session, aliased

from geomina.core.dependencias import obter_sessao, requer
from geomina.core.erros import ErroAplicacao
from geomina.espacial import trajetoria as T
from geomina.modules.amostragem.models import Amostra, Importacao
from geomina.modules.amostragem.router import serie_de
from geomina.modules.analise.longitudinal import REGRAS_LD, valor_grafico
from geomina.modules.auth.models import Usuario
from geomina.modules.dicionarios.models import Dicionario, Termo
from geomina.modules.dicionarios.router import _reconhecer
from geomina.modules.documentos.router import _gravar_arquivo
from geomina.modules.estrutura.models import Mina
from geomina.modules.geoquimica.models import Analito, Certificado, Resultado
from geomina.modules.geoquimica.router import vincular_pendentes
from geomina.modules.sondagem import importacao as I
from geomina.modules.sondagem.models import Furo, IntervaloFuro, SurveyFuro
from geomina.modules.topografia.router import _transformar_ponto

router = APIRouter(tags=["sondagem"])
LER = requer("sondagem:ler")
IMPORTAR = requer("sondagem:importar")


def _mina(db: Session, mina_id: uuid.UUID) -> Mina:
    m = db.get(Mina, mina_id)
    if m is None:
        raise ErroAplicacao(404, "nao_encontrado", "Mina não encontrada.")
    return m


def _reconhecedor(db: Session):
    dics = {d.codigo: d for d in db.scalars(select(Dicionario))}
    cache: dict = {}

    def rec(dic: str, texto: str):
        k = (dic, texto)
        if k not in cache:
            t = _reconhecer(db, dics[dic], texto) if dic in dics else None
            cache[k] = (str(t.id), t.nome) if t else None
        return cache[k]
    return rec


# ------------------------------------------------------------------ importação
@router.post("/minas/{mina_id}/sondagem/importacoes", status_code=201)
def analisar(mina_id: uuid.UUID, request: Request, srid: int = Form(...), convencao: str = Form("horizontal_negativo"),
             referencia_azimute: str = Form("quadricula"), declinacao: float = Form(0.0),
             collar: UploadFile | None = File(None), survey: UploadFile | None = File(None), geologia: UploadFile | None = File(None),
             amostras: UploadFile | None = File(None), u: Usuario = Depends(IMPORTAR), db: Session = Depends(obter_sessao)) -> dict:
    """Fase 1: lê e valida os arquivos (collar, survey, geologia, amostras). Nada é gravado em sondagem."""
    _mina(db, mina_id)
    if convencao not in I.CONVENCOES:
        raise ErroAplicacao(422, "convencao", "Convenção de inclinação inválida.")
    if referencia_azimute not in ("quadricula", "magnetico", "geografico"):
        raise ErroAplicacao(422, "referencia_azimute", "Referência do azimute: quadricula, magnetico ou geografico.")
    enviados = {t: a for t, a in (("collar", collar), ("survey", survey), ("geologia", geologia), ("amostras", amostras)) if a is not None}
    if not enviados:
        raise ErroAplicacao(422, "sem_arquivos", "Envie pelo menos um arquivo (collar, survey, geologia ou amostras).")
    arquivos, guardados = {}, []
    for t, up in enviados.items():
        nome = (up.filename or f"{t}.csv").replace("\\", "/").rsplit("/", 1)[-1]
        a = _gravar_arquivo(request, db, up.file, nome, u)
        arquivos[t] = (request.app.state.armazenamento.caminho(a.chave).read_bytes(), nome)
        guardados.append({"tipo": t, "arquivo_id": str(a.id), "nome": nome})
    existentes = {f.codigo.upper(): f.profundidade_final for f in db.scalars(select(Furo).where(Furo.mina_id == mina_id))}
    try:
        rel = I.analisar(arquivos, convencao, set(existentes), existentes, _reconhecedor(db))
    except I.ArquivoInvalido as e:
        raise ErroAplicacao(422, "arquivo_invalido", str(e)) from e
    rel.update(arquivos=guardados, srid=srid, referencia_azimute=referencia_azimute, declinacao=declinacao)
    imp = Importacao(mina_id=mina_id, tipo="sondagem", arquivo_id=uuid.UUID(guardados[0]["arquivo_id"]),
                     nome_arquivo=", ".join(g["nome"] for g in guardados), relatorio=rel, importado_por=u.id)
    db.add(imp)
    db.flush()
    return {"id": imp.id, **{k: v for k, v in rel.items() if k != "dados"}}


class Confirmar(BaseModel):
    ignorar_erros: bool = Field(False, description="grava só as linhas válidas; as com erro ficam de fora (listadas no relatório)")


@router.post("/importacoes/{imp_id}/confirmar-sondagem")
def confirmar(imp_id: uuid.UUID, e: Confirmar, u: Usuario = Depends(IMPORTAR), db: Session = Depends(obter_sessao)) -> dict:
    imp = db.get(Importacao, imp_id)
    if imp is None or imp.tipo != "sondagem":
        raise ErroAplicacao(404, "nao_encontrado", "Importação não encontrada.")
    if imp.estado != "analisada":
        raise ErroAplicacao(422, "importacao_encerrada", "Esta importação já foi confirmada ou descartada.")
    rel = imp.relatorio
    if rel["erros"] and not e.ignorar_erros:
        raise ErroAplicacao(422, "erros_na_importacao", f"{len(rel['erros'])} linha(s) com erro. Corrija o arquivo ou confirme ignorando essas linhas.")
    d = rel["dados"]
    furos = {f.codigo.upper(): f for f in db.scalars(select(Furo).where(Furo.mina_id == imp.mina_id))}
    for c in d["collar"]:
        f = Furo(mina_id=imp.mina_id, codigo=c["furo"], x=c["x"], y=c["y"], z=c["z"], srid=rel["srid"], azimute=c["azimute"],
                 inclinacao=c["inclinacao"], referencia_azimute=rel["referencia_azimute"], declinacao=rel["declinacao"],
                 profundidade_planejada=c["profundidade_planejada"], profundidade_final=c["profundidade_final"], projeto=c["projeto"],
                 area=c["area"], data_inicio=date.fromisoformat(c["data_inicio"]) if c["data_inicio"] else None,
                 data_fim=date.fromisoformat(c["data_fim"]) if c["data_fim"] else None, responsavel=c["responsavel"], metodo=c["metodo"],
                 descricao=c["descricao"], importacao_id=imp.id)
        db.add(f)
        furos[c["furo"]] = f
    db.flush()
    for s in d["survey"]:
        db.add(SurveyFuro(furo_id=furos[s["furo"]].id, profundidade=s["profundidade"], azimute=s["azimute"], inclinacao=s["inclinacao"], metodo=s["metodo"]))
    for g in d["geologia"]:
        db.add(IntervaloFuro(furo_id=furos[g["furo"]].id, de_m=g["de"], ate_m=g["ate"], litologia_id=_uuid(g["litologia_id"]),
                             alteracao_id=_uuid(g["alteracao_id"]), mineralizacao_id=_uuid(g["mineralizacao_id"]), estruturas=g["estruturas"],
                             descricao=g["descricao"], observacoes=g["observacoes"], atributos=g["atributos"] or None))
    cadastradas = {a.codigo.upper(): a for a in db.scalars(select(Amostra).where(Amostra.mina_id == imp.mina_id))}
    ligadas = novas = 0
    for x in d["amostras"]:
        f = furos[x["furo"]]
        a = cadastradas.get(x["amostra"].upper())
        if a is None:
            a = Amostra(mina_id=imp.mina_id, codigo=x["amostra"], serie=serie_de(x["amostra"]), estado="enviada",
                        observacoes=f"Cadastrada pela importação de sondagem ({imp.nome_arquivo}).")
            db.add(a)
            novas += 1
        a.furo_id, a.furo, a.prof_de_m, a.prof_ate_m = f.id, f.codigo, x["de"], x["ate"]
        if x["observacoes"]:
            a.observacoes = ((a.observacoes or "") + "\n" + x["observacoes"]).strip()
        ligadas += 1
    db.flush()
    v = vincular_pendentes(imp.mina_id, u, db)
    imp.estado, imp.opcoes = "confirmada", e.model_dump()
    imp.relatorio = {**rel, "gravado": {"furos": len(d["collar"]), "surveys": len(d["survey"]), "intervalos": len(d["geologia"]),
                                        "amostras_ligadas": ligadas, "amostras_novas": novas, "resultados_ligados": v["vinculados"]}}
    db.flush()
    return imp.relatorio["gravado"]


def _uuid(v):
    return uuid.UUID(v) if v else None


# ------------------------------------------------------------------ furos
class NovoFuro(BaseModel):
    codigo: str = Field(min_length=1, max_length=40)
    x: float
    y: float
    z: float
    srid: int
    azimute: float | None = Field(None, ge=0, lt=360)
    inclinacao: float | None = Field(None, ge=-90, le=90)
    profundidade_final: float = Field(gt=0)
    projeto: str | None = None
    area: str | None = None
    responsavel: str | None = None
    metodo: str | None = None
    descricao: str | None = None


@router.post("/minas/{mina_id}/furos", status_code=201)
def criar_furo(mina_id: uuid.UUID, e: NovoFuro, _u: Usuario = Depends(IMPORTAR), db: Session = Depends(obter_sessao)) -> dict:
    _mina(db, mina_id)
    if db.scalar(select(Furo.id).where(Furo.mina_id == mina_id, Furo.codigo == e.codigo.upper())):
        raise ErroAplicacao(409, "duplicado", f"O furo {e.codigo.upper()} já existe.")
    f = Furo(mina_id=mina_id, **{**e.model_dump(), "codigo": e.codigo.strip().upper()})
    db.add(f)
    db.flush()
    return {"id": f.id, "codigo": f.codigo}


def _trajetoria(db: Session, f: Furo) -> tuple[T.Trajetoria | None, str | None]:
    sv = db.execute(select(SurveyFuro.profundidade, SurveyFuro.azimute, SurveyFuro.inclinacao).where(SurveyFuro.furo_id == f.id)).all()
    try:
        return T.calcular((f.x, f.y, f.z), f.azimute, f.inclinacao, f.profundidade_final, [tuple(s) for s in sv], f.declinacao or 0.0), None
    except ValueError as ex:
        return None, str(ex)


@router.get("/minas/{mina_id}/furos")
def listar_furos(mina_id: uuid.UUID, _u: Usuario = Depends(LER), db: Session = Depends(obter_sessao)) -> list[dict]:
    nsv = dict(db.execute(select(SurveyFuro.furo_id, func.count()).group_by(SurveyFuro.furo_id)).all())
    nint = dict(db.execute(select(IntervaloFuro.furo_id, func.count()).group_by(IntervaloFuro.furo_id)).all())
    nam = dict(db.execute(select(Amostra.furo_id, func.count()).where(Amostra.furo_id.is_not(None)).group_by(Amostra.furo_id)).all())
    nres = dict(db.execute(select(Amostra.furo_id, func.count(func.distinct(Amostra.id))).join(Resultado, Resultado.amostra_id == Amostra.id)
                           .where(Amostra.furo_id.is_not(None)).group_by(Amostra.furo_id)).all())
    out = []
    for f in db.scalars(select(Furo).where(Furo.mina_id == mina_id).order_by(Furo.codigo)):
        out.append({"id": f.id, "codigo": f.codigo, "projeto": f.projeto, "area": f.area, "x": f.x, "y": f.y, "z": f.z, "srid": f.srid,
                    "azimute": f.azimute, "inclinacao": f.inclinacao, "profundidade_final": f.profundidade_final,
                    "data_inicio": f.data_inicio, "responsavel": f.responsavel, "surveys": nsv.get(f.id, 0),
                    "trajetoria": "real" if nsv.get(f.id, 0) >= 2 else "estimada", "intervalos": nint.get(f.id, 0),
                    "amostras": nam.get(f.id, 0), "amostras_com_resultado": nres.get(f.id, 0)})
    return out


@router.get("/furos/{furo_id}/perfil")
def perfil(furo_id: uuid.UUID, analitos: str = "", regra_ld: str = "limite", _u: Usuario = Depends(LER),
           db: Session = Depends(obter_sessao)) -> dict:
    """Perfil por profundidade: trajetória (real ou estimada), intervalos geológicos e amostras com os resultados pedidos."""
    if regra_ld not in REGRAS_LD:
        raise ErroAplicacao(422, "regra_ld", "Regra para valores abaixo do limite: limite, metade ou omitir.")
    f = db.get(Furo, furo_id)
    if f is None:
        raise ErroAplicacao(404, "nao_encontrado", "Furo não encontrado.")
    mina = db.get(Mina, f.mina_id)
    t, falha = _trajetoria(db, f)
    # coordenadas no sistema da mina (só com transformação aprovada; nunca silenciosa)
    desloc, _tid, motivo_crs = _transformar_ponto(db, mina, f.srid, [0.0, 0.0, 0.0])
    traj = None
    if t is not None:
        pts = T.densificar(t, 2.0)
        estacoes = t.xyz
        if desloc is not None:
            d = np.array(desloc)
            pts, estacoes = pts + d, estacoes + d
        traj = {"estimada": t.estimada, "motivo": t.motivo, "srid": mina.srid_trabalho if desloc is not None else f.srid,
                "convertida": desloc is not None and f.srid != mina.srid_trabalho, "aviso_crs": motivo_crs,
                "pontos": pts.round(3).tolist(), "estacoes": [{"profundidade": float(p), "xyz": e.round(3).tolist()} for p, e in zip(t.profundidades, estacoes, strict=True)]}
    sv = [{"profundidade": s.profundidade, "azimute": s.azimute, "inclinacao": s.inclinacao, "metodo": s.metodo}
          for s in db.scalars(select(SurveyFuro).where(SurveyFuro.furo_id == f.id).order_by(SurveyFuro.profundidade))]
    Lit, Alt, Mi = aliased(Termo), aliased(Termo), aliased(Termo)
    termo = lambda x: {"id": str(x.id), "nome": x.nome, "cor": x.cor, "sigla": x.sigla} if x else None  # noqa: E731
    ints = [{"id": str(i.id), "de": i.de_m, "ate": i.ate_m, "litologia": termo(li), "alteracao": termo(al), "mineralizacao": termo(mi),
             "estruturas": i.estruturas, "descricao": i.descricao, "observacoes": i.observacoes, "atributos": i.atributos or {}}
            for i, li, al, mi in db.execute(select(IntervaloFuro, Lit, Alt, Mi).outerjoin(Lit, Lit.id == IntervaloFuro.litologia_id)
                                            .outerjoin(Alt, Alt.id == IntervaloFuro.alteracao_id).outerjoin(Mi, Mi.id == IntervaloFuro.mineralizacao_id)
                                            .where(IntervaloFuro.furo_id == f.id).order_by(IntervaloFuro.de_m))]
    lista = [a for a in analitos.split(",") if a]
    amostras, sem_prof = [], []
    ams = list(db.scalars(select(Amostra).where(Amostra.furo_id == f.id, Amostra.estado != "cancelada").order_by(Amostra.prof_de_m)))
    vals: dict = {}
    if lista and ams:
        for r, an, cert in db.execute(select(Resultado, Analito.codigo, Certificado.codigo).join(Analito).join(Certificado)
                                      .where(Resultado.amostra_id.in_([a.id for a in ams]), Resultado.preferido.is_(True), Analito.codigo.in_(lista))):
            y, sit = valor_grafico(r.qualificador, r.valor_num, r.limite, regra_ld)
            vals.setdefault(r.amostra_id, {})[an] = {"y": y, "texto": r.valor_texto if r.qualificador != "=" else f"{r.valor_num:g}",
                                                     "situacao": sit, "unidade": r.unidade, "certificado": cert}
    tem_res = set(db.scalars(select(Resultado.amostra_id).where(Resultado.amostra_id.in_([a.id for a in ams])).distinct())) if ams else set()
    for a in ams:
        if a.prof_de_m is None or a.prof_ate_m is None:
            sem_prof.append(a.codigo)
            continue
        meio = T.posicao(t, (a.prof_de_m + a.prof_ate_m) / 2) if t is not None else None
        amostras.append({"id": str(a.id), "codigo": a.codigo, "de": a.prof_de_m, "ate": a.prof_ate_m, "valores": vals.get(a.id, {}),
                         "com_resultado": a.id in tem_res, "estado": a.estado,
                         "xyz": (meio + (desloc if desloc is not None else 0)).round(3).tolist() if meio is not None else None})
    unidades = {}
    for v in vals.values():
        for an, x in v.items():
            unidades.setdefault(an, x["unidade"])
    return {"furo": {"id": str(f.id), "codigo": f.codigo, "projeto": f.projeto, "area": f.area, "x": f.x, "y": f.y, "z": f.z, "srid": f.srid,
                     "azimute": f.azimute, "inclinacao": f.inclinacao, "referencia_azimute": f.referencia_azimute, "declinacao": f.declinacao,
                     "profundidade_final": f.profundidade_final, "profundidade_planejada": f.profundidade_planejada, "data_inicio": f.data_inicio,
                     "data_fim": f.data_fim, "responsavel": f.responsavel, "metodo": f.metodo, "descricao": f.descricao},
            "trajetoria": traj, "erro_trajetoria": falha, "survey": sv, "intervalos": ints, "amostras": amostras,
            "sem_profundidade": sem_prof, "unidades": unidades, "regra_ld_descricao": REGRAS_LD[regra_ld]}


@router.get("/minas/{mina_id}/furos/trajetorias")
def trajetorias(mina_id: uuid.UUID, _u: Usuario = Depends(LER), db: Session = Depends(obter_sessao)) -> list[dict]:
    """Trajetórias de todos os furos no sistema da mina (para planta e 3D)."""
    mina = _mina(db, mina_id)
    out = []
    for f in db.scalars(select(Furo).where(Furo.mina_id == mina_id)):
        t, falha = _trajetoria(db, f)
        desloc, _tid, motivo = _transformar_ponto(db, mina, f.srid, [0.0, 0.0, 0.0])
        if t is None or desloc is None:
            out.append({"id": str(f.id), "codigo": f.codigo, "pontos": None, "motivo": falha or motivo})
            continue
        pts = T.densificar(t, 5.0) + np.array(desloc)
        out.append({"id": str(f.id), "codigo": f.codigo, "estimada": t.estimada, "pontos": pts.round(3).tolist(), "motivo": t.motivo})
    return out


