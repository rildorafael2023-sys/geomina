"""Regras de valor abaixo do limite, percurso pelos pontos e ligação de amostras às galerias.

Padrão: sem eixo desenhado, a distância segue a galeria passando pelos pontos de amostragem (início = ponta mais antiga).
Com eixo desenhado, a distância é a projeção no eixo. Amostras no mesmo ponto (sub-pontos da parede) ficam na mesma distância.
"""

import pytest

from geomina.espacial.chainage import extremidades, percurso_pelos_pontos
from geomina.modules.analise.longitudinal import valor_grafico
from tests.conftest import cab, criar_usuario

API = "/api/v1"
X0, Y0 = 500000.0, 7800000.0
DX, DY = -46.367, -43.899
# galeria em L com rampa: 100 m planos para leste, depois 30 m para norte descendo 40 m (50 m em 3D)
EIXO = [[X0, Y0, 500], [X0 + 100, Y0, 500], [X0 + 100, Y0 + 30, 460]]


@pytest.fixture
def h(token_admin):
    return cab(token_admin)


@pytest.fixture
def cenario(cliente, h):
    mina = cliente.post(f"{API}/minas", headers=h, json={"codigo": "MINA01", "nome": "Mina 01", "srid_trabalho": 31983}).json()
    dic = {x["codigo"]: {t["codigo"]: t for t in x["termos"]} for x in cliente.get(f"{API}/dicionarios", headers=h).json()}
    n = cliente.post(f"{API}/unidades", headers=h, json={"mina_id": mina["id"], "tipo": "NIVEL", "codigo": "N144", "nome": "N144"}).json()
    g = cliente.post(f"{API}/unidades", headers=h, json={"mina_id": mina["id"], "tipo": "GALERIA", "codigo": "GAL-1", "nome": "Galeria 1",
                                                       "pai_id": n["id"]}).json()
    g2 = cliente.post(f"{API}/unidades", headers=h, json={"mina_id": mina["id"], "tipo": "GALERIA", "codigo": "GAL-2", "nome": "Galeria 2",
                                                        "pai_id": n["id"]}).json()
    lit = list(dic["LITOLOGIA"].values())
    flx, ang = lit[0], lit[1]
    amostras = [  # código, x, y, z, litologia, data, seção de-até (sub-pontos da parede)
        ("BS-RP-2", X0 + 50, Y0 + 1, 500, ang, "2026-09-10", (0, 1.4)),     # meio
        ("BS-RP-2B", X0 + 50.2, Y0 + 1, 500, flx, "2026-09-10", (1.4, 3)),  # mesmo ponto, outro intervalo da parede
        ("BS-RP-1", X0, Y0, 500, flx, "2026-09-01", None),                  # início (mais antiga)
        ("BS-RP-3", X0 + 100, Y0 + 30, 460, flx, "2026-09-20", None),       # fim, no alto da rampa
        ("BS-RP-4", X0 + 100, Y0, 500, flx, "2026-09-15", None),            # canto do L, sem resultado
    ]
    for cod, x, y, z, t, d, sec in amostras:
        corpo = {"codigo": cod, "unidade_id": g["id"], "x": x, "y": y, "z": z, "srid": 31983, "litologia_id": t["id"], "data_coleta": d}
        if sec:
            corpo.update(secao_de_m=sec[0], secao_ate_m=sec[1])
        assert cliente.post(f"{API}/minas/{mina['id']}/amostras", headers=h, json=corpo).status_code == 201
    cliente.post(f"{API}/minas/{mina['id']}/amostras", headers=h, json={"codigo": "BS-RP-5", "unidade_id": g["id"]})  # sem XYZ
    cliente.post(f"{API}/minas/{mina['id']}/amostras", headers=h,  # em SAD69: só entra com transformação aprovada
                 json={"codigo": "BE-9", "unidade_id": g["id"], "x": X0 + 75 - DX, "y": Y0 - DY, "z": 500, "srid": 29193})
    csv = ("Amostra;Tipo;Cr (ppm);Be (ppm);MgO (%)\n"
           "BS-RP-1;SMP;519;4,2;17,6\n"
           "BS-RP-2;SMP;<10;68,1;>50\n"
           "BS-RP-2B;SMP;800;12;20\n"
           "BS-RP-3;SMP;1508;<0,5;N.A.\n")
    p = cliente.post(f"{API}/minas/{mina['id']}/laudos", headers=h, files={"arquivo": ("laudo.csv", csv.encode())}).json()
    assert cliente.post(f"{API}/importacoes/{p['id']}/confirmar-laudo", headers=h, json={"certificado": "C-1"}).status_code == 200
    return {"mina": mina, "g": g, "g2": g2, "flx": flx, "ang": ang}


