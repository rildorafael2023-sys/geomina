"""Geoquímica operacional (Etapa 2): base por resultado do laudo, filtros encadeados e conciliação laudo × cadastro.

Regra do usuário: TODOS os resultados dos laudos devem poder ser usados — inclusive de amostras ainda não cadastradas.
"""

import os
from pathlib import Path

import pytest

from tests.conftest import cab, criar_usuario

API = "/api/v1"
PASTA = Path(os.environ.get("GEOMINA_LAUDOS", "/nao/existe"))
LAUDOS = [PASTA / "2f1c1862-GQ2613496.XLS", PASTA / "6f3a32f9-GQ2604840_1.XLS"]


@pytest.fixture
def h(token_admin):
    return cab(token_admin)


@pytest.fixture
def c(cliente, h):
    mina = cliente.post(f"{API}/minas", headers=h, json={"codigo": "MINA01", "nome": "Mina 01", "srid_trabalho": 31983}).json()
    m = mina["id"]
    dic = {x["codigo"]: list(x["termos"]) for x in cliente.get(f"{API}/dicionarios", headers=h).json()}
    lit = dic["LITOLOGIA"]

    def un(tipo, cod, pai=None):
        return cliente.post(f"{API}/unidades", headers=h, json={"mina_id": m, "tipo": tipo, "codigo": cod, "nome": cod, "pai_id": pai}).json()
    n1, n2 = un("NIVEL", "N144"), un("NIVEL", "N120")
    g1, g2 = un("GALERIA", "GAL-1", n1["id"]), un("GALERIA", "GAL-2", n1["id"])
    tv = un("TRAVESSA", "TV-1A", g1["id"])
    g3 = un("GALERIA", "GAL-3", n2["id"])
    camp = cliente.post(f"{API}/minas/{m}/campanhas", headers=h, json={"codigo": "C-2026", "nome": "Campanha 2026"}).json()

    def am(cod, **kw):
        r = cliente.post(f"{API}/minas/{m}/amostras", headers=h, json={"codigo": cod, **kw})
        assert r.status_code == 201, r.text
        return r.json()
    am("BS-RP-1", unidade_id=g1["id"], litologia_id=lit[0]["id"], campanha_id=camp["id"], data_coleta="2026-09-01")
    am("BS-RP-2", unidade_id=tv["id"], litologia_id=lit[1]["id"], data_coleta="2026-09-05")
    am("BS-RP-3", unidade_id=g3["id"], litologia_id=lit[0]["id"], x=500000, y=7800000, z=500, srid=31983, local_descricao="Travessa 3 - Reta",
       data_coleta="2026-09-10")
    a10 = am("BS-RP-10", unidade_id=g1["id"])
    am("BS-RP-11", unidade_id=g2["id"])
    lote = cliente.post(f"{API}/minas/{m}/lotes", headers=h, json={"codigo": "L1", "laboratorio": "SGS", "amostras": ["BS-RP-10"]}).json()
    cliente.post(f"{API}/lotes/{lote['id']}/enviar", headers=h, json={"data_envio": "2026-09-20"})
    csv = ("Amostra;Tipo;Cr (ppm);Be (ppm);MgO (%)\n"
           "BS-RP-1;SMP;519;4,2;17,6\n"
           "BS-RP-2;SMP;<10;68,1;20\n"
           "BS-RP-3;SMP;1508;12;N.A.\n"
           "BS-RP-3A;SMP;900;7;15\n"
           "BS-RP-3B;SMP;1100;8;16\n"
           "BS-RP-3A;DUP;910;7;15\n"
           "BS-RP-50;SMP;300;2;10\n"
           "XYZ-9;SMP;100;1;1\n"
           "OREAS920B;STD;100;2,2;0,33\n")
    p = cliente.post(f"{API}/minas/{m}/laudos", headers=h, files={"arquivo": ("laudo.csv", csv.encode())}).json()
    assert cliente.post(f"{API}/importacoes/{p['id']}/confirmar-laudo", headers=h, json={"certificado": "C-1"}).status_code == 200
    return {"m": m, "n1": n1, "n2": n2, "g1": g1, "g2": g2, "g3": g3, "tv": tv, "lit": lit, "camp": camp, "a10": a10}


def reg(cliente, h, c, **p):
    r = cliente.get(f"{API}/minas/{c['m']}/geoop/registros", headers=h, params=p)
    assert r.status_code == 200, r.text
    return r.json()


