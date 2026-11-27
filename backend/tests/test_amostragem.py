"""Etapa 8 — amostragem."""

import io
import os
from pathlib import Path

import openpyxl
import pytest

from tests.conftest import cab, criar_usuario

API = "/api/v1"
PLANILHA_REAL = Path(os.environ.get("GEOMINA_PLANILHA_CAMPO", "/nao/existe"))


@pytest.fixture
def h(token_admin):
    return cab(token_admin)


@pytest.fixture
def mina(cliente, h):
    return cliente.post(f"{API}/minas", headers=h, json={"codigo": "MINA01", "nome": "Mina 01", "srid_trabalho": 31983}).json()


@pytest.fixture
def termos(cliente, h):
    return {x["codigo"]: {t["codigo"]: t for t in x["termos"]} for x in cliente.get(f"{API}/dicionarios", headers=h).json()}


def nova(cliente, h, mina, **corpo):
    r = cliente.post(f"{API}/minas/{mina['id']}/amostras", headers=h, json=corpo)
    assert r.status_code == 201, r.text
    return r.json()


def xlsx(linhas):
    wb = openpyxl.Workbook()
    for r in linhas:
        wb.active.append(r)
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


def test_cadastro_com_normalizacao_e_unicidade(cliente, h, mina):
    a = nova(cliente, h, mina, codigo="BS - RP - 462 - A", data_coleta="2026-09-20", secao_de_m=1.4, secao_ate_m=1.8)
    assert a["codigo"] == "BS-RP-462A" and a["serie"] == "BS-RP" and a["estado"] == "coletada"
    r = cliente.post(f"{API}/minas/{mina['id']}/amostras", headers=h, json={"codigo": "bs-rp-462a"})
    assert r.status_code == 409
    r = cliente.post(f"{API}/minas/{mina['id']}/amostras", headers=h, json={"codigo": "RP 478"})
    assert r.status_code == 422 and r.json()["detalhes"]["sugestao"] == "BS-RP-478"
    assert nova(cliente, h, mina, codigo="BMT-TS-458", furo="FD-01", prof_de_m=10, prof_ate_m=11)["serie"] == "BMT-TS"
    r = cliente.post(f"{API}/minas/{mina['id']}/amostras", headers=h, json={"codigo": "BS-RP-1", "x": 1, "y": 2})
    assert r.status_code == 422 and r.json()["codigo"] == "srid_obrigatorio"
    r = cliente.post(f"{API}/minas/{mina['id']}/amostras", headers=h, json={"codigo": "BS-RP-2", "secao_de_m": 2, "secao_ate_m": 1})
    assert r.status_code == 422


def test_qaqc_duplicata_e_padrao(cliente, h, mina):
    nova(cliente, h, mina, codigo="BS-RP-468B")
    d = nova(cliente, h, mina, codigo="BS-RP-468BD", papel_controle="dup_campo", amostra_original_codigo="BS-RP-468B")
    assert d["amostra_original_codigo"] == "BS-RP-468B"
    r = cliente.post(f"{API}/minas/{mina['id']}/amostras", headers=h, json={"codigo": "BS-RP-900", "papel_controle": "dup_campo"})
    assert r.status_code == 422  # duplicata sem original (recusada pelo banco)
    r = cliente.post(f"{API}/minas/{mina['id']}/amostras", headers=h, json={"codigo": "BS-RP-901", "papel_controle": "padrao"})
    assert r.status_code == 422
    assert nova(cliente, h, mina, codigo="BS-RP-902", papel_controle="padrao", padrao_codigo="OREAS920B")["padrao_codigo"] == "OREAS920B"


def test_proximo_codigo(cliente, h, mina):
    for c in ("BS-RP-462A", "BS-RP-471", "BS-RP-99"):
        nova(cliente, h, mina, codigo=c)
    assert cliente.get(f"{API}/minas/{mina['id']}/amostras/proximo-codigo", headers=h).json()["codigo"] == "BS-RP-472"


