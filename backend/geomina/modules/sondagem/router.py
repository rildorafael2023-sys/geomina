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
from geomina.modules.arquivos.models import Arquivo
from geomina.modules.auth.models import Usuario
from geomina.modules.dicionarios.models import Dicionario, Termo
from geomina.modules.dicionarios.router import _reconhecer
from geomina.modules.documentos.models import Documento
from geomina.modules.documentos.router import _gravar_arquivo, _nova_versao
from geomina.modules.estrutura.models import Mina
from geomina.modules.geoquimica.models import Analito, Certificado, Resultado
from geomina.modules.geoquimica.router import vincular_pendentes
from geomina.modules.sondagem import descricao as D
from geomina.modules.sondagem import importacao as I
from geomina.modules.sondagem.models import FotoFuro, Furo, IntervaloFuro, SurveyFuro
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
    nfot = dict(db.execute(select(FotoFuro.furo_id, func.count()).group_by(FotoFuro.furo_id)).all())
    out = []
    for f in db.scalars(select(Furo).where(Furo.mina_id == mina_id).order_by(Furo.codigo)):
        out.append({"id": f.id, "codigo": f.codigo, "projeto": f.projeto, "area": f.area, "x": f.x, "y": f.y, "z": f.z, "srid": f.srid,
                    "azimute": f.azimute, "inclinacao": f.inclinacao, "profundidade_final": f.profundidade_final,
                    "data_inicio": f.data_inicio, "responsavel": f.responsavel, "surveys": nsv.get(f.id, 0),
                    "trajetoria": "real" if nsv.get(f.id, 0) >= 2 else "estimada", "intervalos": nint.get(f.id, 0),
                    "amostras": nam.get(f.id, 0), "amostras_com_resultado": nres.get(f.id, 0), "tipo": D.tipo_furo(f.codigo),
                    "fotos": nfot.get(f.id, 0)})
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
    ints = [_intervalo(f, i, termo(li), termo(al), termo(mi))
            for i, li, al, mi in db.execute(select(IntervaloFuro, Lit, Alt, Mi).outerjoin(Lit, Lit.id == IntervaloFuro.litologia_id)
                                            .outerjoin(Alt, Alt.id == IntervaloFuro.alteracao_id).outerjoin(Mi, Mi.id == IntervaloFuro.mineralizacao_id)
                                            .where(IntervaloFuro.furo_id == f.id).order_by(IntervaloFuro.de_m))]
    lista = [a for a in analitos.split(",") if a]
    amostras, sem_prof = [], []
    ams = list(db.scalars(select(Amostra).where(Amostra.furo_id == f.id, Amostra.estado != "cancelada").order_by(Amostra.prof_de_m)))
    if lista == ["*"]:  # todos os analitos que têm resultado nas amostras do furo, na ordem do laudo
        lista = list(db.scalars(select(Analito.codigo).where(Analito.id.in_(
            select(Resultado.analito_id).where(Resultado.amostra_id.in_([a.id for a in ams]), Resultado.preferido.is_(True))))
            .order_by(Analito.tipo, Analito.ordem, Analito.codigo))) if ams else []
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
                     "data_fim": f.data_fim, "responsavel": f.responsavel, "metodo": f.metodo, "descricao": f.descricao,
                     "tipo": D.tipo_furo(f.codigo)},
            "rqd": _resumo_rqd(ints), "grupos": {an: D.grupo_unidade(u) for an, u in unidades.items()},
            "trajetoria": traj, "erro_trajetoria": falha, "survey": sv, "intervalos": ints, "amostras": amostras,
            "sem_profundidade": sem_prof, "unidades": unidades, "analitos": [a for a in lista if a in unidades],
            "regra_ld_descricao": REGRAS_LD[regra_ld], "fotos": _fotos(db, f.id)}