def test_todos_os_resultados_entram(cliente, h, c):
    d = reg(cliente, h, c, analitos="Cr,MgO")
    por = {x["codigo"]: x for x in d["itens"]}
    assert set(por) == {"BS-RP-1", "BS-RP-2", "BS-RP-3", "BS-RP-10", "BS-RP-11", "BS-RP-3A", "BS-RP-3B", "BS-RP-50", "XYZ-9"}
    assert "OREAS920B" not in por, "padrão do laboratório não é amostra (fica no QA/QC)"
    st = {k: v["status"] for k, v in por.items()}
    assert st == {"BS-RP-1": "com_resultado", "BS-RP-2": "com_resultado", "BS-RP-3": "com_resultado", "BS-RP-10": "aguardando",
                  "BS-RP-11": "sem_envio", "BS-RP-3A": "so_laudo", "BS-RP-3B": "so_laudo", "BS-RP-50": "so_laudo", "XYZ-9": "so_laudo"}
    assert por["BS-RP-3A"]["valores"]["Cr"]["y"] == 900 and por["XYZ-9"]["valores"]["Cr"]["texto"] == "100", "resultado sem cadastro é utilizável"
    assert por["BS-RP-2"]["valores"]["Cr"] == {"y": 10.0, "texto": "<10", "situacao": "abaixo_ld", "unidade": "ppm", "certificado": "C-1"}
    assert por["BS-RP-3"]["valores"]["MgO"]["situacao"] == "sem_valor"
    assert por["BS-RP-2"]["nivel"]["codigo"] == "N144" and por["BS-RP-2"]["galeria"]["codigo"] == "GAL-1" and por["BS-RP-2"]["trecho"]["codigo"] == "TV-1A"
    assert por["BS-RP-1"]["laboratorios"] and list(por["BS-RP-1"]["certificados"].values()) == ["C-1"]
    assert d["resumo_status"]["so_laudo"] == 4 and d["total"] == 9
    det = cliente.get(f"{API}/minas/{c['m']}/geoop/registros/{por['BS-RP-3A']['chave']}", headers=h).json()
    assert {(x["analito"], x["tipo_linha"]) for x in det["resultados"]} >= {("Cr", "SMP"), ("Be", "SMP"), ("MgO", "SMP"), ("Cr", "DUP")}, \
        "a consulta mostra todos os analitos do laudo, inclusive a duplicata do laboratório"


def test_filtros_encadeados_com_contagens(cliente, h, c):
    d = reg(cliente, h, c)
    niveis = {o["rotulo"]: o["n"] for o in d["opcoes"]["nivel"]}
    assert niveis == {"N144": 4, "N120": 1, "(sem nível)": 4}
    d = reg(cliente, h, c, nivel=c["n1"]["id"])
    assert d["total"] == 4
    assert {o["rotulo"]: o["n"] for o in d["opcoes"]["galeria"]} == {"GAL-1": 3, "GAL-2": 1}, "o nível restringe as galerias"
    assert {o["rotulo"] for o in d["opcoes"]["nivel"]} == {"N144", "N120", "(sem nível)"}, "a própria faceta mostra as alternativas"
    d = reg(cliente, h, c, nivel=c["n1"]["id"], galeria=c["g1"]["id"])
    assert sorted(x["codigo"] for x in d["itens"]) == ["BS-RP-1", "BS-RP-10", "BS-RP-2"]
    assert {o["rotulo"]: o["n"] for o in d["opcoes"]["trecho"]} == {"TV-1A": 1, "(sem trecho)": 2}
    d = reg(cliente, h, c, litologia=c["lit"][0]["id"])
    assert sorted(x["codigo"] for x in d["itens"]) == ["BS-RP-1", "BS-RP-3"]
    d = reg(cliente, h, c, status="so_laudo,aguardando")
    assert d["total"] == 5
    d = reg(cliente, h, c, cadastro="nao", serie="BS-RP")
    assert sorted(x["codigo"] for x in d["itens"]) == ["BS-RP-3A", "BS-RP-3B", "BS-RP-50"]
    d = reg(cliente, h, c, campanha=c["camp"]["id"])
    assert [x["codigo"] for x in d["itens"]] == ["BS-RP-1"]
    d = reg(cliente, h, c, teor_analito="Cr", teor_min=800)
    assert sorted(x["codigo"] for x in d["itens"]) == ["BS-RP-3", "BS-RP-3A", "BS-RP-3B"], "faixa de teor inclui os só no laudo"
    d = reg(cliente, h, c, texto="rp 3")
    assert sorted(x["codigo"] for x in d["itens"]) == ["BS-RP-3", "BS-RP-3A", "BS-RP-3B"]
    d = reg(cliente, h, c, texto="travessa 3")
    assert [x["codigo"] for x in d["itens"]] == ["BS-RP-3"], "busca também pelo texto do local"
    d = reg(cliente, h, c, data_de="2026-09-04", data_ate="2026-09-30")
    assert sorted(x["codigo"] for x in d["itens"]) == ["BS-RP-2", "BS-RP-3"]
    d = reg(cliente, h, c, tamanho=4, pagina=3)
    assert d["total"] == 9 and len(d["itens"]) == 1, "paginação no servidor"


