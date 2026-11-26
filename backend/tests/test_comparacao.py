"""Etapa 6 — comparação: estatísticas conferidas à mão, correlação, grupos por filtros e faceta de furo."""

import pytest

from geomina.modules.geoop.estatistica import correlacao, descrever
from tests.conftest import cab

API = "/api/v1"


def test_descrever_conferido_a_mao():
    d = descrever([1, 2, 3, 4, 100])
    assert (d["n"], d["min"], d["q1"], d["mediana"], d["q3"], d["max"], d["media"]) == (5, 1, 2, 3, 4, 100, 22)
    assert d["desvio"] == pytest.approx(43.6176, abs=1e-4) and d["cv"] == pytest.approx(198.26, abs=0.01)
    assert d["media_geometrica"] == pytest.approx((1 * 2 * 3 * 4 * 100) ** 0.2)
    assert descrever([]) == {"n": 0} and descrever([5])["desvio"] is None
    assert descrever([0, 5])["media_geometrica"] is None, "média geométrica só com valores positivos"


def test_correlacao():
    c = correlacao([1, 2, 3, 4, 5], [2, 4, 6, 8, 10])
    assert (c["pearson"], c["spearman"], c["n"]) == (1.0, 1.0, 5)
    c = correlacao([1, 2, 3, 4, 5], [1, 4, 9, 16, 1000])
    assert c["spearman"] == 1.0 and c["pearson"] < 0.8, "Spearman pega a relação monotônica; Pearson não"
    assert correlacao([1, None, 3], [1, 2, 3])["pearson"] is None, "menos de 3 pares"
    assert correlacao([1, 1, 1, 1], [1, 2, 3, 4])["pearson"] is None, "variável constante"
    assert correlacao([1, 2, 2, 3], [1, 3, 3, 2])["spearman"] == pytest.approx(1 / 3, abs=1e-4), "postos médios nos empates"


@pytest.fixture
def h(token_admin):
    return cab(token_admin)


def test_comparacao_de_grupos_api(cliente, h):
    m = cliente.post(f"{API}/minas", headers=h, json={"codigo": "MINA01", "nome": "Mina 01", "srid_trabalho": 31983}).json()
    n = cliente.post(f"{API}/unidades", headers=h, json={"mina_id": m["id"], "tipo": "NIVEL", "codigo": "N1", "nome": "N1"}).json()
    ga = cliente.post(f"{API}/unidades", headers=h, json={"mina_id": m["id"], "tipo": "GALERIA", "codigo": "GA", "nome": "GA", "pai_id": n["id"]}).json()
    gb = cliente.post(f"{API}/unidades", headers=h, json={"mina_id": m["id"], "tipo": "GALERIA", "codigo": "GB", "nome": "GB", "pai_id": n["id"]}).json()
    csv = "Amostra;Tipo;Cr (ppm);Be (ppm)\n"
    for i, (g, cr, be) in enumerate([(ga, 100, 1), (ga, 200, 2), (ga, 300, 3), (ga, "<10", 4), (gb, 1000, 9), (gb, 2000, 7), (gb, 3000, 8)]):
        cliente.post(f"{API}/minas/{m['id']}/amostras", headers=h, json={"codigo": f"BS-RP-{i + 1}", "unidade_id": g["id"]})
        csv += f"BS-RP-{i + 1};SMP;{cr};{be}\n"
    p = cliente.post(f"{API}/minas/{m['id']}/laudos", headers=h, files={"arquivo": ("l.csv", csv.encode())}).json()
    cliente.post(f"{API}/importacoes/{p['id']}/confirmar-laudo", headers=h, json={"certificado": "C1"})
    furo = cliente.post(f"{API}/minas/{m['id']}/furos", headers=h, json={"codigo": "F1", "x": 0, "y": 0, "z": 0, "srid": 31983,
                                                                       "azimute": 0, "inclinacao": -90, "profundidade_final": 50}).json()
    corpo = {"analitos": ["Cr", "Be"], "grupos": [{"nome": "Galeria A", "filtros": {"galeria": [ga["id"]]}}, {"nome": "Galeria B", "filtros": {"galeria": [gb["id"]]}},
                                                  {"nome": "Furo F1", "filtros": {"furo": [furo["id"]]}}]}
    d = cliente.post(f"{API}/minas/{m['id']}/geoop/comparacao", headers=h, json=corpo).json()
    a, b, f = d["grupos"]
    assert (a["amostras"], a["analitos"]["Cr"]["estatistica"]["n"], a["analitos"]["Cr"]["no_limite"]) == (4, 3, 1), "<10 fora das estatísticas por padrão"
    assert a["analitos"]["Cr"]["estatistica"]["mediana"] == 200 and b["analitos"]["Cr"]["estatistica"]["media"] == 2000
    assert a["correlacao"]["Cr|Be"]["pearson"] == 1.0 and b["correlacao"]["Cr|Be"]["spearman"] == pytest.approx(-0.5)
    assert a["filtros"] == {"galeria": [ga["id"]]} and a["analitos"]["Cr"]["unidade"] == "ppm"
    assert f["amostras"] == 0 and f["analitos"]["Cr"]["estatistica"] == {"n": 0}, "grupo vazio não inventa números"
    corpo["incluir_limite"] = True
    d = cliente.post(f"{API}/minas/{m['id']}/geoop/comparacao", headers=h, json=corpo).json()
    assert d["grupos"][0]["analitos"]["Cr"]["estatistica"]["n"] == 4 and d["grupos"][0]["analitos"]["Cr"]["estatistica"]["min"] == 10
    r = cliente.get(f"{API}/minas/{m['id']}/geoop/registros", headers=h).json()
    assert {o["rotulo"] for o in r["opcoes"]["furo"]} == {"(sem furo)"}, "faceta de furo existe"
    assert cliente.post(f"{API}/minas/{m['id']}/geoop/comparacao", headers=h, json={"analitos": [], "grupos": []}).status_code == 422


