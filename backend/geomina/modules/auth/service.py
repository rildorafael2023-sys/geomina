from __future__ import annotations

import threading
from datetime import datetime, timedelta

from sqlalchemy import func, select, update
from sqlalchemy.orm import Session

from geomina.core.erros import ErroAplicacao
from geomina.core.seguranca import (
    gerar_hash_senha,
    gerar_token,
    hash_token,
    validar_forca_senha,
    verificar_senha,
)
from geomina.db import agora
from geomina.modules.auth.models import Papel, Sessao, Usuario

# Hash fixo usado para gastar o mesmo tempo quando o login não existe (evita descobrir logins por tempo).
_HASH_FALSO = gerar_hash_senha("senha-inexistente-0")


def total_usuarios(db: Session) -> int:
    return db.scalar(select(func.count()).select_from(Usuario)) or 0


def _exigir_senha_valida(senha: str) -> None:
    erro = validar_forca_senha(senha)
    if erro:
        raise ErroAplicacao(422, "senha_fraca", erro)


def _papeis(db: Session, codigos: list[str]) -> list[Papel]:
    papeis = list(db.scalars(select(Papel).where(Papel.codigo.in_(codigos))))
    desconhecidos = set(codigos) - {p.codigo for p in papeis}
    if desconhecidos:
        raise ErroAplicacao(422, "papel_inexistente", "Papel inexistente.", sorted(desconhecidos))
    return papeis


def criar_usuario(db: Session, *, login: str, nome: str, email: str | None, senha: str,
                  papeis: list[str], trocar_senha: bool = False) -> Usuario:
    _exigir_senha_valida(senha)
    if db.scalar(select(Usuario).where(Usuario.login == login)):
        raise ErroAplicacao(409, "login_existente", f"Já existe um usuário com o login '{login}'.")
    u = Usuario(login=login, nome=nome.strip(), email=email, senha_hash=gerar_hash_senha(senha),
                trocar_senha=trocar_senha, papeis=_papeis(db, papeis))
    db.add(u)
    db.flush()
    return u


# Proteção contra tentativa de senhas: depois de MAX_FALHAS erros seguidos no mesmo login, novas tentativas ficam
# bloqueadas por BLOQUEIO. Fica só na memória (reiniciar o aplicativo libera) — suficiente para um servidor local.
MAX_FALHAS = 5
BLOQUEIO = timedelta(minutes=5)
_falhas: dict[str, tuple[int, datetime]] = {}
_trava_falhas = threading.Lock()


def _verificar_bloqueio(chave: str) -> None:
    with _trava_falhas:
        n, ultima = _falhas.get(chave, (0, agora()))
        if n >= MAX_FALHAS and agora() - ultima < BLOQUEIO:
            minutos = max(1, int((BLOQUEIO - (agora() - ultima)).total_seconds() // 60) + 1)
            raise ErroAplicacao(429, "login_bloqueado",
                                f"Muitas tentativas com senha errada. Aguarde {minutos} minuto(s) e tente de novo.")
        if n >= MAX_FALHAS:
            _falhas.pop(chave, None)


def _registrar_falha(chave: str) -> None:
    with _trava_falhas:
        n, _ = _falhas.get(chave, (0, agora()))
        _falhas[chave] = (n + 1, agora())


def autenticar(db: Session, login: str, senha: str, horas: int) -> tuple[str, Sessao, Usuario]:
    chave = login.strip().lower()
    _verificar_bloqueio(chave)
    u = db.scalar(select(Usuario).where(Usuario.login == login))
    if u is None:
        verificar_senha(senha, _HASH_FALSO)
        _registrar_falha(chave)
        raise ErroAplicacao(401, "credenciais_invalidas", "Login ou senha incorretos.")
    if not verificar_senha(senha, u.senha_hash) or not u.ativo:
        _registrar_falha(chave)
        raise ErroAplicacao(401, "credenciais_invalidas", "Login ou senha incorretos.")
    with _trava_falhas:
        _falhas.pop(chave, None)
    token = gerar_token()
    s = Sessao(usuario_id=u.id, token_hash=hash_token(token), expira_em=agora() + timedelta(hours=horas))
    db.add(s)
    db.info["usuario_id"] = u.id
    # Registro de acesso não é alteração cadastral: não incrementa `versao` nem gera auditoria
    # (o login já fica registrado na tabela `sessao`).
    db.execute(update(Usuario).where(Usuario.id == u.id).values(ultimo_acesso=agora()))
    db.flush()
    return token, s, u


def alterar_usuario(db: Session, u: Usuario, dados, ator: Usuario) -> Usuario:
    if dados.versao != u.versao:
        raise ErroAplicacao(409, "versao_desatualizada",
                            "O usuário foi alterado por outra operação. Recarregue e tente novamente.")
    if dados.nome is not None:
        u.nome = dados.nome.strip()
    if "email" in dados.model_fields_set:
        u.email = dados.email
    if dados.ativo is not None:
        if u.id == ator.id and not dados.ativo:
            raise ErroAplicacao(422, "autodesativacao", "Você não pode desativar o próprio usuário.")
        u.ativo = dados.ativo
    if dados.papeis is not None:
        novos = _papeis(db, dados.papeis)
        if u.id == ator.id and "ADMIN" not in {p.codigo for p in novos}:
            raise ErroAplicacao(422, "auto_rebaixamento", "Você não pode retirar o próprio papel de administrador.")
        u.papeis = novos
    _garantir_um_admin_ativo(db, u)
    db.flush()
    return u


def _garantir_um_admin_ativo(db: Session, alterado: Usuario) -> None:
    admins = [
        x for x in db.scalars(select(Usuario).where(Usuario.ativo.is_(True)))
        if "ADMIN" in {p.codigo for p in x.papeis}
    ]
    if alterado not in admins and alterado.ativo and "ADMIN" in {p.codigo for p in alterado.papeis}:
        admins.append(alterado)
    if not [a for a in admins if a.ativo and "ADMIN" in {p.codigo for p in a.papeis}]:
        raise ErroAplicacao(422, "ultimo_admin", "O sistema precisa de pelo menos um administrador ativo.")


def definir_senha(db: Session, u: Usuario, nova: str, *, trocar_no_proximo_login: bool) -> None:
    _exigir_senha_valida(nova)
    u.senha_hash = gerar_hash_senha(nova)
    u.trocar_senha = trocar_no_proximo_login
    # Ao trocar a senha, todas as sessões abertas do usuário são encerradas.
    for s in db.scalars(select(Sessao).where(Sessao.usuario_id == u.id, Sessao.revogado_em.is_(None))):
        s.revogado_em = agora()
    db.flush()
