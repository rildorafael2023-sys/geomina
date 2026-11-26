"""E18 — revisão de segurança: endereço da máquina (DNS rebinding), cabeçalhos, tentativa de senhas, zip malformado."""

import io
import zipfile

import pytest

from geomina.espacial import shapefile
from tests.conftest import SENHA, cab

API = "/api/v1"


def test_so_atende_pelo_nome_da_maquina(cliente, admin):
    assert cliente.get(f"{API}/saude", headers={"Host": "127.0.0.1:8765"}).status_code == 200
    assert cliente.get(f"{API}/saude", headers={"Host": "localhost:8765"}).status_code == 200
    r = cliente.get(f"{API}/saude", headers={"Host": "site-malicioso.example:8765"})
    assert r.status_code == 421 and r.json()["codigo"] == "host_invalido"
    assert cliente.post(f"{API}/auth/login", headers={"Host": "evil.example"}, json={"login": "admin", "senha": SENHA}).status_code == 421


def test_cabecalhos_de_seguranca(cliente, token_admin):
    r = cliente.get(f"{API}/auth/eu", headers=cab(token_admin))
    assert r.headers["x-content-type-options"] == "nosniff"
    assert r.headers["x-frame-options"] == "DENY"
    assert "sandbox" in r.headers["content-security-policy"]
    assert r.headers["cache-control"] == "no-store"


def test_bloqueio_depois_de_senhas_erradas(cliente, admin):
    for _ in range(5):
        assert cliente.post(f"{API}/auth/login", json={"login": "admin", "senha": "errada123456"}).status_code == 401
    r = cliente.post(f"{API}/auth/login", json={"login": "admin", "senha": SENHA})
    assert r.status_code == 429 and "Aguarde" in r.json()["mensagem"]  # nem a senha certa entra durante o bloqueio
    # outro login não é afetado; login inexistente também conta
    for _ in range(5):
        cliente.post(f"{API}/auth/login", json={"login": "ninguem", "senha": "x" * 12})
    assert cliente.post(f"{API}/auth/login", json={"login": "ninguem", "senha": "x" * 12}).status_code == 429


def test_acerto_zera_contagem(cliente, admin):
    for _ in range(4):
        cliente.post(f"{API}/auth/login", json={"login": "admin", "senha": "errada123456"})
    assert cliente.post(f"{API}/auth/login", json={"login": "admin", "senha": SENHA}).status_code == 200
    for _ in range(4):
        cliente.post(f"{API}/auth/login", json={"login": "admin", "senha": "errada123456"})
    assert cliente.post(f"{API}/auth/login", json={"login": "admin", "senha": SENHA}).status_code == 200


def test_zip_malformado_recusado():
    b = io.BytesIO()
    with zipfile.ZipFile(b, "w", compression=zipfile.ZIP_DEFLATED) as z:
        z.writestr("a.shp", b"\0" * 20_000_000)  # 20 MB de zeros → ~20 kB compactado (taxa > 1000)
        z.writestr("a.dbf", b"x")
    with pytest.raises(shapefile.ShapefileInvalido, match="compressão suspeita"):
        shapefile.ler_do_zip(b.getvalue(), "a.shp")


def test_rotas_exigem_login(cliente, admin):
    """Toda rota da API (exceto saúde, instalação e login) recusa quem não está autenticado."""
    from geomina.main import criar_app  # noqa: F401
    livres = {"/api/docs", "/api/openapi.json", "/api/docs/oauth2-redirect", "/api/redoc", "/api/v1/saude", "/api/v1/instalacao", "/api/v1/instalacao/admin", "/api/v1/auth/login"}
    abertas = []
    for rota in cliente.app.routes:
        caminho = getattr(rota, "path", "")
        if not caminho.startswith("/api/") or caminho in livres:
            continue
        for metodo in rota.methods - {"HEAD", "OPTIONS"}:
            url = caminho.replace("{", "").replace("}", "")
            for nome in ("mina_id", "unidade_id", "ficha_id", "amostra_id", "doc_id", "furo_id", "importacao_id", "lote_id",
                         "usuario_id", "arquivo_id", "levantamento_id", "eixo_id", "layout_id", "certificado_id", "id", "termo_id",
                         "dicionario_id", "transformacao_id", "chave", "numero", "nome"):
                url = url.replace(nome, "00000000-0000-0000-0000-000000000000" if nome.endswith("id") else "1")
            r = cliente.request(metodo, url)
            if r.status_code not in (401, 422, 404, 405):
                abertas.append((metodo, caminho, r.status_code))
    assert abertas == []


def test_verificacao_de_integridade(cliente, token_admin, app):
    from sqlalchemy import text
    h = cab(token_admin)
    cliente.post(f"{API}/arquivos", headers=h, files={"arquivo": ("nota.txt", b"conteudo original")})
    r = cliente.post(f"{API}/sistema/integridade", headers=h).json()
    assert r["ok"], r
    nomes = {i["nome"]: i for i in r["itens"]}
    assert "1 arquivo(s)" in nomes["Arquivos originais (fotos, croquis, laudos, planilhas)"]["detalhe"]
    # arquivo alterado fora do aplicativo é detectado
    with app.state.fabrica_sessoes() as db:
        chave = db.execute(text("SELECT chave FROM arquivo")).scalar()
    p = app.state.armazenamento.caminho(chave)
    p.chmod(0o644)
    p.write_bytes(b"conteudo trocado!")
    r = cliente.post(f"{API}/sistema/integridade", headers=h).json()
    assert not r["ok"] and "1 alterado" in {i["nome"]: i for i in r["itens"]}["Arquivos originais (fotos, croquis, laudos, planilhas)"]["detalhe"]
    # regra de proteção removida é detectada
    with app.state.fabrica_sessoes() as db:
        db.execute(text("DROP TRIGGER trg_resultado_imutavel"))
        db.commit()
    r = cliente.post(f"{API}/sistema/integridade", headers=h).json()
    assert "trg_resultado_imutavel" in {i["nome"]: i for i in r["itens"]}["Regras de proteção gravadas no banco"]["detalhe"]
