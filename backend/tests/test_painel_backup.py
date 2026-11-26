"""Etapa 4 — painel, auditoria, backup e restauração."""

import json
import sqlite3
import zipfile
from datetime import UTC, datetime, timedelta

import pytest

from geomina.config import Config
from geomina.main import criar_app
from geomina.modules.backup import service as bk
from tests.conftest import SENHA, cab, criar_usuario

API = "/api/v1"


@pytest.fixture
def h(token_admin):
    return cab(token_admin)


@pytest.fixture
def mina(cliente, h):
    return cliente.post(f"{API}/minas", headers=h, json={"codigo": "MINA01", "nome": "Mina 01", "srid_trabalho": 31983}).json()


def nova(cliente, h, mina, tipo, codigo, pai=None):
    r = cliente.post(f"{API}/unidades", headers=h,
                     json={"mina_id": mina["id"], "tipo": tipo, "codigo": codigo, "nome": codigo, "pai_id": pai})
    assert r.status_code == 201, r.text
    return r.json()


# ------------------------------------------------------------------ painel
def test_painel_reflete_o_banco(cliente, h, mina):
    p = cliente.get(f"{API}/painel", headers=h).json()
    assert p["unidades_por_tipo"] == [] and p["frentes"] == {} and p["ultimos_avancos"] == []
    n = nova(cliente, h, mina, "NIVEL", "N144")
    g = nova(cliente, h, mina, "GALERIA", "GAL-01", n["id"])
    f1 = nova(cliente, h, mina, "FRENTE", "FR-1", g["id"])
    f2 = nova(cliente, h, mina, "FRENTE", "FR-2", g["id"])
    cliente.patch(f"{API}/unidades/{f2['id']}", headers=h, json={"versao": f2["versao"], "status": "paralisada"})
    hoje = datetime.now().date()
    for dias, m in ((1, 2.5), (5, 3.0), (40, 9.0)):  # o de 40 dias fica fora da janela de 30
        r = cliente.post(f"{API}/unidades/{f1['id']}/avancos", headers=h,
                         json={"data": str(hoje - timedelta(days=dias)), "avanco_m": m})
        assert r.status_code == 201
    p = cliente.get(f"{API}/painel", headers=h).json()
    assert p["mina"] == "MINA01 — Mina 01"
    por_tipo = {c["codigo"]: c["ativas"] for c in p["unidades_por_tipo"]}
    assert por_tipo == {"NIVEL": 1, "GALERIA": 1, "FRENTE": 2}
    assert p["frentes"] == {"ativa": 1, "paralisada": 1}
    assert p["avancos_30_dias"] == {"registros": 2, "metros": 5.5}
    assert [a["avanco_m"] for a in p["ultimos_avancos"]] == [2.5, 3.0, 9.0]
    assert p["usuarios_ativos"] == 1
    assert p["atividades"][0]["tabela"] == "frente_avanco"
    assert p["atividades"][0]["resumo"].endswith("· +9 m")  # data dd/mm/aaaa e vírgula decimal
    assert p["atividades"][1]["resumo"].endswith("· +3 m") and p["atividades"][2]["resumo"].endswith("+2,5 m")


def test_painel_respeita_permissoes(cliente, token_admin, h, mina):
    nova(cliente, h, mina, "NIVEL", "N144")
    criar_usuario(cliente, token_admin, "outro", ["GEOLOGO"])
    _, t = criar_usuario(cliente, token_admin, "leitor", ["CONSULTA"])
    p = cliente.get(f"{API}/painel", headers=cab(t)).json()
    assert p["usuarios_ativos"] is None  # sem permissão de usuários
    assert p["unidades_por_tipo"] is not None
    assert all(a["tabela"] != "usuario" for a in p["atividades"])  # alterações de usuários não aparecem


