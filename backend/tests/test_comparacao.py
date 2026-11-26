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
