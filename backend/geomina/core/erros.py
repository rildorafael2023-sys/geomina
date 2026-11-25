"""Formato padronizado de erros da API: {codigo, mensagem, detalhes}."""

from __future__ import annotations

from typing import Any

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm.exc import StaleDataError
from starlette.exceptions import HTTPException as StarletteHTTPException


class ErroAplicacao(Exception):
    def __init__(self, status: int, codigo: str, mensagem: str, detalhes: Any = None) -> None:
        self.status, self.codigo, self.mensagem, self.detalhes = status, codigo, mensagem, detalhes


def _resp(status: int, codigo: str, mensagem: str, detalhes: Any = None) -> JSONResponse:
    return JSONResponse(status_code=status, content={"codigo": codigo, "mensagem": mensagem, "detalhes": detalhes})


def registrar_tratadores(app: FastAPI) -> None:
    @app.exception_handler(ErroAplicacao)
    async def _app(_r: Request, e: ErroAplicacao):
        return _resp(e.status, e.codigo, e.mensagem, e.detalhes)

    @app.exception_handler(StarletteHTTPException)
    async def _http(_r: Request, e: StarletteHTTPException):
        return _resp(e.status_code, "http_" + str(e.status_code), str(e.detail))

    @app.exception_handler(RequestValidationError)
    async def _validacao(_r: Request, e: RequestValidationError):
        detalhes = [{"campo": ".".join(str(x) for x in err["loc"][1:]), "motivo": err["msg"]} for err in e.errors()]
        return _resp(422, "validacao", "Dados inválidos.", detalhes)

    @app.exception_handler(IntegrityError)
    async def _integridade(_r: Request, e: IntegrityError):
        return _resp(409, "integridade", "A operação viola uma regra de integridade do banco.", str(e.orig))

    @app.exception_handler(StaleDataError)
    async def _concorrencia(_r: Request, _e: StaleDataError):
        return _resp(409, "versao_desatualizada",
                     "O registro foi alterado por outra operação. Recarregue e tente novamente.")
