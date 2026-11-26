"""Importação de levantamentos, transformações e posições ao longo do eixo."""

from __future__ import annotations

import collections
import uuid

import numpy as np
import pyproj
import shapely
from pyproj.transformer import TransformerGroup
from sqlalchemy import insert, select
from sqlalchemy.orm import Session

from geomina.core.erros import ErroAplicacao
from geomina.espacial import shapefile as S
from geomina.espacial.geometria import para_wkb
from geomina.modules.topografia.models import FeicaoTopografica, TransformacaoCoordenadas

pyproj.network.set_network_enabled(False)  # nunca baixar grades/parametros da internet

LIMITE_Z_SUSPEITO = 200.0


# ------------------------------------------------------------------ análise
def analisar_camada(c: S.Camada, srid_mina: int) -> dict:
    epsg, nome_crs = S.crs_do_prj(c.prj)
    vazias = sum(f.vazia for f in c.feicoes)
    com_z = c.tipo in S.COM_Z
    pts = [p for f in c.feicoes for p in f.partes if len(p)]
    xyz = np.vstack(pts) if pts else np.zeros((0, 3 if com_z else 2))
    camadas = collections.defaultdict(lambda: {"feicoes": 0, "z": []})
    for f in c.feicoes:
        nome = (f.atributos or {}).get("Layer") or "(sem camada)"
        camadas[nome]["feicoes"] += 1
        if com_z:
            for p in f.partes:
                if len(p):
                    camadas[nome]["z"].append(p[:, 2])
    resumo_camadas = []
    medianas = []
    for nome, d in camadas.items():
        z = np.concatenate(d["z"]) if d["z"] else np.array([])
        info = {"nome": nome, "feicoes": d["feicoes"]}
        if len(z):
            info.update(z_min=round(float(z.min()), 2), z_mediana=round(float(np.median(z)), 2), z_max=round(float(z.max()), 2),
                        fracao_zero=round(float(np.mean(z == 0)), 3))
            medianas.append(info["z_mediana"])
        resumo_camadas.append(info)
    referencia = float(np.median(medianas)) if medianas else None
    for info in resumo_camadas:
        if "z_mediana" in info:
            info["z_suspeito"] = bool(abs(info["z_mediana"] - referencia) > LIMITE_Z_SUSPEITO or info["fracao_zero"] > 0.5)
    if epsg is None:
        compat = "crs_desconhecido"
    elif epsg == srid_mina:
        compat = "mesmo_crs"
    else:
        compat = "transformar"
    const_z = sum(1 for f in c.feicoes for p in f.partes if com_z and len(p) > 1 and np.ptp(p[:, 2]) == 0)
    return {
        "camada": c.nome, "tipo": S.NOMES.get(c.tipo, str(c.tipo)), "com_z": com_z, "feicoes": len(c.feicoes), "vazias": vazias,
        "vertices": int(len(xyz)), "campos": [n for n, _ in c.campos], "epsg": epsg, "crs_nome": nome_crs,
        "compatibilidade": compat, "srid_mina": srid_mina,
        "extensao": None if not len(xyz) else {k: round(float(v), 3) for k, v in zip(
            ("minx", "maxx", "miny", "maxy"), (xyz[:, 0].min(), xyz[:, 0].max(), xyz[:, 1].min(), xyz[:, 1].max()), strict=True)},
        "z_min": round(float(xyz[:, 2].min()), 2) if com_z and len(xyz) else None,
        "z_max": round(float(xyz[:, 2].max()), 2) if com_z and len(xyz) else None,
        "feicoes_z_constante": const_z, "cota_referencia": referencia,
        "camadas_cad": sorted(resumo_camadas, key=lambda x: -x["feicoes"]),
    }


def opcoes_transformacao(db: Session, mina_id: uuid.UUID, origem: int, destino: int) -> list[dict]:
    ops = []
    for t in db.scalars(select(TransformacaoCoordenadas).where(
            TransformacaoCoordenadas.mina_id == mina_id, TransformacaoCoordenadas.srid_origem == origem,
            TransformacaoCoordenadas.srid_destino == destino)):
        ops.append({"id": str(t.id), "nome": t.nome, "metodo": t.metodo, "aprovada": t.aprovada,
                    "residuo_medio_m": t.residuo_medio_m, "residuo_max_m": t.residuo_max_m, "origem_calibracao": t.origem_calibracao})
    g = TransformerGroup(f"EPSG:{origem}", f"EPSG:{destino}", always_xy=True)
    if g.transformers:
        ops.append({"id": "proj", "nome": f"PROJ: {g.transformers[0].description}", "metodo": "proj", "aprovada": True,
                    "precisao_m": g.transformers[0].accuracy if g.transformers[0].accuracy >= 0 else None,
                    "observacao": "Parâmetros oficiais padrão, sem calibração com a topografia da mina."})
    return ops


