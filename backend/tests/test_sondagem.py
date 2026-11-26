"""Etapa 5 — sondagens: importação com validação, trajetória (real/estimada), perfil por profundidade e resultados."""

import math

import pytest

from tests.conftest import cab, criar_usuario

API = "/api/v1"
X0, Y0 = 500000.0, 7800000.0

COLLAR = (f"Furo;Este;Norte;Cota;Azimute;Inclinação;Profundidade;Projeto;Data\n"
          f"FUR-01;{X0};{Y0};600;0;-90;100;Lavra;01/09/2026\n"
          f"FUR-02;{X0 + 100};{Y0};600;90;-60;120;Lavra;05/09/2026\n"
          f"FUR-03;{X0 + 200};{Y0};480;0;30;40;Subsolo;10/09/2026\n"
          f"FUR-01;{X0};{Y0};600;0;-90;100;;\n"
          f"FUR-04;{X0};{Y0};;0;-90;50;;\n")
SURVEY = ("hole_id;depth;azimuth;dip\n"
          "FUR-02;0;90;-60\nFUR-02;50;90;-60\nFUR-02;100;95;-55\n"
          "FUR-09;10;0;-90\nFUR-02;150;90;-60\n")
GEOLOGIA = ("Furo;De;Até;Litologia;Alteração;Descrição\n"
            "FUR-01;0;10;Flogopita xisto;;xisto foliado\n"
            "FUR-01;10;40;Anfibólio gnaisse;Flogopitização;\n"
            "FUR-01;45;100;Rocha X;;\n"
            "FUR-01;30;45;Gnaisse pelítico;;\n"
            "FUR-01;90;120;Gnaisse pelítico;;\n"
            "FUR-01;50;40;Gnaisse pelítico;;\n")
AMOSTRAS = ("furo;amostra;de;ate\n"
            "FUR-01;BMT-TS-458;0;1\nFUR-01;BMT-TS-459;1;2,5\nFUR-01;BMT-TS-460;2;3\nFUR-02;BMT-TS-470;10;11\nFUR-02;xx;1;2\n")


@pytest.fixture
def h(token_admin):
    return cab(token_admin)


@pytest.fixture
def mina(cliente, h):
    m = cliente.post(f"{API}/minas", headers=h, json={"codigo": "MINA01", "nome": "Mina 01", "srid_trabalho": 31983}).json()
    cliente.post(f"{API}/minas/{m['id']}/amostras", headers=h, json={"codigo": "BMT-TS-459"})  # cadastrada antes, sem furo
    laudo = "Amostra;Tipo;Cr (ppm);Be (ppm)\nBMT-TS-458;SMP;519;4,2\nBMT-TS-459;SMP;<10;68,1\nBMT-TS-470;SMP;1508;12\n"
    p = cliente.post(f"{API}/minas/{m['id']}/laudos", headers=h, files={"arquivo": ("laudo.csv", laudo.encode())}).json()
    cliente.post(f"{API}/importacoes/{p['id']}/confirmar-laudo", headers=h, json={"certificado": "C-S-1"})
    return m


def importar(cliente, h, mina, convencao="horizontal_negativo", **arquivos):
    files = {k: (f"{k}.csv", v.encode()) for k, v in arquivos.items()}
    r = cliente.post(f"{API}/minas/{mina['id']}/sondagem/importacoes", headers=h, files=files,
                     data={"srid": "31983", "convencao": convencao})
    assert r.status_code == 201, r.text
    return r.json()


