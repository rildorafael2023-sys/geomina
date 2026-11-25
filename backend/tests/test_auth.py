"""Autenticação, permissões e regras de usuários."""

from datetime import timedelta

from sqlalchemy import update

from geomina.db import agora
from geomina.modules.auth.models import Sessao
from tests.conftest import SENHA, cab, criar_usuario


def test_instalacao_cria_admin_uma_unica_vez(cliente):
    assert cliente.get("/api/v1/instalacao").json() == {"precisa_admin": True}
    r = cliente.post("/api/v1/instalacao/admin", json={"login": "admin", "nome": "Adm", "senha": SENHA})
    assert r.status_code == 201
    assert "usuario:gerenciar" in r.json()["usuario"]["permissoes"]
    assert cliente.get("/api/v1/instalacao").json() == {"precisa_admin": False}
    r2 = cliente.post("/api/v1/instalacao/admin", json={"login": "outro", "nome": "Outro", "senha": SENHA})
    assert r2.status_code == 409
    assert r2.json()["codigo"] == "instalacao_concluida"


def test_senha_fraca_rejeitada(cliente):
    r = cliente.post("/api/v1/instalacao/admin", json={"login": "admin", "nome": "Adm", "senha": "12345678"})
    assert r.status_code == 422 and r.json()["codigo"] == "senha_fraca"


def test_login_invalido_e_valido(cliente, admin):
    assert cliente.post("/api/v1/auth/login", json={"login": "admin", "senha": "errada123"}).status_code == 401
    assert cliente.post("/api/v1/auth/login", json={"login": "naoexiste", "senha": SENHA}).status_code == 401
    r = cliente.post("/api/v1/auth/login", json={"login": "ADMIN", "senha": SENHA})  # login sem distinção de caixa
    assert r.status_code == 200
    eu = cliente.get("/api/v1/auth/eu", headers=cab(r.json()["token"]))
    assert eu.status_code == 200 and eu.json()["login"] == "admin"


def test_sem_token_e_token_invalido(cliente, admin):
    assert cliente.get("/api/v1/auth/eu").status_code == 401
    assert cliente.get("/api/v1/auth/eu", headers=cab("inventado")).status_code == 401


def test_logout_revoga_sessao(cliente, token_admin):
    assert cliente.post("/api/v1/auth/logout", headers=cab(token_admin)).status_code == 204
    assert cliente.get("/api/v1/auth/eu", headers=cab(token_admin)).status_code == 401


def test_sessao_expirada(app, cliente, token_admin):
    with app.state.fabrica_sessoes() as db:
        db.execute(update(Sessao).values(expira_em=agora() - timedelta(minutes=1)))
        db.commit()
    r = cliente.get("/api/v1/auth/eu", headers=cab(token_admin))
    assert r.status_code == 401 and r.json()["codigo"] == "sessao_invalida"


def test_permissoes_por_papel(cliente, token_admin):
    _, t_consulta = criar_usuario(cliente, token_admin, "leitor", ["CONSULTA"])
    r = cliente.get("/api/v1/usuarios", headers=cab(t_consulta))
    assert r.status_code == 403 and r.json()["codigo"] == "sem_permissao"
    assert cliente.get("/api/v1/usuarios", headers=cab(token_admin)).status_code == 200


def test_usuario_novo_deve_trocar_senha_e_login_duplicado(cliente, token_admin):
    u, _ = criar_usuario(cliente, token_admin, "geologo1", ["GEOLOGO"])
    assert u["trocar_senha"] is True
    r = cliente.post("/api/v1/usuarios", headers=cab(token_admin),
                     json={"login": "GEOLOGO1", "nome": "Xis", "senha": SENHA, "papeis": ["GEOLOGO"]})
    assert r.status_code == 409


def test_papel_inexistente(cliente, token_admin):
    r = cliente.post("/api/v1/usuarios", headers=cab(token_admin),
                     json={"login": "xx1", "nome": "Xis", "senha": SENHA, "papeis": ["CHEFE"]})
    assert r.status_code == 422 and r.json()["codigo"] == "papel_inexistente"


def test_usuario_desativado_perde_acesso(cliente, token_admin):
    u, t = criar_usuario(cliente, token_admin, "geologo2", ["GEOLOGO"])
    r = cliente.patch(f"/api/v1/usuarios/{u['id']}", headers=cab(token_admin),
                      json={"versao": u["versao"], "ativo": False})
    assert r.status_code == 200
    assert cliente.get("/api/v1/auth/eu", headers=cab(t)).status_code == 401
    assert cliente.post("/api/v1/auth/login", json={"login": "geologo2", "senha": SENHA}).status_code == 401


def test_concorrencia_otimista(cliente, token_admin):
    u, _ = criar_usuario(cliente, token_admin, "geologo3", ["GEOLOGO"])
    url = f"/api/v1/usuarios/{u['id']}"
    assert cliente.patch(url, headers=cab(token_admin), json={"versao": u["versao"], "nome": "Aa"}).status_code == 200
    r = cliente.patch(url, headers=cab(token_admin), json={"versao": u["versao"], "nome": "Bb"})
    assert r.status_code == 409 and r.json()["codigo"] == "versao_desatualizada"


def test_admin_nao_se_desativa_nem_remove_ultimo_admin(cliente, admin, token_admin):
    eu = admin["usuario"]
    url = f"/api/v1/usuarios/{eu['id']}"
    r = cliente.patch(url, headers=cab(token_admin), json={"versao": eu["versao"], "ativo": False})
    assert r.status_code == 422
    r = cliente.patch(url, headers=cab(token_admin), json={"versao": eu["versao"], "papeis": ["GEOLOGO"]})
    assert r.status_code == 422


def test_troca_de_senha_encerra_sessoes(cliente, token_admin):
    r = cliente.post("/api/v1/auth/senha", headers=cab(token_admin),
                     json={"senha_atual": "errada1", "nova_senha": "novaSenha456"})
    assert r.status_code == 422
    r = cliente.post("/api/v1/auth/senha", headers=cab(token_admin),
                     json={"senha_atual": SENHA, "nova_senha": "novaSenha456"})
    assert r.status_code == 204
    assert cliente.get("/api/v1/auth/eu", headers=cab(token_admin)).status_code == 401
    assert cliente.post("/api/v1/auth/login", json={"login": "admin", "senha": "novaSenha456"}).status_code == 200
