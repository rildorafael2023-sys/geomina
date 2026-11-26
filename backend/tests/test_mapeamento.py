"""Etapa 5 — ficha digital de mapeamento (API e banco)."""

import pytest
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError

from tests.conftest import cab, criar_usuario

API = "/api/v1"


@pytest.fixture
def h(token_admin):
    return cab(token_admin)


@pytest.fixture
def termos(cliente, h):
    d = {x["codigo"]: {t["codigo"]: t for t in x["termos"]} for x in cliente.get(f"{API}/dicionarios", headers=h).json()}
    return d


@pytest.fixture
def local(cliente, h):
    m = cliente.post(f"{API}/minas", headers=h, json={"codigo": "MINA01", "nome": "Mina 01", "srid_trabalho": 31983,
                                                      "declinacao_magnetica": -22.5}).json()
    def nova(tipo, cod, pai=None):
        return cliente.post(f"{API}/unidades", headers=h, json={"mina_id": m["id"], "tipo": tipo, "codigo": cod,
                                                                "nome": cod, "pai_id": pai}).json()
    n = nova("NIVEL", "N144")
    t = nova("TRAVESSA", "TR-1FSA", n["id"])
    return {"mina": m, "nivel": n, "trav": t}


def ficha_exemplo(local, termos, **extra):
    """Ficha baseada na ficha real de 14/10/26 (Travessa 1FSA, 26 m da entrada)."""
    L, E = termos["LITOLOGIA"], termos["TIPO_ESTRUTURA"]
    corpo = {
        "unidade_id": local["trav"]["id"], "data": "2026-10-14", "distancia_m": 26, "referencia": "entrada da travessa",
        "altura_m": 3.2, "exposicao_id": termos["EXPOSICAO"]["FRENTE"]["id"],
        "descricao": "Continua mesma estruturação observada ao longo da TR1FS.",
        "intervalos": [
            {"de_m": 0, "ate_m": 1.4, "litologia_id": L["ANG"]["id"]},
            {"de_m": 1.4, "ate_m": 1.8, "litologia_id": L["FLX"]["id"],
             "alteracao_id": termos["ALTERACAO"]["FLOGOPITIZACAO"]["id"],
             "intensidade_id": termos["INTENSIDADE"]["FORTE"]["id"]},
            {"de_m": 1.8, "ate_m": 2.2, "litologia_id": L["ANG"]["id"]},
            {"de_m": 2.2, "ate_m": 3.2, "litologia_id": L["GNP"]["id"]},
        ],
        "medidas": [
            {"tipo_id": E["S1"]["id"], "valor_a": 230, "valor_b": 30, "intervalo_indice": 1},
            {"tipo_id": E["FRATURA"]["id"], "valor_a": 160, "valor_b": 90, "familia": "FR-II"},
            {"tipo_id": E["FRATURA"]["id"], "valor_a": 140, "valor_b": 90, "convencao": "strike_rhr_dip", "familia": "FR-I"},
            {"tipo_id": E["LINEACAO"]["id"], "valor_a": 315, "valor_b": 20, "convencao": "trend_plunge"},
        ],
        "amostras": [{"codigo": "BS - RP - 474 - A", "de_m": 1.4, "ate_m": 1.8,
                      "destino_id": termos["DESTINO_AMOSTRA"]["GEOQUIMICA"]["id"]}],
    }
    corpo.update(extra)
    return corpo


def criar(cliente, h, corpo):
    r = cliente.post(f"{API}/mapeamentos", headers=h, json=corpo)
    assert r.status_code == 201, r.text
    return r.json()


def salvar(cliente, h, f, **mudancas):
    corpo = {k: f[k] for k in ("unidade_id", "data", "hora", "acompanhantes", "exposicao_id", "distancia_m",
                               "referencia", "x", "y", "z", "azimute_eixo", "largura_m", "altura_m",
                               "norte_referencia", "declinacao", "descricao", "agua_id", "obs_geotecnicas")}
    corpo["intervalos"] = [{k: v for k, v in i.items()} for i in f["intervalos"]]
    corpo["medidas"] = [{"id": m["id"], "tipo_id": m["tipo_id"], "convencao": m["valor_digitado"]["convencao"],
                         "valor_a": m["valor_digitado"]["a"], "valor_b": m["valor_digitado"]["b"],
                         "familia": m["familia"]} for m in f["medidas"]]
    corpo["amostras"] = [{k: v for k, v in a.items()} for a in f["amostras"]]
    corpo.update(mudancas)
    corpo["versao"] = f["versao"]
    return cliente.put(f"{API}/mapeamentos/{f['id']}", headers=h, json=corpo)


