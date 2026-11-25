"""Senhas e tokens de sessão."""

from __future__ import annotations

import hashlib
import secrets

from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError

_hasher = PasswordHasher()

SENHA_MINIMO = 8


def gerar_hash_senha(senha: str) -> str:
    return _hasher.hash(senha)


def verificar_senha(senha: str, hash_: str) -> bool:
    try:
        return _hasher.verify(hash_, senha)
    except (VerificationError, InvalidHashError):
        return False


def gerar_token() -> str:
    return secrets.token_urlsafe(32)


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def validar_forca_senha(senha: str) -> str | None:
    """Retorna mensagem de erro ou None."""
    if len(senha) < SENHA_MINIMO:
        return f"A senha deve ter pelo menos {SENHA_MINIMO} caracteres."
    if senha.isdigit() or senha.isalpha():
        return "A senha deve combinar letras e números."
    return None
