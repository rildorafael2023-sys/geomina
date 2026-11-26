from __future__ import annotations

import uuid
from datetime import date

import numpy as np
import shapely
from fastapi import APIRouter, Depends, File, Form, Request, UploadFile
from pydantic import BaseModel, Field
from sqlalchemy import func, select, text, update
from sqlalchemy.orm import Session

from geomina.core.dependencias import obter_sessao, requer
from geomina.core.erros import ErroAplicacao
from geomina.db import agora
from geomina.espacial import chainage as C
from geomina.espacial import shapefile as S
from geomina.espacial.geometria import de_wkb, para_wkb
from geomina.modules.amostragem.models import Amostra, Importacao
from geomina.modules.arquivos.models import Arquivo
from geomina.modules.auth.models import Usuario
from geomina.modules.documentos.router import _gravar_arquivo
from geomina.modules.estrutura.models import FrenteAvanco, Mina, UnidadeOperacional
from geomina.modules.mapeamento.models import Mapeamento
from geomina.modules.topografia import service
from geomina.modules.topografia.models import (
    EixoVersao,
    FeicaoTopografica,
    Levantamento,
    PosicaoEixo,
    TransformacaoCoordenadas,
)

router = APIRouter(tags=["topografia"])
LER = requer("topografia:ler")
IMPORTAR = requer("topografia:importar")
TRANSFORMAR = requer("topografia:transformar")
TOLERANCIA_AFASTAMENTO = 10.0


def _mina(db: Session, mina_id: uuid.UUID) -> Mina:
    m = db.get(Mina, mina_id)
    if m is None:
        raise ErroAplicacao(404, "nao_encontrado", "Mina não encontrada.")
    return m


def _zip(request: Request, db: Session, arquivo: UploadFile, u: Usuario) -> tuple[Arquivo, bytes, str]:
    nome = (arquivo.filename or "topografia.zip").replace("\\", "/").rsplit("/", 1)[-1]
    a = _gravar_arquivo(request, db, arquivo.file, nome, u)
    dados = request.app.state.armazenamento.caminho(a.chave).read_bytes()
    if not dados.startswith(b"PK"):
        raise ErroAplicacao(422, "formato", "Envie um arquivo .zip com o shapefile (.shp, .shx, .dbf, .prj, .cpg).")
    return a, dados, nome


# ------------------------------------------------------------------ importação
@router.post("/minas/{mina_id}/topografia/importacoes", status_code=201)
def analisar(mina_id: uuid.UUID, request: Request, arquivo: UploadFile = File(...), u: Usuario = Depends(IMPORTAR),
             db: Session = Depends(obter_sessao)) -> dict:
    """Fase 1: lê todas as camadas do .zip e devolve o relatório de validação. Nada é gravado em topografia."""
    mina = _mina(db, mina_id)
    a, dados, nome = _zip(request, db, arquivo, u)
    try:
        membros = S.listar_camadas(dados)
        if not membros:
            raise ErroAplicacao(422, "sem_shapefile", "Nenhum arquivo .shp dentro do zip.")
        camadas = []
        for m in membros:
            try:
                info = service.analisar_camada(S.ler_do_zip(dados, m), mina.srid_trabalho)
                if info["epsg"] and info["epsg"] != mina.srid_trabalho:
                    info["transformacoes"] = service.opcoes_transformacao(db, mina_id, info["epsg"], mina.srid_trabalho)
            except S.ShapefileInvalido as e:
                info = {"camada": m, "erro": str(e)}
            info["membro"] = m
            camadas.append(info)
    except S.ShapefileInvalido as e:
        raise ErroAplicacao(422, "shapefile_invalido", str(e)) from e
    rel = {"camadas": camadas}
    imp = Importacao(mina_id=mina_id, tipo="topografia", arquivo_id=a.id, nome_arquivo=nome, relatorio=rel, importado_por=u.id)
    db.add(imp)
    db.flush()
    return {"id": imp.id, "nome_arquivo": nome, **rel}


class Confirmacao(BaseModel):
    membro: str
    codigo: str = Field(min_length=1, max_length=40)
    descricao: str | None = None
    data_levantamento: date | None = None
    responsavel: str | None = Field(default=None, max_length=120)
    srid_declarado: int | None = None
    transformacao: str | None = Field(default=None, description="'proj' ou id de transformação aprovada")
    camadas_excluidas: list[str] = []