# ------------------------------------------------------------------ dicionários
def test_dicionarios_iniciais(termos):
    assert {"LITOLOGIA", "TIPO_ESTRUTURA", "ALTERACAO", "INTENSIDADE", "MINERALIZACAO", "MINERAL", "TEXTURA",
            "CONTATO", "EXPOSICAO", "AGUA", "DESTINO_AMOSTRA"} <= set(termos)
    assert termos["LITOLOGIA"]["GNP"]["sigla"] == "Gnp"
    assert termos["TIPO_ESTRUTURA"]["LINEACAO"]["classe"] == "linear"


@pytest.mark.parametrize("texto,codigo", [("Gnaisse Pelitico", "GNP"), ("anfibolio - flogopita xisto", "AFX"),
                                          ("Gnp", "GNP"), ("Lente cloritito", "CLT")])
def test_reconhecer_grafias_da_planilha(cliente, h, texto, codigo):
    r = cliente.get(f"{API}/dicionarios/LITOLOGIA/reconhecer", headers=h, params={"texto": texto}).json()
    assert r["codigo"] == codigo


def test_editar_dicionario(cliente, h, token_admin, termos):
    r = cliente.post(f"{API}/dicionarios/LITOLOGIA/termos", headers=h,
                     json={"codigo": "SERP", "nome": "Serpentinito", "sigla": "Spt", "cor": "#335533"})
    assert r.status_code == 201
    assert cliente.post(f"{API}/dicionarios/LITOLOGIA/termos", headers=h,
                        json={"codigo": "GNP2", "nome": "gnaisse pelitico"}).status_code == 409  # já existe
    assert cliente.post(f"{API}/dicionarios/TIPO_ESTRUTURA/termos", headers=h,
                        json={"codigo": "XX", "nome": "Sem classe"}).status_code == 422
    t = termos["LITOLOGIA"]["PEG"]
    r = cliente.put(f"{API}/termos/{t['id']}/sinonimos", headers=h, json={"textos": ["Pegmatoide"]})
    assert r.status_code == 200
    assert cliente.get(f"{API}/dicionarios/LITOLOGIA/reconhecer", headers=h,
                       params={"texto": "pegmatóide"}).json()["codigo"] == "PEG"
    _, tg = criar_usuario(cliente, token_admin, "geologo1", ["GEOLOGO"])
    assert cliente.post(f"{API}/dicionarios/LITOLOGIA/termos", headers=cab(tg),
                        json={"codigo": "Z", "nome": "Z"}).status_code == 403


# ------------------------------------------------------------------ ficha
def test_criar_ficha_completa(cliente, h, local, termos):
    f = criar(cliente, h, ficha_exemplo(local, termos))
    assert f["numero"] == "MAP-2026-0001" and f["estado"] == "rascunho" and f["revisao"] == 0
    assert f["unidade_caminho"] == ["N144", "TR-1FSA"]
    assert f["declinacao"] == -22.5  # herdada da mina
    assert f["crs"] == "SIRGAS 2000 / UTM zone 23S"
    assert [(i["de_m"], i["ate_m"]) for i in f["intervalos"]] == [(0, 1.4), (1.4, 1.8), (1.8, 2.2), (2.2, 3.2)]
    s1, fr2, fr1, lin = f["medidas"]
    assert (s1["classe"], s1["dip_dir"], s1["dip"]) == ("planar", 230, 30)
    assert s1["intervalo_id"] == f["intervalos"][1]["id"]
    assert (fr1["dip_dir"], fr1["valor_digitado"]) == (230, {"a": 140, "b": 90, "convencao": "strike_rhr_dip"})
    assert (lin["classe"], lin["trend"], lin["plunge"], lin["dip"]) == ("linear", 315, 20, None)
    assert f["amostras"][0]["codigo"] == "BS-RP-474A"
    assert f["avisos"] == []
    assert f["pode_editar"] is True
    assert criar(cliente, h, ficha_exemplo(local, termos))["numero"] == "MAP-2026-0002"