def _intervalo(f: Furo, i: IntervaloFuro, lit, alt, mi) -> dict:
    at = i.atributos or {}
    lit_txt = lit["nome"] if lit else at.get("litologia_original")
    return {"id": str(i.id), "de": i.de_m, "ate": i.ate_m, "espessura": round(i.ate_m - i.de_m, 3), "litologia": lit, "litologia_texto": lit_txt,
            "alteracao": alt, "mineralizacao": mi, "estruturas": i.estruturas, "descricao": i.descricao, "observacoes": i.observacoes,
            "atributos": at, "rqd": at.get("rqd"), "classe_rqd": D.classe_rqd(at.get("rqd")), "recuperacao": at.get("recuperacao"),
            "caixa": at.get("caixa"), "marca_esmeralda": at.get("esmeralda"),
            "ocorrencias": D.ocorrencias(i.descricao, i.observacoes, i.estruturas, mi["nome"] if mi else None, marca_esmeralda=at.get("esmeralda")),
            "material": D.material(lit_txt, i.descricao),
            "cota_topo": D.cota(f.z, f.inclinacao, i.de_m), "cota_base": D.cota(f.z, f.inclinacao, i.ate_m)}


def _resumo_rqd(ints: list[dict]) -> dict | None:
    """Percentual do comprimento com RQD em cada classe e média ponderada pela espessura."""
    com = [x for x in ints if x["rqd"] is not None]
    if not com:
        return None
    total = sum(x["espessura"] for x in com)
    classes = {c: 0.0 for c in ("excelente", "bom", "razoavel", "ruim", "muito_ruim")}
    for x in com:
        classes[x["classe_rqd"]] += x["espessura"]
    return {"classes": {c: round(100 * v / total, 1) for c, v in classes.items()}, "media": round(sum(x["rqd"] * x["espessura"] for x in com) / total, 1),
            "metros": round(total, 2), "trechos": len(com)}


class AjusteIntervalo(BaseModel):
    esmeralda: bool | None = Field(None, description="marca de esmeralda feita à mão (null = segue a descrição)")
    rqd: float | None = Field(None, ge=0, le=100)
    caixa: str | None = Field(None, max_length=20)
    campos: list[str] = Field(default_factory=list, description="quais campos alterar (os demais ficam como estão)")


@router.patch("/intervalos-furo/{intervalo_id}")
def ajustar_intervalo(intervalo_id: uuid.UUID, e: AjusteIntervalo, _u: Usuario = Depends(IMPORTAR), db: Session = Depends(obter_sessao)) -> dict:
    """Marca/desmarca esmeralda à mão e ajusta RQD e caixa de um trecho do log."""
    i = db.get(IntervaloFuro, intervalo_id)
    if i is None:
        raise ErroAplicacao(404, "nao_encontrado", "Intervalo não encontrado.")
    at = dict(i.atributos or {})
    for c in e.campos:
        if c not in ("esmeralda", "rqd", "caixa"):
            raise ErroAplicacao(422, "campo_invalido", f"Campo {c} não pode ser ajustado aqui.")
        v = getattr(e, c)
        if v is None:
            at.pop(c, None)
        else:
            at[c] = v
    i.atributos = at or None
    db.flush()
    f = db.get(Furo, i.furo_id)
    termo = lambda tid: (lambda x: {"id": str(x.id), "nome": x.nome, "cor": x.cor, "sigla": x.sigla} if x else None)(db.get(Termo, tid) if tid else None)  # noqa: E731
    return _intervalo(f, i, termo(i.litologia_id), termo(i.alteracao_id), termo(i.mineralizacao_id))


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




# ------------------------------------------------------------------ edição do log, fotos de testemunho e arquivos
class TrechoFuro(BaseModel):
    de_m: float = Field(ge=0)
    ate_m: float = Field(gt=0)
    litologia_id: uuid.UUID | None = None
    alteracao_id: uuid.UUID | None = None
    mineralizacao_id: uuid.UUID | None = None
    estruturas: str | None = Field(None, max_length=300)
    descricao: str | None = None
    rqd: float | None = Field(None, ge=0, le=100)
    caixa: str | None = Field(None, max_length=20)
    esmeralda: bool | None = None


class LogFuro(BaseModel):
    intervalos: list[TrechoFuro]


def _furo(db: Session, furo_id: uuid.UUID) -> Furo:
    f = db.get(Furo, furo_id)
    if f is None:
        raise ErroAplicacao(404, "nao_encontrado", "Furo não encontrado.")
    return f


