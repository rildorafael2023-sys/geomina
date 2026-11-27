"""Etapa 3 — estrutura operacional da mina."""

import uuid

import pytest
from sqlalchemy import select, text
from sqlalchemy.exc import IntegrityError

from geomina.core.auditoria import Auditoria
from geomina.modules.estrutura.models import TipoUnidade, UnidadeOperacional
from tests.conftest import cab, criar_usuario

API = "/api/v1"


@pytest.fixture
def h(token_admin):
    return cab(token_admin)


@pytest.fixture
def mina(cliente, h):
    r = cliente.post(f"{API}/minas", headers=h, json={"codigo": "MINA01", "nome": "Mina 01", "srid_trabalho": 31983})
    assert r.status_code == 201, r.text
    return r.json()


def nova(cliente, h, mina, tipo, codigo, pai=None, **extra):
    r = cliente.post(f"{API}/unidades", headers=h,
                     json={"mina_id": mina["id"], "tipo": tipo, "codigo": codigo, "nome": codigo, "pai_id": pai, **extra})
    assert r.status_code == 201, r.text
    return r.json()


@pytest.fixture
def arvore(cliente, h, mina):
    """N144 > GAL-01 > TR-1F > FR-1F ; N567 ; N603 ; RAMPA-SUL (multinível)."""
    n144 = nova(cliente, h, mina, "NIVEL", "N144")
    gal = nova(cliente, h, mina, "GALERIA", "GAL-01", n144["id"])
    trav = nova(cliente, h, mina, "TRAVESSA", "TR-1F", gal["id"])
    frente = nova(cliente, h, mina, "FRENTE", "FR-1F", trav["id"])
    n567 = nova(cliente, h, mina, "NIVEL", "N567")
    n603 = nova(cliente, h, mina, "NIVEL", "N603")
    rampa = nova(cliente, h, mina, "RAMPA", "RAMPA-SUL", niveis=[n144["id"], n567["id"], n603["id"]])
    return dict(n144=n144, gal=gal, trav=trav, frente=frente, n567=n567, n603=n603, rampa=rampa)


# ----------------------------------------------------------------- minas e CRS
def test_mina_com_crs_da_mina(cliente, mina):
    assert mina["crs_nome"] == "SIRGAS 2000 / UTM zone 23S"


@pytest.mark.parametrize("srid", [4326, 4674, 999999])
def test_mina_rejeita_crs_geografico_ou_inexistente(cliente, h, srid):
    r = cliente.post(f"{API}/minas", headers=h, json={"codigo": "X", "nome": "Xx", "srid_trabalho": srid})
    assert r.status_code == 422 and r.json()["codigo"] == "crs_invalido"


def test_mina_sad69_aceita(cliente, h):
    r = cliente.post(f"{API}/minas", headers=h, json={"codigo": "M2", "nome": "Mina SAD", "srid_trabalho": 29193})
    assert r.status_code == 201 and r.json()["crs_nome"] == "SAD69 / UTM zone 23S"


def test_so_administrador_cadastra_mina(cliente, token_admin):
    _, t = criar_usuario(cliente, token_admin, "geologo1", ["GEOLOGO"])
    r = cliente.post(f"{API}/minas", headers=cab(t), json={"codigo": "M", "nome": "Mm", "srid_trabalho": 31983})
    assert r.status_code == 403


# ----------------------------------------------------------------- árvore
def test_arvore_e_caminho(cliente, h, mina, arvore):
    d = cliente.get(f"{API}/unidades/{arvore['frente']['id']}", headers=h).json()
    assert d["caminho_nomes"] == ["N144 — N144", "GAL-01 — GAL-01", "TR-1F — TR-1F", "FR-1F — FR-1F"]
    lista = cliente.get(f"{API}/minas/{mina['id']}/unidades", headers=h).json()
    assert {u["codigo"] for u in lista} == {"N144", "GAL-01", "TR-1F", "FR-1F", "N567", "N603", "RAMPA-SUL"}