def test_validacoes_da_ficha(cliente, h, local, termos):
    L = termos["LITOLOGIA"]
    base = ficha_exemplo(local, termos)
    r = cliente.post(f"{API}/mapeamentos", headers=h, json={**base, "intervalos": [
        {"de_m": 0, "ate_m": 2, "litologia_id": L["ANG"]["id"]}, {"de_m": 1.5, "ate_m": 3, "litologia_id": L["GNP"]["id"]}]})
    assert r.status_code == 422 and "sobrepostos" in r.json()["mensagem"]
    r = cliente.post(f"{API}/mapeamentos", headers=h, json={**base, "amostras": [{"codigo": "RP 478"}]})
    assert r.status_code == 422 and r.json()["detalhes"]["sugestao"] == "BS-RP-478"
    r = cliente.post(f"{API}/mapeamentos", headers=h, json={**base, "medidas": [
        {"tipo_id": termos["TIPO_ESTRUTURA"]["S1"]["id"], "valor_a": 230, "valor_b": 95}]})
    assert r.status_code == 422
    r = cliente.post(f"{API}/mapeamentos", headers=h, json={**base, "medidas": [
        {"tipo_id": termos["TIPO_ESTRUTURA"]["S1"]["id"], "valor_a": 230, "valor_b": 30, "convencao": "trend_plunge"}]})
    assert r.status_code == 422 and "planar" in r.json()["mensagem"]
    r = cliente.post(f"{API}/mapeamentos", headers=h, json={**base, "referencia": None})
    assert r.status_code == 422 and r.json()["codigo"] == "referencia_obrigatoria"
    r = cliente.post(f"{API}/mapeamentos", headers=h, json={**base, "intervalos": [
        {"de_m": 0, "ate_m": 1, "litologia_id": termos["ALTERACAO"]["SILICIFICACAO"]["id"]}]})
    assert r.status_code == 422  # termo do dicionário errado (recusado pelo banco)
    r = cliente.post(f"{API}/mapeamentos", headers=h, json={**base, "amostras": [
        {"codigo": "BS-RP-1"}, {"codigo": "bs - rp - 1"}]})
    assert r.status_code == 422 and r.json()["codigo"] == "amostra_repetida"


def test_avisos_lacuna_e_codigo_antigo(cliente, h, local, termos):
    L = termos["LITOLOGIA"]
    f = criar(cliente, h, ficha_exemplo(local, termos, intervalos=[
        {"de_m": 0, "ate_m": 1, "litologia_id": L["ANG"]["id"]}, {"de_m": 1.5, "ate_m": 3, "litologia_id": L["GNP"]["id"]}],
        amostras=[{"codigo": "BE-0042"}]))
    assert any("Lacuna" in a for a in f["avisos"]) and any("antiga" in a for a in f["avisos"])


def test_edicao_preserva_ids_e_audita_mudancas(app, cliente, h, local, termos):
    f = criar(cliente, h, ficha_exemplo(local, termos))
    ids = [i["id"] for i in f["intervalos"]]
    intervalos = [dict(i) for i in f["intervalos"]]
    intervalos[3]["descricao"] = "biotita gnaisse formando placas no contato"
    r = salvar(cliente, h, f, intervalos=intervalos[:4], amostras=[])
    assert r.status_code == 200, r.text
    g = r.json()
    assert [i["id"] for i in g["intervalos"]] == ids and g["amostras"] == []
    with app.state.engine.connect() as c:
        ops = dict(c.execute(text("SELECT tabela || operacao, count(*) FROM auditoria WHERE tabela IN "
                                  "('mapeamento_intervalo','mapeamento_amostra') GROUP BY 1")).all())
    assert ops == {"mapeamento_intervaloI": 4, "mapeamento_intervaloU": 1, "mapeamento_amostraI": 1,
                   "mapeamento_amostraD": 1}
    assert salvar(cliente, h, f).status_code == 409  # versão antiga


def test_fluxo_submeter_aprovar_reabrir(cliente, h, token_admin, local, termos):
    _, tg = criar_usuario(cliente, token_admin, "geologo1", ["GEOLOGO"])
    _, tr = criar_usuario(cliente, token_admin, "revisor1", ["REVISOR"])
    f = criar(cliente, cab(tg), ficha_exemplo(local, termos))
    url = f"{API}/mapeamentos/{f['id']}"
    assert cliente.post(f"{url}/aprovar", headers=cab(tr)).status_code == 422  # ainda não submetida
    assert cliente.post(f"{url}/submeter", headers=cab(tg)).json()["estado"] == "submetido"
    sub = cliente.get(url, headers=cab(tg)).json()
    assert sub["pode_editar"] is False
    assert salvar(cliente, cab(tg), sub).status_code == 403
    assert cliente.post(f"{url}/aprovar", headers=cab(tg)).status_code == 403  # geólogo não aprova
    d = cliente.post(f"{url}/devolver", headers=cab(tr), json={"motivo": "Faltou a alteração do intervalo 3"}).json()
    assert d["estado"] == "rascunho" and d["motivo"].startswith("Faltou")
    cliente.post(f"{url}/submeter", headers=cab(tg))
    a = cliente.post(f"{url}/aprovar", headers=cab(tr)).json()
    assert a["estado"] == "aprovado" and a["revisado_por"] == "Revisor1"
    assert cliente.post(f"{url}/cancelar", headers=cab(tg), json={"motivo": "erro"}).status_code == 403
    r = cliente.post(f"{url}/reabrir", headers=cab(tr), json={"motivo": "Corrigir mergulho da S1"}).json()
    assert r["estado"] == "rascunho" and r["revisao"] == 1
    rev = cliente.get(f"{url}/revisoes", headers=cab(tg)).json()
    assert len(rev) == 1 and rev[0]["conteudo"]["estado"] == "aprovado" and rev[0]["conteudo"]["medidas"][0]["dip"] == 30
    assert cliente.delete(url, headers=cab(tg)).status_code == 422  # já foi submetida: só cancelar


