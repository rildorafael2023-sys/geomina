"""Relatórios gerais (E17).

- Fichas de mapeamento: Excel com abas Fichas, Intervalos, Estruturas, Amostras citadas e Metadados; CSV das fichas.
- Produção por período: fichas, amostras coletadas, certificados e resultados recebidos, por mês e por geólogo, e as
  pendências atuais (fichas não aprovadas, amostras sem resultado).
- Auditoria: CSV com os mesmos filtros da tela de histórico.

Somente leitura; nada aqui altera o banco.
"""

from __future__ import annotations

import csv
import io
import uuid
from collections import Counter, defaultdict
from datetime import date, datetime

import openpyxl
from openpyxl.styles import Font, PatternFill
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from geomina.config import VERSAO_APP
from geomina.modules.amostragem.models import Amostra
from geomina.modules.auth.models import Usuario
from geomina.modules.dicionarios.models import Termo
from geomina.modules.estrutura.models import Mina, UnidadeOperacional
from geomina.modules.geoquimica.models import Certificado, Resultado
from geomina.modules.mapeamento.models import Mapeamento

ESTADOS = {"rascunho": "Rascunho", "submetido": "Aguardando revisão", "aprovado": "Aprovada", "cancelado": "Cancelada"}
MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"]


def _termos(db: Session, ids: set) -> dict:
    ids = {i for i in ids if i}
    return {t.id: t for t in db.scalars(select(Termo).where(Termo.id.in_(ids)))} if ids else {}


def _nome(t: Termo | None) -> str | None:
    return t.nome if t else None


def fichas(db: Session, mina_id: uuid.UUID, ids: list[uuid.UUID]) -> dict:
    """Linhas das quatro tabelas do relatório de fichas, na ordem da lista (já filtrada pelo serviço de mapeamento)."""
    if not ids:
        return {"fichas": [], "intervalos": [], "estruturas": [], "amostras": []}
    ms = {m.id: m for m in db.scalars(select(Mapeamento).where(Mapeamento.mina_id == mina_id, Mapeamento.id.in_(ids)))}
    ordem = [ms[i] for i in ids if i in ms]
    unid = {u.id: u for u in db.scalars(select(UnidadeOperacional).where(UnidadeOperacional.id.in_({m.unidade_id for m in ordem})))}
    usu = {u.id: u.nome for u in db.scalars(select(Usuario).where(Usuario.id.in_(
        {m.geologo_id for m in ordem} | {m.revisado_por for m in ordem if m.revisado_por})))}
    tids: set = set()
    for m in ordem:
        tids |= {m.exposicao_id, m.agua_id}
        for i in m.intervalos:
            tids |= {i.litologia_id, i.textura_id, i.alteracao_id, i.intensidade_id, i.mineralizacao_id, i.contato_id}
        tids |= {x.tipo_id for x in m.medidas} | {a.destino_id for a in m.amostras}
    T = _termos(db, tids)
    F, IV, E, A = [], [], [], []
    for m in ordem:
        u = unid.get(m.unidade_id)
        base = {"ficha": m.numero, "data": m.data, "unidade": u.codigo if u else None}
        F.append({**base, "caminho": u.caminho if u else None, "hora": m.hora, "geologo": usu.get(m.geologo_id),
                  "acompanhantes": m.acompanhantes, "estado": ESTADOS.get(m.estado, m.estado), "revisao": m.revisao,
                  "revisado_por": usu.get(m.revisado_por), "exposicao": _nome(T.get(m.exposicao_id)), "distancia_m": m.distancia_m,
                  "referencia": m.referencia, "x": m.x, "y": m.y, "z": m.z, "largura_m": m.largura_m, "altura_m": m.altura_m,
                  "agua": _nome(T.get(m.agua_id)), "litologias": ", ".join(dict.fromkeys(
                      (T[i.litologia_id].sigla or T[i.litologia_id].nome) for i in m.intervalos if i.litologia_id in T)),
                  "intervalos": len(m.intervalos), "medidas": len(m.medidas), "amostras": len(m.amostras),
                  "descricao": m.descricao, "obs_geotecnicas": m.obs_geotecnicas})
        idx = {i.id: n for n, i in enumerate(m.intervalos, 1)}
        for n, i in enumerate(m.intervalos, 1):
            IV.append({**base, "n": n, "de_m": i.de_m, "ate_m": i.ate_m, "litologia": _nome(T.get(i.litologia_id)),
                      "textura": _nome(T.get(i.textura_id)), "granulacao": i.granulacao, "cor": i.cor,
                      "alteracao": _nome(T.get(i.alteracao_id)), "intensidade": _nome(T.get(i.intensidade_id)),
                      "mineralizacao": _nome(T.get(i.mineralizacao_id)), "minerais": i.minerais, "percentual": i.percentual,
                      "contato": _nome(T.get(i.contato_id)), "descricao": i.descricao})
        for x in m.medidas:
            planar = x.classe == "planar"
            E.append({**base, "tipo": _nome(T.get(x.tipo_id)), "classe": "planar" if planar else "linear",
                      "medida": f"{x.dip_dir:03.0f}/{x.dip:02.0f}" if planar else f"{x.trend:03.0f}→{x.plunge:02.0f}",
                      "dip_dir": x.dip_dir, "dip": x.dip, "trend": x.trend, "plunge": x.plunge, "familia": x.familia,
                      "espessura_m": x.espessura_m, "preenchimento": x.preenchimento, "intervalo": idx.get(x.intervalo_id),
                      "observacao": x.observacao})
        for a in m.amostras:
            A.append({**base, "codigo": a.codigo, "tipo": a.tipo, "de_m": a.de_m, "ate_m": a.ate_m,
                      "destino": _nome(T.get(a.destino_id)), "leitura_campo": a.leitura_campo, "observacao": a.observacao})
    return {"fichas": F, "intervalos": IV, "estruturas": E, "amostras": A}