def test_codigo_unico_por_mina(cliente, h, mina, arvore):
    r = cliente.post(f"{API}/unidades", headers=h,
                     json={"mina_id": mina["id"], "tipo": "NIVEL", "codigo": "n144", "nome": "dup"})
    assert r.status_code == 409
    outra = cliente.post(f"{API}/minas", headers=h, json={"codigo": "M2", "nome": "Mina 2", "srid_trabalho": 31983}).json()
    nova(cliente, h, outra, "NIVEL", "N144")  # mesmo código em outra mina é permitido


def test_locais_livres_pela_api(cliente, h, mina, arvore):
    """Desde a 0011 o geólogo cadastra o local onde precisar: travessa na raiz ou dentro de qualquer região."""
    r = cliente.post(f"{API}/unidades", headers=h, json={"mina_id": mina["id"], "tipo": "TRAVESSA", "codigo": "1F5", "nome": "Travessa 1F5"})
    assert r.status_code == 201, r.text
    r = cliente.post(f"{API}/unidades", headers=h, json={"mina_id": mina["id"], "tipo": "TRAVESSA", "codigo": "1F6", "nome": "Travessa 1F6",
                                                          "pai_id": arvore["rampa"]["id"]})
    assert r.status_code == 201, r.text


def test_regra_de_hierarquia_pela_api(cliente, h, mina, arvore, app):
    """As regras continuam valendo se o administrador as restringir em "Tipos e regras"."""
    _sql(app, "DELETE FROM regra_hierarquia WHERE tipo_pai_id = (SELECT id FROM tipo_unidade WHERE codigo = 'GALERIA') "
              "AND tipo_filho_id = (SELECT id FROM tipo_unidade WHERE codigo = 'NIVEL')")
    _sql(app, "UPDATE tipo_unidade SET pode_ser_raiz = 0 WHERE codigo = 'GALERIA'")
    r = cliente.post(f"{API}/unidades", headers=h, json={"mina_id": mina["id"], "tipo": "NIVEL", "codigo": "N9",
                                                          "nome": "N9", "pai_id": arvore["gal"]["id"]})
    assert r.status_code == 422 and r.json()["codigo"] == "regra_violada"
    assert "não é permitido dentro" in r.json()["mensagem"]
    r = cliente.post(f"{API}/unidades", headers=h, json={"mina_id": mina["id"], "tipo": "GALERIA", "codigo": "G9",
                                                          "nome": "G9"})
    assert r.status_code == 422 and "raiz" in r.json()["mensagem"]


def test_rampa_multinivel_aparece_em_cada_nivel(cliente, h, mina, arvore):
    for nivel in ("n144", "n567", "n603"):
        lista = cliente.get(f"{API}/minas/{mina['id']}/unidades", headers=h,
                            params={"nivel_id": arvore[nivel]["id"]}).json()
        assert "RAMPA-SUL" in {u["codigo"] for u in lista}
    n144 = {u["codigo"] for u in cliente.get(f"{API}/minas/{mina['id']}/unidades", headers=h,
                                             params={"nivel_id": arvore["n144"]["id"]}).json()}
    assert {"N144", "GAL-01", "TR-1F", "FR-1F", "RAMPA-SUL"} == n144


def test_nivel_so_em_unidade_multinivel(cliente, h, arvore):
    r = cliente.put(f"{API}/unidades/{arvore['gal']['id']}/niveis", headers=h, json={"niveis": [arvore["n567"]["id"]]})
    assert r.status_code == 422
    r = cliente.put(f"{API}/unidades/{arvore['rampa']['id']}/niveis", headers=h, json={"niveis": [arvore["gal"]["id"]]})
    assert r.status_code == 422


def test_mover_subarvore_recalcula_caminhos(app, cliente, h, mina, arvore):
    gal2 = nova(cliente, h, mina, "GALERIA", "GAL-02", arvore["n567"]["id"])
    t = cliente.get(f"{API}/unidades/{arvore['trav']['id']}", headers=h).json()
    r = cliente.post(f"{API}/unidades/{t['id']}/mover", headers=h, json={"versao": t["versao"], "novo_pai_id": gal2["id"]})
    assert r.status_code == 200, r.text
    d = cliente.get(f"{API}/unidades/{arvore['frente']['id']}", headers=h).json()
    assert d["caminho_nomes"][:2] == ["N567 — N567", "GAL-02 — GAL-02"]
    n567 = {u["codigo"] for u in cliente.get(f"{API}/minas/{mina['id']}/unidades", headers=h,
                                             params={"nivel_id": arvore["n567"]["id"]}).json()}
    assert {"TR-1F", "FR-1F"} <= n567


