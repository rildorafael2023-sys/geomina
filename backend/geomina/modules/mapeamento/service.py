from __future__ import annotations

import uuid
from datetime import date

from sqlalchemy import func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from geomina.core.erros import ErroAplicacao
from geomina.db import agora
from geomina.modules.auth.models import Papel, Permissao, Usuario, papel_permissao, usuario_papel
from geomina.modules.dicionarios.models import Termo
from geomina.modules.estrutura.models import Mina, UnidadeOperacional
from geomina.modules.estrutura.service import nome_crs
from geomina.modules.mapeamento import regras
from geomina.modules.mapeamento import schemas as s
from geomina.modules.mapeamento.models import (
    AmostraCitada,
    Intervalo,
    Mapeamento,
    MapeamentoRevisao,
    MedidaEstrutural,
)


def _erro(msg: str, codigo: str = "regra_violada", status: int = 422) -> ErroAplicacao:
    return ErroAplicacao(status, codigo, msg)


def buscar(db: Session, ficha_id: uuid.UUID) -> Mapeamento:
    m = db.get(Mapeamento, ficha_id)
    if m is None:
        raise _erro("Ficha de mapeamento não encontrada.", "nao_encontrado", 404)
    return m


# ------------------------------------------------------------------ permissões
def pode_editar(m: Mapeamento, u: Usuario) -> bool:
    p = u.permissoes()
    return m.estado == "rascunho" and (
        ("mapeamento:editar" in p and m.geologo_id == u.id) or "mapeamento:aprovar" in p)


def _aprovadores_ativos(db: Session) -> int:
    q = (select(func.count(func.distinct(Usuario.id)))
         .join(usuario_papel, usuario_papel.c.usuario_id == Usuario.id)
         .join(Papel, Papel.id == usuario_papel.c.papel_id)
         .join(papel_permissao, papel_permissao.c.papel_id == Papel.id)
         .join(Permissao, Permissao.id == papel_permissao.c.permissao_id)
         .where(Usuario.ativo.is_(True), Permissao.codigo == "mapeamento:aprovar"))
    return db.scalar(q) or 0


# ------------------------------------------------------------------ gravação
def _numero(db: Session, mina_id: uuid.UUID, ano: int) -> str:
    prefixo = f"MAP-{ano}-"
    ultimo = db.scalar(select(func.max(Mapeamento.numero)).where(Mapeamento.mina_id == mina_id,
                                                                 Mapeamento.numero.like(prefixo + "%")))
    seq = int(ultimo.rsplit("-", 1)[1]) + 1 if ultimo else 1
    return f"{prefixo}{seq:04d}"


def _termos(db: Session, ids: set[uuid.UUID]) -> dict[uuid.UUID, Termo]:
    ids.discard(None)  # type: ignore[arg-type]
    return {t.id: t for t in db.scalars(select(Termo).where(Termo.id.in_(ids)))} if ids else {}


def _ids_termos_ficha(m: Mapeamento) -> set[uuid.UUID]:
    ids = {m.exposicao_id, m.agua_id}
    for i in m.intervalos:
        ids |= {i.litologia_id, i.textura_id, i.alteracao_id, i.intensidade_id, i.mineralizacao_id, i.contato_id}
    ids |= {x.tipo_id for x in m.medidas} | {a.destino_id for a in m.amostras}
    ids.discard(None)
    return ids


def _ids_termos_entrada(d: s.FichaEntrada) -> set[uuid.UUID]:
    ids = {d.exposicao_id, d.agua_id}
    for i in d.intervalos:
        ids |= {i.litologia_id, i.textura_id, i.alteracao_id, i.intensidade_id, i.mineralizacao_id, i.contato_id}
    ids |= {x.tipo_id for x in d.medidas} | {a.destino_id for a in d.amostras}
    ids.discard(None)
    return ids


