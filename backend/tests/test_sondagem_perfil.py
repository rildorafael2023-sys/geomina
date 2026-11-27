"""Sondagem (como no vídeo de referência): RQD, caixas, ocorrências, amostragem dos furos, fotos em lote e exportação."""

import io

import pytest
from PIL import Image

from geomina.modules.sondagem import descricao as D
from tests.conftest import cab

API = "/api/v1"

GEO = ("furo;de;ate;litologia;rqd;caixa;descricao\n"
       "F310;0;4;Solo;;;solo argiloso vermelho\n"
       "F310;4;10;Gnaisse pelítico;80;1;gnaisse com pirita disseminada\n"
       "F310;10;12;Flogopita xisto;40;2;flogopitito com esmeralda e molibdenita\n"
       "F310;12;20;Anfibólio gnaisse;95;3;anfibólio gnaisse, sem esmeralda, com calcita\n"
       "INA07;0;5;Solo;;;solo úmido, água a 3 m\n")
COLLAR = "furo;x;y;z;azimute;inclinacao;profundidade;area\nF310;500000;7800000;600;0;-90;20;baixada, curva do rio\nINA07;500100;7800000;610;0;-90;5;\n"
AMOSTRAS = "furo;amostra;de;ate\nF310;BMT-TS-442;10;11\nF310;BMT-TS-443;11;12\n"
LAUDO = "Amostra;Tipo;Be (ppm);Cr (ppm);Li (ppm);MgO (%)\nBMT-TS-442;SMP;28,2;1175;94;12\nBMT-TS-443;SMP;65;2097;72;9\n"


def test_leituras_da_descricao():
    assert D.ocorrencias("flogopitito com esmeralda e molibdenita") == ["esmeralda", "molibdenita"]
    assert D.ocorrencias("gnaisse, sem esmeralda, com calcita") == ["carbonato"]
    assert D.ocorrencias("xisto", marca_esmeralda=True) == ["esmeralda"], "marca à mão"
    assert D.ocorrencias("berilo verde (esmeralda)", marca_esmeralda=False) == []
    assert D.ocorrencias("solo úmido, água a 3 m") == ["agua"]
    assert D.material("Solo", None) == "solo" and D.material("Outros", "material não recuperado") == "nao_recuperado"
    assert D.tipo_furo("INA 07") == "ina" and D.tipo_furo("F310") == "exploratorio"
    assert D.cota(600, -90, 10) == 590 and D.cota(600, -60, 10) == pytest.approx(591.34, abs=0.01)
    assert D.ler_nome_foto("F310_CX29_136,6-137,2.jpg") == {"furo": "F310", "caixa": "29", "de": 136.6, "ate": 137.2}
    assert D.ler_nome_foto("INA07 cx2 12,4 - 15,3.jpg") == {"furo": "INA07", "caixa": "2", "de": 12.4, "ate": 15.3}
    assert D.ler_nome_foto("F-310_caixa_3.png")["caixa"] == "3"
    assert D.ler_nome_foto("IMG_2033.jpg")["de"] is None


@pytest.fixture
def h(token_admin):
    return cab(token_admin)


@pytest.fixture
def mina(cliente, h):
    m = cliente.post(f"{API}/minas", headers=h, json={"codigo": "MINA01", "nome": "Mina 01", "srid_trabalho": 31983}).json()
    files = {"collar": ("c.csv", COLLAR.encode()), "geologia": ("g.csv", GEO.encode()), "amostras": ("a.csv", AMOSTRAS.encode())}
    p = cliente.post(f"{API}/minas/{m['id']}/sondagem/importacoes", headers=h, files=files, data={"srid": "31983"}).json()
    assert cliente.post(f"{API}/importacoes/{p['id']}/confirmar-sondagem", headers=h, json={"ignorar_erros": True}).status_code == 200
    lp = cliente.post(f"{API}/minas/{m['id']}/laudos", headers=h, files={"arquivo": ("l.csv", LAUDO.encode())}).json()
    cliente.post(f"{API}/importacoes/{lp['id']}/confirmar-laudo", headers=h, json={"certificado": "GQ2611017"})
    return m


def _png():
    b = io.BytesIO()
    Image.new("RGB", (30, 20), (90, 120, 90)).save(b, "PNG")
    return b.getvalue()