def test_lote_de_envio_muda_estado_e_fica_fechado(cliente, h, mina):
    for c in ("BS-RP-1", "BS-RP-2", "BS-RP-3"):
        nova(cliente, h, mina, codigo=c)
    lote = cliente.post(f"{API}/minas/{mina['id']}/lotes", headers=h,
                        json={"codigo": "L-2026-01", "laboratorio": "SGS Geosol", "amostras": ["BS-RP-1", "bs - rp - 2"]}).json()
    assert lote["amostras"] == ["BS-RP-1", "BS-RP-2"] and lote["estado"] == "aberto"
    r = cliente.post(f"{API}/lotes/{lote['id']}/amostras", headers=h, json={"codigos": ["BS-RP-404"]})
    assert r.status_code == 422 and r.json()["detalhes"] == ["BS-RP-404"]
    e = cliente.post(f"{API}/lotes/{lote['id']}/enviar", headers=h, json={"data_envio": "2026-09-24"}).json()
    assert e["estado"] == "enviado"
    lista = {a["codigo"]: a for a in cliente.get(f"{API}/minas/{mina['id']}/amostras", headers=h).json()}
    assert lista["BS-RP-1"]["estado"] == "enviada" and lista["BS-RP-1"]["lotes"] == ["L-2026-01"]
    assert lista["BS-RP-3"]["estado"] == "coletada"
    r = cliente.post(f"{API}/lotes/{lote['id']}/amostras", headers=h, json={"codigos": ["BS-RP-3"]})
    assert r.status_code == 422 and "já foi enviado" in r.json()["mensagem"]
    a1 = lista["BS-RP-1"]
    r = cliente.put(f"{API}/amostras/{a1['id']}", headers=h, json={**{k: a1[k] for k in ("papel_controle", "padrao_codigo")},
                                                                   "codigo": "BS-RP-1000", "versao": a1["versao"]})
    assert r.status_code == 422 and r.json()["codigo"] == "codigo_bloqueado"


def test_gerar_amostras_da_ficha(cliente, h, mina, termos):
    n = cliente.post(f"{API}/unidades", headers=h, json={"mina_id": mina["id"], "tipo": "NIVEL", "codigo": "N144", "nome": "N144"}).json()
    L = termos["LITOLOGIA"]
    f = cliente.post(f"{API}/mapeamentos", headers=h, json={
        "unidade_id": n["id"], "data": "2026-10-14", "distancia_m": 28, "referencia": "entrada",
        "intervalos": [{"de_m": 0, "ate_m": 1.4, "litologia_id": L["ANG"]["id"]}, {"de_m": 1.4, "ate_m": 3, "litologia_id": L["FLX"]["id"]}],
        "amostras": [{"codigo": "BS-RP-474A", "de_m": 1.5, "ate_m": 2.5}, {"codigo": "BS-RP-474B"}]}).json()
    r = cliente.post(f"{API}/mapeamentos/{f['id']}/gerar-amostras", headers=h)
    assert r.status_code == 201
    a = {x["codigo"]: x for x in r.json()}
    assert a["BS-RP-474A"]["litologia"] == "Flogopita xisto" and a["BS-RP-474A"]["ficha"] == f["numero"]
    assert a["BS-RP-474A"]["unidade"] == "N144" and a["BS-RP-474A"]["data_coleta"] == "2026-10-14"
    assert a["BS-RP-474B"]["litologia"] is None
    assert cliente.post(f"{API}/mapeamentos/{f['id']}/gerar-amostras", headers=h).json() == []  # não duplica


PLANILHA = [
    ["Ponto", "Sub Ponto", "Direção da seção", "Intervalo", "Espessura", "Litologia", "Descriçao de campo (Afloramento)",
     "X", "Y", "Z", "Data", "Amostra", "Designação de campo (Amostra)", "O que fazer com a amostra"],
    ["BS - RP - 225", None, "Lado esquerdo Rampa Sul", "0 m - 4,5 m", None, "Gnaisse Pelítico ", "Gnaisse", 500783.5, 7800419.5, 535.1, None, None, None, None],
    [None, None, "Lado esquerdo Rampa Sul", "4,5 m - 5 m", None, "Flogopita Xisto", "Flogopita xisto silicoso", "500783,5\n", 7800419.5, 535.1,
     "15/12/2023", "BS - RP - 225", "BS - RP - 225", "GEOQUÍMICA"],
    [None, None, "Travessa 1F", "0 m - 1 m", None, "anfibolio - flogopita xisto", "x", 500800, 7800400, 530, None, "RP 478", None, "GEOQUÍMICA"],
    [None, None, "Travessa 1F", "1 m - 2 m", None, "Rocha Desconhecida", "y", None, None, None, None, "BS - RP - 237 - B", None, "IDENTIFICAÇÃO MINERALÓGICA"],
    [None, None, "Travessa 1F", "2 m - 3 m", None, "Gnaisse pelitico", "z", None, None, None, None, "BS - RP - 237 B", None, None],
    [None, None, "Travessa 1F", "3 m - 4 m", None, "Gnaisse pelitico", "z", None, None, None, None, "x", None, None],
    [None, None, "Travessa 1F", "intervalo?", None, "Gnaisse pelitico", "z", None, None, None, "ontem", "SAB-CP-026", None, None],
]


