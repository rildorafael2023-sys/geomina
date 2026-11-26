"""Etapa 11 — teores ao longo da galeria (Seção 27 §2).

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


def test_sem_eixo_segue_a_galeria_pelas_amostras(cliente, h, cenario):
    g = cenario["g"]
    d = cliente.get(f"{API}/unidades/{g['id']}/longitudinal", headers=h, params={"analitos": "Cr,Be,MgO"}).json()
    r = d["referencia"]
    assert (r["tipo"], r["tem_eixo"], r["pontos"], r["comprimento_m"]) == ("amostras", False, 4, 150.02)
    assert r["inicio"] == "ponto da amostra BS-RP-1 (coleta 01/09/2026)", "início = ponta com a amostra mais antiga"
    assert [p[:2] for p in r["percurso"]] == [[X0, Y0], [X0 + 50, Y0 + 1], [X0 + 100, Y0], [X0 + 100, Y0 + 30]]
    pos = [(a["codigo"], a["ponto"], round(a["chainage_m"], 2)) for a in d["amostras"]]
    assert pos == [("BS-RP-1", 1, 0), ("BS-RP-2", 2, 50.01), ("BS-RP-2B", 2, 50.01), ("BS-RP-4", 3, 100.02), ("BS-RP-3", 4, 150.02)]
    v = {a["codigo"]: a["valores"] for a in d["amostras"]}
    assert v["BS-RP-1"]["Cr"]["y"] == 519 and v["BS-RP-2"]["Cr"] == {"y": 10.0, "texto": "<10", "situacao": "abaixo_ld", "unidade": "ppm", "certificado": "C-1"}
    assert v["BS-RP-2"]["MgO"]["situacao"] == "acima_ld" and v["BS-RP-3"]["MgO"]["y"] is None
    assert v["BS-RP-4"] == {}, "amostra sem resultado aparece no seu ponto, sem valor inventado"
    s = {x["chave"]: x for x in d["series"]}
    assert (s["Cr"]["pontos"], s["Cr"]["abaixo_ld"], s["Cr"]["min"], s["Cr"]["max"]) == (4, 1, 10.0, 1508.0)
    assert s["MgO"]["sem_valor"] == 1 and s["MgO"]["pontos"] == 3
    motivos = {x["codigo"]: x["motivo"] for x in d["sem_posicao"]}
    assert motivos["BS-RP-5"] == "sem coordenadas" and "nenhuma transformação aprovada" in motivos["BE-9"]

    inv = cliente.get(f"{API}/unidades/{g['id']}/longitudinal", headers=h, params={"analitos": "Cr", "inverter": True}).json()
    assert [a["codigo"] for a in inv["amostras"]][0] == "BS-RP-3" and inv["referencia"]["invertido"]
    assert {a["codigo"]: a["chainage_m"] for a in inv["amostras"]}["BS-RP-1"] == pytest.approx(150.02, abs=0.01)


def test_ramos_diferentes_juntos_geram_aviso(cliente, h, cenario):
    """Amostras de dois ramos (ex.: travessa Direita e Esquerda) ligadas à mesma unidade: o caminho zigue-zagueia — avisar."""
    mina, g2 = cenario["mina"], cenario["g2"]
    # entroncamento em T: tronco de 120 m para norte e dois ramos de 120 m para leste e oeste
    for i, (x, y) in enumerate([(0, 0), (0, 40), (0, 80), (0, 120), (40, 120), (-40, 120), (80, 120), (-80, 120), (120, 120), (-120, 120)]):
        cliente.post(f"{API}/minas/{mina['id']}/amostras", headers=h,
                     json={"codigo": f"BS-RP-{800 + i}", "unidade_id": g2["id"], "x": X0 + 500 + x, "y": Y0 + y, "z": 500, "srid": 31983})
    r = cliente.get(f"{API}/unidades/{g2['id']}/longitudinal", headers=h, params={"analitos": "Cr"}).json()["referencia"]
    assert r["irregular"] and r["irregular"]["caminho_m"] > 1.6 * r["irregular"]["entre_pontas_m"]
    r = cliente.get(f"{API}/unidades/{cenario['g']['id']}/longitudinal", headers=h, params={"analitos": "Cr"}).json()["referencia"]
    assert r["irregular"] is None, "galeria em L com amostras em sequência não é irregular"


def test_filtros_nao_mudam_as_distancias(cliente, h, cenario):
    g = cenario["g"]
    url = f"{API}/unidades/{g['id']}/longitudinal"

    def pos(**p):
        return [(a["codigo"], round(a["chainage_m"])) for a in cliente.get(url, headers=h, params={"analitos": "Cr", **p}).json()["amostras"]]
    assert pos(litologias=cenario["ang"]["id"]) == [("BS-RP-2", 50)], "a distância continua a da galeria inteira"
    assert pos(data_de="2026-09-10", data_ate="2026-09-15") == [("BS-RP-2", 50), ("BS-RP-2B", 50), ("BS-RP-4", 100)]
    assert pos(chainage_de=40, chainage_ate=120) == [("BS-RP-2", 50), ("BS-RP-2B", 50), ("BS-RP-4", 100)]
    assert pos(teor_analito="Cr", teor_min=500) == [("BS-RP-1", 0), ("BS-RP-2B", 50), ("BS-RP-3", 150)]
    assert pos(teor_analito="Be", teor_max=5) == [("BS-RP-1", 0), ("BS-RP-3", 150)], "filtro por analito que não está no gráfico"


def test_regras_ld_na_serie(cliente, h, cenario):
    url = f"{API}/unidades/{cenario['g']['id']}/longitudinal"
    d = cliente.get(url, headers=h, params={"analitos": "Cr", "regra_ld": "metade"}).json()
    assert {a["codigo"]: a["valores"].get("Cr", {}).get("y") for a in d["amostras"]}["BS-RP-2"] == 5.0
    d = cliente.get(url, headers=h, params={"analitos": "Cr", "regra_ld": "omitir"}).json()
    assert (d["series"][0]["omitido"], d["series"][0]["abaixo_ld"], d["series"][0]["pontos"]) == (1, 1, 3)
    assert cliente.get(url, headers=h, params={"analitos": "Cr", "regra_ld": "zero"}).status_code == 422


def test_com_eixo_desenhado_e_transformacao(cliente, h, cenario):
    g, mina = cenario["g"], cenario["mina"]
    assert cliente.get(f"{API}/unidades/{g['id']}/longitudinal", headers=h, params={"analitos": "Cr", "referencia": "eixo"}).json()["codigo"] == "sem_eixo"
    cliente.post(f"{API}/unidades/{g['id']}/eixos", headers=h, json={"pontos": EIXO, "inicio_descricao": "emboque"})
    d = cliente.get(f"{API}/unidades/{g['id']}/longitudinal", headers=h, params={"analitos": "Cr"}).json()
    assert (d["referencia"]["tipo"], d["referencia"]["inicio"], d["referencia"]["comprimento_m"]) == ("eixo", "emboque", 150.0)
    pos = {a["codigo"]: (a["chainage_m"], a["afastamento_m"]) for a in d["amostras"]}
    assert pos["BS-RP-1"] == (0, 0) and pos["BS-RP-2"] == (50, 1) and pos["BS-RP-3"] == (150, 0), "sem precisar 'Calcular posições'"
    d = cliente.get(f"{API}/unidades/{g['id']}/longitudinal", headers=h, params={"analitos": "Cr", "referencia": "amostras"}).json()
    assert d["referencia"]["tipo"] == "amostras", "o usuário pode preferir seguir pelas amostras mesmo com eixo"
    # transformação SAD→SIRGAS aprovada: a amostra antiga em SAD69 entra no seu lugar
    t = cliente.post(f"{API}/minas/{mina['id']}/transformacoes/calibrar", headers=h, files={"arquivo": ("x.zip", _zip_par())},
                     data={"membro_origem": "sad.shp", "membro_destino": "sirgas.shp", "nome": "SAD→SIRGAS"}).json()
    cliente.post(f"{API}/transformacoes/{t['id']}/aprovar", headers=h)
    d = cliente.get(f"{API}/unidades/{g['id']}/longitudinal", headers=h, params={"analitos": "Cr"}).json()
    assert {a["codigo"]: a["chainage_m"] for a in d["amostras"]}["BE-9"] == pytest.approx(75, abs=0.01)


def _zip_par():
    from tests.test_topografia import GALERIA, sad, zipar
    return zipar({"sad": (sad(GALERIA), 29193), "sirgas": (GALERIA, 31983)})


def test_csv_lista_de_galerias_e_permissao(cliente, h, cenario, token_admin):
    g = cenario["g"]
    r = cliente.get(f"{API}/unidades/{g['id']}/longitudinal.csv", headers=h, params={"analitos": "Cr,Be"})
    linhas = r.content.decode("utf-8-sig").splitlines()
    assert "caminho pelas amostras, 150.02 m; 0 m = ponto da amostra BS-RP-1" in linhas[0]
    cab_ = linhas[1].split(";")
    assert cab_[:3] == ["amostra", "ponto", "distancia_m"]
    por = {ln.split(";")[0]: ln.split(";") for ln in linhas[2:]}
    assert por["BS-RP-2"][cab_.index("Cr (texto)")] == "<10" and por["BS-RP-2"][cab_.index("Cr (grafico)")] == "10,0"
    assert por["BS-RP-3"][1] == "4" and len(por) == 5
    u = {x["codigo"]: x for x in cliente.get(f"{API}/minas/{cenario['mina']['id']}/longitudinal/unidades", headers=h).json()}
    assert "N144" not in u and (u["GAL-1"]["amostras"], u["GAL-2"]["amostras"], u["GAL-1"]["eixo_versao"]) == (6, 0, None)
    d = cliente.get(f"{API}/unidades/{cenario['g2']['id']}/longitudinal", headers=h, params={"analitos": "Cr"}).json()
    assert d["amostras"] == [] and d["referencia"]["pontos"] == 0
    _, consulta = criar_usuario(cliente, token_admin, "cons", ["CONSULTA"])
    assert cliente.get(f"{API}/unidades/{g['id']}/longitudinal", headers=cab(consulta), params={"analitos": "Cr"}).status_code == 200


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
    d = cliente.get(f"{API}/unidades/{g2['id']}/longitudinal", headers=h, params={"analitos": "Cr"}).json()
    assert [a["codigo"] for a in d["amostras"]] == ["BS-RP-700", "BS-RP-701", "BS-RP-703"]
    assert "Lado esquerdo Rampa Sul" in {x["local"] for x in cliente.get(f"{API}/minas/{mina['id']}/amostras/sem-local", headers=h).json()}
    aid = d["amostras"][0]["id"]
    hist = cliente.get(f"{API}/auditoria", headers=h, params={"tabela": "amostra", "operacao": "U", "texto": aid}).json()["itens"]
    assert any(ev["depois"].get("unidade_id") == g2["id"] for ev in hist), "a ligação fica no histórico de alterações"
