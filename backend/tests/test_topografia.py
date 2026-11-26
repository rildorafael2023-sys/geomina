"""Etapa 10 — importação de topografia, transformações, eixos e chainage (API)."""

import io
import os
import struct
import zipfile
from pathlib import Path

import pyproj
import pytest
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError

from tests.conftest import cab, criar_usuario

API = "/api/v1"
ZIP_REAL = Path(os.environ.get("GEOMINA_TOPO_ZIP", "/nao/existe"))
X0, Y0 = 500000.0, 7800000.0
DX, DY = -46.367, -43.899


def prj(epsg):
    return pyproj.CRS.from_epsg(epsg).to_wkt("WKT1_ESRI")


def shapefile(feicoes):
    """PolyLineZ com várias feições: [(layer, [(x, y, z), …]), …] → (shp, shx, dbf)."""
    regs, idx, off = [], [], 50
    for i, (_, pts) in enumerate(feicoes, 1):
        n = len(pts)
        corpo = struct.pack("<i", 13) + struct.pack("<4d", 0, 0, 0, 0) + struct.pack("<ii", 1, n) + struct.pack("<i", 0)
        corpo += b"".join(struct.pack("<2d", x, y) for x, y, _ in pts) + struct.pack("<2d", 0, 0)
        corpo += b"".join(struct.pack("<d", z) for *_, z in pts)
        regs.append(struct.pack(">ii", i, len(corpo) // 2) + corpo)
        idx.append(struct.pack(">ii", off, len(corpo) // 2))
        off += 4 + len(corpo) // 2
    corpo = b"".join(regs)

    def cab_(tam):
        return struct.pack(">i", 9994) + b"\0" * 20 + struct.pack(">i", tam // 2) + struct.pack("<ii", 1000, 13) + b"\0" * 64
    shp = cab_(100 + len(corpo)) + corpo
    shx = cab_(100 + 8 * len(idx)) + b"".join(idx)
    campos = b"Layer" + b"\0" * 6 + b"C" + b"\0" * 4 + bytes([20, 0]) + b"\0" * 14
    dbf = struct.pack("<BBBBIHH", 3, 26, 1, 1, len(feicoes), 65, 21) + b"\0" * 20 + campos + b"\r"
    dbf += b"".join(b" " + layer.ljust(20).encode() for layer, _ in feicoes) + b"\x1a"
    return shp, shx, dbf


def zipar(camadas):
    """{nome: (feicoes, epsg)} → bytes do zip."""
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as z:
        for nome, (feicoes, epsg) in camadas.items():
            shp, shx, dbf = shapefile(feicoes)
            z.writestr(f"{nome}.shp", shp)
            z.writestr(f"{nome}.shx", shx)
            z.writestr(f"{nome}.dbf", dbf)
            z.writestr(f"{nome}.cpg", "UTF-8")
            if epsg:
                z.writestr(f"{nome}.prj", prj(epsg))
    return buf.getvalue()


GALERIA = [
    ("EIXO", [(X0, Y0, 500.0), (X0 + 100, Y0, 500.0), (X0 + 100, Y0 + 50, 490.0)]),
    ("PAREDE", [(X0, Y0 + 2, 501.0), (X0 + 98, Y0 + 2, 501.0)]),
    ("PAREDE", [(X0, Y0 - 2, 501.0), (X0 + 102, Y0 - 2, 501.0)]),
    ("TEXTO", [(X0 + 10, Y0, 0.0), (X0 + 20, Y0, 0.0)]),
]


def sad(feicoes):
    return [(layer, [(x - DX, y - DY, z) for x, y, z in pts]) for layer, pts in feicoes]


@pytest.fixture
def h(token_admin):
    return cab(token_admin)


@pytest.fixture
def mina(cliente, h):
    return cliente.post(f"{API}/minas", headers=h, json={"codigo": "MINA01", "nome": "Mina 01", "srid_trabalho": 31983}).json()


def analisar(cliente, h, mina, dados, nome="topo.zip"):
    r = cliente.post(f"{API}/minas/{mina['id']}/topografia/importacoes", headers=h, files={"arquivo": (nome, dados)})
    assert r.status_code == 201, r.text
    return r.json()


def confirmar(cliente, h, imp, membro, **kw):
    return cliente.post(f"{API}/importacoes/{imp['id']}/confirmar-topografia", headers=h,
                        json={"membro": membro, "codigo": kw.pop("codigo", "TOPO-2026-09"), **kw})


def test_importacao_mesmo_sistema_eixo_e_chainage(cliente, h, mina):
    imp = analisar(cliente, h, mina, zipar({"galeria": (GALERIA, 31983)}))
    c = imp["camadas"][0]
    assert c["epsg"] == 31983 and c["compatibilidade"] == "mesmo_crs" and c["feicoes"] == 4 and c["com_z"]
    cad = {x["nome"]: x for x in c["camadas_cad"]}
    assert cad["TEXTO"]["z_suspeito"] and not cad["PAREDE"]["z_suspeito"]

    r = confirmar(cliente, h, imp, "galeria.shp", camadas_excluidas=[])
    assert r.status_code == 200, r.text
    assert r.json()["feicoes"] == 4 and r.json()["transformacao"] == "nenhuma" and r.json()["camadas_z_suspeito"] == ["TEXTO"]
    assert confirmar(cliente, h, imp, "galeria.shp", codigo="OUTRO").json()["codigo"] == "importacao_encerrada"

    lev = cliente.get(f"{API}/minas/{mina['id']}/levantamentos", headers=h).json()
    assert len(lev) == 1 and lev[0]["feicoes"] == 4 and lev[0]["extensao"][2] == 0.0
    geo = cliente.get(f"{API}/minas/{mina['id']}/topografia/geometria", headers=h).json()
    assert geo["feicoes"] == 3, "camada com Z suspeito fica fora do desenho por padrão"
    assert {c["nome"] for c in geo["camadas"]} == {"EIXO", "PAREDE"}
    eixo_f = geo["camadas"][0]["feicoes"][0]
    o = geo["origem"]
    assert [o[0] + eixo_f["c"][0][0][0], o[1] + eixo_f["c"][0][0][1]] == [X0, Y0], "coordenadas relativas exatas"
    geo = cliente.get(f"{API}/minas/{mina['id']}/topografia/geometria", headers=h,
                      params={"incluir_z_suspeito": True, "bbox": f"{X0 + 99},{Y0 + 10},{X0 + 101},{Y0 + 60}"}).json()
    assert geo["feicoes"] == 1, "R*Tree: só o eixo passa pelo trecho norte"

    # eixo a partir da feição da topografia
    n = cliente.post(f"{API}/unidades", headers=h, json={"mina_id": mina["id"], "tipo": "NIVEL", "codigo": "N144", "nome": "N144"}).json()
    g = cliente.post(f"{API}/unidades", headers=h, json={"mina_id": mina["id"], "tipo": "GALERIA", "codigo": "GAL-1", "nome": "Galeria 1",
                                                       "pai_id": n["id"]}).json()
    r = cliente.post(f"{API}/unidades/{n['id']}/eixos", headers=h, json={"feicao_id": eixo_f["id"]})
    assert r.status_code == 422 and r.json()["codigo"] == "regra_violada", "nível não tem eixo"
    r = cliente.post(f"{API}/unidades/{g['id']}/eixos", headers=h, json={"feicao_id": eixo_f["id"], "inicio_descricao": "emboque"})
    assert r.status_code == 201, r.text
    assert round(r.json()["comprimento_3d"], 3) == round(100 + (50**2 + 10**2) ** 0.5, 3) and r.json()["comprimento_2d"] == 150

    # amostra em SIRGAS, amostra em SAD69 sem transformação aprovada, ficha sem cota
    a = cliente.post(f"{API}/minas/{mina['id']}/amostras", headers=h,
                     json={"codigo": "BS-RP-1", "unidade_id": g["id"], "x": X0 + 40, "y": Y0 + 3, "z": 500, "srid": 31983})
    assert a.status_code == 201, a.text
    cliente.post(f"{API}/minas/{mina['id']}/amostras", headers=h,
                 json={"codigo": "BS-RP-2", "unidade_id": g["id"], "x": X0 + 60 - DX, "y": Y0 - DY, "z": 500, "srid": 29193})
    r = cliente.post(f"{API}/unidades/{g['id']}/eixos/posicoes", headers=h)
    assert r.status_code == 200, r.text
    p = r.json()
    assert [(x["objeto"], x["chainage_m"], x["afastamento_m"]) for x in p["posicoes"]] == [("BS-RP-1", 40.0, 3.0)]
    assert p["ignorados"][0]["objeto"] == "BS-RP-2" and "nenhuma transformação aprovada" in p["ignorados"][0]["motivo"]

    # transformação SAD → SIRGAS calibrada e aprovada: BS-RP-2 entra
    dados = zipar({"sad": (sad(GALERIA), 29193), "sirgas": (GALERIA, 31983)})
    r = cliente.post(f"{API}/minas/{mina['id']}/transformacoes/calibrar", headers=h, files={"arquivo": ("par.zip", dados)},
                     data={"membro_origem": "sad.shp", "membro_destino": "sirgas.shp", "nome": "SAD69→SIRGAS topografia"})
    assert r.status_code == 201, r.text
    t = r.json()
    assert (t["dx"], t["dy"], t["srid_origem"], t["srid_destino"]) == (DX, DY, 29193, 31983) and t["residuo_max_m"] < 0.001
    assert t["proj_erro_medio_m"] > 0.5, "PROJ padrão difere da topografia da mina"
    cliente.post(f"{API}/transformacoes/{t['id']}/aprovar", headers=h)
    p = cliente.post(f"{API}/unidades/{g['id']}/eixos/posicoes", headers=h).json()
    assert [(x["objeto"], x["chainage_m"], x["convertido"]) for x in p["posicoes"]] == [("BS-RP-1", 40.0, False), ("BS-RP-2", 60.0, True)]
    pos = cliente.get(f"{API}/unidades/{g['id']}/posicoes", headers=h).json()
    assert [x["objeto"] for x in pos] == ["BS-RP-1", "BS-RP-2"]

    # nova versão do eixo invertida: a anterior deixa de ser vigente; posições recalculadas na nova
    r = cliente.post(f"{API}/unidades/{g['id']}/eixos", headers=h, json={"feicao_id": eixo_f["id"], "inverter": True})
    eixos = cliente.get(f"{API}/unidades/{g['id']}/eixos", headers=h).json()
    assert [(e["numero"], e["vigente"]) for e in eixos] == [(2, True), (1, False)]
    assert cliente.get(f"{API}/unidades/{g['id']}/posicoes", headers=h).json() == []
    p = cliente.post(f"{API}/unidades/{g['id']}/eixos/posicoes", headers=h).json()
    total = eixos[0]["comprimento_3d"]
    assert [x["chainage_m"] for x in p["posicoes"]] == [round(total - 60, 2), round(total - 40, 2)]


def test_sad69_exige_escolha_de_transformacao_e_registra(cliente, h, mina):
    imp = analisar(cliente, h, mina, zipar({"sad": (sad(GALERIA), 29193)}))
    c = imp["camadas"][0]
    assert c["compatibilidade"] == "transformar" and [o["id"] for o in c["transformacoes"]] == ["proj"]
    r = confirmar(cliente, h, imp, "sad.shp")
    assert r.status_code == 422 and r.json()["codigo"] == "transformacao_obrigatoria"
    r = confirmar(cliente, h, imp, "sad.shp", transformacao="proj", camadas_excluidas=["TEXTO"])
    assert r.status_code == 200 and r.json()["feicoes"] == 3 and r.json()["transformacao"].startswith("PROJ")
    f = cliente.get(f"{API}/minas/{mina['id']}/topografia/geometria", headers=h).json()["camadas"][0]["feicoes"][0]
    d = cliente.get(f"{API}/feicoes/{f['id']}", headers=h).json()
    assert d["convertida"] and abs(d["coordenadas"][0][0] - X0) < 5, "PROJ fica a poucos metros da translação da mina"
    assert d["coordenadas"][0][2] == 500.0, "a cota não é alterada"


def test_crs_desconhecido_exige_declaracao(cliente, h, mina):
    imp = analisar(cliente, h, mina, zipar({"semprj": (GALERIA, None)}))
    assert imp["camadas"][0]["compatibilidade"] == "crs_desconhecido"
    assert confirmar(cliente, h, imp, "semprj.shp").json()["codigo"] == "crs_obrigatorio"
    assert confirmar(cliente, h, imp, "semprj.shp", srid_declarado=31983).status_code == 200


def test_validacoes_e_permissoes(cliente, h, mina, token_admin):
    r = cliente.post(f"{API}/minas/{mina['id']}/topografia/importacoes", headers=h, files={"arquivo": ("x.zip", b"nao e zip")})
    assert r.status_code == 422 and r.json()["codigo"] == "formato"
    _, tecnico = criar_usuario(cliente, token_admin, "tec", ["TECNICO"])
    r = cliente.post(f"{API}/minas/{mina['id']}/topografia/importacoes", headers=cab(tecnico), files={"arquivo": ("t.zip", zipar({"a": (GALERIA, 31983)}))})
    assert r.status_code == 403
    assert cliente.get(f"{API}/minas/{mina['id']}/levantamentos", headers=cab(tecnico)).status_code == 200
    n = cliente.post(f"{API}/unidades", headers=h, json={"mina_id": mina["id"], "tipo": "NIVEL", "codigo": "N1", "nome": "N1"}).json()
    g = cliente.post(f"{API}/unidades", headers=h, json={"mina_id": mina["id"], "tipo": "GALERIA", "codigo": "G1", "nome": "G1",
                                                       "pai_id": n["id"]}).json()
    r = cliente.post(f"{API}/unidades/{g['id']}/eixos", headers=h, json={"pontos": [[0, 0], [10, 0]]})
    assert r.json()["codigo"] == "pontos_invalidos", "sem cota não vira eixo"
    r = cliente.post(f"{API}/unidades/{g['id']}/eixos", headers=h, json={"pontos": [[0, 0, 0], [0, 0, 0], [5, 0, 0]]})
    assert r.json()["codigo"] == "pontos_invalidos"
    r = cliente.post(f"{API}/unidades/{g['id']}/eixos", headers=h, json={"pontos": [[0, 0, 0], [30, 40, 0]]})
    assert r.status_code == 201 and r.json()["comprimento_3d"] == 50
    assert cliente.post(f"{API}/unidades/{n['id']}/eixos/posicoes", headers=h).json()["codigo"] == "sem_eixo"


def test_feicao_e_eixo_imutaveis(app, cliente, h, mina):
    imp = analisar(cliente, h, mina, zipar({"g": (GALERIA, 31983)}))
    confirmar(cliente, h, imp, "g.shp")
    with app.state.engine.begin() as c, pytest.raises(IntegrityError, match="topografia:"):
        c.execute(text("UPDATE feicao_topografica SET camada_cad='X'"))
    with app.state.engine.begin() as c, pytest.raises(IntegrityError, match="topografia:"):
        c.execute(text("DELETE FROM feicao_topografica"))


@pytest.mark.skipif(not ZIP_REAL.exists(), reason="topografia real não disponível nesta máquina")
def test_zip_real_importa_e_calibra(cliente, h, mina):
    dados = ZIP_REAL.read_bytes()
    imp = analisar(cliente, h, mina, dados, "real.zip")
    camadas = {c["membro"]: c for c in imp["camadas"]}
    sad_ = next(m for m in camadas if "/SAD/" in m and m.endswith("_Piso.shp"))  # mesmo levantamento do SIRGAS
    sir = next(m for m in camadas if "/SIRGAS/" in m)
    assert camadas[sad_]["epsg"] == 29193 and camadas[sir]["epsg"] == 31983
    r = confirmar(cliente, h, imp, sir, codigo="REAL")
    assert r.status_code == 200, r.text
    assert r.json()["feicoes"] == camadas[sir]["feicoes"] - camadas[sir]["vazias"]
    r = cliente.post(f"{API}/minas/{mina['id']}/transformacoes/calibrar", headers=h, files={"arquivo": ("real.zip", dados)},
                     data={"membro_origem": sad_, "membro_destino": sir, "nome": "SAD69→SIRGAS mina"})
    t = r.json()
    assert abs(t["dx"] - DX) < 0.01 and abs(t["dy"] - DY) < 0.01 and t["residuo_medio_m"] < 0.01, t
    assert t["proj_erro_medio_m"] > 1