@router.post("/importacoes/{imp_id}/confirmar-topografia")
def confirmar(imp_id: uuid.UUID, e: Confirmacao, request: Request, u: Usuario = Depends(IMPORTAR),
              db: Session = Depends(obter_sessao)) -> dict:
    imp = db.get(Importacao, imp_id)
    if imp is None or imp.tipo != "topografia":
        raise ErroAplicacao(404, "nao_encontrado", "Importação não encontrada.")
    if imp.estado != "analisada":
        raise ErroAplicacao(422, "importacao_encerrada", "Esta importação já foi confirmada ou descartada.")
    info = next((c for c in imp.relatorio["camadas"] if c["membro"] == e.membro), None)
    if info is None or "erro" in info:
        raise ErroAplicacao(422, "camada_invalida", "Camada inexistente ou ilegível neste zip.")
    if db.scalar(select(Levantamento.id).where(Levantamento.mina_id == imp.mina_id, Levantamento.codigo == e.codigo)):
        raise ErroAplicacao(409, "duplicado", f"Já existe o levantamento {e.codigo}.")
    mina = _mina(db, imp.mina_id)
    origem = info["epsg"] or e.srid_declarado
    if origem is None:
        raise ErroAplicacao(422, "crs_obrigatorio",
                            "O arquivo não informa o sistema de coordenadas (.prj ausente ou não reconhecido): declare-o.")
    f_trans, trans_id, trans_desc = service.transformador(db, e.transformacao, origem, mina.srid_trabalho)
    dados = request.app.state.armazenamento.caminho(db.get(Arquivo, imp.arquivo_id).chave).read_bytes()
    camada = S.ler_do_zip(dados, e.membro)
    suspeitas = {c["nome"] for c in info["camadas_cad"] if c.get("z_suspeito")}
    lev = Levantamento(mina_id=imp.mina_id, codigo=e.codigo, descricao=e.descricao, data_levantamento=e.data_levantamento,
                       responsavel=e.responsavel, importacao_id=imp.id, camada=e.membro, tipo_geometria=info["tipo"],
                       srid_original=origem, transformacao_id=trans_id, feicoes=0, vertices=0, minx=0, maxx=0, miny=0, maxy=0)
    db.add(lev)
    db.flush()
    n, nv, xyz = service.gravar_feicoes(db, lev.id, camada, f_trans, set(e.camadas_excluidas), suspeitas)
    if n == 0:
        raise ErroAplicacao(422, "sem_feicoes", "Nenhuma feição para importar (todas vazias ou excluídas).")
    lev.feicoes, lev.vertices = n, nv
    lev.minx, lev.maxx, lev.miny, lev.maxy = (float(v) for v in (xyz[:, 0].min(), xyz[:, 0].max(), xyz[:, 1].min(), xyz[:, 1].max()))
    if xyz.shape[1] == 3:
        lev.minz, lev.maxz = float(xyz[:, 2].min()), float(xyz[:, 2].max())
    imp.estado, imp.opcoes = "confirmada", e.model_dump(mode="json")
    imp.relatorio = {**imp.relatorio, "levantamento_id": str(lev.id), "feicoes": n, "vertices": nv, "transformacao": trans_desc}
    db.flush()
    return {"levantamento_id": lev.id, "feicoes": n, "vertices": nv, "transformacao": trans_desc,
            "camadas_z_suspeito": sorted(suspeitas - set(e.camadas_excluidas))}


@router.get("/minas/{mina_id}/levantamentos")
def levantamentos(mina_id: uuid.UUID, _u: Usuario = Depends(LER), db: Session = Depends(obter_sessao)) -> list[dict]:
    out = []
    for lev in db.scalars(select(Levantamento).where(Levantamento.mina_id == mina_id).order_by(Levantamento.criado_em.desc())):
        t = db.get(TransformacaoCoordenadas, lev.transformacao_id) if lev.transformacao_id else None
        camadas = db.execute(select(FeicaoTopografica.camada_cad, func.count(), func.max(FeicaoTopografica.z_suspeito))
                             .where(FeicaoTopografica.levantamento_id == lev.id).group_by(FeicaoTopografica.camada_cad)).all()
        out.append({"id": lev.id, "codigo": lev.codigo, "descricao": lev.descricao, "data_levantamento": lev.data_levantamento,
                    "responsavel": lev.responsavel, "camada": lev.camada, "tipo": lev.tipo_geometria, "srid_original": lev.srid_original,
                    "transformacao": t.nome if t else None, "feicoes": lev.feicoes, "vertices": lev.vertices,
                    "extensao": [lev.minx, lev.miny, lev.minz, lev.maxx, lev.maxy, lev.maxz], "arquivado": lev.arquivado,
                    "camadas_cad": [{"nome": n, "feicoes": q, "z_suspeito": bool(z)} for n, q, z in sorted(camadas, key=lambda x: -x[1])]})
    return out


