"""Perfil da frente: ao abrir uma amostra, os trechos da seção metro a metro com a litologia e os teores do laudo."""

import pytest

from tests.conftest import cab, criar_usuario
from tests.test_amostragem import xlsx

API = "/api/v1"

CAB = ["Ponto", "Sub Ponto", "Direção da seção", "Intervalo", "Espessura", "Litologia", "Descriçao de campo (Afloramento)",
       "X", "Y", "Z", "Data", "Amostra", "Designação de campo (Amostra)", "O que fazer com a amostra"]
PLANILHA = [
    CAB,
    ["P-10", None, "Travessa 1F5", "0 m - 1 m", 1, "Gnaisse Pelítico", "gnaisse bandado", None, None, None, "15/10/2026", "BS - RP - 225", None, "GEOQUÍMICA"],
    [None, None, "Travessa 1F5", "1 m - 2 m", 1, "Flogopita Xisto", "xisto com flogopita", None, None, None, "15/10/2026", "BS - RP - 225", None, "GEOQUÍMICA"],
    [None, None, "Travessa 1F5", "2 m - 3 m", 1, "Anfibólio gnaisse", "não amostrado", None, None, None, None, None, None, None],
    [None, None, "Travessa 1F5", "3 m - 4,5 m", 1.5, "Gnaisse Pelítico", "", None, None, None, "15/10/2026", "BS - RP - 226", None, "GEOQUÍMICA"],
    ["P-11", None, "Travessa 1F5", "0 m - 2 m", 2, "Flogopita Xisto", "", None, None, None, "16/10/2026", "BS - RP - 227", None, None],
]
LAUDO = ("Amostra;Tipo;Cr (ppm);Be (ppm);MgO (%)\n"
         "BS-RP-225;SMP;519;4,2;12,5\nBS-RP-226;SMP;<10;68,1;3\nBS-RP-227;SMP;1508;12;20\n")


@pytest.fixture
def h(token_admin):
    return cab(token_admin)


@pytest.fixture
def mina(cliente, h):
    return cliente.post(f"{API}/minas", headers=h, json={"codigo": "MINA01", "nome": "Mina 01", "srid_trabalho": 31983}).json()


def _importar(cliente, h, mina, linhas=PLANILHA):
    p = cliente.post(f"{API}/minas/{mina['id']}/amostras/importacoes", headers=h, files={"arquivo": ("campo.xlsx", xlsx(linhas))}).json()
    return cliente.post(f"{API}/importacoes/{p['id']}/confirmar-amostras", headers=h, json={"repetidos": "primeira"}).json()


def _laudo(cliente, h, mina):
    p = cliente.post(f"{API}/minas/{mina['id']}/laudos", headers=h, files={"arquivo": ("laudo.csv", LAUDO.encode())}).json()
    assert cliente.post(f"{API}/importacoes/{p['id']}/confirmar-laudo", headers=h, json={"certificado": "GQ-1"}).status_code == 200


def _amostra(cliente, h, mina, codigo):
    return next(a for a in cliente.get(f"{API}/minas/{mina['id']}/amostras", headers=h).json() if a["codigo"] == codigo)


