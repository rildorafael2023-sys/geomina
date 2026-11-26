"""Etapa 9 — importação de laudos e resultados geoquímicos."""

import os
from pathlib import Path

import pytest
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError

from geomina.modules.geoquimica import laudo as L
from tests.conftest import cab, criar_usuario

API = "/api/v1"
PASTA = Path(os.environ.get("GEOMINA_LAUDOS", "/nao/existe"))
LAUDO1 = PASTA / "2f1c1862-GQ2613496.XLS"
LAUDO2 = PASTA / "6f3a32f9-GQ2604840_1.XLS"
reais = pytest.mark.skipif(not LAUDO1.exists(), reason="laudos reais não disponíveis nesta máquina")


@pytest.fixture
def h(token_admin):
    return cab(token_admin)


@pytest.fixture
def mina(cliente, h):
    return cliente.post(f"{API}/minas", headers=h, json={"codigo": "MINA01", "nome": "Mina 01", "srid_trabalho": 31983}).json()


CSV = ("Amostra;Tipo;Cr (ppm);Be (ppm);MgO (%);F_ppm\n"
       "BS-RP-1;SMP;519;4,2;17,6;1710\n"
       "BS-RP-2;SMP;<1;<0,5;>99;N.A.\n"
       "BS-RP-1;DUP;560;4,0;17,9;1800\n"
       "OREAS920B;STD;100;2,2;0,33;--\n"
       "BS-RP-999;SMP;10;1;1;1\n")


def enviar(cliente, h, mina, nome, dados):
    r = cliente.post(f"{API}/minas/{mina['id']}/laudos", headers=h, files={"arquivo": (nome, dados)})
    assert r.status_code == 201, r.text
    return r.json()


def test_valores_especiais():
    assert L.valor("<0,5") == ("<0,5", None, "<", 0.5)
    assert L.valor(">99") == (">99", None, ">", 99.0)
    assert L.valor("N.A.")[2] == "NA" and L.valor("--")[2] == "--"
    assert L.valor("1.234,5")[1] == 1234.5 and L.valor(7.98)[1] == 7.98
    with pytest.raises(L.LaudoInvalido):
        L.valor("abc")


def test_csv_generico_previa_confirmacao_e_preferidos(cliente, h, mina):
    for c in ("BS-RP-1", "BS-RP-2"):
        cliente.post(f"{API}/minas/{mina['id']}/amostras", headers=h, json={"codigo": c})
    p = enviar(cliente, h, mina, "laudo.csv", CSV.encode())
    assert p["formato"] == "GENERICO" and [c["analito"] for c in p["colunas"]] == ["Cr", "Be", "MgO", "F"]
    assert p["resumo"] == {"vinculada": 3, "controle_lab": 1, "nao_encontrada": 1}
    r = cliente.post(f"{API}/importacoes/{p['id']}/confirmar-laudo", headers=h, json={})
    assert r.status_code == 422 and r.json()["codigo"] == "certificado_obrigatorio"
    c = cliente.post(f"{API}/importacoes/{p['id']}/confirmar-laudo", headers=h, json={"certificado": "B-001"}).json()
    assert c["amostras_vinculadas"] == 2 and c["sem_vinculo"] == ["BS-RP-999", "OREAS920B"]
    amostras = {a["codigo"]: a for a in cliente.get(f"{API}/minas/{mina['id']}/amostras", headers=h).json()}
    res = {(x["analito"], x["tipo_linha"]): x for x in cliente.get(f"{API}/amostras/{amostras['BS-RP-1']['id']}/resultados", headers=h).json()}
    assert res[("Cr", "SMP")]["valor_num"] == 519 and res[("Cr", "SMP")]["preferido"] is True
    assert res[("Cr", "DUP")]["preferido"] is False
    r2 = {x["analito"]: x for x in cliente.get(f"{API}/amostras/{amostras['BS-RP-2']['id']}/resultados", headers=h).json()}
    assert (r2["Cr"]["qualificador"], r2["Cr"]["limite"], r2["Cr"]["valor"]) == ("<", 1, "<1")
    assert r2["MgO"]["qualificador"] == ">" and r2["F"]["qualificador"] == "NA"
    t = cliente.get(f"{API}/minas/{mina['id']}/resultados/tabela", headers=h, params={"analitos": "Cr,Be"}).json()
    assert t["colunas"] == ["Be (ppm)", "Cr (ppm)"] or t["colunas"] == ["Cr (ppm)", "Be (ppm)"]
    assert {ln["amostra"]: ln["valores"]["Cr (ppm)"] for ln in t["linhas"]} == {"BS-RP-1": "519", "BS-RP-2": "<1"}
    csv = cliente.get(f"{API}/minas/{mina['id']}/resultados/tabela.csv", headers=h)
    assert csv.status_code == 200 and "BS-RP-1;BS-RP-1;SMP;B-001" in csv.content.decode("utf-8-sig")
    q = cliente.get(f"{API}/certificados/{c['certificado_id']}/qaqc", headers=h).json()
    cr = next(x for x in q["pares"] if x["analito"] == "Cr")
    assert cr["rpd"] == round(41 / 539.5 * 100, 1) and q["padroes"] == ["OREAS920B"]


