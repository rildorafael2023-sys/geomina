"""Armazenamento de arquivos originais (RNF-04)."""

import hashlib
import os
import stat

from geomina.core.armazenamento import ArquivoCorrompido
from tests.conftest import cab, criar_usuario

PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 100
PDF = b"%PDF-1.7\n" + b"conteudo de teste" * 50


def _enviar(cliente, token, nome, conteudo):
    return cliente.post("/api/v1/arquivos", headers=cab(token), files={"arquivo": (nome, conteudo)})


def test_envio_hash_e_download(app, cliente, token_admin):
    r = _enviar(cliente, token_admin, "croqui.pdf", PDF)
    assert r.status_code == 201
    d = r.json()
    assert d["sha256"] == hashlib.sha256(PDF).hexdigest()
    assert d["mime"] == "application/pdf" and d["tamanho"] == len(PDF) and d["ja_existia"] is False
    baixado = cliente.get(f"/api/v1/arquivos/{d['id']}/conteudo?verificar=true", headers=cab(token_admin))
    assert baixado.status_code == 200 and baixado.content == PDF


def test_deduplicacao(cliente, token_admin):
    a = _enviar(cliente, token_admin, "a.pdf", PDF).json()
    b = _enviar(cliente, token_admin, "copia.pdf", PDF).json()
    assert b["ja_existia"] is True and b["id"] == a["id"]


def test_tipo_detectado_pelo_conteudo_nao_pela_extensao(cliente, token_admin):
    d = _enviar(cliente, token_admin, "falso.pdf", PNG).json()
    assert d["mime"] == "image/png"


def test_original_somente_leitura_e_corrupcao_detectada(app, cliente, token_admin):
    d = _enviar(cliente, token_admin, "f.png", PNG).json()
    arm = app.state.armazenamento
    caminho = arm.caminho(arm.chave_para(d["sha256"]))
    assert not os.stat(caminho).st_mode & stat.S_IWUSR
    os.chmod(caminho, stat.S_IWUSR | stat.S_IRUSR)
    caminho.write_bytes(PNG + b"alterado")
    try:
        arm.verificar(arm.chave_para(d["sha256"]), d["sha256"])
        raise AssertionError("corrupção não detectada")
    except ArquivoCorrompido:
        pass
    r = cliente.get(f"/api/v1/arquivos/{d['id']}/conteudo?verificar=true", headers=cab(token_admin))
    assert r.status_code == 500 and r.json()["codigo"] == "arquivo_corrompido"


def test_limite_de_tamanho(app, cliente, token_admin):
    app.state.config.tamanho_max_upload_mb = 1
    r = _enviar(cliente, token_admin, "grande.bin", b"0" * (1024 * 1024 + 1))
    assert r.status_code == 413
    assert list((app.state.config.pasta_arquivos / "tmp").iterdir()) == []


def test_consulta_nao_envia(cliente, token_admin):
    _, t = criar_usuario(cliente, token_admin, "leitor", ["CONSULTA"])
    assert _enviar(cliente, t, "a.pdf", PDF).status_code == 403