def test_mover_para_dentro_de_si_e_proibido(cliente, h, arvore):
    g = cliente.get(f"{API}/unidades/{arvore['gal']['id']}", headers=h).json()
    r = cliente.post(f"{API}/unidades/{g['id']}/mover", headers=h,
                     json={"versao": g["versao"], "novo_pai_id": arvore["trav"]["id"]})
    assert r.status_code == 422 and "dentro dela mesma" in r.json()["mensagem"]


def test_inativacao_e_exclusao(cliente, h, mina, arvore):
    t = cliente.get(f"{API}/unidades/{arvore['trav']['id']}", headers=h).json()
    r = cliente.patch(f"{API}/unidades/{t['id']}", headers=h, json={"versao": t["versao"], "ativo": False})
    assert r.status_code == 422 and r.json()["codigo"] == "filhos_ativos"
    f = cliente.get(f"{API}/unidades/{arvore['frente']['id']}", headers=h).json()
    assert cliente.patch(f"{API}/unidades/{f['id']}", headers=h,
                         json={"versao": f["versao"], "ativo": False}).status_code == 200
    assert cliente.patch(f"{API}/unidades/{t['id']}", headers=h,
                         json={"versao": t["versao"], "ativo": False}).status_code == 200
    r = cliente.post(f"{API}/unidades", headers=h, json={"mina_id": mina["id"], "tipo": "FRENTE", "codigo": "FR-X",
                                                          "nome": "x", "pai_id": t["id"]})
    assert r.status_code == 422 and r.json()["codigo"] == "pai_inativo"
    assert cliente.delete(f"{API}/unidades/{arvore['gal']['id']}", headers=h).status_code == 409
    assert cliente.delete(f"{API}/unidades/{arvore['n144']['id']}", headers=h).status_code == 409  # rampa vinculada
    assert cliente.delete(f"{API}/unidades/{arvore['frente']['id']}", headers=h).status_code == 204


def test_concorrencia_unidade(cliente, h, arvore):
    g = arvore["gal"]
    assert cliente.patch(f"{API}/unidades/{g['id']}", headers=h, json={"versao": g["versao"], "nome": "A"}).status_code == 200
    r = cliente.patch(f"{API}/unidades/{g['id']}", headers=h, json={"versao": g["versao"], "nome": "B"})
    assert r.status_code == 409


# ----------------------------------------------------------------- avanços
def test_avancos_de_frente(cliente, h, token_admin, arvore):
    url = f"{API}/unidades/{arvore['frente']['id']}/avancos"
    r = cliente.post(url, headers=h, json={"data": "2026-10-14", "distancia_m": 26})
    assert r.status_code == 422 and r.json()["codigo"] == "referencia_obrigatoria"
    r = cliente.post(url, headers=h, json={"data": "2026-10-14", "distancia_m": 26, "referencia": "entrada da travessa"})
    assert r.status_code == 201
    r = cliente.post(url, headers=h, json={"data": "2026-10-20", "distancia_m": 28.4, "avanco_m": 2.4,
                                           "referencia": "entrada da travessa"})
    assert r.status_code == 201
    lista = cliente.get(url, headers=h).json()
    assert [a["distancia_m"] for a in lista] == [28.4, 26]  # mais recente primeiro
    assert lista[0]["responsavel_nome"] == "Administrador"
    r = cliente.post(f"{API}/unidades/{arvore['gal']['id']}/avancos", headers=h, json={"data": "2026-10-14", "avanco_m": 2})
    assert r.status_code == 422 and r.json()["codigo"] == "nao_e_frente"
    r = cliente.post(url, headers=h, json={"data": "2026-10-21", "x": 500000.0})
    assert r.status_code == 422 and r.json()["codigo"] == "coordenadas_incompletas"
    a = lista[0]
    r = cliente.put(f"{API}/avancos/{a['id']}", headers=h, json={**{k: a[k] for k in (
        "data", "distancia_m", "referencia", "avanco_m", "x", "y", "z", "observacao")}, "avanco_m": 2.5,
        "versao": a["versao"]})
    assert r.status_code == 200 and r.json()["avanco_m"] == 2.5