def _validar(db: Session, d: s.FichaEntrada, ja_usados: set[uuid.UUID]) -> dict[uuid.UUID, Termo]:
    if (d.x is None) != (d.y is None) or (d.z is not None and d.x is None):
        raise _erro("Informe X e Y juntos (Z é opcional e exige X e Y).", "coordenadas_incompletas")
    if d.distancia_m is not None and not (d.referencia or "").strip():
        raise _erro("Informe a referência a partir da qual a distância foi medida.", "referencia_obrigatoria")
    ids = _ids_termos_entrada(d)
    termos = _termos(db, set(ids))
    if len(termos) != len(ids):
        raise _erro("Há termo de dicionário inexistente na ficha.", "termo_inexistente")
    novos_inativos = [t.nome for t in termos.values() if not t.ativo and t.id not in ja_usados]
    if novos_inativos:
        raise _erro(f"Termo(s) inativo(s) não podem ser usados em registros novos: {', '.join(novos_inativos)}.",
                    "termo_inativo")
    try:
        regras.verificar_intervalos([regras.Faixa(i.de_m, i.ate_m, f"nº {n + 1}") for n, i in enumerate(d.intervalos)])
    except regras.ErroRegra as e:
        raise _erro(str(e), "intervalo_invalido") from e
    for n, md in enumerate(d.medidas):
        t = termos[md.tipo_id]
        if t.classe not in ("planar", "linear"):
            raise _erro(f"Medida nº {n + 1}: '{t.nome}' não é um tipo de estrutura.", "medida_invalida")
        if (t.classe == "linear") != (md.convencao == "trend_plunge"):
            raise _erro(f"Medida nº {n + 1}: {t.nome} é uma estrutura {t.classe}; use "
                        f"{'caimento/rumo' if t.classe == 'linear' else 'direção de mergulho/mergulho'}.",
                        "medida_invalida")
        if md.intervalo_indice is not None and md.intervalo_indice >= len(d.intervalos):
            raise _erro(f"Medida nº {n + 1}: intervalo associado inexistente.", "medida_invalida")
    codigos: set[str] = set()
    for n, a in enumerate(d.amostras):
        c = regras.normalizar_codigo(a.codigo)
        if c.codigo is None:
            raise ErroAplicacao(422, "codigo_amostra", f"Amostra nº {n + 1}: {c.aviso}",
                                {"sugestao": c.sugestao, "indice": n})
        if c.codigo in codigos:
            raise _erro(f"Amostra {c.codigo} repetida na ficha.", "amostra_repetida")
        codigos.add(c.codigo)
        if a.de_m is not None and a.ate_m is not None and a.ate_m <= a.de_m:
            raise _erro(f"Amostra {c.codigo}: 'até' deve ser maior que 'de'.", "amostra_invalida")
    return termos


CAMPOS_CABECALHO = ("unidade_id", "data", "hora", "acompanhantes", "exposicao_id", "distancia_m", "referencia", "x",
                    "y", "z", "azimute_eixo", "largura_m", "altura_m", "norte_referencia", "declinacao", "descricao",
                    "agua_id", "obs_geotecnicas")


def _aplicar(db: Session, m: Mapeamento, d: s.FichaEntrada, termos: dict[uuid.UUID, Termo]) -> None:
    for campo in CAMPOS_CABECALHO:
        setattr(m, campo, getattr(d, campo))

    # filhos: atualiza os existentes (mesmo id), cria os novos e remove os que saíram — cada mudança é auditada
    def sincronizar(atuais, entradas, criar, atualizar):
        por_id = {x.id: x for x in atuais}
        resultado = []
        for e in entradas:
            obj = por_id.pop(e.id, None) if e.id else None
            if e.id and obj is None:
                raise _erro("Item da ficha não pertence a esta ficha.", "item_invalido")
            obj = obj or criar()
            atualizar(obj, e)
            resultado.append(obj)
        for removido in por_id.values():  # exclusão explícita: entra na auditoria
            db.delete(removido)
        return resultado

    def at_intervalo(obj: Intervalo, e: s.IntervaloEntrada):
        for campo, valor in e.model_dump(exclude={"id"}).items():
            setattr(obj, campo, valor)

    m.intervalos = sincronizar(m.intervalos, d.intervalos, Intervalo, at_intervalo)
    db.flush()  # ids dos intervalos para associar às medidas

    def at_medida(obj: MedidaEstrutural, e: s.MedidaEntrada):
        t = termos[e.tipo_id]
        obj.tipo_id, obj.classe, obj.convencao = e.tipo_id, t.classe, e.convencao
        obj.valor_digitado = {"a": e.valor_a, "b": e.valor_b, "convencao": e.convencao}
        try:
            if t.classe == "planar":
                obj.dip_dir, obj.dip = regras.plano(e.valor_a, e.valor_b, e.convencao)
                obj.trend = obj.plunge = None
            else:
                obj.trend, obj.plunge = regras.linha(e.valor_a, e.valor_b)
                obj.dip_dir = obj.dip = None
        except regras.ErroRegra as erro:
            raise _erro(f"{t.nome}: {erro}", "medida_invalida") from erro
        for campo in ("familia", "espessura_m", "preenchimento", "movimento", "observacao"):
            setattr(obj, campo, getattr(e, campo))
        obj.intervalo_id = m.intervalos[e.intervalo_indice].id if e.intervalo_indice is not None else None

    medidas = sincronizar(m.medidas, d.medidas, MedidaEstrutural, at_medida)
    for n, x in enumerate(medidas):
        x.ordem = n
    m.medidas = medidas

    def at_amostra(obj: AmostraCitada, e: s.AmostraEntrada):
        for campo, valor in e.model_dump(exclude={"id"}).items():
            setattr(obj, campo, valor)
        obj.codigo = regras.normalizar_codigo(e.codigo).codigo

    amostras = sincronizar(m.amostras, d.amostras, AmostraCitada, at_amostra)
    for n, x in enumerate(amostras):
        x.ordem = n
    m.amostras = amostras