def test_regra_ld():
    assert valor_grafico("=", 5.0, None, "limite") == (5.0, "medido")
    assert valor_grafico("<", None, 10.0, "limite") == (10.0, "abaixo_ld")
    assert valor_grafico("<", None, 10.0, "metade") == (5.0, "abaixo_ld")
    assert valor_grafico("<", None, 10.0, "omitir") == (None, "omitido")
    assert valor_grafico(">", None, 50.0, "metade") == (50.0, "acima_ld"), "metade só vale para abaixo do limite"
    assert valor_grafico("NA", None, None, "limite") == (None, "sem_valor")


def test_percurso_pelos_pontos():
    pts = [[50, 0, 500], [0, 0, 500], [100, 0, 500], [100, 30, 460], [25, 0, 500]]
    a, b = extremidades(pts)
    assert {a, b} == {1, 3}
    p = percurso_pelos_pontos(pts, 1)
    assert p.ordem == [1, 4, 0, 2, 3] and p.distancia == [0, 25, 50, 100, 150], "segue a galeria; o trecho da rampa é 3D"
    assert percurso_pelos_pontos(pts, 3).ordem == [3, 2, 0, 4, 1]
    assert percurso_pelos_pontos([[0, 0], [10, 0]], 0).distancia == [0, 10], "sem cota: distância em planta"
    longe = [[i * 5, 0, 0] for i in range(6)] + [[200, 0, 0]]
    assert percurso_pelos_pontos(longe, 0).saltos == [6], "trecho muito maior que o espaçamento típico é sinalizado"


def test_ligar_amostras_da_planilha_a_galeria(cliente, h, cenario, token_admin):
    """Amostras importadas só com o texto do local (planilha de campo) são ligadas em lote à galeria."""
    mina, g2 = cenario["mina"], cenario["g2"]
    for i, loc in enumerate(["Travessa 1F - 2 - Reta", "Travessa 1F - 2 - Reta", "Lado esquerdo Rampa Sul", None]):
        cliente.post(f"{API}/minas/{mina['id']}/amostras", headers=h,
                     json={"codigo": f"BS-RP-{700 + i}", "local_descricao": loc, "x": X0 + 300 + i * 10, "y": Y0, "z": 500, "srid": 31983})
    locais = {x["local"]: x for x in cliente.get(f"{API}/minas/{mina['id']}/amostras/sem-local", headers=h).json()}
    assert (locais["Travessa 1F - 2 - Reta"]["amostras"], locais["Travessa 1F - 2 - Reta"]["com_coordenadas"]) == (2, 2)
    assert locais["Lado esquerdo Rampa Sul"]["amostras"] == 1 and locais[None]["amostras"] == 1
    _, tec = criar_usuario(cliente, token_admin, "tec", ["CONSULTA"])
    r = cliente.post(f"{API}/minas/{mina['id']}/amostras/ligar-unidade", headers=cab(tec), json={"unidade_id": g2["id"], "local": "x"})
    assert r.status_code == 403
    r = cliente.post(f"{API}/minas/{mina['id']}/amostras/ligar-unidade", headers=h, json={"unidade_id": g2["id"], "local": "Travessa 1F - 2 - Reta"})
    assert r.json() == {"ligadas": 2, "unidade": "GAL-2"}
    r = cliente.post(f"{API}/minas/{mina['id']}/amostras/ligar-unidade", headers=h, json={"unidade_id": g2["id"], "codigos": ["BS - RP - 703"]})
    assert r.json()["ligadas"] == 1, "também por lista de códigos (normalizados)"
    r = cliente.post(f"{API}/minas/{mina['id']}/amostras/ligar-unidade", headers=h, json={"unidade_id": g2["id"], "locais": ["Nada", "Outro"]})
    assert r.json()["ligadas"] == 0, "vários textos de local de uma vez (variações de escrita)"
    lista = cliente.get(f"{API}/minas/{mina['id']}/amostras", headers=h).json()
    assert sorted(a["codigo"] for a in lista if a["unidade_id"] == g2["id"]) == ["BS-RP-700", "BS-RP-701", "BS-RP-703"]
    assert "Lado esquerdo Rampa Sul" in {x["local"] for x in cliente.get(f"{API}/minas/{mina['id']}/amostras/sem-local", headers=h).json()}
    aid = next(a["id"] for a in lista if a["codigo"] == "BS-RP-700")
    hist = cliente.get(f"{API}/auditoria", headers=h, params={"tabela": "amostra", "operacao": "U", "texto": aid}).json()["itens"]
    assert any(ev["depois"].get("unidade_id") == g2["id"] for ev in hist), "a ligação fica no histórico de alterações"
