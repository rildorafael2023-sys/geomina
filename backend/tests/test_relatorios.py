"""E17 — relatórios gerais: fichas de mapeamento (Excel/CSV), produção por período e histórico de alterações em CSV."""

import csv
import io

import openpyxl

from tests.conftest import cab, criar_usuario
from tests.test_mapeamento import API, criar, ficha_exemplo, h, local, termos  # noqa: F401


def _planilha(conteudo: bytes):
    return openpyxl.load_workbook(io.BytesIO(conteudo))


def test_relatorio_de_fichas(cliente, h, token_admin, local, termos):  # noqa: F811
    _, tg = criar_usuario(cliente, token_admin, "geologo1", ["GEOLOGO"])
    f1 = criar(cliente, cab(tg), ficha_exemplo(local, termos))
    criar(cliente, cab(tg), ficha_exemplo(local, termos, data="2026-11-02", amostras=[], medidas=[]))
    m = local["mina"]["id"]
    r = cliente.get(f"{API}/minas/{m}/relatorios/fichas.xlsx", headers=h)
    assert r.status_code == 200 and r.headers["content-disposition"].endswith('fichas_mapeamento.xlsx"')
    wb = _planilha(r.content)
    assert wb.sheetnames == ["Fichas", "Intervalos", "Estruturas", "Amostras citadas", "Metadados"]
    fichas = list(wb["Fichas"].values)
    assert len(fichas) == 3 and fichas[0][0] == "Ficha"
    linha = dict(zip(fichas[0], next(x for x in fichas[1:] if x[0] == f1["numero"]), strict=True))
    assert linha["Unidade"] == "TR-1FSA" and linha["Geólogo"] == "Geologo1" and linha["Estado"] == "Rascunho"
    assert linha["Intervalos"] == 4 and linha["Medidas"] == 4 and linha["Amostras"] == 1
    assert len(list(wb["Intervalos"].values)) == 1 + 8
    est = list(wb["Estruturas"].values)
    assert len(est) == 5
    medidas = {x[est[0].index("Medida")] for x in est[1:]}
    assert "230/30" in medidas and "315→20" in medidas
    # a estrutura ligada ao intervalo 2 (FLX) aparece com o nº do intervalo
    assert any(x[est[0].index("Intervalo nº")] == 2 for x in est[1:])
    am = list(wb["Amostras citadas"].values)
    assert am[1][am[0].index("Amostra")] == "BS-RP-474A"
    meta = dict(wb["Metadados"].values)
    assert meta["Fichas"] == 2 and meta["Mina"] == "MINA01 — Mina 01"

    # filtro por data: só a ficha de outubro
    wb = _planilha(cliente.get(f"{API}/minas/{m}/relatorios/fichas.xlsx", headers=h, params={"ate": "2026-10-31"}).content)
    assert len(list(wb["Fichas"].values)) == 2 and "Até" in dict(wb["Metadados"].values)["Filtros"]

    # CSV por tabela, separador ";" e vírgula decimal (Excel brasileiro)
    c = cliente.get(f"{API}/minas/{m}/relatorios/fichas.csv", headers=h, params={"tabela": "intervalos"}).content.decode("utf-8-sig")
    assert c.splitlines()[0].startswith("Ficha;Data;Unidade;Nº;De (m)")
    assert ";1,4;1,8;" in c and "14/10/2026" in c
    assert cliente.get(f"{API}/minas/{m}/relatorios/fichas.csv", headers=h, params={"tabela": "usuario"}).status_code == 422


