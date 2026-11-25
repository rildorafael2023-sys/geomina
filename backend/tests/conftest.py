import pytest
from fastapi.testclient import TestClient

from geomina.config import Config
from geomina.main import criar_app

SENHA = "senhaForte123"


@pytest.fixture
def cfg(tmp_path):
    return Config(dados=tmp_path / "dados")


@pytest.fixture
def app(cfg):
    a = criar_app(cfg)
    yield a
    a.state.engine.dispose()


@pytest.fixture
def cliente(app):
    with TestClient(app) as c:
        yield c


def cab(token):
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def admin(cliente):
    r = cliente.post("/api/v1/instalacao/admin", json={"login": "admin", "nome": "Administrador", "senha": SENHA})
    assert r.status_code == 201, r.text
    return r.json()


@pytest.fixture
def token_admin(admin):
    return admin["token"]


def criar_usuario(cliente, token, login, papeis):
    r = cliente.post("/api/v1/usuarios", headers=cab(token),
                     json={"login": login, "nome": login.title(), "senha": SENHA, "papeis": papeis})
    assert r.status_code == 201, r.text
    r2 = cliente.post("/api/v1/auth/login", json={"login": login, "senha": SENHA})
    assert r2.status_code == 200, r2.text
    return r.json(), r2.json()["token"]