def test_papeis_na_estrutura(cliente, token_admin, mina, arvore):
    _, tec = criar_usuario(cliente, token_admin, "tecnico1", ["TECNICO"])
    _, leitor = criar_usuario(cliente, token_admin, "leitor1", ["CONSULTA"])
    assert cliente.post(f"{API}/unidades/{arvore['frente']['id']}/avancos", headers=cab(tec),
                        json={"data": "2026-10-14", "avanco_m": 3}).status_code == 201
    assert cliente.post(f"{API}/unidades", headers=cab(tec), json={"mina_id": mina["id"], "tipo": "NIVEL",
                                                                   "codigo": "N1", "nome": "N1"}).status_code == 403
    assert cliente.get(f"{API}/minas/{mina['id']}/unidades", headers=cab(leitor)).status_code == 200
    assert cliente.post(f"{API}/unidades/{arvore['frente']['id']}/avancos", headers=cab(leitor),
                        json={"data": "2026-10-14", "avanco_m": 3}).status_code == 403


# ----------------------------------------------------------------- histórico e auditoria
def test_historico_da_unidade(cliente, h, arvore):
    t = arvore["trav"]
    cliente.patch(f"{API}/unidades/{t['id']}", headers=h, json={"versao": t["versao"], "status": "paralisada"})
    hist = cliente.get(f"{API}/unidades/{t['id']}/historico", headers=h).json()
    descricoes = [e["descricao"] for e in hist]
    assert "Unidade cadastrada" in descricoes
    assert any(x.startswith("Unidade criada dentro desta: FR-1F") for x in descricoes)
    assert "Alteração: situação" in descricoes
    assert all(e["usuario"] == "Administrador" for e in hist)
    cliente.post(f"{API}/unidades/{arvore['frente']['id']}/avancos", headers=h,
                 json={"data": "2026-10-14", "avanco_m": 3})
    hf = cliente.get(f"{API}/unidades/{arvore['frente']['id']}/historico", headers=h).json()
    assert any(e["descricao"].startswith("Avanço registrado (2026-10-14") for e in hf)


def test_desvinculo_de_nivel_auditado(app, cliente, h, arvore):
    cliente.put(f"{API}/unidades/{arvore['rampa']['id']}/niveis", headers=h, json={"niveis": [arvore["n144"]["id"]]})
    with app.state.fabrica_sessoes() as db:
        ops = [a.operacao for a in db.scalars(select(Auditoria).where(Auditoria.tabela == "unidade_nivel"))]
    assert ops.count("I") == 3 and ops.count("D") == 2


# ----------------------------------------------------------------- regras configuráveis
def test_configurar_tipos_e_regras(cliente, h, mina, arvore):
    tipos = {t["codigo"]: t for t in cliente.get(f"{API}/tipos-unidade", headers=h).json()}
    assert "FRENTE" in tipos["TRAVESSA"]["filhos_permitidos"]
    r = cliente.post(f"{API}/tipos-unidade", headers=h, json={"codigo": "PAINEL", "nome": "Painel"})
    assert r.status_code == 201
    regras = {c: t["filhos_permitidos"] for c, t in tipos.items()}
    regras["NIVEL"] = regras["NIVEL"] + ["PAINEL"]
    regras["PAINEL"] = ["FRENTE"]
    assert cliente.put(f"{API}/regras-hierarquia", headers=h, json={"regras": regras}).status_code == 200
    painel = nova(cliente, h, mina, "PAINEL", "P-01", arvore["n567"]["id"])
    nova(cliente, h, mina, "FRENTE", "FR-P01", painel["id"])
    regras["PAINEL"] = []  # remover regra em uso deve ser recusado pelo banco
    r = cliente.put(f"{API}/regras-hierarquia", headers=h, json={"regras": regras})
    assert r.status_code == 422 and "dependem desta regra" in r.json()["mensagem"]