COLUNAS_FICHAS = [("ficha", "Ficha"), ("data", "Data"), ("unidade", "Unidade"), ("caminho", "Caminho"), ("hora", "Hora"),
                  ("geologo", "Geólogo"), ("acompanhantes", "Acompanhantes"), ("estado", "Estado"), ("revisao", "Revisão"),
                  ("revisado_por", "Revisado por"), ("exposicao", "Exposição"), ("distancia_m", "Distância (m)"),
                  ("referencia", "Referência"), ("x", "X"), ("y", "Y"), ("z", "Z"), ("largura_m", "Largura (m)"),
                  ("altura_m", "Altura (m)"), ("agua", "Água"), ("litologias", "Litologias"), ("intervalos", "Intervalos"),
                  ("medidas", "Medidas"), ("amostras", "Amostras"), ("descricao", "Descrição"),
                  ("obs_geotecnicas", "Observações geotécnicas")]
COLUNAS_INTERVALOS = [("ficha", "Ficha"), ("data", "Data"), ("unidade", "Unidade"), ("n", "Nº"), ("de_m", "De (m)"),
                      ("ate_m", "Até (m)"), ("litologia", "Litologia"), ("textura", "Textura"), ("granulacao", "Granulação"),
                      ("cor", "Cor"), ("alteracao", "Alteração"), ("intensidade", "Intensidade"),
                      ("mineralizacao", "Mineralização"), ("minerais", "Minerais"), ("percentual", "%"),
                      ("contato", "Contato"), ("descricao", "Descrição")]
COLUNAS_ESTRUTURAS = [("ficha", "Ficha"), ("data", "Data"), ("unidade", "Unidade"), ("tipo", "Tipo"), ("classe", "Classe"),
                      ("medida", "Medida"), ("dip_dir", "Dip dir"), ("dip", "Dip"), ("trend", "Trend"), ("plunge", "Plunge"),
                      ("familia", "Família"), ("espessura_m", "Espessura (m)"), ("preenchimento", "Preenchimento"),
                      ("intervalo", "Intervalo nº"), ("observacao", "Observação")]
COLUNAS_AMOSTRAS = [("ficha", "Ficha"), ("data", "Data"), ("unidade", "Unidade"), ("codigo", "Amostra"), ("tipo", "Tipo"),
                    ("de_m", "De (m)"), ("ate_m", "Até (m)"), ("destino", "Destino"),
                    ("leitura_campo", "Leitura de campo (não laboratorial)"), ("observacao", "Observação")]