@router.post("/levantamentos/{lev_id}/arquivar")
def arquivar(lev_id: uuid.UUID, _u: Usuario = Depends(IMPORTAR), db: Session = Depends(obter_sessao)) -> dict:
    lev = db.get(Levantamento, lev_id)
    if lev is None:
        raise ErroAplicacao(404, "nao_encontrado", "Levantamento não encontrado.")
    lev.arquivado = not lev.arquivado
    db.flush()
    return {"arquivado": lev.arquivado}


@router.get("/minas/{mina_id}/topografia/geometria")
def geometria(mina_id: uuid.UUID, levantamentos: str | None = None, bbox: str | None = None, incluir_z_suspeito: bool = False,
              limite: int = 200000, _u: Usuario = Depends(LER), db: Session = Depends(obter_sessao)) -> dict:
    """Geometria compacta para desenho: coordenadas relativas a uma origem (evita perda de precisão em float32).

    bbox = "minx,miny,maxx,maxy" (consulta pelo índice R*Tree)."""
    q = select(FeicaoTopografica.id, FeicaoTopografica.geom, FeicaoTopografica.camada_cad, FeicaoTopografica.levantamento_id,
               FeicaoTopografica.z_suspeito).join(Levantamento).where(Levantamento.mina_id == mina_id, Levantamento.arquivado.is_(False))
    if levantamentos:
        q = q.where(FeicaoTopografica.levantamento_id.in_([uuid.UUID(x) for x in levantamentos.split(",")]))
    if not incluir_z_suspeito:
        q = q.where(FeicaoTopografica.z_suspeito.is_(False))
    if bbox:
        x0, y0, x1, y1 = (float(v) for v in bbox.split(","))
        ids = text("SELECT id FROM feicao_rtree WHERE maxx >= :x0 AND minx <= :x1 AND maxy >= :y0 AND miny <= :y1")
        rowids = [r[0] for r in db.execute(ids, {"x0": x0, "x1": x1, "y0": y0, "y1": y1})]
        q = q.where(text("feicao_topografica.rowid IN (SELECT value FROM json_each(:r))").bindparams(r=str(rowids)))
    linhas = db.execute(q.limit(limite)).all()
    lev = db.scalar(select(Levantamento).where(Levantamento.mina_id == mina_id).order_by(Levantamento.criado_em))
    origem = [round((lev.minx + lev.maxx) / 2), round((lev.miny + lev.maxy) / 2), round(lev.minz or 0)] if lev else [0, 0, 0]
    camadas: dict[str, list] = {}
    for fid, wkb, cam, _lev, susp in linhas:
        g = de_wkb(wkb)
        partes = [g] if g.geom_type in ("LineString", "Point") else list(getattr(g, "geoms", [g.exterior] if hasattr(g, "exterior") else []))
        coords = []
        for p in partes:
            xyz = shapely.get_coordinates(p, include_z=g.has_z)
            rel = np.round(xyz - np.array(origem[: xyz.shape[1]]), 3)
            coords.append(rel.tolist())
        camadas.setdefault(cam or "(sem camada)", []).append({"id": str(fid), "c": coords, "s": bool(susp)})
    return {"origem": origem, "srid": _mina(db, mina_id).srid_trabalho, "feicoes": len(linhas), "truncado": len(linhas) >= limite,
            "camadas": [{"nome": k, "feicoes": v} for k, v in sorted(camadas.items())]}


