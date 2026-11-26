"""Aplicação FastAPI do GeoMina (servidor local, somente 127.0.0.1)."""

from __future__ import annotations

import threading
from pathlib import Path

from fastapi import APIRouter, FastAPI, Request
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from geomina.config import VERSAO_APP, Config
from geomina.core.armazenamento import ArmazenamentoLocal
from geomina.core.auditoria import registrar_listeners
from geomina.core.erros import registrar_tratadores
from geomina.db import criar_engine, criar_fabrica_sessoes
from geomina.janela import Presenca
from geomina.migrar import migrar
from geomina.modules.amostragem.router import router as amostragem_router
from geomina.modules.analise.router import router as analise_router
from geomina.modules.arquivos.router import router as arquivos_router
from geomina.modules.auth.router import router as auth_router
from geomina.modules.backup import service as backup_service
from geomina.modules.backup.router import router as backup_router
from geomina.modules.dicionarios.router import router as dicionarios_router
from geomina.modules.documentos.router import router as documentos_router
from geomina.modules.estrutura.router import router as estrutura_router
from geomina.modules.geoop.router import router as geoop_router
from geomina.modules.geoquimica.router import router as geoquimica_router
from geomina.modules.mapeamento.router import router as mapeamento_router
from geomina.modules.painel.router import router as painel_router
from geomina.modules.relatorios.router import router as relatorios_router
from geomina.modules.sistema.router import router as sistema_router
from geomina.modules.sondagem.router import router as sondagem_router
from geomina.modules.topografia.router import router as topografia_router

PASTA_INTERFACE = Path(__file__).parent / "static"



HOSTS_PERMITIDOS = {"127.0.0.1", "localhost", "::1", "testserver"}

def criar_app(cfg: Config | None = None, aplicar_migracoes: bool = True) -> FastAPI:
    cfg = cfg or Config()
    cfg.preparar_pastas()
    if aplicar_migracoes:
        migrar(cfg)

    app = FastAPI(title="GeoMina", version=VERSAO_APP, docs_url="/api/docs", openapi_url="/api/openapi.json")
    app.state.config = cfg
    # Backup automático em segundo plano: na abertura e a cada hora (diário só do banco; semanal completo; teste de
    # restauração e cópia para a segunda pasta, se configurada). Não atrasa a abertura do aplicativo.
    app.state.parar_backup = threading.Event()
    app.state.backup_thread = backup_service.agendar(cfg, app.state.parar_backup) if cfg.backup_diario else None
    app.state.engine = criar_engine(cfg.url_banco)
    app.state.fabrica_sessoes = criar_fabrica_sessoes(app.state.engine)
    app.state.armazenamento = ArmazenamentoLocal(cfg.pasta_arquivos)
    app.state.presenca = Presenca()
    app.state.restaurando = False
    registrar_listeners(app.state.fabrica_sessoes)
    registrar_tratadores(app)

    @app.middleware("http")
    async def _seguranca(request: Request, chamar):
        # Só atende pelo nome da própria máquina: impede que uma página da internet use "DNS rebinding" para
        # falar com o GeoMina pelo navegador do usuário (o servidor escuta só em 127.0.0.1).
        host = (request.headers.get("host") or "").rsplit(":", 1)[0].strip("[]").lower()
        if host not in HOSTS_PERMITIDOS:
            return JSONResponse(status_code=421, content={"codigo": "host_invalido", "detalhes": None,
                                                          "mensagem": "Acesse o GeoMina pelo endereço 127.0.0.1 ou localhost."})
        resposta = await chamar(request)
        resposta.headers.setdefault("X-Content-Type-Options", "nosniff")
        resposta.headers.setdefault("X-Frame-Options", "DENY")
        resposta.headers.setdefault("Referrer-Policy", "no-referrer")
        if request.url.path.startswith("/api/"):
            # arquivos enviados pelos usuários nunca executam script na origem do aplicativo
            resposta.headers.setdefault("Content-Security-Policy", "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox")
            resposta.headers.setdefault("Cache-Control", "no-store")
        return resposta

    @app.middleware("http")
    async def _bloquear_durante_restauracao(request: Request, chamar):
        if app.state.restaurando and request.url.path.startswith("/api/") and not request.url.path.endswith("/saude"):
            return JSONResponse(status_code=503, content={"codigo": "restaurando", "detalhes": None,
                                                          "mensagem": "Restauração de backup em andamento. Aguarde."})
        return await chamar(request)

    api = APIRouter(prefix="/api/v1")
    for r in (sistema_router, auth_router, arquivos_router, estrutura_router, painel_router, backup_router,
              dicionarios_router, mapeamento_router, documentos_router, amostragem_router,
              geoquimica_router, topografia_router, analise_router, geoop_router, sondagem_router, relatorios_router):
        api.include_router(r)
    app.include_router(api)

    if (PASTA_INTERFACE / "index.html").exists():
        app.mount("/assets", StaticFiles(directory=PASTA_INTERFACE / "assets"), name="assets")

        @app.get("/{caminho:path}", include_in_schema=False)
        def interface(caminho: str):
            if caminho == "api" or caminho.startswith("api/"):
                return JSONResponse(status_code=404, content={"codigo": "http_404", "mensagem": "Not Found",
                                                              "detalhes": None})
            alvo = (PASTA_INTERFACE / caminho).resolve()
            if caminho and alvo.is_file() and PASTA_INTERFACE.resolve() in alvo.parents:
                return FileResponse(alvo)
            return FileResponse(PASTA_INTERFACE / "index.html")

    return app