def test_conciliacao_subamostras_e_cadastro(cliente, h, c, token_admin):
    m = c["m"]
    k = cliente.get(f"{API}/minas/{m}/geoop/conciliacao", headers=h).json()
    assert [(s["codigo"], s["pai"]["codigo"]) for s in k["subamostras"]] == [("BS-RP-3A", "BS-RP-3"), ("BS-RP-3B", "BS-RP-3")]
    assert [s["codigo"] for s in k["nao_cadastradas"]] == ["BS-RP-50"]
    assert [s["codigo"] for s in k["fora_das_regras"]] == ["XYZ-9"]
    assert [s["codigo"] for s in k["controles_laboratorio"]] == ["OREAS920B"]
    _, cons = criar_usuario(cliente, token_admin, "cons", ["CONSULTA"])
    assert cliente.post(f"{API}/minas/{m}/geoop/conciliacao/subamostras", headers=cab(cons), json={"codigos": ["BS-RP-3A"]}).status_code == 403
    r = cliente.post(f"{API}/minas/{m}/geoop/conciliacao/subamostras", headers=h, json={"codigos": ["BS-RP-50"]})
    assert r.status_code == 422 and r.json()["codigo"] == "nao_e_subamostra"
    r = cliente.post(f"{API}/minas/{m}/geoop/conciliacao/subamostras", headers=h, json={"codigos": ["BS-RP-3A", "BS-RP-3B"]}).json()
    assert r["criadas"] == ["BS-RP-3A", "BS-RP-3B"] and r["resultados_ligados"] == 9  # 3A: 3 SMP + 3 DUP; 3B: 3 SMP
    a = {x["codigo"]: x for x in cliente.get(f"{API}/minas/{m}/amostras", headers=h).json()}
    assert (a["BS-RP-3A"]["x"], a["BS-RP-3A"]["unidade"], a["BS-RP-3A"]["local_descricao"]) == (500000, "GAL-3", "Travessa 3 - Reta"), "herda o ponto"
    assert a["BS-RP-3A"]["litologia_id"] is None and "Sub-amostra do ponto BS-RP-3" in a["BS-RP-3A"]["observacoes"]
    d = reg(cliente, h, c, galeria=c["g3"]["id"], analitos="Cr")
    assert {x["codigo"]: (x["status"], x["valores"]["Cr"]["y"]) for x in d["itens"]} == \
        {"BS-RP-3": ("com_resultado", 1508), "BS-RP-3A": ("com_resultado", 900), "BS-RP-3B": ("com_resultado", 1100)}
    det = cliente.get(f"{API}/minas/{m}/geoop/registros/laudo:BS-RP-3A", headers=h).json()
    assert det["cadastrada"] and det["chave"] != "laudo:BS-RP-3A", "a chave antiga do laudo leva à amostra cadastrada"
    r = cliente.post(f"{API}/minas/{m}/geoop/conciliacao/cadastrar", headers=h, json={"codigos": ["BS-RP-50"]}).json()
    assert r["criadas"] == ["BS-RP-50"]
    assert cliente.post(f"{API}/minas/{m}/geoop/conciliacao/cadastrar", headers=h, json={"codigos": ["XYZ-9"]}).status_code == 422
    k = cliente.get(f"{API}/minas/{m}/geoop/conciliacao", headers=h).json()
    assert (k["subamostras"], k["nao_cadastradas"]) == ([], [])
    d = reg(cliente, h, c)
    assert d["resumo_status"]["so_laudo"] == 1, "só o código fora das regras continua só no laudo"


def test_csv_com_filtros(cliente, h, c):
    r = cliente.get(f"{API}/minas/{c['m']}/geoop/registros.csv", headers=h, params={"analitos": "Cr,Be", "cadastro": "nao"})
    linhas = r.content.decode("utf-8-sig").splitlines()
    assert "cadastro=nao" in linhas[0]
    cab_ = linhas[1].split(";")
    assert cab_[0] == "amostra" and cab_[-2:] == ["Cr", "Be"]
    por = {ln.split(";")[0]: ln.split(";") for ln in linhas[2:]}
    assert set(por) == {"BS-RP-3A", "BS-RP-3B", "BS-RP-50", "XYZ-9"} and por["XYZ-9"][-2:] == ["100", "1"]


@pytest.mark.skipif(not LAUDOS[0].exists(), reason="laudos reais não disponíveis nesta máquina")
def test_laudos_reais_nenhum_resultado_fica_de_fora(cliente, h):
    m = cliente.post(f"{API}/minas", headers=h, json={"codigo": "M", "nome": "Mina", "srid_trabalho": 31983}).json()["id"]
    for f in LAUDOS:
        p = cliente.post(f"{API}/minas/{m}/laudos", headers=h, files={"arquivo": (f.name, f.read_bytes())}).json()
        cliente.post(f"{API}/importacoes/{p['id']}/confirmar-laudo", headers=h, json={})
    d = cliente.get(f"{API}/minas/{m}/geoop/registros", headers=h, params={"tamanho": 5000}).json()
    assert d["total"] == 66 and d["resumo_status"]["so_laudo"] == 66, "nenhuma amostra cadastrada: todas aparecem como só no laudo"
    assert sum(x["n_resultados"] for x in d["itens"]) == 3168, "todos os resultados SMP dos 2 laudos estão representados"
    assert len({a for x in d["itens"] for a in x["analitos"]}) == 48, "os 48 analitos dos laudos ficam disponíveis"
    k = cliente.get(f"{API}/minas/{m}/geoop/conciliacao", headers=h).json()
    assert len(k["nao_cadastradas"]) + len(k["fora_das_regras"]) >= 60