def test_producao_por_periodo(cliente, h, token_admin, local, termos):  # noqa: F811
    _, tg = criar_usuario(cliente, token_admin, "geologo1", ["GEOLOGO"])
    _, tr = criar_usuario(cliente, token_admin, "revisor1", ["REVISOR"])
    m = local["mina"]["id"]
    f = criar(cliente, cab(tg), ficha_exemplo(local, termos))
    criar(cliente, cab(tg), ficha_exemplo(local, termos, data="2026-11-02", amostras=[]))
    criar(cliente, cab(tg), ficha_exemplo(local, termos, data="2025-01-10", amostras=[]))
    cliente.post(f"{API}/mapeamentos/{f['id']}/submeter", headers=cab(tg))
    cliente.post(f"{API}/mapeamentos/{f['id']}/aprovar", headers=cab(tr))
    for cod, d in (("BS-RP-1", "2026-10-03"), ("BS-RP-2", "2026-10-20"), ("BS-RP-3", "2026-11-05"), ("BS-RP-4", None)):
        r = cliente.post(f"{API}/minas/{m}/amostras", headers=h, json={"codigo": cod, "unidade_id": local["trav"]["id"], "data_coleta": d})
        assert r.status_code == 201, r.text
    laudo = "Amostra;Tipo;Cr (ppm);Be (ppm)\nBS-RP-1;SMP;500;3\nBS-RP-3;SMP;900;4\nX-9;SMP;1;1\nOREAS;STD;1;1\n"
    p = cliente.post(f"{API}/minas/{m}/laudos", headers=h, files={"arquivo": ("l.csv", laudo.encode())}).json()
    cliente.post(f"{API}/importacoes/{p['id']}/confirmar-laudo", headers=h, json={"certificado": "C-1"})

    d = cliente.get(f"{API}/minas/{m}/relatorios/producao", headers=h, params={"de": "2026-01-01", "ate": "2026-12-31"}).json()
    meses = {x["mes"]: x for x in d["meses"]}
    assert meses["2026-10"]["fichas"] == 1 and meses["2026-11"]["fichas"] == 1 and "2025-01" not in meses
    assert meses["2026-10"]["amostras"] == 2 and meses["2026-10"]["amostras_com_resultado"] == 1
    assert meses["2026-11"]["amostras"] == 1 and meses["2026-11"]["amostras_com_resultado"] == 1
    assert d["total"]["certificados"] == 1 and d["total"]["resultados"] == 6  # 3 amostras SMP × 2 analitos (padrão fora)
    assert d["total"]["fichas_aprovadas"] == 1 and meses["2026-10"]["rotulo"] == "out/2026"
    assert d["pendencias"] == {"amostras_sem_resultado": 2, "fichas_rascunho": 2, "fichas_aguardando_revisao": 0}
    assert d["amostras_sem_data"] == 1
    assert {g["nome"]: g["fichas"] for g in d["geologos"]}["Geologo1"] == 2
    # sem período: inclui 2025
    assert cliente.get(f"{API}/minas/{m}/relatorios/producao", headers=h).json()["total"]["fichas"] == 3
    wb = _planilha(cliente.get(f"{API}/minas/{m}/relatorios/producao.xlsx", headers=h).content)
    assert wb.sheetnames == ["Por mês", "Por geólogo", "Pendências", "Metadados"]
    assert list(wb["Por mês"].values)[-1][:2] == ("Total", 3)


def test_historico_csv_e_permissoes(cliente, h, token_admin, local, termos):  # noqa: F811
    _, tg = criar_usuario(cliente, token_admin, "geologo1", ["GEOLOGO"])
    criar(cliente, cab(tg), ficha_exemplo(local, termos))
    r = cliente.get(f"{API}/auditoria.csv", headers=h, params={"tabela": "mapeamento"})
    assert r.status_code == 200
    linhas = list(csv.reader(io.StringIO(r.content.decode("utf-8-sig")), delimiter=";"))
    assert linhas[0][:4] == ["Quando", "Usuário", "Operação", "Tabela"] 
    assert ["Geologo1", "inclusão", "Ficha de mapeamento"] in [x[1:4] for x in linhas[1:]]
    assert all(x[3] == "Ficha de mapeamento" for x in linhas[1:])  # filtro por tabela aplicado
    assert cliente.get(f"{API}/auditoria.csv", headers=cab(tg)).status_code == 403  # geólogo não lê o histórico geral
    m = local["mina"]["id"]
    assert cliente.get(f"{API}/minas/{m}/relatorios/fichas.xlsx", headers=cab(tg)).status_code == 200
    _, tc = criar_usuario(cliente, token_admin, "convidado", ["CONSULTA"])
    assert cliente.get(f"{API}/minas/{m}/relatorios/producao", headers=cab(tc)).status_code in (200, 403)