# ----------------------------------------------------------------- integridade no próprio banco
def _sql(app, sql, **p):
    with app.state.engine.begin() as c:
        c.execute(text(sql), p)


def _ids(app):
    with app.state.fabrica_sessoes() as db:
        tipos = {t.codigo: t.id.hex for t in db.scalars(select(TipoUnidade))}
        unid = {u.codigo: u for u in db.scalars(select(UnidadeOperacional))}
        return tipos, {c: (u.id.hex, u.mina_id.hex, u.caminho) for c, u in unid.items()}


def _inserir(app, mina_hex, tipo_hex, pai_hex, codigo):
    _sql(app, "INSERT INTO unidade_operacional (id, mina_id, tipo_id, pai_id, codigo, nome, status, ativo, criado_em, "
              "versao) VALUES (:id, :m, :t, :p, :c, :c, 'ativa', 1, CURRENT_TIMESTAMP, 1)",
         id=uuid.uuid4().hex, m=mina_hex, t=tipo_hex, p=pai_hex, c=codigo)


def test_banco_recusa_hierarquia_invalida_sem_passar_pela_api(app, arvore):
    tipos, u = _ids(app)
    mina_hex = u["N144"][1]
    _sql(app, "DELETE FROM regra_hierarquia WHERE tipo_pai_id = (SELECT id FROM tipo_unidade WHERE codigo = 'GALERIA') "
              "AND tipo_filho_id = (SELECT id FROM tipo_unidade WHERE codigo = 'NIVEL')")
    _sql(app, "UPDATE tipo_unidade SET pode_ser_raiz = 0 WHERE codigo = 'GALERIA'")
    with pytest.raises(IntegrityError, match="raiz"):
        _inserir(app, mina_hex, tipos["GALERIA"], None, "G-RAIZ")
    with pytest.raises(IntegrityError, match="não é permitido dentro"):
        _inserir(app, mina_hex, tipos["NIVEL"], u["GAL-01"][0], "N-ERRADO")
    with pytest.raises(IntegrityError, match="dentro dela mesma"):
        _sql(app, "UPDATE unidade_operacional SET pai_id = :p WHERE id = :id", p=u["FR-1F"][0], id=u["N144"][0])
    with pytest.raises(IntegrityError, match="frente"):
        _sql(app, "INSERT INTO frente_avanco (id, frente_id, data, avanco_m, criado_em, versao) "
                  "VALUES (:id, :f, '2026-01-01', 1, CURRENT_TIMESTAMP, 1)", id=uuid.uuid4().hex, f=u["GAL-01"][0])
    with pytest.raises(IntegrityError, match="vários níveis"):
        _sql(app, "INSERT INTO unidade_nivel (unidade_id, nivel_id) VALUES (:u, :n)", u=u["GAL-01"][0], n=u["N567"][0])
    with pytest.raises(IntegrityError, match="características"):
        _sql(app, "UPDATE tipo_unidade SET e_frente = 0 WHERE codigo = 'FRENTE'")


def test_banco_mantem_caminho(app, arvore):
    _, u = _ids(app)
    n144, gal, trav, fr = (u[c][0] for c in ("N144", "GAL-01", "TR-1F", "FR-1F"))
    assert u["FR-1F"][2] == f"/{n144}/{gal}/{trav}/{fr}/"


def test_datas_saem_com_fuso_utc(cliente, h, arvore):
    d = cliente.get(f"{API}/unidades/{arvore['gal']['id']}", headers=h).json()
    assert d["criado_em"].endswith(("Z", "+00:00"))
    hist = cliente.get(f"{API}/unidades/{arvore['gal']['id']}/historico", headers=h).json()
    assert hist[0]["ocorrido_em"].endswith(("Z", "+00:00"))