def criar(db: Session, d: s.FichaEntrada, u: Usuario) -> Mapeamento:
    unidade = db.get(UnidadeOperacional, d.unidade_id)
    if unidade is None or not unidade.ativo:
        raise _erro("Unidade da mina inexistente ou inativa.", "unidade_invalida")
    termos = _validar(db, d, set())
    mina = db.get(Mina, unidade.mina_id)
    for _tentativa in range(3):
        m = Mapeamento(mina_id=unidade.mina_id, numero=_numero(db, unidade.mina_id, d.data.year), geologo_id=u.id,
                       estado="rascunho", revisao=0,
                       **{c: getattr(d, c) for c in CAMPOS_CABECALHO})
        try:
            with db.begin_nested():
                db.add(m)
                db.flush()
            break
        except IntegrityError:  # número ocupado por gravação simultânea: tenta o próximo
            continue
    else:
        raise _erro("Não foi possível numerar a ficha. Tente novamente.", "numeracao")
    _aplicar(db, m, d, termos)
    if d.declinacao is None:
        m.declinacao = mina.declinacao_magnetica
    db.flush()
    return m


def alterar(db: Session, m: Mapeamento, d: s.FichaAlteracao, u: Usuario) -> Mapeamento:
    if m.versao != d.versao:
        raise _erro("A ficha foi alterada por outra operação. Recarregue e tente novamente.", "versao_desatualizada",
                    409)
    if not pode_editar(m, u):
        raise _erro("Esta ficha não pode ser editada por você no estado atual.", "sem_permissao", 403)
    unidade = db.get(UnidadeOperacional, d.unidade_id)
    if unidade is None or unidade.mina_id != m.mina_id:
        raise _erro("Unidade inválida para esta mina.", "unidade_invalida")
    termos = _validar(db, d, _ids_termos_ficha(m))
    _aplicar(db, m, d, termos)
    # A ficha é um documento único: mudar só intervalos/medidas/amostras também avança a versão,
    # para que duas edições simultâneas sejam detectadas.
    m.atualizado_em = agora()
    db.flush()
    return m


# ------------------------------------------------------------------ fluxo
def submeter(db: Session, m: Mapeamento, u: Usuario) -> None:
    if not pode_editar(m, u):
        raise _erro("Só o autor (ou um revisor) pode submeter um rascunho.", "sem_permissao", 403)
    if not m.intervalos:
        raise _erro("Descreva pelo menos um intervalo da seção antes de submeter.", "ficha_incompleta")
    m.estado, m.submetido_em, m.motivo = "submetido", agora(), None
    db.flush()


def aprovar(db: Session, m: Mapeamento, u: Usuario) -> None:
    if m.estado != "submetido":
        raise _erro("Só fichas submetidas podem ser aprovadas.", "estado_invalido")
    if m.geologo_id == u.id and _aprovadores_ativos(db) > 1:
        raise _erro("A ficha deve ser aprovada por outro revisor (não pelo autor).", "autoaprovacao", 403)
    m.estado, m.revisado_por, m.revisado_em = "aprovado", u.id, agora()
    db.flush()


def devolver(db: Session, m: Mapeamento, motivo: str, u: Usuario) -> None:
    if m.estado != "submetido":
        raise _erro("Só fichas submetidas podem ser devolvidas.", "estado_invalido")
    m.estado, m.motivo, m.revisado_por, m.revisado_em = "rascunho", motivo, u.id, agora()
    db.flush()