@router.get("/feicoes/{feicao_id}")
def feicao(feicao_id: uuid.UUID, _u: Usuario = Depends(LER), db: Session = Depends(obter_sessao)) -> dict:
    f = db.get(FeicaoTopografica, feicao_id)
    if f is None:
        raise ErroAplicacao(404, "nao_encontrado", "Feição não encontrada.")
    g = de_wkb(f.geom)
    lev = db.get(Levantamento, f.levantamento_id)
    return {"id": f.id, "levantamento": lev.codigo, "indice_origem": f.indice_origem, "tipo": f.tipo, "dimensao": f.dimensao,
            "camada_cad": f.camada_cad, "entidade_cad": f.entidade_cad, "z_suspeito": f.z_suspeito, "atributos": f.atributos,
            "coordenadas": shapely.get_coordinates(g, include_z=g.has_z).round(3).tolist(),
            "convertida": f.geom_original is not None}


# ------------------------------------------------------------------ transformações
@router.get("/minas/{mina_id}/transformacoes")
def transformacoes(mina_id: uuid.UUID, _u: Usuario = Depends(LER), db: Session = Depends(obter_sessao)) -> list[dict]:
    return [{"id": t.id, "nome": t.nome, "srid_origem": t.srid_origem, "srid_destino": t.srid_destino, "metodo": t.metodo,
             "parametros": t.parametros, "residuo_medio_m": t.residuo_medio_m, "residuo_max_m": t.residuo_max_m,
             "pontos": t.pontos_calibracao, "origem_calibracao": t.origem_calibracao, "aprovada": t.aprovada}
            for t in db.scalars(select(TransformacaoCoordenadas).where(TransformacaoCoordenadas.mina_id == mina_id))]


@router.post("/minas/{mina_id}/transformacoes/calibrar", status_code=201)
def calibrar(mina_id: uuid.UUID, request: Request, arquivo: UploadFile = File(...), membro_origem: str = Form(...),
             membro_destino: str = Form(...), nome: str = Form(..., min_length=3), u: Usuario = Depends(TRANSFORMAR),
             db: Session = Depends(obter_sessao)) -> dict:
    """Calcula a translação usada pela topografia a partir do mesmo levantamento em dois sistemas."""
    _mina(db, mina_id)
    a, dados, nome_zip = _zip(request, db, arquivo, u)
    try:
        r = service.calibrar(S.ler_do_zip(dados, membro_origem), S.ler_do_zip(dados, membro_destino))
    except S.ShapefileInvalido as e:
        raise ErroAplicacao(422, "shapefile_invalido", str(e)) from e
    if not r["srid_origem"] or not r["srid_destino"]:
        raise ErroAplicacao(422, "crs_obrigatorio", "Os dois arquivos precisam do .prj com o sistema de coordenadas.")
    t = TransformacaoCoordenadas(mina_id=mina_id, nome=nome, srid_origem=r["srid_origem"], srid_destino=r["srid_destino"],
                                 metodo="translacao", parametros={"dx": r["dx"], "dy": r["dy"], "dz": r["dz"]},
                                 residuo_medio_m=r["residuo_medio_m"], residuo_max_m=r["residuo_max_m"], pontos_calibracao=r["pontos"],
                                 origem_calibracao=f"{nome_zip}: {membro_origem} → {membro_destino} (sha256 {a.sha256[:12]}…)")
    db.add(t)
    db.flush()
    return {"id": t.id, **r}


@router.post("/transformacoes/{tid}/aprovar")
def aprovar_transformacao(tid: uuid.UUID, u: Usuario = Depends(TRANSFORMAR), db: Session = Depends(obter_sessao)) -> dict:
    t = db.get(TransformacaoCoordenadas, tid)
    if t is None:
        raise ErroAplicacao(404, "nao_encontrado", "Transformação não encontrada.")
    t.aprovada, t.aprovada_por, t.aprovada_em = True, u.id, agora()
    db.flush()
    return {"id": t.id, "aprovada": True}


# ------------------------------------------------------------------ eixos
class NovoEixo(BaseModel):
    pontos: list[list[float]] | None = Field(default=None, description="[[x, y, z], …] no sistema da mina, na ordem do chainage")
    feicao_id: uuid.UUID | None = None
    inverter: bool = False
    inicio_descricao: str | None = Field(default=None, max_length=120)
    observacao: str | None = None


def _eixo_saida(v: EixoVersao) -> dict:
    g = de_wkb(v.geom)
    return {"id": v.id, "numero": v.numero, "vertices": v.vertices, "comprimento_3d": round(v.comprimento_3d, 3),
            "comprimento_2d": round(v.comprimento_2d, 3), "origem": v.origem, "inicio_descricao": v.inicio_descricao,
            "observacao": v.observacao, "vigente": v.vigente, "criado_em": v.criado_em,
            "coordenadas": shapely.get_coordinates(g, include_z=True).round(3).tolist()}


