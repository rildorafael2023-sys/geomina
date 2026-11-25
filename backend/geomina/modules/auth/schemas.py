from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class PapelSaida(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    codigo: str
    nome: str


class UsuarioSaida(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    login: str
    nome: str
    email: str | None
    ativo: bool
    trocar_senha: bool
    ultimo_acesso: datetime | None
    versao: int
    papeis: list[PapelSaida]


class EuSaida(UsuarioSaida):
    permissoes: list[str]


class Login(BaseModel):
    login: str = Field(min_length=1, max_length=40)
    senha: str = Field(min_length=1, max_length=200)


class LoginSaida(BaseModel):
    token: str
    expira_em: datetime
    usuario: EuSaida


class AdminInicial(BaseModel):
    login: str = Field(min_length=3, max_length=40, pattern=r"^[A-Za-z0-9._-]+$")
    nome: str = Field(min_length=2, max_length=120)
    email: str | None = Field(default=None, max_length=160)
    senha: str = Field(min_length=1, max_length=200)


class UsuarioNovo(AdminInicial):
    papeis: list[str] = Field(min_length=1)


class UsuarioAlteracao(BaseModel):
    versao: int
    nome: str | None = Field(default=None, min_length=2, max_length=120)
    email: str | None = Field(default=None, max_length=160)
    ativo: bool | None = None
    papeis: list[str] | None = Field(default=None, min_length=1)


class RedefinirSenha(BaseModel):
    nova_senha: str = Field(min_length=1, max_length=200)


class TrocarSenha(BaseModel):
    senha_atual: str
    nova_senha: str = Field(min_length=1, max_length=200)