def _aba(ws, colunas, linhas):
    ws.append([r for _, r in colunas])
    for c in ws[1]:
        c.font = Font(bold=True)
        c.fill = PatternFill("solid", fgColor="E9ECEF")
    for linha in linhas:
        ws.append([linha.get(k) for k, _ in colunas])
    ws.freeze_panes = "B2"
    for i, (k, r) in enumerate(colunas):
        larg = max([len(r)] + [len(str(x.get(k) or "")) for x in linhas[:200]])
        ws.column_dimensions[openpyxl.utils.get_column_letter(i + 1)].width = min(max(larg + 2, 8), 50)
    for row in ws.iter_rows(min_row=2):
        for c in row:
            if isinstance(c.value, date):
                c.number_format = "DD/MM/YYYY"


def _metadados(wb, titulo: str, meta: dict):
    m = wb.create_sheet("Metadados")
    m.append(["Relatório", titulo])
    for k, v in [("Gerado por", f"GeoMina {VERSAO_APP}"), ("Data", datetime.now().strftime("%d/%m/%Y %H:%M")), *meta.items()]:
        m.append([k, v if not isinstance(v, (list, dict)) else str(v)])
    m.column_dimensions["A"].width = 24
    m.column_dimensions["B"].width = 80
    for c in m["A"]:
        c.font = Font(bold=True)


def _salvar(wb) -> bytes:
    b = io.BytesIO()
    wb.save(b)
    return b.getvalue()


def xlsx_fichas(dados: dict, meta: dict) -> bytes:
    wb = openpyxl.Workbook()
    _aba(wb.active, COLUNAS_FICHAS, dados["fichas"])
    wb.active.title = "Fichas"
    for nome, cols, chave in (("Intervalos", COLUNAS_INTERVALOS, "intervalos"), ("Estruturas", COLUNAS_ESTRUTURAS, "estruturas"),
                              ("Amostras citadas", COLUNAS_AMOSTRAS, "amostras")):
        _aba(wb.create_sheet(nome), cols, dados[chave])
    _metadados(wb, "Fichas de mapeamento geológico", meta)
    return _salvar(wb)


def _fmt(v):
    if isinstance(v, date):
        return v.strftime("%d/%m/%Y")
    if isinstance(v, float):
        return f"{v:g}".replace(".", ",")
    return "" if v is None else str(v)


def csv_tabela(colunas, linhas) -> bytes:
    s = io.StringIO()
    w = csv.writer(s, delimiter=";", lineterminator="\n")
    w.writerow([r for _, r in colunas])
    for linha in linhas:
        w.writerow([_fmt(linha.get(k)) for k, _ in colunas])
    return ("﻿" + s.getvalue()).encode("utf-8")


def _mes(d) -> str | None:
    if d is None:
        return None
    if isinstance(d, datetime):
        d = d.astimezone().date()
    return f"{d.year}-{d.month:02d}"


def rotulo_mes(chave: str) -> str:
    a, m = chave.split("-")
    return f"{MESES[int(m) - 1]}/{a}"


