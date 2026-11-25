"""Regras de negócio da estrutura operacional.

As regras estruturais (hierarquia, ciclos, mesma mina, caminho) também estão em triggers do banco;
aqui ficam as verificações que produzem mensagens claras antes de chegar ao banco e as regras que
dependem de contexto (inativação, exclusão, versões).
"""

from __future__ import annotations

import uuid

import pyproj
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from geomina.core.auditoria import Auditoria
from geomina.core.erros import ErroAplicacao
from geomina.modules.auth.models import Usuario
from geomina.modules.estrutura import schemas as s
from geomina.modules.estrutura.models import (
    FrenteAvanco,
    Mina,
    RegraHierarquia,
    TipoUnidade,
    UnidadeNivel,
    UnidadeOperacional,
)

# ---------------------------------------------------------------- utilidades


def _versao(obj, versao: int) -> None:
    if obj.versao != versao:
        raise ErroAplicacao(409, "versao_desatualizada",
                            "O registro foi alterado por outra operação. Recarregue e tente novamente.")


def _nao_encontrado(o, nome: str):
    if o is None:
        raise ErroAplicacao(404, "nao_encontrado", f"{nome} não encontrado(a).")
    return o


def nome_crs(srid: int) -> str | None:
    try:
        return pyproj.CRS.from_epsg(srid).name
    except pyproj.exceptions.CRSError:
        return None


def validar_crs(srid: int) -> None:
    try:
        crs = pyproj.CRS.from_epsg(srid)
    except pyproj.exceptions.CRSError as e:
        raise ErroAplicacao(422, "crs_invalido", f"EPSG:{srid} não existe na base de sistemas de coordenadas.") from e
    unidades = {eixo.unit_name for eixo in crs.axis_info}
    if not crs.is_projected or unidades != {"metre"}:
        raise ErroAplicacao(422, "crs_invalido",
                            f"EPSG:{srid} ({crs.name}) não é um sistema projetado em metros (ex.: UTM).")


# ---------------------------------------------------------------- minas


def criar_mina(db: Session, d: s.MinaEntrada) -> Mina:
    validar_crs(d.srid_trabalho)
    if db.scalar(select(Mina).where(Mina.codigo == d.codigo)):
        raise ErroAplicacao(409, "duplicado", f"Já existe uma mina com o código '{d.codigo}'.")
    m = Mina(**d.model_dump())
    db.add(m)
    db.flush()
    return m


def alterar_mina(db: Session, m: Mina, d: s.MinaAlteracao) -> Mina:
    _versao(m, d.versao)
    for campo in ("nome", "declinacao_magnetica", "observacoes"):
        if campo in d.model_fields_set:
            setattr(m, campo, getattr(d, campo))
    db.flush()
    return m


def mina_saida(m: Mina) -> s.MinaSaida:
    saida = s.MinaSaida.model_validate(m)
    saida.crs_nome = nome_crs(m.srid_trabalho)
    return saida


# ---------------------------------------------------------------- tipos e regras


def tipos_saida(db: Session) -> list[s.TipoUnidadeSaida]:
    tipos = list(db.scalars(select(TipoUnidade).order_by(TipoUnidade.ordem, TipoUnidade.nome)))
    por_id = {t.id: t for t in tipos}
    filhos: dict[uuid.UUID, list[str]] = {t.id: [] for t in tipos}
    for r in db.scalars(select(RegraHierarquia)):
        filhos[r.tipo_pai_id].append(por_id[r.tipo_filho_id].codigo)
    saida = []
    for t in tipos:
        o = s.TipoUnidadeSaida.model_validate(t)
        o.filhos_permitidos = sorted(filhos[t.id], key=lambda c: next(x.ordem for x in tipos if x.codigo == c))
        saida.append(o)
    return saida


def tipo_por_codigo(db: Session, codigo: str) -> TipoUnidade:
    t = db.scalar(select(TipoUnidade).where(TipoUnidade.codigo == codigo))
    if t is None:
        raise ErroAplicacao(422, "tipo_inexistente", f"Tipo de unidade '{codigo}' não existe.")
    return t