def test_importacao_planilha_previa_e_confirmacao(cliente, h, mina, termos):
    nova(cliente, h, mina, codigo="BS-RP-237B")  # já existe
    r = cliente.post(f"{API}/minas/{mina['id']}/amostras/importacoes", headers=h,
                     files={"arquivo": ("GEOQUIMICA_DESCRICAO.xlsx", xlsx(PLANILHA))})
    assert r.status_code == 201, r.text
    p = r.json()
    assert p["total"] == 5  # linhas sem amostra e "x" ignoradas
    por = {x["original"]: x for x in p["linhas"]}
    assert por["BS - RP - 225"]["codigo"] == "BS-RP-225" and por["BS - RP - 225"]["status"] == "ok"
    assert por["BS - RP - 225"]["ponto"] == "BS - RP - 225" and (por["BS - RP - 225"]["de"], por["BS - RP - 225"]["ate"]) == (4.5, 5)
    assert por["BS - RP - 225"]["x"] == 500783.5 and por["BS - RP - 225"]["data"] == "2023-12-15"
    assert por["BS - RP - 225"]["litologia"] == "Flogopita xisto"
    assert por["RP 478"]["status"] == "sugestao" and por["RP 478"]["codigo"] == "BS-RP-478"
    assert por["RP 478"]["litologia"] == "Anfibólio-flogopita xisto"
    assert por["BS - RP - 237 - B"]["status"] == "existente"
    assert por["BS - RP - 237 B"]["status"] == "repetido"
    # código de outra série: aceito como está (banco completo); a data inválida só gera aviso
    assert por["SAB-CP-026"]["codigo"] == "SAB-CP-026" and por["SAB-CP-026"]["status"] != "erro"
    assert any("Data" in m for m in por["SAB-CP-026"]["mensagens"])
    assert p["litologias_nao_reconhecidas"] == {"Rocha Desconhecida": 1}
    assert cliente.get(f"{API}/minas/{mina['id']}/amostras", headers=h).json()[0]["codigo"] == "BS-RP-237B"  # nada gravado ainda
    c = cliente.post(f"{API}/importacoes/{p['id']}/confirmar-amostras", headers=h,
                     json={"srid": 29193, "aceitar_sugestoes": True}).json()
    assert c["gravadas"] == 3
    assert sorted(i["motivo"] for i in c["ignoradas"]) == ["já cadastrada", "já cadastrada"]
    assert {x["codigo"]: x["serie"] for x in cliente.get(f"{API}/minas/{mina['id']}/amostras", headers=h).json()}["SAB-CP-026"] == "SAB-CP"
    a = {x["codigo"]: x for x in cliente.get(f"{API}/minas/{mina['id']}/amostras", headers=h).json()}
    assert a["BS-RP-225"]["srid"] == 29193 and a["BS-RP-225"]["local_descricao"] == "Lado esquerdo Rampa Sul"
    assert a["BS-RP-478"]["observacoes"] == "Código original na planilha: RP 478"
    assert cliente.post(f"{API}/importacoes/{p['id']}/confirmar-amostras", headers=h, json={}).status_code == 422
    hist = cliente.get(f"{API}/minas/{mina['id']}/importacoes", headers=h).json()
    assert hist[0]["gravadas"] == 3 and len(hist[0]["arquivo_sha256"]) == 64


def test_importacao_sem_sistema_de_coordenadas_nao_inventa(cliente, h, mina):
    p = cliente.post(f"{API}/minas/{mina['id']}/amostras/importacoes", headers=h,
                     files={"arquivo": ("p.xlsx", xlsx(PLANILHA[:3]))}).json()
    cliente.post(f"{API}/importacoes/{p['id']}/confirmar-amostras", headers=h, json={})
    a = cliente.get(f"{API}/minas/{mina['id']}/amostras", headers=h).json()[0]
    assert a["x"] is None and a["srid"] is None and "não importadas" in a["observacoes"]