def producao(db: Session, mina_id: uuid.UUID, de: date | None, ate: date | None) -> dict:
    """Produção por mês e por geólogo, e pendências atuais. Datas de campo (ficha, coleta); para laudos, a emissão do
    certificado (ou a data de importação quando o laudo não traz emissão)."""
    def dentro(d) -> bool:
        if d is None:
            return False
        dd = d.astimezone().date() if isinstance(d, datetime) else d
        return (de is None or dd >= de) and (ate is None or dd <= ate)

    usu = dict(db.execute(select(Usuario.id, Usuario.nome)).all())
    meses: dict[str, Counter] = defaultdict(Counter)
    geologos: dict[str, Counter] = defaultdict(Counter)

    fichas = db.execute(select(Mapeamento.data, Mapeamento.geologo_id, Mapeamento.estado, Mapeamento.revisado_em)
                        .where(Mapeamento.mina_id == mina_id)).all()
    estados = Counter(e for _, _, e, _ in fichas)
    for d, g, e, rev in fichas:
        if e == "cancelado":
            continue
        if dentro(d):
            meses[_mes(d)]["fichas"] += 1
            geologos[usu.get(g, "—")]["fichas"] += 1
        if e == "aprovado" and dentro(rev):
            meses[_mes(rev)]["fichas_aprovadas"] += 1

    com_resultado = set(db.scalars(select(Resultado.amostra_id).distinct().where(Resultado.amostra_id.is_not(None))))
    amostras = db.execute(select(Amostra.id, Amostra.data_coleta, Amostra.geologo_id, Amostra.responsavel_nome, Amostra.estado)
                          .where(Amostra.mina_id == mina_id)).all()
    sem_data = 0
    pend = Counter()
    for aid, d, g, resp, est in amostras:
        if est == "cancelada":
            continue
        if aid not in com_resultado:
            pend["amostras_sem_resultado"] += 1
        if d is None:
            sem_data += 1
            continue
        if dentro(d):
            meses[_mes(d)]["amostras"] += 1
            geologos[usu.get(g) or resp or "—"]["amostras"] += 1
            if aid in com_resultado:
                meses[_mes(d)]["amostras_com_resultado"] += 1

    certs = db.execute(select(Certificado.id, Certificado.emitido_em, Certificado.criado_em).where(Certificado.mina_id == mina_id)).all()
    n_res = dict(db.execute(select(Resultado.certificado_id, func.count()).where(Resultado.tipo_linha == "SMP")
                            .group_by(Resultado.certificado_id)).all())
    for cid, emit, criado in certs:
        d = emit or criado
        if dentro(d):
            meses[_mes(d)]["certificados"] += 1
            meses[_mes(d)]["resultados"] += n_res.get(cid, 0)

    pend["fichas_rascunho"] = estados.get("rascunho", 0)
    pend["fichas_aguardando_revisao"] = estados.get("submetido", 0)
    chaves = ("fichas", "fichas_aprovadas", "amostras", "amostras_com_resultado", "certificados", "resultados")
    lista_meses = [{"mes": k, "rotulo": rotulo_mes(k), **{c: meses[k].get(c, 0) for c in chaves}} for k in sorted(meses)]
    total = {c: sum(m[c] for m in lista_meses) for c in chaves}
    return {"periodo": {"de": de, "ate": ate}, "meses": lista_meses, "total": total,
            "geologos": sorted(({"nome": n, "fichas": c.get("fichas", 0), "amostras": c.get("amostras", 0)} for n, c in geologos.items()),
                               key=lambda x: (-x["fichas"] - x["amostras"], x["nome"])),
            "estados_fichas": {ESTADOS[k]: estados.get(k, 0) for k in ESTADOS},
            "pendencias": dict(pend), "amostras_sem_data": sem_data}


def xlsx_producao(p: dict, meta: dict) -> bytes:
    wb = openpyxl.Workbook()
    _aba(wb.active, [("rotulo", "Mês"), ("fichas", "Fichas"), ("fichas_aprovadas", "Fichas aprovadas"), ("amostras", "Amostras coletadas"),
                     ("amostras_com_resultado", "Dessas, com resultado"), ("certificados", "Certificados"),
                     ("resultados", "Resultados (amostras)")], p["meses"] + [{"rotulo": "Total", **p["total"]}])
    wb.active.title = "Por mês"
    _aba(wb.create_sheet("Por geólogo"), [("nome", "Geólogo / responsável"), ("fichas", "Fichas"), ("amostras", "Amostras")], p["geologos"])
    pend = [{"item": "Fichas em rascunho", "n": p["pendencias"].get("fichas_rascunho", 0)},
            {"item": "Fichas aguardando revisão", "n": p["pendencias"].get("fichas_aguardando_revisao", 0)},
            {"item": "Amostras sem resultado de laboratório", "n": p["pendencias"].get("amostras_sem_resultado", 0)},
            {"item": "Amostras sem data de coleta (fora da contagem por mês)", "n": p["amostras_sem_data"]}]
    _aba(wb.create_sheet("Pendências"), [("item", "Pendência atual"), ("n", "Quantidade")], pend)
    _metadados(wb, "Produção por período", meta)
    return _salvar(wb)


def mina_texto(db: Session, mina_id: uuid.UUID) -> str:
    m = db.get(Mina, mina_id)
    return f"{m.codigo} — {m.nome}" if m else "?"