@router.put("/furos/{furo_id}/intervalos")
def gravar_intervalos(furo_id: uuid.UUID, e: LogFuro, u: Usuario = Depends(IMPORTAR), db: Session = Depends(obter_sessao)) -> dict:
    """Substitui a descrição geológica do furo (intervalos de/até com litologia e descrição)."""
    f = _furo(db, furo_id)
    trechos = sorted(e.intervalos, key=lambda t: (t.de_m, t.ate_m))
    for t in trechos:
        if t.ate_m <= t.de_m:
            raise ErroAplicacao(422, "intervalo_invalido", f"Intervalo {t.de_m:g}–{t.ate_m:g} m: o 'até' precisa ser maior que o 'de'.")
        if t.ate_m > f.profundidade_final + 1e-9:
            raise ErroAplicacao(422, "alem_do_furo", f"Intervalo {t.de_m:g}–{t.ate_m:g} m passa da profundidade final ({f.profundidade_final:g} m).")
    for t1, t2 in zip(trechos, trechos[1:], strict=False):
        if t2.de_m < t1.ate_m - 1e-9:
            raise ErroAplicacao(422, "sobreposicao", f"Os intervalos {t1.de_m:g}–{t1.ate_m:g} m e {t2.de_m:g}–{t2.ate_m:g} m se sobrepõem.")
    for i in db.scalars(select(IntervaloFuro).where(IntervaloFuro.furo_id == f.id)):
        db.delete(i)
    db.flush()
    for t in trechos:
        db.add(IntervaloFuro(furo_id=f.id, de_m=t.de_m, ate_m=t.ate_m, litologia_id=t.litologia_id, alteracao_id=t.alteracao_id,
                             mineralizacao_id=t.mineralizacao_id, estruturas=t.estruturas, descricao=t.descricao, responsavel=u.nome,
                             atributos={k: v for k, v in (("rqd", t.rqd), ("caixa", t.caixa), ("esmeralda", t.esmeralda)) if v is not None} or None))
    db.flush()
    return {"intervalos": len(trechos)}


@router.delete("/furos/{furo_id}", status_code=204)
def excluir_furo(furo_id: uuid.UUID, _u: Usuario = Depends(IMPORTAR), db: Session = Depends(obter_sessao)):
    """Exclui um furo cadastrado por engano. As amostras continuam cadastradas (só perdem o vínculo com o furo)."""
    f = _furo(db, furo_id)
    for a in db.scalars(select(Amostra).where(Amostra.furo_id == f.id)):
        a.furo_id = None
    for x in db.scalars(select(FotoFuro).where(FotoFuro.furo_id == f.id)):
        db.delete(x)
    db.flush()
    db.delete(f)
    db.flush()


def _fotos(db: Session, furo_id: uuid.UUID) -> list[dict]:
    out = []
    for x, d in db.execute(select(FotoFuro, Documento).join(Documento, Documento.id == FotoFuro.documento_id)
                           .where(FotoFuro.furo_id == furo_id).order_by(FotoFuro.de_m.nulls_last(), Documento.titulo)):
        v = d.versoes[-1] if d.versoes else None
        mime = db.scalar(select(Arquivo.mime).where(Arquivo.id == v.arquivo_id)) if v else None
        out.append({"id": str(x.id), "documento_id": str(d.id), "versao": v.numero if v else 1, "titulo": d.titulo, "de": x.de_m, "ate": x.ate_m,
                    "caixa": x.caixa, "legenda": x.legenda, "categoria": d.categoria, "mime": mime})
    return out


@router.get("/furos/{furo_id}/fotos")
def fotos(furo_id: uuid.UUID, _u: Usuario = Depends(LER), db: Session = Depends(obter_sessao)) -> list[dict]:
    _furo(db, furo_id)
    return _fotos(db, furo_id)


@router.post("/furos/{furo_id}/fotos", status_code=201)
def enviar_fotos(furo_id: uuid.UUID, request: Request, arquivos: list[UploadFile] = File(...), de_m: float | None = Form(None),
                 ate_m: float | None = Form(None), caixa: str | None = Form(None), legenda: str | None = Form(None),
                 u: Usuario = Depends(IMPORTAR), db: Session = Depends(obter_sessao)) -> list[dict]:
    """Fotos das caixas de testemunho (JPG/PNG/TIFF) ou arquivos da descrição do furo (PDF), ligados ao furo e ao intervalo."""
    f = _furo(db, furo_id)
    if de_m is not None and ate_m is not None and ate_m <= de_m:
        raise ErroAplicacao(422, "intervalo_invalido", "O 'até' precisa ser maior que o 'de'.")
    if len(arquivos) > 100:
        raise ErroAplicacao(422, "muitos_arquivos", "Envie no máximo 100 arquivos por vez.")
    for arq in arquivos:
        nome = (arq.filename or "foto").replace("\\", "/").rsplit("/", 1)[-1]
        a = _gravar_arquivo(request, db, arq.file, nome, u)
        categoria = "foto" if a.mime.startswith("image/") else "campo"
        intervalo = f" {de_m:g}–{ate_m:g} m" if de_m is not None and ate_m is not None else ""
        d = Documento(mina_id=f.mina_id, categoria=categoria, titulo=f"{f.codigo}{intervalo} — {nome.rsplit('.', 1)[0]}"[:200],
                      legenda=legenda, autor_id=u.id, descricao=f"Furo {f.codigo}" + (f", caixa {caixa}" if caixa else ""))
        db.add(d)
        db.flush()
        _nova_versao(request, db, d, a, nome, None, u)
        db.add(FotoFuro(furo_id=f.id, documento_id=d.id, de_m=de_m, ate_m=ate_m, caixa=caixa, legenda=legenda))
    db.flush()
    return _fotos(db, f.id)