def test_reimportacao_bloqueada_e_resultados_imutaveis(app, cliente, h, mina):
    p = enviar(cliente, h, mina, "laudo.csv", CSV.encode())
    cliente.post(f"{API}/importacoes/{p['id']}/confirmar-laudo", headers=h, json={"certificado": "B-001"})
    p2 = enviar(cliente, h, mina, "laudo.csv", CSV.encode())
    assert p2["arquivo_ja_importado"] is True
    r = cliente.post(f"{API}/importacoes/{p2['id']}/confirmar-laudo", headers=h, json={"certificado": "B-001"})
    assert r.status_code == 409 and r.json()["codigo"] == "certificado_duplicado"
    with pytest.raises(IntegrityError, match="não podem ser alterados"), app.state.engine.begin() as c:
        c.execute(text("UPDATE resultado SET valor_num = 1"))
    with pytest.raises(IntegrityError, match="não podem ser excluídos"), app.state.engine.begin() as c:
        c.execute(text("DELETE FROM resultado"))


def test_vincular_pendentes_e_reanalise(cliente, h, mina):
    p = enviar(cliente, h, mina, "laudo.csv", CSV.encode())
    cliente.post(f"{API}/importacoes/{p['id']}/confirmar-laudo", headers=h, json={"certificado": "B-001"})
    cliente.post(f"{API}/minas/{mina['id']}/amostras", headers=h, json={"codigo": "BS-RP-999"})
    v = cliente.post(f"{API}/minas/{mina['id']}/resultados/vincular-pendentes", headers=h).json()
    assert v["amostras"] == 1 and v["vinculados"] == 4
    # reanálise em certificado posterior passa a ser o resultado preferido
    p2 = enviar(cliente, h, mina, "reanalise.csv", b"Amostra;Cr (ppm)\nBS-RP-999;12\n")
    cliente.post(f"{API}/importacoes/{p2['id']}/confirmar-laudo", headers=h, json={"certificado": "B-002"})
    a = next(x for x in cliente.get(f"{API}/minas/{mina['id']}/amostras", headers=h).json() if x["codigo"] == "BS-RP-999")
    cr = [x for x in cliente.get(f"{API}/amostras/{a['id']}/resultados", headers=h).json() if x["analito"] == "Cr"]
    assert {x["valor"]: x["preferido"] for x in cr} == {"10": False, "12": True}


def test_painel_aguardando_resultado(cliente, h, mina):
    for c in ("BS-RP-1", "BS-RP-2", "BS-RP-3"):
        cliente.post(f"{API}/minas/{mina['id']}/amostras", headers=h, json={"codigo": c})
    lote = cliente.post(f"{API}/minas/{mina['id']}/lotes", headers=h, json={"codigo": "L1", "laboratorio": "SGS", "amostras": ["BS-RP-1", "BS-RP-2", "BS-RP-3"]}).json()
    cliente.post(f"{API}/lotes/{lote['id']}/enviar", headers=h, json={"data_envio": "2026-09-24"})
    assert cliente.get(f"{API}/painel", headers=h).json()["amostras"]["aguardando_resultado"] == 3
    p = enviar(cliente, h, mina, "laudo.csv", CSV.encode())
    cliente.post(f"{API}/importacoes/{p['id']}/confirmar-laudo", headers=h, json={"certificado": "B-001"})
    assert cliente.get(f"{API}/painel", headers=h).json()["amostras"]["aguardando_resultado"] == 1


