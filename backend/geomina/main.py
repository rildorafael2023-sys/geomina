"""Aplicação FastAPI do GeoMina (servidor local, somente 127.0.0.1)."""

from __future__ import annotations

import logging
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
from geomina.modules.arquivos.router import router as arquivos_router
from geomina.modules.auth.router import router as auth_router
from geomina.modules.backup.router import router as backup_router
from geomina.modules.backup.service import backup_diario_se_necessario
from geomina.modules.estrutura.router import router as estrutura_router
from geomina.modules.painel.router import router as painel_router
from geomina.modules.sistema.router import router as sistema_router

PASTA_INTERFACE = Path(__file__).parent / "static"


def criar_app(cfg: Config | None = None, aplicar_migracoes: bool = True) -> FastAPI:
    cfg = cfg or Config()
    cfg.preparar_pastas()
    if aplicar_migracoes:
        migrar(cfg)
    if cfg.backup_diario:
        try:
            backup_diario_se_necessario(cfg)
        except Exception:  # o aplicativo abre mesmo se o backup diário falhar (fica no log)
            logging.getLogger("geomina").exception("Falha no backup diário automático")

    app = FastAPI(title="GeoMina", version=VERSAO_APP, docs_url="/api/docs", openapi_url="/api/openapi.json")
    app.state.config = cfg
    app.state.engine = criar_engine(cfg.url_banco)
    app.state.fabrica_sessoes = criar_fabrica_sessoes(app.state.engine)
    app.state.armazenamento = ArmazenamentoLocal(cfg.pasta_arquivos)
    app.state.presenca = Presenca()
    app.state.restaurando = False
    registrar_listeners(app.state.fabrica_sessoes)
    registrar_tratadores(app)

    @app.middleware("http")
    async def _bloquear_durante_restauracao(request: Request, chamar):
        if app.state.restaurando and request.url.path.startswith("/api/") and not request.url.path.endswith("/saude"):
            return JSONResponse(status_code=503, content={"codigo": "restaurando", "detalhes": None,
                                                          "mensagem": "Restauração de backup em andamento. Aguarde."})
        return await chamar(request)

    api = APIRouter(prefix="/api/v1")
    for r in (sistema_router, auth_router, arquivos_router, estrutura_router, painel_router, backup_router):
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