# ------------------------------------------------------------------ transformação
def transformador(db: Session, escolha: str | None, origem: int, destino: int):
    """Retorna (função xyz->xyz, transformacao_id ou None, descrição)."""
    if origem == destino:
        return (lambda a: a), None, "nenhuma"
    if not escolha:
        raise ErroAplicacao(422, "transformacao_obrigatoria",
                            f"Os dados estão em EPSG:{origem} e a mina em EPSG:{destino}: escolha a transformação.")
    if escolha == "proj":
        tr = pyproj.Transformer.from_crs(f"EPSG:{origem}", f"EPSG:{destino}", always_xy=True)

        def f(a):
            x, y = tr.transform(a[:, 0], a[:, 1])
            return np.column_stack([x, y, a[:, 2]]) if a.shape[1] == 3 else np.column_stack([x, y])
        return f, None, f"PROJ: {tr.description}"
    t = db.get(TransformacaoCoordenadas, uuid.UUID(escolha))
    if t is None or (t.srid_origem, t.srid_destino) != (origem, destino):
        raise ErroAplicacao(422, "transformacao_invalida", "Transformação inexistente ou para outros sistemas.")
    if not t.aprovada:
        raise ErroAplicacao(422, "transformacao_nao_aprovada", "A transformação ainda não foi aprovada por um revisor.")
    dx, dy, dz = t.parametros["dx"], t.parametros["dy"], t.parametros.get("dz", 0.0)

    def g(a):
        b = a.copy()
        b[:, 0] += dx
        b[:, 1] += dy
        if b.shape[1] == 3:
            b[:, 2] += dz
        return b
    return g, t.id, t.nome


def calibrar(origem: S.Camada, destino: S.Camada) -> dict:
    """Translação média entre dois arquivos da mesma topografia em sistemas diferentes (pares por registro)."""
    if len(origem.feicoes) != len(destino.feicoes):
        raise ErroAplicacao(422, "arquivos_diferentes", "Os dois arquivos não têm o mesmo número de registros.")
    a, b = [], []
    for fa, fb in zip(origem.feicoes, destino.feicoes, strict=True):
        for pa, pb in zip(fa.partes, fb.partes, strict=False):
            if len(pa) == len(pb) and len(pa):
                a.append(pa)
                b.append(pb)
    if not a:
        raise ErroAplicacao(422, "sem_pares", "Nenhum par de vértices correspondente.")
    pa, pb = np.vstack(a), np.vstack(b)
    d = pb - pa
    media = d.mean(axis=0)
    residuo = np.linalg.norm(d[:, :2] - media[:2], axis=1)
    ea, eb = S.crs_do_prj(origem.prj)[0], S.crs_do_prj(destino.prj)[0]
    resultado = {"srid_origem": ea, "srid_destino": eb, "dx": round(float(media[0]), 4), "dy": round(float(media[1]), 4),
                 "dz": round(float(media[2]), 4) if d.shape[1] == 3 else 0.0, "pontos": int(len(pa)),
                 "residuo_medio_m": round(float(residuo.mean()), 4), "residuo_max_m": round(float(residuo.max()), 4)}
    if ea and eb:
        tr = pyproj.Transformer.from_crs(f"EPSG:{ea}", f"EPSG:{eb}", always_xy=True)
        x, y = tr.transform(pa[:, 0], pa[:, 1])
        erro = np.hypot(x - pb[:, 0], y - pb[:, 1])
        resultado["proj_descricao"] = tr.description
        resultado["proj_erro_medio_m"] = round(float(erro.mean()), 3)
    return resultado


# ------------------------------------------------------------------ gravação das feições
def _geometria(tipo: int, partes: list[np.ndarray]):
    if tipo in (1, 11, 21):
        return shapely.points(partes[0][0])
    if tipo in (8, 18, 28):
        return shapely.multipoints(partes[0])
    if tipo in (3, 13, 23):
        linhas = [shapely.linestrings(p) for p in partes if len(p) >= 2]
        if not linhas:
            return None
        return linhas[0] if len(linhas) == 1 else shapely.multilinestrings(linhas)
    aneis = [p for p in partes if len(p) >= 4]
    if not aneis:
        return None
    return shapely.polygons(aneis[0], holes=aneis[1:] or None)


def gravar_feicoes(db: Session, levantamento_id: uuid.UUID, c: S.Camada, f_trans, excluir: set[str],
                   suspeitas: set[str]) -> tuple[int, int, np.ndarray]:
    linhas, gravadas, vertices = [], 0, 0
    todas = []
    for f in c.feicoes:
        camada = (f.atributos or {}).get("Layer")
        if f.vazia or (camada or "(sem camada)") in excluir:
            continue
        originais = [p for p in f.partes if len(p)]
        convertidas = [f_trans(p) for p in originais]
        g = _geometria(f.tipo, convertidas)
        if g is None:
            continue
        xyz = np.vstack(convertidas)
        todas.append(xyz)
        tem_z = xyz.shape[1] == 3
        mudou = any(not np.array_equal(a, b) for a, b in zip(originais, convertidas, strict=True))
        linhas.append({
            "id": uuid.uuid4(), "levantamento_id": levantamento_id, "indice_origem": f.indice, "tipo": S.NOMES[f.tipo],
            "dimensao": 3 if tem_z else 2, "camada_cad": camada, "entidade_cad": (f.atributos or {}).get("Entity"),
            "z_suspeito": (camada or "(sem camada)") in suspeitas,
            "atributos": {k: v for k, v in (f.atributos or {}).items() if v not in (None, "")},
            "geom": para_wkb(g), "geom_original": para_wkb(_geometria(f.tipo, originais)) if mudou else None,
            "minx": float(xyz[:, 0].min()), "maxx": float(xyz[:, 0].max()), "miny": float(xyz[:, 1].min()),
            "maxy": float(xyz[:, 1].max()), "minz": float(xyz[:, 2].min()) if tem_z else None,
            "maxz": float(xyz[:, 2].max()) if tem_z else None,
        })
        vertices += len(xyz)
        if len(linhas) >= 2000:
            db.execute(insert(FeicaoTopografica), linhas)
            gravadas += len(linhas)
            linhas = []
    if linhas:
        db.execute(insert(FeicaoTopografica), linhas)
        gravadas += len(linhas)
    return gravadas, vertices, (np.vstack(todas) if todas else np.zeros((0, 3)))
