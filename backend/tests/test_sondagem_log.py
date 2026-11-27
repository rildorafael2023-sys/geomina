"""Módulo Sondagem: log do furo com descrição, intervalos amostrados, teores de todos os elementos e fotos de testemunho."""

import io

import pytest
from PIL import Image

from tests.conftest import cab, criar_usuario

API = "/api/v1"


@pytest.fixture
def h(token_admin):
    return cab(token_admin)


@pytest.fixture
def furo(cliente, h):
    m = cliente.post(f"{API}/minas", headers=h, json={"codigo": "MINA01", "nome": "Mina 01", "srid_trabalho": 31983}).json()
    f = cliente.post(f"{API}/minas/{m['id']}/furos", headers=h,
                     json={"codigo": "fd-01", "x": 500000, "y": 7800000, "z": 600, "srid": 31983, "azimute": 0, "inclinacao": -90,
                           "profundidade_final": 30}).json()
    amostras = "furo;amostra;de;ate\nFD-01;BMT-TS-1;2;3,5\nFD-01;BMT-TS-2;3,5;5\n"
    p = cliente.post(f"{API}/minas/{m['id']}/sondagem/importacoes", headers=h, files={"amostras": ("am.csv", amostras.encode())},
                     data={"srid": "31983"}).json()
    assert cliente.post(f"{API}/importacoes/{p['id']}/confirmar-sondagem", headers=h, json={}).status_code == 200
    laudo = "Amostra;Tipo;Cr (ppm);Be (ppm);MgO (%)\nBMT-TS-1;SMP;519;4,2;12\nBMT-TS-2;SMP;<10;68,1;3\n"
    lp = cliente.post(f"{API}/minas/{m['id']}/laudos", headers=h, files={"arquivo": ("laudo.csv", laudo.encode())}).json()
    cliente.post(f"{API}/importacoes/{lp['id']}/confirmar-laudo", headers=h, json={"certificado": "C-1"})
    return {"mina": m, **f}


def _png():
    buf = io.BytesIO()
    Image.new("RGB", (40, 20), (120, 90, 60)).save(buf, "PNG")
    return buf.getvalue()


def test_log_com_descricao_teores_e_fotos(cliente, h, furo, token_admin):
    dic = {x["codigo"]: list(x["termos"]) for x in cliente.get(f"{API}/dicionarios", headers=h).json()}
    lito = dic["LITOLOGIA"][0]
    corpo = {"intervalos": [{"de_m": 0, "ate_m": 3, "litologia_id": lito["id"], "descricao": "gnaisse bandado"},
                            {"de_m": 3, "ate_m": 10, "descricao": "xisto"}]}
    assert cliente.put(f"{API}/furos/{furo['id']}/intervalos", headers=h, json=corpo).json() == {"intervalos": 2}
    ruim = {"intervalos": [{"de_m": 0, "ate_m": 40}]}
    assert cliente.put(f"{API}/furos/{furo['id']}/intervalos", headers=h, json=ruim).json()["codigo"] == "alem_do_furo"

    r = cliente.post(f"{API}/furos/{furo['id']}/fotos", headers=h, files=[("arquivos", ("cx1.png", _png(), "image/png"))],
                     data={"de_m": "0", "ate_m": "5", "caixa": "1", "legenda": "caixa 1"})
    assert r.status_code == 201, r.text
    foto = r.json()[0]
    assert (foto["de"], foto["ate"], foto["caixa"], foto["categoria"]) == (0, 5, "1", "foto")

    p = cliente.get(f"{API}/furos/{furo['id']}/perfil", headers=h, params={"analitos": "*"}).json()
    assert p["furo"]["codigo"] == "FD-01" and [i["descricao"] for i in p["intervalos"]] == ["gnaisse bandado", "xisto"]
    assert p["intervalos"][0]["litologia"]["nome"] == lito["nome"]
    assert set(p["analitos"]) == {"Cr", "Be", "MgO"}
    am = {a["codigo"]: a for a in p["amostras"]}
    assert (am["BMT-TS-1"]["de"], am["BMT-TS-1"]["ate"]) == (2, 3.5)
    assert am["BMT-TS-1"]["valores"]["Cr"]["texto"] == "519" and am["BMT-TS-2"]["valores"]["Cr"]["texto"] == "<10"
    assert len(p["fotos"]) == 1
    img = cliente.get(f"{API}/documentos/{foto['documento_id']}/versoes/1/arquivo", headers=h, params={"tipo": "miniatura"})
    assert img.status_code == 200 and img.headers["content-type"] == "image/jpeg"

    _, consulta = criar_usuario(cliente, token_admin, "leitor", ["CONSULTA"])
    assert cliente.get(f"{API}/furos/{furo['id']}/fotos", headers=cab(consulta)).status_code == 200
    assert cliente.put(f"{API}/furos/{furo['id']}/intervalos", headers=cab(consulta), json=corpo).status_code == 403

    assert cliente.delete(f"{API}/fotos-furo/{foto['id']}", headers=h).status_code == 204
    assert cliente.get(f"{API}/furos/{furo['id']}/fotos", headers=h).json() == []
    assert cliente.delete(f"{API}/furos/{furo['id']}", headers=h).status_code == 204
    assert cliente.get(f"{API}/minas/{furo['mina']['id']}/furos", headers=h).json() == []
    a = next(x for x in cliente.get(f"{API}/minas/{furo['mina']['id']}/amostras", headers=h).json() if x["codigo"] == "BMT-TS-1")
    assert a["furo"] == "FD-01", "a amostra continua cadastrada com o código do furo"