def test_importacao_csv_modelo_simples(cliente, h, mina):
    csv = "codigo;data;litologia;descricao\nBS-RP-500;14/10/2026;Gnp;canal na parede\nBMT-TS-10;14/10/2026;;testemunho\n"
    p = cliente.post(f"{API}/minas/{mina['id']}/amostras/importacoes", headers=h,
                     files={"arquivo": ("amostras.csv", csv.encode("latin-1"))}).json()
    assert p["resumo"]["ok"] == 2 and p["linhas"][0]["litologia"] == "Gnaisse pelítico"


@pytest.mark.skipif(not PLANILHA_REAL.exists(), reason="planilha real de campo não disponível nesta máquina")
def test_planilha_real_de_campo(cliente, h, mina):
    p = cliente.post(f"{API}/minas/{mina['id']}/amostras/importacoes", headers=h,
                     files={"arquivo": ("GEOQUIMICA_DESCRICAO.xlsx", PLANILHA_REAL.read_bytes())}).json()
    assert p["total"] >= 300
    assert p["resumo"]["sugestao"] > 100  # grafias "RP 478" (sem BS) exigem confirmação
    c = cliente.post(f"{API}/importacoes/{p['id']}/confirmar-amostras", headers=h,
                     json={"srid": 29193, "aceitar_sugestoes": True}).json()
    assert c["gravadas"] == p["resumo"]["ok"] + p["resumo"]["sugestao"]
    print("\nPLANILHA REAL:", p["total"], p["resumo"], "não reconhecidas:", p["litologias_nao_reconhecidas"], "gravadas:", c["gravadas"])


def test_permissoes(cliente, token_admin, mina):
    _, t = criar_usuario(cliente, token_admin, "tec", ["TECNICO"])
    assert cliente.post(f"{API}/minas/{mina['id']}/amostras", headers=cab(t), json={"codigo": "BS-RP-1"}).status_code == 201
    assert cliente.post(f"{API}/minas/{mina['id']}/amostras/importacoes", headers=cab(t),
                        files={"arquivo": ("p.csv", b"codigo\nBS-RP-2\n")}).status_code == 403


def test_planilha_com_coluna_de_galeria_liga_a_unidade(cliente, h, mina):
    """E18: a coluna "galeria/unidade" da planilha liga a amostra à unidade cadastrada (antes era descartada)."""
    n = cliente.post(f"{API}/unidades", headers=h, json={"mina_id": mina["id"], "tipo": "NIVEL", "codigo": "N9", "nome": "N9"}).json()
    g = cliente.post(f"{API}/unidades", headers=h, json={"mina_id": mina["id"], "tipo": "GALERIA", "codigo": "1F-5", "nome": "g", "pai_id": n["id"]}).json()
    csv = "codigo;galeria;local\nBS-RP-700;1f 5;\nBS-RP-701;GAL-NAO-EXISTE;\nBS-RP-702;1F5;parede esquerda\n"
    p = cliente.post(f"{API}/minas/{mina['id']}/amostras/importacoes", headers=h, files={"arquivo": ("a.csv", csv.encode())}).json()
    linhas = {x["codigo"]: x for x in p["linhas"]}
    assert linhas["BS-RP-700"]["unidade"] == "1F-5" and linhas["BS-RP-702"]["unidade_id"] == g["id"]
    assert linhas["BS-RP-701"]["unidade_id"] is None and any("não cadastrada" in m for m in linhas["BS-RP-701"]["mensagens"])
    assert cliente.post(f"{API}/importacoes/{p['id']}/confirmar-amostras", headers=h, json={}).json()["gravadas"] == 3
    am = {a["codigo"]: a for a in cliente.get(f"{API}/minas/{mina['id']}/amostras", headers=h).json()}
    assert am["BS-RP-700"]["unidade_id"] == g["id"] and am["BS-RP-702"]["local_descricao"] == "parede esquerda"
    assert am["BS-RP-701"]["unidade_id"] is None and am["BS-RP-701"]["local_descricao"] == "GAL-NAO-EXISTE"