# ------------------------------------------------------------------ auditoria
def test_consulta_auditoria_filtros_e_permissao(cliente, token_admin, h, mina):
    n = nova(cliente, h, mina, "NIVEL", "N144")
    cliente.patch(f"{API}/unidades/{n['id']}", headers=h, json={"versao": n["versao"], "nome": "Nível 144"})
    r = cliente.get(f"{API}/auditoria", headers=h, params={"tabela": "unidade_operacional"}).json()
    assert r["total"] == 2 and {i["operacao"] for i in r["itens"]} == {"I", "U"}
    alteracao = next(i for i in r["itens"] if i["operacao"] == "U")
    assert alteracao["antes"]["nome"] == "N144" and alteracao["depois"]["nome"] == "Nível 144"
    r = cliente.get(f"{API}/auditoria", headers=h, params={"texto": "Nível 144"}).json()
    assert r["total"] == 1
    hoje = datetime.now().date()
    assert cliente.get(f"{API}/auditoria", headers=h, params={"de": str(hoje), "ate": str(hoje)}).json()["total"] >= 3
    assert cliente.get(f"{API}/auditoria", headers=h, params={"ate": str(hoje - timedelta(days=2))}).json()["total"] == 0
    p1 = cliente.get(f"{API}/auditoria", headers=h, params={"tamanho": 1, "pagina": 1}).json()
    p2 = cliente.get(f"{API}/auditoria", headers=h, params={"tamanho": 1, "pagina": 2}).json()
    assert p1["itens"][0]["id"] != p2["itens"][0]["id"]
    _, tg = criar_usuario(cliente, token_admin, "geologo1", ["GEOLOGO"])
    assert cliente.get(f"{API}/auditoria", headers=cab(tg)).status_code == 403
    _, tr = criar_usuario(cliente, token_admin, "revisor1", ["REVISOR"])
    assert cliente.get(f"{API}/auditoria", headers=cab(tr)).status_code == 200


# ------------------------------------------------------------------ backup
def test_backup_completo_com_manifesto_e_arquivos(app, cliente, h, mina):
    cliente.post(f"{API}/arquivos", headers=h, files={"arquivo": ("croqui.pdf", b"%PDF-1.7 teste")})
    r = cliente.post(f"{API}/backups", headers=h, json={})
    assert r.status_code == 201, r.text
    nome = r.json()["backup"]["nome"]
    caminho = app.state.config.pasta_backups / nome
    with zipfile.ZipFile(caminho) as z:
        m = json.loads(z.read("manifesto.json"))
        nomes = z.namelist()
    assert m["tipo"] == "completo" and m["com_arquivos"] and m["arquivos"] == 1
    assert m["contagens"]["mina"] == 1 and m["usuario"] == "Administrador"
    assert any(n.startswith("arquivos/objetos/") for n in nomes)
    lista = cliente.get(f"{API}/backups", headers=h).json()
    assert lista[0]["nome"] == nome
    baixado = cliente.get(f"{API}/backups/{nome}/download", headers=h)
    assert baixado.status_code == 200 and baixado.content == caminho.read_bytes()
    assert cliente.get(f"{API}/auditoria", headers=h, params={"operacao": "B"}).json()["total"] == 1


def test_backup_copia_para_outra_pasta(cliente, h, tmp_path):
    destino = tmp_path / "pendrive"
    r = cliente.post(f"{API}/backups", headers=h, json={"copiar_para": str(destino)})
    assert r.status_code == 422 and "não existe" in r.json()["mensagem"]
    destino.mkdir()
    r = cliente.post(f"{API}/backups", headers=h, json={"copiar_para": str(destino)})
    assert r.status_code == 201 and (destino / r.json()["backup"]["nome"]).exists()


def test_backup_so_administrador(cliente, token_admin):
    _, t = criar_usuario(cliente, token_admin, "revisor1", ["REVISOR"])
    assert cliente.post(f"{API}/backups", headers=cab(t), json={}).status_code == 403
    assert cliente.get(f"{API}/backups", headers=cab(t)).status_code == 403


def test_download_nao_sai_da_pasta_de_backups(app, cliente, h):
    r = cliente.get(f"{API}/backups/..%2Fgeomina.db/download", headers=h)
    assert r.status_code == 404 and b"SQLite" not in r.content
    for nome in ("../geomina.db", "..\\geomina.db", "/etc/passwd"):
        with pytest.raises(bk.BackupInvalido):
            bk.caminho_seguro(app.state.config, nome)


def test_rota_de_api_inexistente_responde_404_json(cliente):
    r = cliente.get(f"{API}/nao-existe")
    assert r.status_code == 404 and r.json()["codigo"] == "http_404"


# ------------------------------------------------------------------ restauração
def test_restauracao_completa(app, cliente, h, mina):
    nova(cliente, h, mina, "NIVEL", "N144")
    nome = cliente.post(f"{API}/backups", headers=h, json={}).json()["backup"]["nome"]
    nova(cliente, h, mina, "NIVEL", "N567")  # criado depois do backup: deve sumir
    r = cliente.post(f"{API}/backups/restaurar", headers=h, json={"nome": nome, "senha": "errada", "confirmacao": "RESTAURAR"})
    assert r.status_code == 422 and r.json()["codigo"] == "senha_incorreta"
    r = cliente.post(f"{API}/backups/restaurar", headers=h, json={"nome": nome, "senha": SENHA, "confirmacao": "sim"})
    assert r.status_code == 422
    r = cliente.post(f"{API}/backups/restaurar", headers=h, json={"nome": nome, "senha": SENHA, "confirmacao": "RESTAURAR"})
    assert r.status_code == 200, r.text
    seguranca = r.json()["backup_de_seguranca"]
    codigos = {u["codigo"] for u in cliente.get(f"{API}/minas/{mina['id']}/unidades", headers=h).json()}
    assert codigos == {"N144"}
    # o estado anterior (com N567) ficou guardado no backup de segurança
    with zipfile.ZipFile(app.state.config.pasta_backups / seguranca) as z:
        assert json.loads(z.read("manifesto.json"))["contagens"]["unidade_operacional"] == 2
    eventos = cliente.get(f"{API}/auditoria", headers=h, params={"operacao": "R"}).json()
    assert eventos["total"] == 1 and eventos["itens"][0]["depois"]["restaurado"] == nome
    # banco íntegro e utilizável depois da restauração
    nova(cliente, h, mina, "NIVEL", "N603")