def criar_tipo(db: Session, d: s.TipoUnidadeEntrada) -> TipoUnidade:
    if db.scalar(select(TipoUnidade).where(TipoUnidade.codigo == d.codigo)):
        raise ErroAplicacao(409, "duplicado", f"Já existe um tipo com o código '{d.codigo}'.")
    t = TipoUnidade(**d.model_dump())
    db.add(t)
    db.flush()
    return t


def alterar_tipo(db: Session, t: TipoUnidade, d: s.TipoUnidadeAlteracao) -> TipoUnidade:
    _versao(t, d.versao)
    for campo in d.model_fields_set - {"versao"}:
        setattr(t, campo, getattr(d, campo))
    db.flush()
    return t


def definir_regras(db: Session, d: s.RegrasEntrada) -> None:
    tipos = {t.codigo.upper(): t for t in db.scalars(select(TipoUnidade))}
    desejadas: set[tuple[uuid.UUID, uuid.UUID]] = set()
    for pai, filhos in d.regras.items():
        for cod in [pai, *filhos]:
            if cod.upper() not in tipos:
                raise ErroAplicacao(422, "tipo_inexistente", f"Tipo de unidade '{cod}' não existe.")
        desejadas |= {(tipos[pai.upper()].id, tipos[f.upper()].id) for f in filhos}
    atuais = {(r.tipo_pai_id, r.tipo_filho_id): r for r in db.scalars(select(RegraHierarquia))}
    for chave, regra in atuais.items():
        if chave not in desejadas:
            db.delete(regra)  # o trigger impede remover regra em uso
    for pai_id, filho_id in desejadas - set(atuais):
        db.add(RegraHierarquia(tipo_pai_id=pai_id, tipo_filho_id=filho_id))
    db.flush()


# ---------------------------------------------------------------- unidades


def _resumo(u: UnidadeOperacional) -> s.UnidadeResumo:
    return s.UnidadeResumo(id=u.id, mina_id=u.mina_id, pai_id=u.pai_id, tipo=u.tipo.codigo, tipo_nome=u.tipo.nome,
                           codigo=u.codigo, nome=u.nome, status=u.status, ativo=u.ativo, versao=u.versao)


def buscar_unidade(db: Session, unidade_id: uuid.UUID) -> UnidadeOperacional:
    return _nao_encontrado(db.get(UnidadeOperacional, unidade_id), "Unidade")


def detalhe(db: Session, u: UnidadeOperacional) -> s.UnidadeDetalhe:
    ids = [uuid.UUID(h) for h in (u.caminho or "").strip("/").split("/") if h]
    nomes = {x.id: f"{x.codigo} — {x.nome}" for x in db.scalars(select(UnidadeOperacional).where(
        UnidadeOperacional.id.in_(ids)))}
    niveis = list(db.scalars(select(UnidadeOperacional).join(UnidadeNivel, UnidadeNivel.nivel_id ==
                                                             UnidadeOperacional.id)
                             .where(UnidadeNivel.unidade_id == u.id).order_by(UnidadeOperacional.codigo)))
    filhos = db.scalar(select(func.count()).where(UnidadeOperacional.pai_id == u.id)) or 0
    return s.UnidadeDetalhe(**_resumo(u).model_dump(), cota_referencia=u.cota_referencia, descricao=u.descricao,
                            caminho_nomes=[nomes.get(i, "?") for i in ids], niveis=[_resumo(n) for n in niveis],
                            filhos=filhos, criado_em=u.criado_em, atualizado_em=u.atualizado_em)