def test_autor_nao_aprova_a_propria_ficha_se_houver_outro_revisor(cliente, h, token_admin, local, termos):
    f = criar(cliente, h, ficha_exemplo(local, termos))
    url = f"{API}/mapeamentos/{f['id']}"
    cliente.post(f"{url}/submeter", headers=h)
    criar_usuario(cliente, token_admin, "revisor1", ["REVISOR"])
    r = cliente.post(f"{url}/aprovar", headers=h)
    assert r.status_code == 403 and r.json()["codigo"] == "autoaprovacao"


def test_unico_aprovador_pode_aprovar_a_propria(cliente, h, local, termos):
    f = criar(cliente, h, ficha_exemplo(local, termos))
    url = f"{API}/mapeamentos/{f['id']}"
    cliente.post(f"{url}/submeter", headers=h)
    assert cliente.post(f"{url}/aprovar", headers=h).json()["estado"] == "aprovado"


def test_excluir_rascunho_e_cancelar(cliente, h, local, termos):
    f = criar(cliente, h, ficha_exemplo(local, termos))
    assert cliente.delete(f"{API}/mapeamentos/{f['id']}", headers=h).status_code == 204
    g = criar(cliente, h, ficha_exemplo(local, termos))
    c = cliente.post(f"{API}/mapeamentos/{g['id']}/cancelar", headers=h, json={"motivo": "duplicada"}).json()
    assert c["estado"] == "cancelado" and c["pode_editar"] is False
    assert cliente.post(f"{API}/mapeamentos/{g['id']}/submeter", headers=h).status_code == 403


def test_listagem_e_filtros(cliente, h, local, termos):
    a = criar(cliente, h, ficha_exemplo(local, termos))
    criar(cliente, h, ficha_exemplo(local, termos, data="2026-09-01", intervalos=[
        {"de_m": 0, "ate_m": 2, "litologia_id": termos["LITOLOGIA"]["MUM"]["id"]}], amostras=[], medidas=[]))
    base = f"{API}/minas/{local['mina']['id']}/mapeamentos"
    todas = cliente.get(base, headers=h).json()
    assert [x["data"] for x in todas] == ["2026-10-14", "2026-09-01"]
    assert todas[0]["litologias"] == ["Ang", "Flx", "Gnp"] and todas[0]["medidas"] == 4
    assert len(cliente.get(base, headers=h, params={"litologia_id": termos["LITOLOGIA"]["MUM"]["id"]}).json()) == 1
    assert len(cliente.get(base, headers=h, params={"unidade_id": local["nivel"]["id"]}).json()) == 2
    assert len(cliente.get(base, headers=h, params={"de": "2026-10-01"}).json()) == 1
    assert cliente.get(base, headers=h, params={"texto": "474A"}).json()[0]["id"] == a["id"]


def test_painel_mostra_fichas(cliente, h, local, termos):
    f = criar(cliente, h, ficha_exemplo(local, termos))
    cliente.post(f"{API}/mapeamentos/{f['id']}/submeter", headers=h)
    assert cliente.get(f"{API}/painel", headers=h).json()["fichas"] == {"submetido": 1}


def test_verificar_codigo(cliente, h):
    r = cliente.get(f"{API}/codigos-amostra/verificar", headers=h, params={"codigo": "BS - RP - 237 B"}).json()
    assert r["codigo"] == "BS-RP-237B"


# ------------------------------------------------------------------ imutabilidade no banco
def test_banco_impede_alterar_ficha_aprovada(app, cliente, h, local, termos):
    f = criar(cliente, h, ficha_exemplo(local, termos))
    url = f"{API}/mapeamentos/{f['id']}"
    cliente.post(f"{url}/submeter", headers=h)
    cliente.post(f"{url}/aprovar", headers=h)
    hexid = f["id"].replace("-", "")
    with pytest.raises(IntegrityError, match="rascunho"), app.state.engine.begin() as c:
        c.execute(text("UPDATE mapeamento SET descricao = 'adulterada' WHERE id = :i"), {"i": hexid})
    with pytest.raises(IntegrityError, match="rascunho"), app.state.engine.begin() as c:
        c.execute(text("UPDATE mapeamento_intervalo SET de_m = 0.1 WHERE mapeamento_id = :i"), {"i": hexid})
    with pytest.raises(IntegrityError, match="rascunho"), app.state.engine.begin() as c:
        c.execute(text("DELETE FROM medida_estrutural WHERE mapeamento_id = :i"), {"i": hexid})
    with pytest.raises(IntegrityError), app.state.engine.begin() as c:
        c.execute(text("DELETE FROM mapeamento WHERE id = :i"), {"i": hexid})