def test_permissoes(cliente, token_admin, mina):
    _, t = criar_usuario(cliente, token_admin, "leitor", ["CONSULTA"])
    assert cliente.post(f"{API}/minas/{mina['id']}/laudos", headers=cab(t), files={"arquivo": ("l.csv", CSV.encode())}).status_code == 403
    assert cliente.get(f"{API}/minas/{mina['id']}/certificados", headers=cab(t)).status_code == 200


@reais
def test_laudos_reais_sgs(cliente, h, mina):
    # amostras dos laudos cadastradas antes (como acontece na rotina)
    for c in ("BS-RP-462A", "BS-RP-468B", "BMT-TS-458", "BS-RP-413", "BS-RP-431B"):
        cliente.post(f"{API}/minas/{mina['id']}/amostras", headers=h, json={"codigo": c})
    p1 = enviar(cliente, h, mina, "GQ2613496.XLS", LAUDO1.read_bytes())
    assert p1["formato"] == "SGS" and p1["certificado"] == "GQ2613496" and p1["projeto"] == "Mina 01"
    assert len(p1["colunas"]) == 48 and p1["tipos"] == {"SMP": 25, "DUP": 1, "REP": 6, "STD": 10, "BLK": 1}
    assert p1["erros_valor"] == []
    c1 = cliente.post(f"{API}/importacoes/{p1['id']}/confirmar-laudo", headers=h, json={}).json()
    p2 = enviar(cliente, h, mina, "GQ2604840_1.XLS", LAUDO2.read_bytes())
    c2 = cliente.post(f"{API}/importacoes/{p2['id']}/confirmar-laudo", headers=h, json={}).json()
    assert c1["amostras_vinculadas"] == 3 and c2["amostras_vinculadas"] == 2
    # a ordem das colunas muda entre os laudos (Cl): o resultado por analito tem de ser o mesmo
    a = {x["codigo"]: x["id"] for x in cliente.get(f"{API}/minas/{mina['id']}/amostras", headers=h).json()}
    r = {(x["analito"], x["tipo_linha"]): x for x in cliente.get(f"{API}/amostras/{a['BS-RP-468B']}/resultados", headers=h).json()}
    assert r[("F", "SMP")]["valor_num"] == 6916 and r[("Be", "SMP")]["valor_num"] == 68.1 and r[("Cr", "SMP")]["valor_num"] == 1508
    assert r[("Be", "DUP")]["valor_num"] == 66.9 and r[("SiO2", "SMP")]["unidade"] == "%"
    r413 = {x["analito"]: x for x in cliente.get(f"{API}/amostras/{a['BS-RP-413']}/resultados", headers=h).json()}
    assert r413["Cl"]["valor_num"] == 52 and r413["Ag"]["valor"] == "<0,5"
    cert = cliente.get(f"{API}/minas/{mina['id']}/certificados", headers=h).json()
    assert {x["codigo"] for x in cert} == {"GQ2613496", "GQ2604840"}
    q = cliente.get(f"{API}/certificados/{c1['certificado_id']}/qaqc", headers=h).json()
    assert q["padroes"] == ["OREAS920B", "SG_092"] or set(q["padroes"]) >= {"OREAS920B", "SG_092"}
    be = next(x for x in q["pares"] if x["analito"] == "Be" and x["tipo"] == "DUP")
    assert be["original"] == 68.1 and be["repeticao"] == 66.9
    print("\nLAUDOS REAIS:", c1["resultados"], "+", c2["resultados"], "resultados; alertas QA/QC:", q["alertas"])