@router.get("/unidades/{unidade_id}/eixos")
def eixos(unidade_id: uuid.UUID, _u: Usuario = Depends(LER), db: Session = Depends(obter_sessao)) -> list[dict]:
    return [_eixo_saida(v) for v in db.scalars(select(EixoVersao).where(EixoVersao.unidade_id == unidade_id)
                                                .order_by(EixoVersao.numero.desc()))]


@router.post("/unidades/{unidade_id}/eixos", status_code=201)
def criar_eixo(unidade_id: uuid.UUID, e: NovoEixo, u: Usuario = Depends(IMPORTAR), db: Session = Depends(obter_sessao)) -> dict:
    un = db.get(UnidadeOperacional, unidade_id)
    if un is None:
        raise ErroAplicacao(404, "nao_encontrado", "Unidade não encontrada.")
    if (e.pontos is None) == (e.feicao_id is None):
        raise ErroAplicacao(422, "eixo_origem", "Informe os pontos do eixo ou uma feição da topografia.")
    if e.feicao_id:
        f = db.get(FeicaoTopografica, e.feicao_id)
        if f is None:
            raise ErroAplicacao(404, "nao_encontrado", "Feição não encontrada.")
        g = de_wkb(f.geom)
        if g.geom_type != "LineString" or not g.has_z:
            raise ErroAplicacao(422, "feicao_invalida", "Use uma linha única com cota (ex.: 3DPolyline do eixo).")
        pts = shapely.get_coordinates(g, include_z=True)
    else:
        pts = np.asarray(e.pontos, dtype=float)
        if pts.ndim != 2 or pts.shape[1] != 3:
            raise ErroAplicacao(422, "pontos_invalidos", "Cada ponto do eixo precisa de X, Y e Z (o sistema não inventa cotas).")
    if len(pts) < 2 or np.any(np.linalg.norm(np.diff(pts, axis=0), axis=1) == 0):
        raise ErroAplicacao(422, "pontos_invalidos", "O eixo precisa de pelo menos 2 pontos distintos consecutivos.")
    if e.inverter:
        pts = pts[::-1]
    numero = (db.scalar(select(func.max(EixoVersao.numero)).where(EixoVersao.unidade_id == unidade_id)) or 0) + 1
    db.execute(update(EixoVersao).where(EixoVersao.unidade_id == unidade_id).values(vigente=False))
    v = EixoVersao(unidade_id=unidade_id, numero=numero, geom=para_wkb(shapely.linestrings(pts)), vertices=len(pts),
                   comprimento_3d=float(C.comprimentos(pts)[-1]), comprimento_2d=C.comprimento_2d(pts),
                   origem="feicao" if e.feicao_id else "pontos", feicao_id=e.feicao_id, inicio_descricao=e.inicio_descricao,
                   observacao=e.observacao, criado_por=u.id)
    db.add(v)
    db.flush()
    return _eixo_saida(v)


def _transformar_ponto(db: Session, mina: Mina, srid: int, xyz: list[float]) -> tuple[list[float] | None, uuid.UUID | None, str | None]:
    if srid == mina.srid_trabalho:
        return xyz, None, None
    t = db.scalar(select(TransformacaoCoordenadas).where(
        TransformacaoCoordenadas.mina_id == mina.id, TransformacaoCoordenadas.srid_origem == srid,
        TransformacaoCoordenadas.srid_destino == mina.srid_trabalho, TransformacaoCoordenadas.aprovada.is_(True)))
    if t is None:
        return None, None, f"coordenadas em EPSG:{srid} e nenhuma transformação aprovada para EPSG:{mina.srid_trabalho}"
    p = dict(t.parametros)
    out = [xyz[0] + p["dx"], xyz[1] + p["dy"]] + ([xyz[2] + p.get("dz", 0)] if len(xyz) == 3 else [])
    return out, t.id, None