def test_espacial_frente_e_furo(cliente, h):
    m = cliente.post(f"{API}/minas", headers=h, json={"codigo": "MINA01", "nome": "Mina", "srid_trabalho": 31983}).json()
    cliente.post(f"{API}/minas/{m['id']}/amostras", headers=h, json={"codigo": "BS-RP-1", "x": 500000, "y": 7800000, "z": 500, "srid": 31983})
    cliente.post(f"{API}/minas/{m['id']}/amostras", headers=h, json={"codigo": "BS-RP-2", "x": 500010, "y": 7800000, "srid": 31983})  # sem Z
    cliente.post(f"{API}/minas/{m['id']}/amostras", headers=h, json={"codigo": "BS-RP-3", "x": 500046, "y": 7800044, "z": 500, "srid": 29193})
    collar = "furo;x;y;z;azimute;dip;eoh\nF1;500100;7800000;600;0;-90;50\n"
    am = "furo;amostra;de;ate\nF1;BMT-TS-1;10;12\n"
    files = {"collar": ("c.csv", collar.encode()), "amostras": ("a.csv", am.encode())}
    p = cliente.post(f"{API}/minas/{m['id']}/sondagem/importacoes", headers=h, files=files, data={"srid": "31983"}).json()
    cliente.post(f"{API}/importacoes/{p['id']}/confirmar-sondagem", headers=h, json={})
    laudo = "Amostra;Tipo;Cr (ppm)\nBS-RP-1;SMP;500\nBMT-TS-1;SMP;900\nBS-RP-77;SMP;10\n"
    q = cliente.post(f"{API}/minas/{m['id']}/laudos", headers=h, files={"arquivo": ("l.csv", laudo.encode())}).json()
    cliente.post(f"{API}/importacoes/{q['id']}/confirmar-laudo", headers=h, json={"certificado": "C"})
    d = cliente.get(f"{API}/minas/{m['id']}/geoop/espacial", headers=h, params={"analitos": "Cr"}).json()
    assert [(x["codigo"], x["xyz"], x["valores"]["Cr"]["y"]) for x in d["pontos"]] == [("BS-RP-1", [500000, 7800000, 500], 500)]
    s = d["segmentos"][0]
    assert (s["codigo"], s["furo"], s["xyz0"], s["xyz1"], s["estimada"], s["valores"]["Cr"]["y"]) == ("BMT-TS-1", "F1", [500100, 7800000, 590], [500100, 7800000, 588], True, 900)
    motivos = {x["codigo"]: x["motivo"] for x in d["sem_posicao"]}
    assert "sem cota" in motivos["BS-RP-2"] and "nenhuma transformação aprovada" in motivos["BS-RP-3"] and motivos["BS-RP-77"].startswith("só no laudo")
    assert d["trajetorias"][0]["codigo"] == "F1" and d["trajetorias"][0]["pontos"][-1] == [500100, 7800000, 550]
    assert d["unidades"] == {"Cr": "ppm"} and d["srid"] == 31983


