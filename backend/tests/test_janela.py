"""Janela própria, instância única e encerramento automático."""

from pathlib import Path

from geomina.janela import (
    ESPERA_APOS_FECHAR,
    TOLERANCIA_INICIAL,
    TOLERANCIA_SEM_SINAL,
    Presenca,
    comando_janela,
)


def test_comando_modo_aplicativo_com_perfil_proprio():
    cmd = comando_janela(Path("msedge.exe"), "http://127.0.0.1:8765/", Path("C:/dados/janela"))
    assert "--app=http://127.0.0.1:8765/" in cmd
    assert any(c.startswith("--user-data-dir=") for c in cmd)
    assert "--no-first-run" in cmd


def test_presenca_inativa_nunca_encerra():
    p = Presenca(ativo=False, inicio=0)
    assert not p.deve_encerrar(agora=10_000)


def test_presenca_tolerancia_inicial():
    p = Presenca(ativo=True, inicio=0)
    assert not p.deve_encerrar(agora=TOLERANCIA_INICIAL - 1)
    assert p.deve_encerrar(agora=TOLERANCIA_INICIAL + 1)


def test_fechar_janela_encerra_mas_recarregar_nao():
    p = Presenca(ativo=True, inicio=0)
    p.ultimo_sinal, p.fechando_em = 100, 100
    assert not p.deve_encerrar(agora=100 + ESPERA_APOS_FECHAR - 1)
    assert p.deve_encerrar(agora=100 + ESPERA_APOS_FECHAR + 1)
    # recarregar: novo sinal logo após o "fechando" cancela o encerramento
    p.sinal()
    assert p.fechando_em is None


def test_sem_sinal_por_muito_tempo_encerra():
    p = Presenca(ativo=True, inicio=0)
    p.ultimo_sinal = 50
    assert not p.deve_encerrar(agora=50 + TOLERANCIA_SEM_SINAL - 1)
    assert p.deve_encerrar(agora=50 + TOLERANCIA_SEM_SINAL + 1)


def test_rotas_de_presenca_exigem_cabecalho(app, cliente):
    assert cliente.post("/api/v1/sistema/presenca").status_code == 400
    assert cliente.post("/api/v1/sistema/presenca", headers={"X-GeoMina": "1"}).status_code == 204
    assert app.state.presenca.ultimo_sinal is not None
    assert cliente.post("/api/v1/sistema/fechando", headers={"X-GeoMina": "1"}).status_code == 204
    assert app.state.presenca.fechando_em is not None