def listar(db: Session, mina_id: uuid.UUID, *, incluir_inativas: bool = True, nivel_id: uuid.UUID | None = None,
           tipo: str | None = None, texto: str | None = None) -> list[s.UnidadeResumo]:
    q = select(UnidadeOperacional).where(UnidadeOperacional.mina_id == mina_id)
    if not incluir_inativas:
        q = q.where(UnidadeOperacional.ativo.is_(True))
    if nivel_id is not None:
        nivel = buscar_unidade(db, nivel_id)
        if not nivel.tipo.e_nivel:
            raise ErroAplicacao(422, "nao_e_nivel", "A unidade informada não é um nível.")
        vinculadas = select(UnidadeNivel.unidade_id).where(UnidadeNivel.nivel_id == nivel_id)
        q = q.where(or_(UnidadeOperacional.caminho.like(nivel.caminho + "%"), UnidadeOperacional.id.in_(vinculadas)))
    if tipo:
        q = q.where(UnidadeOperacional.tipo_id == tipo_por_codigo(db, tipo).id)
    if texto:
        padrao = f"%{texto}%"
        q = q.where(or_(UnidadeOperacional.codigo.ilike(padrao), UnidadeOperacional.nome.ilike(padrao)))
    unidades = db.scalars(q.join(TipoUnidade).order_by(TipoUnidade.ordem, UnidadeOperacional.codigo))
    return [_resumo(u) for u in unidades]


def _definir_niveis(db: Session, u: UnidadeOperacional, niveis: list[uuid.UUID]) -> None:
    if niveis and not u.tipo.multinivel:
        raise ErroAplicacao(422, "nao_multinivel", f"Unidades do tipo {u.tipo.nome} não se vinculam a vários níveis.")
    for nid in niveis:
        n = buscar_unidade(db, nid)
        if not n.tipo.e_nivel or n.mina_id != u.mina_id:
            raise ErroAplicacao(422, "nivel_invalido", f"'{n.codigo}' não é um nível desta mina.")
    # Pelo ORM (e não DELETE em massa) para que cada vínculo removido/criado seja auditado.
    atuais = {v.nivel_id: v for v in db.scalars(select(UnidadeNivel).where(UnidadeNivel.unidade_id == u.id))}
    desejados = set(niveis)
    for nid, vinculo in atuais.items():
        if nid not in desejados:
            db.delete(vinculo)
    for nid in dict.fromkeys(niveis):
        if nid not in atuais:
            db.add(UnidadeNivel(unidade_id=u.id, nivel_id=nid))
    db.flush()


def criar_unidade(db: Session, d: s.UnidadeEntrada) -> UnidadeOperacional:
    mina = _nao_encontrado(db.get(Mina, d.mina_id), "Mina")
    tipo = tipo_por_codigo(db, d.tipo)
    if not tipo.ativo:
        raise ErroAplicacao(422, "tipo_inativo", f"O tipo {tipo.nome} está inativo.")
    if d.pai_id is not None:
        pai = buscar_unidade(db, d.pai_id)
        if not pai.ativo:
            raise ErroAplicacao(422, "pai_inativo", "Não é possível criar unidades dentro de uma unidade inativa.")
    if db.scalar(select(UnidadeOperacional).where(UnidadeOperacional.mina_id == mina.id,
                                                  UnidadeOperacional.codigo == d.codigo)):
        raise ErroAplicacao(409, "duplicado", f"Já existe uma unidade com o código '{d.codigo}' nesta mina.")
    u = UnidadeOperacional(mina_id=mina.id, tipo_id=tipo.id, pai_id=d.pai_id, codigo=d.codigo.strip(),
                           nome=d.nome.strip(), status=d.status, cota_referencia=d.cota_referencia,
                           descricao=d.descricao)
    db.add(u)
    db.flush()  # triggers validam a hierarquia e calculam o caminho
    db.refresh(u)
    if d.niveis:
        _definir_niveis(db, u, d.niveis)
    return u