@router.delete("/fotos-furo/{foto_id}", status_code=204)
def remover_foto(foto_id: uuid.UUID, _u: Usuario = Depends(IMPORTAR), db: Session = Depends(obter_sessao)):
    """Tira a foto do log do furo. O arquivo continua guardado (arquivado em Fotos e croquis), como todo documento."""
    x = db.get(FotoFuro, foto_id)
    if x is None:
        raise ErroAplicacao(404, "nao_encontrado", "Foto não encontrada.")
    d = db.get(Documento, x.documento_id)
    db.delete(x)
    if d is not None:
        d.arquivado = True
    db.flush()


# ------------------------------------------------------------------ visão geral, amostragem dos furos e fotos em lote
@router.get("/minas/{mina_id}/sondagem/resumo")
def resumo(mina_id: uuid.UUID, _u: Usuario = Depends(LER), db: Session = Depends(obter_sessao)) -> dict:
    """Números do cartão de Sondagem no Início."""
    codigos = list(db.scalars(select(Furo.codigo).where(Furo.mina_id == mina_id)))
    furos = select(Furo.id).where(Furo.mina_id == mina_id)
    amostras = select(Amostra.id).where(Amostra.furo_id.in_(furos))
    return {
        "exploratorios": sum(1 for c in codigos if D.tipo_furo(c) == "exploratorio"),
        "ina": sum(1 for c in codigos if D.tipo_furo(c) == "ina"),
        "intervalos": db.scalar(select(func.count()).select_from(IntervaloFuro).where(IntervaloFuro.furo_id.in_(furos))) or 0,
        "amostras": db.scalar(select(func.count()).select_from(Amostra).where(Amostra.furo_id.in_(furos))) or 0,
        "com_quimica": db.scalar(select(func.count(func.distinct(Resultado.amostra_id))).where(Resultado.amostra_id.in_(amostras))) or 0,
        "fotos": db.scalar(select(func.count()).select_from(FotoFuro).where(FotoFuro.furo_id.in_(furos))) or 0,
        "metros": round(db.scalar(select(func.sum(Furo.profundidade_final)).where(Furo.mina_id == mina_id)) or 0, 2),
    }