def test_validacao_e_importacao(cliente, h, mina, token_admin):
    p = importar(cliente, h, mina, collar=COLLAR, survey=SURVEY, geologia=GEOLOGIA, amostras=AMOSTRAS)
    msgs = [e["mensagem"] for e in p["erros"]]
    esperados = ["FUR-01 repetido", "FUR-04: falta Z", "FUR-09 não está no collar", "survey a 150.0 m fora do furo",
                 "30.0–45.0 m sobrepõe", "90.0–120.0 m passa da profundidade final", "intervalo inválido 50.0–40.0",
                 "2.0–3.0 m sobrepõe", "não segue as regras de código"]
    for esp in esperados:
        assert any(esp in m for m in msgs), (esp, msgs)
    av = [a["mensagem"] for a in p["avisos"]]
    assert any("FUR-03: furo ascendente" in a for a in av) and any("FUR-01: sem survey suficiente — trajetória será ESTIMADA" in a for a in av)
    assert any("litologia 'Rocha X' não está no dicionário" in a for a in av) and any("lacuna sem descrição entre 40.0 e 45.0 m" in a for a in av)
    assert {f["furo"]: (f["surveys"], f["intervalos"], f["amostras"]) for f in p["furos"]} == \
        {"FUR-01": (0, 3, 2), "FUR-02": (3, 0, 1), "FUR-03": (0, 0, 0)}
    r = cliente.post(f"{API}/importacoes/{p['id']}/confirmar-sondagem", headers=h, json={})
    assert r.status_code == 422 and r.json()["codigo"] == "erros_na_importacao", "com erros só grava se o usuário escolher ignorar"
    _, cons = criar_usuario(cliente, token_admin, "cons", ["CONSULTA"])
    assert cliente.post(f"{API}/importacoes/{p['id']}/confirmar-sondagem", headers=cab(cons), json={"ignorar_erros": True}).status_code == 403
    g = cliente.post(f"{API}/importacoes/{p['id']}/confirmar-sondagem", headers=h, json={"ignorar_erros": True}).json()
    assert g == {"furos": 3, "surveys": 3, "intervalos": 3, "amostras_ligadas": 3, "amostras_novas": 2, "resultados_ligados": 4}
    furos = {f["codigo"]: f for f in cliente.get(f"{API}/minas/{mina['id']}/furos", headers=cab(cons)).json()}
    assert (furos["FUR-01"]["trajetoria"], furos["FUR-02"]["trajetoria"]) == ("estimada", "real")
    assert (furos["FUR-01"]["amostras"], furos["FUR-01"]["amostras_com_resultado"], furos["FUR-01"]["intervalos"]) == (2, 2, 3)
    assert cliente.post(f"{API}/importacoes/{p['id']}/confirmar-sondagem", headers=h, json={"ignorar_erros": True}).json()["codigo"] == "importacao_encerrada"
    p2 = importar(cliente, h, mina, collar=COLLAR.splitlines()[0] + "\n" + COLLAR.splitlines()[1] + "\n")
    assert any("FUR-01 já está cadastrado" in e["mensagem"] for e in p2["erros"])


def test_perfil_trajetoria_e_resultados(cliente, h, mina):
    p = importar(cliente, h, mina, collar=COLLAR, survey=SURVEY, geologia=GEOLOGIA, amostras=AMOSTRAS)
    cliente.post(f"{API}/importacoes/{p['id']}/confirmar-sondagem", headers=h, json={"ignorar_erros": True})
    furos = {f["codigo"]: f for f in cliente.get(f"{API}/minas/{mina['id']}/furos", headers=h).json()}
    d = cliente.get(f"{API}/furos/{furos['FUR-01']['id']}/perfil", headers=h, params={"analitos": "Cr,Be"}).json()
    assert d["trajetoria"]["estimada"] and "sem survey" in d["trajetoria"]["motivo"]
    assert d["trajetoria"]["pontos"][-1] == [X0, Y0, 500.0], "vertical: fundo 100 m abaixo do collar"
    assert [(i["de"], i["ate"], (i["litologia"] or {}).get("nome")) for i in d["intervalos"]] == \
        [(0, 10, "Flogopita xisto"), (10, 40, "Anfibólio gnaisse"), (45, 100, None)]
    assert d["intervalos"][2]["atributos"] == {"litologia_original": "Rocha X"}, "texto original preservado"
    assert d["intervalos"][1]["alteracao"]["nome"] == "Flogopitização"
    a = {x["codigo"]: x for x in d["amostras"]}
    assert (a["BMT-TS-458"]["de"], a["BMT-TS-458"]["ate"], a["BMT-TS-458"]["valores"]["Cr"]["y"]) == (0, 1, 519)
    assert a["BMT-TS-459"]["valores"]["Cr"]["situacao"] == "abaixo_ld" and a["BMT-TS-459"]["xyz"] == [X0, Y0, 598.25]
    assert d["unidades"] == {"Cr": "ppm", "Be": "ppm"}
    d2 = cliente.get(f"{API}/furos/{furos['FUR-02']['id']}/perfil", headers=h, params={"analitos": "Cr"}).json()
    assert not d2["trajetoria"]["estimada"] and "curvatura mínima" in d2["trajetoria"]["motivo"]
    x, y, z = d2["amostras"][0]["xyz"]  # BMT-TS-470 a 10,5 m num trecho reto a 90°/−60°
    assert x == pytest.approx(X0 + 100 + 10.5 * math.cos(math.radians(60)), abs=1e-3) and z == pytest.approx(600 - 10.5 * math.sin(math.radians(60)), abs=1e-3)
    assert d2["amostras"][0]["valores"]["Cr"]["y"] == 1508
    d3 = cliente.get(f"{API}/furos/{furos['FUR-03']['id']}/perfil", headers=h).json()
    assert d3["trajetoria"]["pontos"][-1][2] == pytest.approx(500.0), "furo ascendente de subsolo sobe 20 m"
    tr = {t["codigo"]: t for t in cliente.get(f"{API}/minas/{mina['id']}/furos/trajetorias", headers=h).json()}
    assert tr["FUR-02"]["estimada"] is False and len(tr["FUR-02"]["pontos"]) > 10
    # a amostra agora tem furo e profundidade também na base da geoquímica operacional
    r = cliente.get(f"{API}/minas/{mina['id']}/geoop/registros", headers=h, params={"texto": "BMT-TS-458"}).json()["itens"][0]
    assert (r["furo"], r["prof_de_m"], r["prof_ate_m"]) == ("FUR-01", 0, 1)