def alterar_unidade(db: Session, u: UnidadeOperacional, d: s.UnidadeAlteracao) -> UnidadeOperacional:
    _versao(u, d.versao)
    if d.codigo and d.codigo != u.codigo and db.scalar(select(UnidadeOperacional).where(
            UnidadeOperacional.mina_id == u.mina_id, UnidadeOperacional.codigo == d.codigo)):
        raise ErroAplicacao(409, "duplicado", f"Já existe uma unidade com o código '{d.codigo}' nesta mina.")
    if d.ativo is False and u.ativo:
        ativos = db.scalar(select(func.count()).where(UnidadeOperacional.pai_id == u.id,
                                                      UnidadeOperacional.ativo.is_(True)))
        if ativos:
            raise ErroAplicacao(422, "filhos_ativos",
                                f"Inative antes as {ativos} unidade(s) ativas dentro de '{u.codigo}'.")
    if d.ativo is True and not u.ativo and u.pai_id is not None and not buscar_unidade(db, u.pai_id).ativo:
        raise ErroAplicacao(422, "pai_inativo", "Reative antes a unidade-pai.")
    for campo in d.model_fields_set - {"versao"}:
        valor = getattr(d, campo)
        setattr(u, campo, valor.strip() if isinstance(valor, str) and campo in ("codigo", "nome") else valor)
    db.flush()
    return u


def mover_unidade(db: Session, u: UnidadeOperacional, d: s.Mover) -> UnidadeOperacional:
    _versao(u, d.versao)
    if d.novo_pai_id is not None:
        novo = buscar_unidade(db, d.novo_pai_id)
        if not novo.ativo:
            raise ErroAplicacao(422, "pai_inativo", "Não é possível mover para dentro de uma unidade inativa.")
    u.pai_id = d.novo_pai_id
    db.flush()  # triggers: ciclo, regra de hierarquia, caminho da sub-árvore
    db.expire_all()  # caminhos das unidades internas foram recalculados no banco
    return buscar_unidade(db, u.id)


def definir_niveis(db: Session, u: UnidadeOperacional, niveis: list[uuid.UUID]) -> None:
    _definir_niveis(db, u, niveis)


def excluir_unidade(db: Session, u: UnidadeOperacional) -> None:
    """Exclusão só para cadastro feito por engano: sem unidades internas nem registros vinculados."""
    if db.scalar(select(func.count()).where(UnidadeOperacional.pai_id == u.id)):
        raise ErroAplicacao(409, "possui_vinculos", "A unidade contém outras unidades. Use 'inativar'.")
    if db.scalar(select(func.count()).where(FrenteAvanco.frente_id == u.id)):
        raise ErroAplicacao(409, "possui_vinculos", "A frente possui avanços registrados. Use 'inativar'.")
    if db.scalar(select(func.count()).where(UnidadeNivel.nivel_id == u.id)):
        raise ErroAplicacao(409, "possui_vinculos", "Há rampas/chaminés vinculadas a este nível. Use 'inativar'.")
    for vinculo in db.scalars(select(UnidadeNivel).where(UnidadeNivel.unidade_id == u.id)):
        db.delete(vinculo)
    db.flush()
    db.delete(u)
    db.flush()


# ---------------------------------------------------------------- avanços


def _exigir_frente(u: UnidadeOperacional) -> None:
    if not u.tipo.e_frente:
        raise ErroAplicacao(422, "nao_e_frente", "Avanços só podem ser registrados em frentes.")


def _validar_avanco(d: s.AvancoEntrada) -> None:
    if d.distancia_m is None and d.avanco_m is None and d.x is None:
        raise ErroAplicacao(422, "avanco_vazio", "Informe a distância, o avanço ou as coordenadas.")
    if (d.x is None) != (d.y is None) or (d.z is not None and d.x is None):
        raise ErroAplicacao(422, "coordenadas_incompletas", "Informe X e Y juntos (Z é opcional, exige X e Y).")
    if d.distancia_m is not None and not d.referencia:
        raise ErroAplicacao(422, "referencia_obrigatoria",
                            "Informe a referência a partir da qual a distância foi medida.")


def registrar_avanco(db: Session, frente: UnidadeOperacional, d: s.AvancoEntrada, usuario: Usuario) -> FrenteAvanco:
    _exigir_frente(frente)
    _validar_avanco(d)
    a = FrenteAvanco(frente_id=frente.id, responsavel_id=usuario.id, **d.model_dump())
    db.add(a)
    db.flush()
    return a