def _backup_alterado(app, cliente, h, alterar):
    nome = cliente.post(f"{API}/backups", headers=h, json={}).json()["backup"]["nome"]
    origem = app.state.config.pasta_backups / nome
    novo = origem.with_name("geomina-20990101-000000-completo.zip")
    with zipfile.ZipFile(origem) as zi, zipfile.ZipFile(novo, "w") as zo:
        for item in zi.infolist():
            zo.writestr(item, alterar(item.filename, zi.read(item.filename)))
    return novo.name


def test_restauracao_recusa_backup_corrompido(app, cliente, h, mina):
    def corromper(nome, dados):
        if nome != "geomina.db":
            return dados
        meio = len(dados) // 2
        return dados[:meio] + bytes(b ^ 0xFF for b in dados[meio:meio + 64]) + dados[meio + 64:]
    nome = _backup_alterado(app, cliente, h, corromper)
    r = cliente.post(f"{API}/backups/restaurar", headers=h, json={"nome": nome, "senha": SENHA, "confirmacao": "RESTAURAR"})
    assert r.status_code == 422 and "corrompido" in r.json()["mensagem"]


def test_restauracao_recusa_backup_de_versao_mais_nova(app, cliente, h, mina):
    def futuro(nome, dados):
        if nome != "manifesto.json":
            return dados
        m = json.loads(dados)
        m["revisao_banco"] = "9999"
        return json.dumps(m).encode()
    nome = _backup_alterado(app, cliente, h, futuro)
    r = cliente.post(f"{API}/backups/restaurar", headers=h, json={"nome": nome, "senha": SENHA, "confirmacao": "RESTAURAR"})
    assert r.status_code == 422 and "versão mais nova" in r.json()["mensagem"]


def test_api_bloqueada_durante_restauracao(app, cliente, h):
    app.state.restaurando = True
    try:
        assert cliente.get(f"{API}/painel", headers=h).status_code == 503
        assert cliente.get(f"{API}/saude").status_code == 200
    finally:
        app.state.restaurando = False


# ------------------------------------------------------------------ backup diário automático
def test_backup_diario_na_abertura_e_retencao(tmp_path):
    cfg = Config(dados=tmp_path / "d", backup_diario=True)
    a = criar_app(cfg)
    a.state.engine.dispose()
    diarios = [b for b in bk.listar(cfg) if b.tipo == "diario"]
    assert len(diarios) == 1 and not diarios[0].com_arquivos
    assert bk.backup_diario_se_necessario(cfg) is None  # menos de 24 h: não repete
    # simula 20 dias de backups antigos: só os 14 mais recentes ficam
    origem = cfg.pasta_backups / diarios[0].nome
    for i in range(20):
        with zipfile.ZipFile(origem) as zi:
            m = json.loads(zi.read("manifesto.json"))
            m["criado_em"] = (datetime.now(UTC) - timedelta(days=2 + i)).isoformat()
            with zipfile.ZipFile(cfg.pasta_backups / f"geomina-antigo{i:02d}-diario.zip", "w") as zo:
                zo.writestr("manifesto.json", json.dumps(m))
                zo.writestr("geomina.db", zi.read("geomina.db"))
    origem.unlink()
    assert bk.backup_diario_se_necessario(cfg) is not None
    assert len([b for b in bk.listar(cfg) if b.tipo == "diario"]) == 14


def test_backup_consistente_e_integro(app, cliente, h, mina):
    nome = cliente.post(f"{API}/backups", headers=h, json={}).json()["backup"]["nome"]
    destino = app.state.config.dados / "extraido"
    with zipfile.ZipFile(app.state.config.pasta_backups / nome) as z:
        z.extract("geomina.db", destino)
    con = sqlite3.connect(destino / "geomina.db")
    assert con.execute("pragma integrity_check").fetchone()[0] == "ok"
    assert con.execute("select count(*) from mina").fetchone()[0] == 1
    con.close()