def test_convencoes_de_inclinacao_e_crs(cliente, h, mina):
    collar = "furo;x;y;z;azimute;dip;eoh\nV1;500000;7800000;600;0;60;10\n"
    p = importar(cliente, h, mina, convencao="horizontal_positivo", collar=collar)
    cliente.post(f"{API}/importacoes/{p['id']}/confirmar-sondagem", headers=h, json={})
    f = next(x for x in cliente.get(f"{API}/minas/{mina['id']}/furos", headers=h).json() if x["codigo"] == "V1")
    assert f["inclinacao"] == -60, "60 positivo para baixo vira −60"
    collar = "furo;x;y;z;azimute;dip;eoh\nV2;500000;7800000;600;0;0;10\n"
    p = importar(cliente, h, mina, convencao="vertical", collar=collar)
    cliente.post(f"{API}/importacoes/{p['id']}/confirmar-sondagem", headers=h, json={})
    f = next(x for x in cliente.get(f"{API}/minas/{mina['id']}/furos", headers=h).json() if x["codigo"] == "V2")
    assert f["inclinacao"] == -90, "0 a partir da vertical = vertical descendente"
    # furo em SAD69 sem transformação aprovada: a trajetória fica no sistema original, com aviso — nada convertido em silêncio
    r = cliente.post(f"{API}/minas/{mina['id']}/furos", headers=h, json={"codigo": "S1", "x": 500046, "y": 7800044, "z": 600, "srid": 29193,
                                                                         "azimute": 0, "inclinacao": -90, "profundidade_final": 10})
    d = cliente.get(f"{API}/furos/{r.json()['id']}/perfil", headers=h).json()
    assert d["trajetoria"]["srid"] == 29193 and "nenhuma transformação aprovada" in d["trajetoria"]["aviso_crs"]
    assert cliente.post(f"{API}/minas/{mina['id']}/furos", headers=h, json={"codigo": "s1", "x": 0, "y": 0, "z": 0, "srid": 31983,
                                                                          "profundidade_final": 5}).status_code == 409
    r = cliente.post(f"{API}/minas/{mina['id']}/sondagem/importacoes", headers=h, files={"collar": ("c.csv", b"a;b\n1;2\n")}, data={"srid": "31983"})
    assert r.status_code == 422 and "cabeçalho" in r.json()["mensagem"]


def test_furo_sem_trajetoria_nao_e_gravado(cliente, h, mina):
    collar = "furo;x;y;z;azimute;dip;eoh\nOK1;500000;7800000;600;0;-90;10\nRUIM;500010;7800000;600;;;10\n"
    am = "furo;amostra;de;ate\nRUIM;BMT-TS-900;0;1\nOK1;BMT-TS-901;0;1\n"
    p = importar(cliente, h, mina, collar=collar, amostras=am)
    msgs = [e["mensagem"] for e in p["erros"]]
    assert any("RUIM: sem survey e sem azimute/inclinação" in m for m in msgs) and any("1 linha(s) de RUIM não serão gravadas" in m for m in msgs)
    g = cliente.post(f"{API}/importacoes/{p['id']}/confirmar-sondagem", headers=h, json={"ignorar_erros": True}).json()
    assert (g["furos"], g["amostras_ligadas"]) == (1, 1)
    assert [f["codigo"] for f in cliente.get(f"{API}/minas/{mina['id']}/furos", headers=h).json()] == ["OK1"]