def test_consulta_ordem_por_valor_faceta_elemento_e_exportacoes(cliente, h, tmp_path):
    import io
    import json
    import sqlite3
    import struct

    import openpyxl
    import shapely
    m = cliente.post(f"{API}/minas", headers=h, json={"codigo": "MINA01", "nome": "Mina", "srid_trabalho": 31983}).json()
    for i, z in enumerate([500, 501, None]):
        cliente.post(f"{API}/minas/{m['id']}/amostras", headers=h, json={"codigo": f"BS-RP-{i + 1}", "x": 500000 + i, "y": 7800000, "z": z, "srid": 31983})
    collar = "furo;x;y;z;azimute;dip;eoh\nF1;500100;7800000;600;0;-90;50\n"
    files = {"collar": ("c.csv", collar.encode()), "amostras": ("a.csv", b"furo;amostra;de;ate\nF1;BMT-TS-1;10;12\n")}
    p = cliente.post(f"{API}/minas/{m['id']}/sondagem/importacoes", headers=h, files=files, data={"srid": "31983"}).json()
    cliente.post(f"{API}/importacoes/{p['id']}/confirmar-sondagem", headers=h, json={})
    laudo = "Amostra;Tipo;Cr (ppm);Be (ppm)\nBS-RP-1;SMP;500;1\nBS-RP-2;SMP;<10;2\nBMT-TS-1;SMP;900;\n"
    q = cliente.post(f"{API}/minas/{m['id']}/laudos", headers=h, files={"arquivo": ("l.csv", laudo.encode())}).json()
    cliente.post(f"{API}/importacoes/{q['id']}/confirmar-laudo", headers=h, json={"certificado": "C"})
    base = f"{API}/minas/{m['id']}/geoop"
    d = cliente.get(f"{base}/registros", headers=h, params={"ordem": "valor:Cr", "analitos": "Cr"}).json()
    assert [x["codigo"] for x in d["itens"]] == ["BMT-TS-1", "BS-RP-1", "BS-RP-2", "BS-RP-3"], "maior teor primeiro; sem valor no fim"
    assert {o["valor"]: o["n"] for o in d["opcoes"]["analito"]} == {"Cr": 3, "Be": 2, "_nenhum": 1}
    assert cliente.get(f"{base}/registros", headers=h, params={"analito": "Be"}).json()["total"] == 2
    # Excel com metadados
    r = cliente.get(f"{base}/registros.xlsx", headers=h, params={"analitos": "Cr", "serie": "BS-RP"})
    wb = openpyxl.load_workbook(io.BytesIO(r.content))
    linhas = list(wb["Amostras"].iter_rows(values_only=True))
    assert linhas[0][:3] == ("Amostra", "Cadastrada", "Status") and linhas[0][-2:] == ("Cr (ppm) — laudo", "Cr (ppm) — valor numérico")
    assert {x[0]: x[-2:] for x in linhas[1:]} == {"BS-RP-1": ("500", 500), "BS-RP-2": ("<10", 10), "BS-RP-3": (None, None)}
    meta = dict(wb["Metadados"].iter_rows(values_only=True))
    assert "serie=BS-RP" in meta["Filtros aplicados"] and meta["Sistema de coordenadas da mina"] == "EPSG:31983"
    # GeoJSON
    g = json.loads(cliente.get(f"{base}/espacial.geojson", headers=h, params={"analitos": "Cr"}).content)
    tipos = sorted((f["geometry"]["type"], f["properties"]["amostra"]) for f in g["features"])
    assert tipos == [("LineString", "BMT-TS-1"), ("Point", "BS-RP-1"), ("Point", "BS-RP-2")]
    assert g["crs"]["properties"]["name"].endswith("31983") and g["geomina"]["sem_posicao"] == 1
    # GeoPackage: estrutura OGC e geometrias lidas de volta
    arq = tmp_path / "x.gpkg"
    arq.write_bytes(cliente.get(f"{base}/espacial.gpkg", headers=h, params={"analitos": "Cr"}).content)
    db = sqlite3.connect(arq)
    assert db.execute("PRAGMA application_id").fetchone()[0] == 0x47504B47
    assert {r[0] for r in db.execute("SELECT table_name FROM gpkg_contents")} == {"amostras_frente", "intervalos_furo"}
    assert db.execute("SELECT geometry_type_name, srs_id, z FROM gpkg_geometry_columns WHERE table_name='intervalos_furo'").fetchone() == ("LINESTRING", 31983, 1)
    assert "SIRGAS 2000" in db.execute("SELECT definition FROM gpkg_spatial_ref_sys WHERE srs_id=31983").fetchone()[0]
    blob, cod, cr = db.execute('SELECT geom, amostra, "Cr_valor" FROM intervalos_furo').fetchone()
    assert blob[:2] == b"GP" and struct.unpack("<i", blob[4:8])[0] == 31983
    assert shapely.from_wkb(blob[8:]).coords[:] == [(500100, 7800000, 590), (500100, 7800000, 588)] and (cod, cr) == ("BMT-TS-1", 900)
    pts = {c: shapely.from_wkb(b[8:]).coords[0] for b, c in db.execute("SELECT geom, amostra FROM amostras_frente")}
    assert pts == {"BS-RP-1": (500000, 7800000, 500), "BS-RP-2": (500001, 7800000, 501)}


