"""Dependências FastAPI: sessão de banco, usuário autenticado, permissões."""

from __future__ import annotations

from collections.abc import Callable, Iterator

from fastapi import Depends, Request
from sqlalchemy import select
from sqlalchemy.orm import Session

from geomina.core.erros import ErroAplicacao
from geomina.core.seguranca import hash_token
from geomina.db import agora
from geomina.modules.auth.models import Sessao, Usuario


def obter_sessao(request: Request) -> Iterator[Session]:
    sessao = request.app.state.fabrica_sessoes()
    sessao.info["origem"] = "aplicativo"
    try:
        yield sessao
        sessao.commit()
    except BaseException:
        sessao.rollback()
        raise
    finally:
        sessao.close()


def _token(request: Request) -> str | None:
    cab = request.headers.get("authorization", "")
    if cab.lower().startswith("bearer "):
        return cab[7:].strip() or None
    return None


def usuario_atual(request: Request, db: Session = Depends(obter_sessao)) -> Usuario:
    token = _token(request)
    if not token:
        raise ErroAplicacao(401, "nao_autenticado", "É necessário entrar no sistema.")
    s = db.scalar(select(Sessao).where(Sessao.token_hash == hash_token(token)))
    agora_ = agora()
    if s is None or s.revogado_em is not None or _utc(s.expira_em) <= agora_:
        raise ErroAplicacao(401, "sessao_invalida", "Sessão expirada ou inválida. Entre novamente.")
    usuario = db.get(Usuario, s.usuario_id)
    if usuario is None or not usuario.ativo:
        raise ErroAplicacao(401, "usuario_inativo", "Usuário inativo.")
    db.info["usuario_id"] = usuario.id
    request.state.sessao_id = s.id
    return usuario


def requer(*permissoes: str) -> Callable[..., Usuario]:
    def _dep(usuario: Usuario = Depends(usuario_atual)) -> Usuario:
        faltando = set(permissoes) - usuario.permissoes()
        if faltando:
            raise ErroAplicacao(403, "sem_permissao", "Você não tem permissão para esta ação.", sorted(faltando))
        return usuario

    return _dep


def _utc(dt):
    # SQLite devolve datetimes sem fuso; gravamos sempre em UTC.
    from datetime import UTC

    return dt if dt.tzinfo else dt.replace(tzinfo=UTC)
