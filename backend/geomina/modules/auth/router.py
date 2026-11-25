from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, Request
from sqlalchemy import select
from sqlalchemy.orm import Session

from geomina.core.dependencias import obter_sessao, requer, usuario_atual
from geomina.core.erros import ErroAplicacao
from geomina.core.seguranca import verificar_senha
from geomina.db import agora
from geomina.modules.auth import service
from geomina.modules.auth.models import Papel, Sessao, Usuario
from geomina.modules.auth.schemas import (
    AdminInicial,
    EuSaida,
    Login,
    LoginSaida,
    PapelSaida,
    RedefinirSenha,
    TrocarSenha,
    UsuarioAlteracao,
    UsuarioNovo,
    UsuarioSaida,
)

router = APIRouter(tags=["autenticação e usuários"])


def _eu(u: Usuario) -> EuSaida:
    return EuSaida(**UsuarioSaida.model_validate(u).model_dump(), permissoes=sorted(u.permissoes()))


@router.get("/instalacao")
def estado_instalacao(db: Session = Depends(obter_sessao)) -> dict:
    return {"precisa_admin": service.total_usuarios(db) == 0}


@router.post("/instalacao/admin", response_model=LoginSaida, status_code=201)
def criar_admin_inicial(dados: AdminInicial, request: Request, db: Session = Depends(obter_sessao)):
    """Cria o primeiro administrador. Só funciona enquanto não houver nenhum usuário."""
    if service.total_usuarios(db) > 0:
        raise ErroAplicacao(409, "instalacao_concluida", "O administrador inicial já foi criado.")
    db.info["origem"] = "instalacao"
    service.criar_usuario(db, login=dados.login, nome=dados.nome, email=dados.email,
                          senha=dados.senha, papeis=["ADMIN"])
    token, s, u = service.autenticar(db, dados.login, dados.senha, request.app.state.config.sessao_horas)
    return LoginSaida(token=token, expira_em=s.expira_em, usuario=_eu(u))


@router.post("/auth/login", response_model=LoginSaida)
def login(dados: Login, request: Request, db: Session = Depends(obter_sessao)):
    token, s, u = service.autenticar(db, dados.login, dados.senha, request.app.state.config.sessao_horas)
    return LoginSaida(token=token, expira_em=s.expira_em, usuario=_eu(u))


@router.post("/auth/logout", status_code=204)
def logout(request: Request, _u: Usuario = Depends(usuario_atual), db: Session = Depends(obter_sessao)):
    s = db.get(Sessao, request.state.sessao_id)
    if s:
        s.revogado_em = agora()


@router.get("/auth/eu", response_model=EuSaida)
def eu(u: Usuario = Depends(usuario_atual)):
    return _eu(u)


@router.post("/auth/senha", status_code=204)
def trocar_senha(dados: TrocarSenha, u: Usuario = Depends(usuario_atual), db: Session = Depends(obter_sessao)):
    u = db.merge(u)
    if not verificar_senha(dados.senha_atual, u.senha_hash):
        raise ErroAplicacao(422, "senha_atual_incorreta", "A senha atual está incorreta.")
    service.definir_senha(db, u, dados.nova_senha, trocar_no_proximo_login=False)


@router.get("/papeis", response_model=list[PapelSaida])
def listar_papeis(_u: Usuario = Depends(usuario_atual), db: Session = Depends(obter_sessao)):
    return list(db.scalars(select(Papel).order_by(Papel.nome)))


@router.get("/usuarios", response_model=list[UsuarioSaida])
def listar_usuarios(_u: Usuario = Depends(requer("usuario:gerenciar")), db: Session = Depends(obter_sessao)):
    return list(db.scalars(select(Usuario).order_by(Usuario.nome)))


@router.post("/usuarios", response_model=UsuarioSaida, status_code=201)
def criar_usuario(dados: UsuarioNovo, _u: Usuario = Depends(requer("usuario:gerenciar")),
                  db: Session = Depends(obter_sessao)):
    return service.criar_usuario(db, login=dados.login, nome=dados.nome, email=dados.email, senha=dados.senha,
                                 papeis=dados.papeis, trocar_senha=True)


def _buscar(db: Session, usuario_id: uuid.UUID) -> Usuario:
    u = db.get(Usuario, usuario_id)
    if u is None:
        raise ErroAplicacao(404, "nao_encontrado", "Usuário não encontrado.")
    return u


@router.patch("/usuarios/{usuario_id}", response_model=UsuarioSaida)
def alterar_usuario(usuario_id: uuid.UUID, dados: UsuarioAlteracao,
                    ator: Usuario = Depends(requer("usuario:gerenciar")), db: Session = Depends(obter_sessao)):
    return service.alterar_usuario(db, _buscar(db, usuario_id), dados, ator)


@router.post("/usuarios/{usuario_id}/senha", status_code=204)
def redefinir_senha(usuario_id: uuid.UUID, dados: RedefinirSenha,
                    _a: Usuario = Depends(requer("usuario:gerenciar")), db: Session = Depends(obter_sessao)):
    service.definir_senha(db, _buscar(db, usuario_id), dados.nova_senha, trocar_no_proximo_login=True)