@router.get("/minas/{mina_id}/sondagem/amostras")
def amostragem_furos(mina_id: uuid.UUID, _u: Usuario = Depends(LER), db: Session = Depends(obter_sessao)) -> dict:
    """Todas as amostras de testemunho com furo, intervalo, litologia do log naquele intervalo, laudo e teores (resultado preferido)."""
    furos = {f.id: f for f in db.scalars(select(Furo).where(Furo.mina_id == mina_id))}
    ams = list(db.scalars(select(Amostra).where(Amostra.mina_id == mina_id, Amostra.estado != "cancelada",
                                                (Amostra.furo_id.is_not(None)) | (Amostra.serie == "BMT-TS")).order_by(Amostra.codigo)))
    Lit = aliased(Termo)
    por_furo: dict = {}
    for i, li in db.execute(select(IntervaloFuro, Lit).outerjoin(Lit, Lit.id == IntervaloFuro.litologia_id)
                            .where(IntervaloFuro.furo_id.in_(list(furos))).order_by(IntervaloFuro.de_m)):
        por_furo.setdefault(i.furo_id, []).append((i, li))
    vals: dict = {}
    certs: dict = {}
    analitos: dict[str, dict] = {}
    ids = [a.id for a in ams]
    for k in range(0, len(ids), 900):
        for r, an, cert in db.execute(select(Resultado, Analito, Certificado.codigo).join(Analito).join(Certificado)
                                      .where(Resultado.amostra_id.in_(ids[k:k + 900]), Resultado.preferido.is_(True))):
            vals.setdefault(r.amostra_id, {})[an.codigo] = r.valor_texto if r.qualificador != "=" else f"{r.valor_num:g}"
            certs.setdefault(r.amostra_id, set()).add(cert)
            analitos.setdefault(an.codigo, {"codigo": an.codigo, "unidade": r.unidade, "grupo": D.grupo_unidade(r.unidade),
                                            "ordem": (an.tipo, an.ordem, an.codigo)})
    linhas = []
    for a in ams:
        f = furos.get(a.furo_id) if a.furo_id else None
        lito = desc = None
        if f and a.prof_de_m is not None and a.prof_ate_m is not None:
            meio = (a.prof_de_m + a.prof_ate_m) / 2
            for i, li in por_furo.get(f.id, []):
                if i.de_m <= meio <= i.ate_m:
                    lito = li.nome if li else (i.atributos or {}).get("litologia_original")
                    desc = i.descricao
                    break
        linhas.append({"id": str(a.id), "codigo": a.codigo, "furo_id": str(f.id) if f else None, "furo": f.codigo if f else a.furo,
                       "tipo_furo": D.tipo_furo(f.codigo) if f else None, "localizacao": (f.area if f else None) or a.local_descricao,
                       "de": a.prof_de_m, "ate": a.prof_ate_m, "litologia": lito or (a.descricao if not f else None), "descricao": desc or a.descricao,
                       "certificados": sorted(certs.get(a.id, set())), "valores": vals.get(a.id, {})})
    colunas = [{k: v for k, v in x.items() if k != "ordem"} for x in sorted(analitos.values(), key=lambda x: x["ordem"])]
    return {"amostras": linhas, "analitos": colunas}


@router.post("/minas/{mina_id}/sondagem/fotos", status_code=201)
def fotos_em_lote(mina_id: uuid.UUID, request: Request, arquivos: list[UploadFile] = File(...), conferir: bool = Form(False),
                  u: Usuario = Depends(IMPORTAR), db: Session = Depends(obter_sessao)) -> dict:
    """Importa várias fotos de testemunho de uma vez. O nome do arquivo diz o furo, a caixa e o De–Até
    (ex.: F310_CX29_136,6-137,2.jpg). Sem De–Até, usa o intervalo da caixa no log. Com ``conferir``, só lê os nomes."""
    _mina(db, mina_id)
    furos = {f.codigo.replace("-", "").replace(" ", "").upper(): f for f in db.scalars(select(Furo).where(Furo.mina_id == mina_id))}
    lidas, gravadas = [], 0
    for arq in arquivos[:300]:
        nome = (arq.filename or "foto").replace("\\", "/").rsplit("/", 1)[-1]
        info = D.ler_nome_foto(nome)
        f = furos.get(info["furo"] or "")
        de, ate = info["de"], info["ate"]
        if f is not None and de is None and info["caixa"]:
            trechos = [i for i in db.scalars(select(IntervaloFuro).where(IntervaloFuro.furo_id == f.id))
                       if str((i.atributos or {}).get("caixa", "")).upper() == info["caixa"].upper()]
            if trechos:
                de, ate = min(i.de_m for i in trechos), max(i.ate_m for i in trechos)
        situacao = "ok" if f is not None and de is not None else ("sem_intervalo" if f is not None else "furo_nao_encontrado")
        lidas.append({"arquivo": nome, "furo": f.codigo if f else info["furo"], "caixa": info["caixa"], "de": de, "ate": ate, "situacao": situacao})
        if conferir or f is None:
            continue
        a = _gravar_arquivo(request, db, arq.file, nome, u)
        categoria = "foto" if a.mime.startswith("image/") else "campo"
        intervalo = f" {de:g}–{ate:g} m" if de is not None and ate is not None else ""
        d = Documento(mina_id=mina_id, categoria=categoria, titulo=f"{f.codigo}{intervalo} — {nome.rsplit('.', 1)[0]}"[:200], autor_id=u.id,
                      descricao=f"Furo {f.codigo}" + (f", caixa {info['caixa']}" if info["caixa"] else ""))
        db.add(d)
        db.flush()
        _nova_versao(request, db, d, a, nome, None, u)
        db.add(FotoFuro(furo_id=f.id, documento_id=d.id, de_m=de, ate_m=ate, caixa=info["caixa"]))
        gravadas += 1
    db.flush()
    return {"lidas": lidas, "gravadas": gravadas}


