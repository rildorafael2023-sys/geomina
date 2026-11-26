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
        return _resp(*traduzir_integridade(str(e.orig)))

    @app.exception_handler(StaleDataError)
    async def _concorrencia(_r: Request, _e: StaleDataError):
        return _resp(409, "versao_desatualizada",
                     "O registro foi alterado por outra operação. Recarregue e tente novamente.")


# Prefixos das mensagens RAISE(ABORT, ...) dos triggers (migrações): são regras de negócio
# garantidas pelo banco e podem ser mostradas ao usuário como estão.
PREFIXOS_REGRAS = ("hierarquia:", "multinível:", "avanço:", "tipo de unidade:", "regra de hierarquia:", "mapeamento:",
                   "documento:", "amostra:", "geoquímica:", "topografia:",
                   "auditoria:")


def traduzir_integridade(msg: str) -> tuple[int, str, str, str]:
    for prefixo in PREFIXOS_REGRAS:
        if msg.startswith(prefixo):
            texto = msg[len(prefixo):].strip()
            return 422, "regra_violada", texto[:1].upper() + texto[1:] + ".", msg
    if msg.startswith("UNIQUE constraint failed"):
        return 409, "duplicado", "Já existe um registro com esses dados.", msg
    if msg.startswith("FOREIGN KEY constraint failed"):
        return 409, "possui_vinculos", "O registro está vinculado a outros registros.", msg
    if msg.startswith("CHECK constraint failed"):
        return 422, "valor_invalido", "Valor fora das regras permitidas.", msg
    return 409, "integridade", "A operação viola uma regra de integridade do banco.", msg