def reabrir(db: Session, m: Mapeamento, motivo: str, u: Usuario) -> None:
    """Guarda o instantâneo aprovado e volta a ficha para rascunho com nova revisão."""
    if m.estado != "aprovado":
        raise _erro("Só fichas aprovadas podem ser reabertas para correção.", "estado_invalido")
    conteudo = detalhe(db, m, u).model_dump(mode="json", exclude={"avisos", "pode_editar", "pode_aprovar"})
    db.add(MapeamentoRevisao(mapeamento_id=m.id, revisao=m.revisao, conteudo=conteudo, aprovado_por=m.revisado_por,
                             aprovado_em=m.revisado_em, reaberto_por=u.id, motivo=motivo))
    m.estado, m.revisao, m.motivo = "rascunho", m.revisao + 1, motivo
    db.flush()


def cancelar(db: Session, m: Mapeamento, motivo: str, u: Usuario) -> None:
    if m.estado == "cancelado":
        raise _erro("A ficha já está cancelada.", "estado_invalido")
    if m.estado == "aprovado" and "mapeamento:aprovar" not in u.permissoes():
        raise _erro("Só um revisor pode cancelar uma ficha aprovada.", "sem_permissao", 403)
    if m.estado != "aprovado" and not (m.geologo_id == u.id or "mapeamento:aprovar" in u.permissoes()):
        raise _erro("Só o autor ou um revisor pode cancelar a ficha.", "sem_permissao", 403)
    m.estado, m.motivo = "cancelado", motivo
    db.flush()


def excluir(db: Session, m: Mapeamento, u: Usuario) -> None:
    if not pode_editar(m, u):
        raise _erro("Você não pode excluir esta ficha.", "sem_permissao", 403)
    db.delete(m)  # trigger: só rascunho nunca submetido
    db.flush()


# ------------------------------------------------------------------ leitura
def _nomes_caminho(db: Session, u: UnidadeOperacional) -> list[str]:
    ids = [uuid.UUID(h) for h in (u.caminho or "").strip("/").split("/") if h]
    nomes = {x.id: x.codigo for x in db.scalars(select(UnidadeOperacional).where(UnidadeOperacional.id.in_(ids)))}
    return [nomes.get(i, "?") for i in ids]


def _avisos(m: Mapeamento) -> list[str]:
    avisos = regras.verificar_intervalos([regras.Faixa(i.de_m, i.ate_m, "") for i in m.intervalos], m.altura_m) \
        if m.intervalos else []
    if m.estado == "rascunho" and not m.intervalos:
        avisos.append("Nenhum intervalo descrito na seção.")
    if m.distancia_m is None and m.x is None:
        avisos.append("Posição não informada (distância a partir de uma referência ou coordenadas).")
    avisos += [c.aviso for c in (regras.normalizar_codigo(a.codigo) for a in m.amostras) if c.aviso]
    return avisos


def detalhe(db: Session, m: Mapeamento, u: Usuario) -> s.FichaSaida:
    unidade = db.get(UnidadeOperacional, m.unidade_id)
    mina = db.get(Mina, m.mina_id)
    ids_usuarios = [i for i in (m.geologo_id, m.revisado_por) if i]
    nomes = {i: n for i, n in db.execute(select(Usuario.id, Usuario.nome).where(Usuario.id.in_(ids_usuarios)))}
    termos = _termos(db, _ids_termos_ficha(m))
    return s.FichaSaida(
        id=m.id, mina_id=m.mina_id, numero=m.numero, unidade_id=m.unidade_id,
        unidade=f"{unidade.codigo} — {unidade.nome}", unidade_caminho=_nomes_caminho(db, unidade),
        data=m.data, hora=m.hora, geologo_id=m.geologo_id, geologo=nomes.get(m.geologo_id, "?"),
        acompanhantes=m.acompanhantes, exposicao_id=m.exposicao_id, distancia_m=m.distancia_m,
        referencia=m.referencia, x=m.x, y=m.y, z=m.z, crs=nome_crs(mina.srid_trabalho), azimute_eixo=m.azimute_eixo,
        largura_m=m.largura_m, altura_m=m.altura_m, norte_referencia=m.norte_referencia, declinacao=m.declinacao,
        descricao=m.descricao, agua_id=m.agua_id, obs_geotecnicas=m.obs_geotecnicas, estado=m.estado,
        revisao=m.revisao, versao=m.versao, submetido_em=m.submetido_em,
        revisado_por=nomes.get(m.revisado_por) if m.revisado_por else None, revisado_em=m.revisado_em,
        motivo=m.motivo, criado_em=m.criado_em, atualizado_em=m.atualizado_em,
        intervalos=[s.IntervaloSaida(id=i.id, de_m=i.de_m, ate_m=i.ate_m, litologia_id=i.litologia_id,
                                     textura_id=i.textura_id, granulacao=i.granulacao, cor=i.cor,
                                     alteracao_id=i.alteracao_id, intensidade_id=i.intensidade_id,
                                     mineralizacao_id=i.mineralizacao_id, minerais=i.minerais,
                                     percentual=i.percentual, contato_id=i.contato_id, descricao=i.descricao)
                    for i in m.intervalos],
        medidas=[s.MedidaSaida.model_validate(x, from_attributes=True) for x in m.medidas],
        amostras=[s.AmostraSaida.model_validate(a, from_attributes=True) for a in m.amostras],
        termos={str(t.id): s.TermoRef(id=t.id, codigo=t.codigo, nome=t.nome, sigla=t.sigla, cor=t.cor)
                for t in termos.values()},
        avisos=_avisos(m), pode_editar=pode_editar(m, u),
        pode_aprovar="mapeamento:aprovar" in u.permissoes() and m.estado in ("submetido", "aprovado"),
    )