@router.post("/unidades/{unidade_id}/eixos/posicoes")
def calcular_posicoes(unidade_id: uuid.UUID, _u: Usuario = Depends(IMPORTAR), db: Session = Depends(obter_sessao)) -> dict:
    """Projeta no eixo vigente as amostras, fichas e avanços desta unidade (e do que está dentro dela) que têm coordenadas."""
    un = db.get(UnidadeOperacional, unidade_id)
    v = db.scalar(select(EixoVersao).where(EixoVersao.unidade_id == unidade_id, EixoVersao.vigente.is_(True)))
    if un is None or v is None:
        raise ErroAplicacao(422, "sem_eixo", "A unidade não tem eixo vigente.")
    mina = db.get(Mina, un.mina_id)
    eixo = shapely.get_coordinates(de_wkb(v.geom), include_z=True)
    sub = select(UnidadeOperacional.id).where(UnidadeOperacional.caminho.like(un.caminho + "%"))
    objetos = []
    for a in db.scalars(select(Amostra).where(Amostra.unidade_id.in_(sub), Amostra.x.is_not(None))):
        objetos.append(("amostra_id", a.id, a.codigo, a.srid, [a.x, a.y] + ([a.z] if a.z is not None else [])))
    for m in db.scalars(select(Mapeamento).where(Mapeamento.unidade_id.in_(sub), Mapeamento.x.is_not(None))):
        objetos.append(("mapeamento_id", m.id, m.numero, mina.srid_trabalho, [m.x, m.y] + ([m.z] if m.z is not None else [])))
    for f in db.scalars(select(FrenteAvanco).where(FrenteAvanco.frente_id.in_(sub), FrenteAvanco.x.is_not(None))):
        objetos.append(("avanco_id", f.id, f"avanço {f.data:%d/%m/%Y}", mina.srid_trabalho, [f.x, f.y] + ([f.z] if f.z is not None else [])))
    resultado, ignorados = [], []
    for campo, oid, rotulo, srid, xyz in objetos:
        p, tid, motivo = _transformar_ponto(db, mina, srid, xyz)
        if p is None:
            ignorados.append({"objeto": rotulo, "motivo": motivo})
            continue
        pr = C.projetar(eixo, p)
        existente = db.scalar(select(PosicaoEixo).filter_by(eixo_versao_id=v.id, **{campo: oid}))
        if existente:
            db.delete(existente)
            db.flush()
        db.add(PosicaoEixo(eixo_versao_id=v.id, chainage_m=pr.chainage, afastamento_m=pr.afastamento, ambigua=pr.ambigua,
                           alternativa_m=pr.alternativa, transformacao_id=tid, **{campo: oid}))
        alertas = []
        if pr.afastamento > TOLERANCIA_AFASTAMENTO:
            alertas.append(f"a {pr.afastamento:.1f} m do eixo")
        if pr.ambigua:
            alertas.append(f"posição ambígua (também perto de {pr.alternativa:.1f} m)")
        if len(p) == 2:
            alertas.append("sem cota: projetado em planta")
        resultado.append({"tipo": campo.replace("_id", ""), "objeto": rotulo, "chainage_m": round(pr.chainage, 2),
                          "afastamento_m": round(pr.afastamento, 2), "alertas": alertas, "convertido": tid is not None})
    db.flush()
    return {"eixo_versao": v.numero, "comprimento_3d": round(v.comprimento_3d, 2),
            "posicoes": sorted(resultado, key=lambda r: r["chainage_m"]), "ignorados": ignorados}


@router.get("/unidades/{unidade_id}/posicoes")
def posicoes(unidade_id: uuid.UUID, _u: Usuario = Depends(LER), db: Session = Depends(obter_sessao)) -> list[dict]:
    v = db.scalar(select(EixoVersao).where(EixoVersao.unidade_id == unidade_id, EixoVersao.vigente.is_(True)))
    if v is None:
        return []
    out = []
    for p in db.scalars(select(PosicaoEixo).where(PosicaoEixo.eixo_versao_id == v.id).order_by(PosicaoEixo.chainage_m)):
        if p.amostra_id:
            rot, tipo = db.scalar(select(Amostra.codigo).where(Amostra.id == p.amostra_id)), "amostra"
        elif p.mapeamento_id:
            rot, tipo = db.scalar(select(Mapeamento.numero).where(Mapeamento.id == p.mapeamento_id)), "mapeamento"
        else:
            rot, tipo = "avanço", "avanco"
        out.append({"tipo": tipo, "objeto": rot, "objeto_id": p.amostra_id or p.mapeamento_id or p.avanco_id,
                    "chainage_m": round(p.chainage_m, 2), "afastamento_m": round(p.afastamento_m, 2), "ambigua": p.ambigua,
                    "eixo_versao": v.numero})
    return out