def test_perfil_da_planilha_com_teores(cliente, h, mina):
    c = _importar(cliente, h, mina)
    assert c["gravadas"] == 3 and c["trechos_perfil"] == 5, "a mesma amostra em dois trechos e o trecho sem amostra entram no perfil"
    _laudo(cliente, h, mina)
    a = _amostra(cliente, h, mina, "BS-RP-225")
    p = cliente.get(f"{API}/amostras/{a['id']}/perfil-frente", headers=h).json()
    assert p["frente"]["ponto"] == "P-10" and p["frente"]["origem"] == "perfil" and p["frente"]["local"] == "Travessa 1F5"
    t = p["intervalos"]
    assert [(x["de"], x["ate"], x["amostra"]) for x in t] == [(0, 1, "BS-RP-225"), (1, 2, "BS-RP-225"), (2, 3, None), (3, 4.5, "BS-RP-226")]
    assert [x["litologia"]["nome"] for x in t] == ["Gnaisse pelítico", "Flogopita xisto", "Anfibólio gnaisse", "Gnaisse pelítico"]
    assert t[3]["espessura"] == 1.5 and t[0]["descricao"] == "gnaisse bandado"
    assert {x["chave"] for x in p["analitos"]} == {"Be (ppm)", "Cr (ppm)", "MgO (%)"}
    am = {x["codigo"]: x for x in p["amostras"]}
    assert set(am) == {"BS-RP-225", "BS-RP-226"}, "só as amostras do mesmo ponto"
    assert am["BS-RP-225"]["valores"]["Cr (ppm)"]["texto"] == "519" and am["BS-RP-226"]["valores"]["Cr (ppm)"]["texto"] == "<10"
    assert am["BS-RP-225"]["certificados"] == ["GQ-1"] and p["comprimento"] == 4.5


def test_reimportar_nao_duplica_e_preenche_ponto(cliente, h, mina):
    _importar(cliente, h, mina)
    c = _importar(cliente, h, mina)
    assert c["gravadas"] == 0 and c["trechos_perfil"] == 0
    a = _amostra(cliente, h, mina, "BS-RP-225")
    assert len(cliente.get(f"{API}/amostras/{a['id']}/perfil-frente", headers=h).json()["intervalos"]) == 4


def test_sem_perfil_usa_a_secao_da_amostra_e_edicao_manual(cliente, h, mina, token_admin):
    dic = {x["codigo"]: {t["codigo"]: t for t in x["termos"]} for x in cliente.get(f"{API}/dicionarios", headers=h).json()}
    gnp = next(iter(dic["LITOLOGIA"].values()))
    a = cliente.post(f"{API}/minas/{mina['id']}/amostras", headers=h,
                     json={"codigo": "BS-RP-300", "secao_de_m": 0, "secao_ate_m": 2, "litologia_id": gnp["id"]}).json()
    cliente.post(f"{API}/minas/{mina['id']}/amostras", headers=h, json={"codigo": "BS-RP-301"})
    p = cliente.get(f"{API}/amostras/{a['id']}/perfil-frente", headers=h).json()
    assert p["frente"]["origem"] == "amostras" and p["intervalos"][0]["amostra"] == "BS-RP-300"
    corpo = {"intervalos": [{"de_m": 1, "ate_m": 2, "litologia_id": gnp["id"], "amostra_codigo": "BS - RP - 301"},
                            {"de_m": 0, "ate_m": 1, "litologia_id": gnp["id"], "amostra_codigo": "BS-RP-300", "descricao": "lapa"}]}
    r = cliente.put(f"{API}/amostras/{a['id']}/perfil-frente", headers=h, json=corpo)
    assert r.status_code == 200, r.text
    p = r.json()
    assert p["frente"]["origem"] == "perfil" and p["frente"]["ponto"] == "BS-RP-300"
    assert [(x["de"], x["amostra"]) for x in p["intervalos"]] == [(0, "BS-RP-300"), (1, "BS-RP-301")]
    b = _amostra(cliente, h, mina, "BS-RP-301")
    assert b["ponto_campo"] == "BS-RP-300", "a outra amostra passa a ser da mesma frente"
    assert len(cliente.get(f"{API}/amostras/{b['id']}/perfil-frente", headers=h).json()["intervalos"]) == 2
    ruim = {"intervalos": [{"de_m": 0, "ate_m": 2}, {"de_m": 1, "ate_m": 3}]}
    assert cliente.put(f"{API}/amostras/{a['id']}/perfil-frente", headers=h, json=ruim).json()["codigo"] == "sobreposicao"
    _, consulta = criar_usuario(cliente, token_admin, "leitor", ["CONSULTA"])
    assert cliente.get(f"{API}/amostras/{a['id']}/perfil-frente", headers=cab(consulta)).status_code == 200
    assert cliente.put(f"{API}/amostras/{a['id']}/perfil-frente", headers=cab(consulta), json=corpo).status_code == 403