def listar(db: Session, mina_id: uuid.UUID, *, unidade_id: uuid.UUID | None = None, geologo_id: uuid.UUID | None = None,
           estado: str | None = None, de: date | None = None, ate: date | None = None,
           litologia_id: uuid.UUID | None = None, texto: str | None = None, limite: int = 500) -> list[s.FichaResumo]:
    q = (select(Mapeamento, UnidadeOperacional.codigo, Usuario.nome)
         .join(UnidadeOperacional, UnidadeOperacional.id == Mapeamento.unidade_id)
         .join(Usuario, Usuario.id == Mapeamento.geologo_id)
         .where(Mapeamento.mina_id == mina_id))
    if unidade_id:
        base = db.get(UnidadeOperacional, unidade_id)
        if base is None:
            raise _erro("Unidade não encontrada.", "nao_encontrado", 404)
        q = q.where(UnidadeOperacional.caminho.like(base.caminho + "%"))
    if geologo_id:
        q = q.where(Mapeamento.geologo_id == geologo_id)
    if estado:
        q = q.where(Mapeamento.estado == estado)
    if de:
        q = q.where(Mapeamento.data >= de)
    if ate:
        q = q.where(Mapeamento.data <= ate)
    if litologia_id:
        q = q.where(Mapeamento.id.in_(select(Intervalo.mapeamento_id).where(Intervalo.litologia_id == litologia_id)))
    if texto:
        p = f"%{texto}%"
        q = q.where(or_(Mapeamento.numero.ilike(p), Mapeamento.descricao.ilike(p),
                        Mapeamento.id.in_(select(AmostraCitada.mapeamento_id).where(AmostraCitada.codigo.ilike(p)))))
    linhas = db.execute(q.order_by(Mapeamento.data.desc(), Mapeamento.numero.desc()).limit(limite)).all()
    ids_lito = {i.litologia_id for m, _, _ in linhas for i in m.intervalos}
    lito = {t.id: t.sigla or t.nome for t in _termos(db, ids_lito).values()}
    return [s.FichaResumo(id=m.id, numero=m.numero, data=m.data, unidade_id=m.unidade_id, unidade=cod, geologo=nome,
                          estado=m.estado, revisao=m.revisao,
                          litologias=list(dict.fromkeys(lito[i.litologia_id] for i in m.intervalos)),
                          medidas=len(m.medidas), amostras=len(m.amostras))
            for m, cod, nome in linhas]


def revisoes(db: Session, m: Mapeamento) -> list[s.RevisaoSaida]:
    linhas = db.execute(select(MapeamentoRevisao, Usuario.nome)
                        .outerjoin(Usuario, Usuario.id == MapeamentoRevisao.reaberto_por)
                        .where(MapeamentoRevisao.mapeamento_id == m.id).order_by(MapeamentoRevisao.revisao.desc()))
    return [s.RevisaoSaida(revisao=r.revisao, aprovado_em=r.aprovado_em, reaberto_em=r.reaberto_em, reaberto_por=nome,
                           motivo=r.motivo, conteudo=r.conteudo) for r, nome in linhas]