@router.get("/furos/{furo_id}/caixas")
def caixas(furo_id: uuid.UUID, _u: Usuario = Depends(LER), db: Session = Depends(obter_sessao)) -> dict:
    """Caixas do log (atributo caixa dos trechos) com o intervalo de cada uma e se já têm foto."""
    f = _furo(db, furo_id)
    cx: dict[str, list[float]] = {}
    for i in db.scalars(select(IntervaloFuro).where(IntervaloFuro.furo_id == f.id)):
        c = (i.atributos or {}).get("caixa")
        if c not in (None, ""):
            a = cx.setdefault(str(c), [i.de_m, i.ate_m])
            a[0], a[1] = min(a[0], i.de_m), max(a[1], i.ate_m)
    fotos = list(db.scalars(select(FotoFuro).where(FotoFuro.furo_id == f.id)))
    com_foto = {str(x.caixa).upper() for x in fotos if x.caixa}
    for x in fotos:  # foto sem número de caixa conta para a caixa que ela cobre
        if x.caixa is None and x.de_m is not None and x.ate_m is not None:
            for c, (de, ate) in cx.items():
                if x.de_m < ate and x.ate_m > de:
                    com_foto.add(c.upper())

    def chave(c):
        n = "".join(ch for ch in c if ch.isdigit())
        return (int(n) if n else 10**9, c)
    lista = [{"caixa": c, "de": de, "ate": ate, "com_foto": c.upper() in com_foto} for c, (de, ate) in sorted(cx.items(), key=lambda kv: chave(kv[0]))]
    fotografado = 0.0
    trechos = sorted((x.de_m, x.ate_m) for x in fotos if x.de_m is not None and x.ate_m is not None)
    fim = -1.0
    for de, ate in trechos:  # metros cobertos por foto, sem contar sobreposição
        if ate > fim:
            fotografado += ate - max(de, fim)
            fim = ate
    descritos = db.scalar(select(func.sum(IntervaloFuro.ate_m - IntervaloFuro.de_m)).where(IntervaloFuro.furo_id == f.id)) or 0
    return {"caixas": lista, "sem_foto": [c["caixa"] for c in lista if not c["com_foto"]], "fotos": len(fotos),
            "a_conferir": sum(1 for x in fotos if x.de_m is None), "fotografado_m": round(fotografado, 2), "descrito_m": round(descritos, 2)}


@router.get("/minas/{mina_id}/sondagem/fotos.csv")
def exportar_fotos(mina_id: uuid.UUID, formato: str = "imago", _u: Usuario = Depends(LER), db: Session = Depends(obter_sessao)):
    """Tabela das fotos para Datarock/Imago (HoleID, From, To, Box, ImageFile) ou Leapfrog (hole_id, from, to, box, image)."""
    import csv
    import io

    from fastapi.responses import Response
    if formato not in ("imago", "leapfrog"):
        raise ErroAplicacao(422, "formato", "Formato: imago ou leapfrog.")
    buf = io.StringIO()
    w = csv.writer(buf, delimiter=",")
    w.writerow(["HoleID", "From", "To", "Box", "ImageFile", "Caption"] if formato == "imago" else ["hole_id", "from", "to", "box", "image", "caption"])
    q = (select(Furo.codigo, FotoFuro, Documento).join(FotoFuro, FotoFuro.furo_id == Furo.id).join(Documento, Documento.id == FotoFuro.documento_id)
         .where(Furo.mina_id == mina_id).order_by(Furo.codigo, FotoFuro.de_m))
    for cod, x, d in db.execute(q):
        nome = d.versoes[-1].nome_original if d.versoes else d.titulo
        w.writerow([cod, "" if x.de_m is None else f"{x.de_m:g}", "" if x.ate_m is None else f"{x.ate_m:g}", x.caixa or "", nome, x.legenda or ""])
    return Response(buf.getvalue().encode("utf-8-sig"), media_type="text/csv",
                    headers={"Content-Disposition": f'attachment; filename="fotos_testemunho_{formato}.csv"'})