def test_perfil_com_rqd_caixa_ocorrencias_e_cotas(cliente, h, mina):
    furos = {f["codigo"]: f for f in cliente.get(f"{API}/minas/{mina['id']}/furos", headers=h).json()}
    assert furos["INA07"]["tipo"] == "ina" and furos["F310"]["tipo"] == "exploratorio"
    p = cliente.get(f"{API}/furos/{furos['F310']['id']}/perfil", headers=h, params={"analitos": "*"}).json()
    ints = p["intervalos"]
    assert ints[0]["material"] == "solo" and ints[1]["ocorrencias"] == ["sulfeto"]
    assert ints[2]["ocorrencias"] == ["esmeralda", "molibdenita"] and ints[2]["caixa"] == "2" and ints[2]["classe_rqd"] == "ruim"
    assert (ints[2]["cota_topo"], ints[2]["cota_base"]) == (590, 588)
    assert p["rqd"]["classes"]["excelente"] == 50.0 and p["rqd"]["media"] == pytest.approx((80 * 6 + 40 * 2 + 95 * 8) / 16, abs=0.1)
    assert p["grupos"] == {"Be": "ppm", "Cr": "ppm", "Li": "ppm", "MgO": "%"}
    assert p["furo"]["tipo"] == "exploratorio"
    # marca de esmeralda à mão
    r = cliente.patch(f"{API}/intervalos-furo/{ints[3]['id']}", headers=h, json={"esmeralda": True, "campos": ["esmeralda"]}).json()
    assert r["ocorrencias"][0] == "esmeralda" and r["marca_esmeralda"] is True
    r = cliente.patch(f"{API}/intervalos-furo/{ints[2]['id']}", headers=h, json={"esmeralda": False, "campos": ["esmeralda"]}).json()
    assert "esmeralda" not in r["ocorrencias"]
    r = cliente.patch(f"{API}/intervalos-furo/{ints[2]['id']}", headers=h, json={"campos": ["esmeralda"]}).json()
    assert "esmeralda" in r["ocorrencias"], "sem marca volta a seguir a descrição"


def test_resumo_e_amostragem_dos_furos(cliente, h, mina):
    r = cliente.get(f"{API}/minas/{mina['id']}/sondagem/resumo", headers=h).json()
    assert (r["exploratorios"], r["ina"], r["intervalos"], r["amostras"], r["com_quimica"], r["fotos"]) == (1, 1, 5, 2, 2, 0)
    a = cliente.get(f"{API}/minas/{mina['id']}/sondagem/amostras", headers=h).json()
    am = {x["codigo"]: x for x in a["amostras"]}
    assert am["BMT-TS-442"]["furo"] == "F310" and am["BMT-TS-442"]["litologia"] == "Flogopita xisto"
    assert am["BMT-TS-442"]["localizacao"] == "baixada, curva do rio" and am["BMT-TS-442"]["certificados"] == ["GQ2611017"]
    assert am["BMT-TS-443"]["valores"]["Cr"] == "2097"
    assert [x["codigo"] for x in a["analitos"] if x["grupo"] == "%"] == ["MgO"]


def test_fotos_em_lote_caixas_e_exportacao(cliente, h, mina):
    furos = {f["codigo"]: f for f in cliente.get(f"{API}/minas/{mina['id']}/furos", headers=h).json()}
    arqs = [("arquivos", ("F310_CX2_10-12.png", _png(), "image/png")), ("arquivos", ("F310_CX3.png", _png(), "image/png")),
            ("arquivos", ("F999_CX1_1-2.png", _png(), "image/png"))]
    conf = cliente.post(f"{API}/minas/{mina['id']}/sondagem/fotos", headers=h, files=arqs, data={"conferir": "true"}).json()
    assert conf["gravadas"] == 0 and [x["situacao"] for x in conf["lidas"]] == ["ok", "ok", "furo_nao_encontrado"]
    assert (conf["lidas"][1]["de"], conf["lidas"][1]["ate"]) == (12, 20), "sem De–Até usa o intervalo da caixa no log"
    r = cliente.post(f"{API}/minas/{mina['id']}/sondagem/fotos", headers=h, files=arqs).json()
    assert r["gravadas"] == 2
    c = cliente.get(f"{API}/furos/{furos['F310']['id']}/caixas", headers=h).json()
    assert c["sem_foto"] == ["1"] and c["fotos"] == 2 and c["fotografado_m"] == 10
    csv = cliente.get(f"{API}/minas/{mina['id']}/sondagem/fotos.csv", headers=h, params={"formato": "leapfrog"}).text
    assert "hole_id,from,to,box,image" in csv and "F310,10,12,2,F310_CX2_10-12.png" in csv
    assert "HoleID" in cliente.get(f"{API}/minas/{mina['id']}/sondagem/fotos.csv", headers=h).text
    assert cliente.get(f"{API}/minas/{mina['id']}/sondagem/resumo", headers=h).json()["fotos"] == 2