def alterar_avanco(db: Session, a: FrenteAvanco, d: s.AvancoAlteracao) -> FrenteAvanco:
    _versao(a, d.versao)
    _validar_avanco(d)
    for campo, valor in d.model_dump(exclude={"versao"}).items():
        setattr(a, campo, valor)
    db.flush()
    return a


def listar_avancos(db: Session, frente: UnidadeOperacional) -> list[s.AvancoSaida]:
    _exigir_frente(frente)
    linhas = db.execute(select(FrenteAvanco, Usuario.nome).outerjoin(Usuario, Usuario.id == FrenteAvanco.responsavel_id)
                        .where(FrenteAvanco.frente_id == frente.id)
                        .order_by(FrenteAvanco.data.desc(), FrenteAvanco.criado_em.desc()))
    saida = []
    for a, nome in linhas:
        o = s.AvancoSaida.model_validate(a)
        o.responsavel_nome = nome
        saida.append(o)
    return saida


# ---------------------------------------------------------------- histórico

_NOMES_CAMPOS = {"codigo": "código", "nome": "nome", "status": "situação", "ativo": "ativo",
                 "pai_id": "localização", "descricao": "descrição", "cota_referencia": "cota de referência"}


def _descrever(a: Auditoria, alvo: str) -> str:
    if a.tabela == "unidade_operacional":
        if a.registro_id != alvo:
            return f"Unidade criada dentro desta: {(a.depois or {}).get('codigo')}"
        if a.operacao == "I":
            return "Unidade cadastrada"
        campos = [k for k in (a.depois or {}) if k in _NOMES_CAMPOS]
        if campos == ["pai_id"]:
            return "Unidade movida na hierarquia"
        return "Alteração: " + ", ".join(_NOMES_CAMPOS[c] for c in campos) if campos else "Alteração"
    if a.tabela == "frente_avanco":
        d = a.depois or a.antes or {}
        dist = f"{d.get('distancia_m')} m de {d.get('referencia')}" if d.get("distancia_m") is not None else ""
        avanco = f"avanço de {d.get('avanco_m')} m" if d.get("avanco_m") is not None else ""
        partes = ", ".join(p for p in (dist, avanco) if p)
        acao = {"I": "Avanço registrado", "U": "Avanço corrigido", "D": "Avanço excluído"}[a.operacao]
        return f"{acao} ({d.get('data')}{', ' + partes if partes else ''})"
    if a.tabela == "unidade_nivel":
        return {"I": "Vinculada a um nível", "D": "Desvinculada de um nível"}.get(a.operacao, "Vínculo de nível")
    return a.tabela


def historico(db: Session, u: UnidadeOperacional, limite: int = 300) -> list[s.EventoHistorico]:
    alvo = str(u.id)
    q = (
        select(Auditoria, Usuario.nome)
        .outerjoin(Usuario, Usuario.id == Auditoria.usuario_id)
        .where(or_(
            (Auditoria.tabela == "unidade_operacional") & (Auditoria.registro_id == alvo),
            (Auditoria.tabela == "unidade_operacional") & (Auditoria.operacao == "I")
            & (func.json_extract(Auditoria.depois, "$.pai_id") == alvo),
            (Auditoria.tabela == "frente_avanco") & or_(
                func.json_extract(Auditoria.depois, "$.frente_id") == alvo,
                func.json_extract(Auditoria.antes, "$.frente_id") == alvo),
            (Auditoria.tabela == "unidade_nivel") & (Auditoria.registro_id.like(alvo + ",%")),
        ))
        .order_by(Auditoria.ocorrido_em.desc(), Auditoria.id.desc())
        .limit(limite)
    )
    return [s.EventoHistorico(ocorrido_em=a.ocorrido_em, tabela=a.tabela, operacao=a.operacao,
                              descricao=_descrever(a, alvo), usuario=nome, antes=a.antes, depois=a.depois)
            for a, nome in db.execute(q)]