def test_exportacao_ignora_analito_inexistente_ou_malicioso(cliente, h, tmp_path):
    import sqlite3
    m = cliente.post(f"{API}/minas", headers=h, json={"codigo": "MINA01", "nome": "Mina", "srid_trabalho": 31983}).json()
    cliente.post(f"{API}/minas/{m['id']}/amostras", headers=h, json={"codigo": "BS-RP-1", "x": 1, "y": 2, "z": 3, "srid": 31983})
    q = cliente.post(f"{API}/minas/{m['id']}/laudos", headers=h, files={"arquivo": ("l.csv", b"Amostra;Tipo;Cr (ppm)\nBS-RP-1;SMP;5\n")}).json()
    cliente.post(f"{API}/importacoes/{q['id']}/confirmar-laudo", headers=h, json={"certificado": "C"})
    malicioso = 'Cr,x" TEXT); DROP TABLE gpkg_contents; --'
    r = cliente.get(f"{API}/minas/{m['id']}/geoop/espacial.gpkg", headers=h, params={"analitos": malicioso})
    assert r.status_code == 200
    arq = tmp_path / "a.gpkg"
    arq.write_bytes(r.content)
    db = sqlite3.connect(arq)
    assert db.execute("SELECT count(*) FROM gpkg_contents").fetchone()[0] == 2
    colunas = [c[1] for c in db.execute("PRAGMA table_info(amostras_frente)")]
    assert "Cr_valor" in colunas and not any("DROP" in c for c in colunas)
    r = cliente.get(f"{API}/minas/{m['id']}/geoop/registros.xlsx", headers=h, params={"analitos": "Cr,NaoExiste"})
    assert r.status_code == 200
