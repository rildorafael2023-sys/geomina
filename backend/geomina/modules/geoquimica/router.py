from __future__ import annotations

import csv
import io
import uuid
from collections import defaultdict
from datetime import datetime

from fastapi import APIRouter, Depends, File, Query, Request, UploadFile
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy import func, insert, select, update
from sqlalchemy.orm import Session

from geomina.core.dependencias import obter_sessao, requer
from geomina.core.erros import ErroAplicacao
from geomina.modules.amostragem.models import Amostra, Importacao
from geomina.modules.arquivos.models import Arquivo
from geomina.modules.auth.models import Usuario
from geomina.modules.documentos.router import _gravar_arquivo
from geomina.modules.geoquimica import laudo as L
from geomina.modules.geoquimica.models import Analito, Certificado, Laboratorio, MetodoAnalitico, Resultado
from geomina.modules.mapeamento.regras import normalizar_codigo, serie_de_codigo

router = APIRouter(tags=["geoquímica"])
LER = requer("geoquimica:ler")
IMPORTAR = requer("amostra:importar")


def _canonico_laudo(codigo: str) -> str | None:
    """Código canônico para ligar o resultado: no laudo, 'RP 478' é o ponto BS-RP-478 (mesmo ponto de produção)."""
    c = normalizar_codigo(codigo)
    return c.codigo or c.sugestao


def _tipo_linha(tipo: str, codigo: str) -> str:
    return L.tipo_por_codigo(tipo, codigo)


class Confirmacao(BaseModel):
    laboratorio: str = Field(default="SGS Geosol", min_length=2, max_length=120)
    certificado: str | None = Field(default=None, max_length=40, description="obrigatório se o laudo não informar")
    cadastrar_amostras: bool = Field(default=True, description="cadastra como amostra (sem furo) cada código do laudo ainda não cadastrado")


def _analisar(db: Session, mina_id: uuid.UUID, dados: bytes, nome: str, sha: str) -> dict:
    try:
        laudo = L.ler(dados, nome)
    except L.LaudoInvalido as e:
        raise ErroAplicacao(422, "laudo_invalido", str(e)) from e
    amostras = {a.codigo.upper(): a for a in db.scalars(select(Amostra).where(Amostra.mina_id == mina_id))}
    analitos = {a.codigo for a in db.scalars(select(Analito))}
    linhas, erros_valor = [], []
    for ln in laudo.linhas:
        tipo = _tipo_linha(ln.tipo, ln.codigo)
        c = normalizar_codigo(ln.codigo)
        canon = _canonico_laudo(ln.codigo)
        a = amostras.get(canon.upper()) if canon else None
        situacao = "vinculada" if a else ("controle_lab" if tipo in ("STD", "BLK") else "nao_encontrada")
        if tipo in ("DUP", "REP") and not a:
            situacao = "nao_encontrada"
        if not a and tipo == "SMP" and canon:
            situacao = "nova_amostra"  # será cadastrada (sem furo) ao confirmar
        valores = 0
        for col in laudo.colunas:
            try:
                L.valor(ln.valores.get(col.indice))
                valores += 1
            except L.LaudoInvalido as e:
                erros_valor.append({"linha": ln.numero, "coluna": col.analito, "erro": str(e)})
        linhas.append({"linha": ln.numero, "tipo": tipo, "codigo_laboratorio": ln.codigo, "codigo": canon,
                       "sugestao": c.sugestao, "situacao": situacao, "estado_amostra": a.estado if a else None,
                       "valores": valores})
    ja = db.scalar(select(Certificado.id).where(Certificado.codigo == laudo.certificado)) if laudo.certificado else None
    mesmo_arquivo = db.scalar(select(func.count()).select_from(Importacao).join(Arquivo, Arquivo.id == Importacao.arquivo_id)
                              .where(Arquivo.sha256 == sha, Importacao.tipo == "resultados", Importacao.estado == "confirmada"))
    resumo = defaultdict(int)
    for x in linhas:
        resumo[x["situacao"]] += 1
    return {
        "formato": laudo.formato, "certificado": laudo.certificado,
        "emitido_em": laudo.emitido_em.isoformat() if laudo.emitido_em else None, "cliente": laudo.cliente,
        "referencia": laudo.referencia, "projeto": laudo.projeto,
        "colunas": [{"analito": c.analito, "unidade": c.unidade, "metodo": c.metodo, "novo": c.analito not in analitos}
                    for c in laudo.colunas],
        "linhas": linhas, "resumo": dict(resumo),
        "tipos": {t: sum(1 for x in linhas if x["tipo"] == t) for t in ("SMP", "DUP", "REP", "STD", "BLK")},
        "erros_valor": erros_valor[:200], "certificado_ja_importado": ja is not None, "arquivo_ja_importado": bool(mesmo_arquivo),
    }


@router.post("/minas/{mina_id}/laudos", status_code=201)
def analisar(mina_id: uuid.UUID, request: Request, arquivo: UploadFile = File(...), u: Usuario = Depends(IMPORTAR),
             db: Session = Depends(obter_sessao)) -> dict:
    """Fase 1: lê o laudo, guarda o original e mostra a prévia. Nenhum resultado é gravado."""
    nome = (arquivo.filename or "laudo").replace("\\", "/").rsplit("/", 1)[-1]
    a = _gravar_arquivo(request, db, arquivo.file, nome, u)
    dados = request.app.state.armazenamento.caminho(a.chave).read_bytes()
    rel = _analisar(db, mina_id, dados, nome, a.sha256)
    imp = Importacao(mina_id=mina_id, tipo="resultados", arquivo_id=a.id, nome_arquivo=nome, relatorio=rel, importado_por=u.id)
    db.add(imp)
    db.flush()
    return {"id": imp.id, "nome_arquivo": nome, **rel}


def _obter(db: Session, modelo, **filtro):
    obj = db.scalar(select(modelo).filter_by(**filtro))
    if obj is None:
        obj = modelo(**filtro)
        db.add(obj)
        db.flush()
    return obj


@router.post("/importacoes/{imp_id}/confirmar-laudo")
def confirmar(imp_id: uuid.UUID, e: Confirmacao, request: Request, u: Usuario = Depends(IMPORTAR),
              db: Session = Depends(obter_sessao)) -> dict:
    """Fase 2: grava certificado e resultados. Resultados de códigos não cadastrados ficam sem vínculo."""
    imp = db.get(Importacao, imp_id)
    if imp is None or imp.tipo != "resultados":
        raise ErroAplicacao(404, "nao_encontrado", "Importação não encontrada.")
    if imp.estado != "analisada":
        raise ErroAplicacao(422, "importacao_encerrada", "Esta importação já foi confirmada ou descartada.")
    rel = imp.relatorio
    codigo_cert = rel["certificado"] or e.certificado
    if not codigo_cert:
        raise ErroAplicacao(422, "certificado_obrigatorio", "Informe o número do certificado/boletim do laboratório.")
    lab = db.scalar(select(Laboratorio).where(Laboratorio.nome == e.laboratorio))
    if lab is None:
        lab = Laboratorio(codigo=e.laboratorio.upper().replace(" ", "_")[:30], nome=e.laboratorio)
        db.add(lab)
        db.flush()
    if db.scalar(select(Certificado.id).where(Certificado.laboratorio_id == lab.id, Certificado.codigo == codigo_cert)):
        raise ErroAplicacao(409, "certificado_duplicado", f"O certificado {codigo_cert} já foi importado.")
    arq = db.get(Arquivo, imp.arquivo_id)
    laudo = L.ler(request.app.state.armazenamento.caminho(arq.chave).read_bytes(), imp.nome_arquivo)
    cert = Certificado(laboratorio_id=lab.id, mina_id=imp.mina_id, codigo=codigo_cert,
                       emitido_em=datetime.fromisoformat(rel["emitido_em"]) if rel["emitido_em"] else None,
                       cliente=rel["cliente"], referencia=rel["referencia"], projeto=rel["projeto"], importacao_id=imp.id)
    db.add(cert)
    db.flush()
    metodos, analitos = {}, {}
    for ordem, c in enumerate(laudo.colunas):
        if c.metodo not in metodos:
            metodos[c.metodo] = _obter(db, MetodoAnalitico, laboratorio_id=lab.id, codigo=c.metodo)
        if c.analito not in analitos:
            an = db.scalar(select(Analito).where(Analito.codigo == c.analito))
            if an is None:
                an = Analito(codigo=c.analito, tipo=L.tipo_analito(c.analito), ordem=ordem)
                db.add(an)
                db.flush()
            analitos[c.analito] = an
    amostras = {a.codigo.upper(): a for a in db.scalars(select(Amostra).where(Amostra.mina_id == imp.mina_id))}
    gravados, vinculados, cadastradas = 0, set(), []
    novos = []
    for ln in laudo.linhas:
        tipo = _tipo_linha(ln.tipo, ln.codigo)
        canon = _canonico_laudo(ln.codigo)
        amostra = amostras.get(canon.upper()) if canon else None
        if amostra is None and canon and tipo == "SMP" and e.cadastrar_amostras:
            amostra = Amostra(mina_id=imp.mina_id, codigo=canon, serie=serie_de_codigo(canon), estado="enviada",
                              observacoes=f"Cadastrada pelo laudo {codigo_cert} (código no laudo: {ln.codigo}).")
            db.add(amostra)
            db.flush()
            amostras[canon.upper()] = amostra
            cadastradas.append(canon)
        for col in laudo.colunas:
            texto, num, qual, lim = L.valor(ln.valores.get(col.indice))
            if qual == "--" and not texto:
                continue
            novos.append(dict(
                id=uuid.uuid4(), certificado_id=cert.id, amostra_id=amostra.id if amostra else None, codigo_laboratorio=ln.codigo,
                codigo_canonico=canon, tipo_linha=tipo, analito_id=analitos[col.analito].id,
                metodo_id=metodos[col.metodo].id, unidade=col.unidade, valor_texto=texto or "(vazio)", valor_num=num,
                qualificador=qual, limite=lim, preferido=False, linha_origem=ln.numero, observacao=None))
            gravados += 1
        if amostra:
            vinculados.add(amostra.codigo)
    # gravação em lote (o ORM objeto a objeto levava ~20 s para 100 mil resultados)
    for i in range(0, len(novos), 5000):
        db.execute(insert(Resultado), novos[i:i + 5000])
    _recalcular_preferidos(db, {r["amostra_id"] for r in novos if r["amostra_id"] and r["tipo_linha"] == "SMP"})
    imp.estado = "confirmada"
    imp.opcoes = e.model_dump()
    imp.relatorio = {**rel, "gravados": gravados, "amostras_vinculadas": sorted(vinculados), "amostras_cadastradas": cadastradas}
    db.flush()
    return {"certificado_id": cert.id, "certificado": codigo_cert, "resultados": gravados, "amostras_vinculadas": len(vinculados),
            "amostras_cadastradas": len(cadastradas),
            "sem_vinculo": sorted({r["codigo_laboratorio"] for r in novos if r["amostra_id"] is None})}


def _recalcular_preferidos(db: Session, amostra_ids: set) -> None:
    """Preferido = resultado SMP do certificado mais recente (reanálise substitui), por amostra, analito e método."""
    if not amostra_ids:
        return
    # synchronize_session=False: com dezenas de milhares de resultados na sessão, a sincronização em memória do ORM
    # é quadrática (minutos por laudo). Os objetos são expirados no fim, e o próximo acesso relê do banco.
    sem_sync = {"synchronize_session": False}
    ids_am = list(amostra_ids)
    for i in range(0, len(ids_am), 500):
        db.execute(update(Resultado).where(Resultado.amostra_id.in_(ids_am[i:i + 500])).values(preferido=False),
                   execution_options=sem_sync)
    linhas = []
    for i in range(0, len(ids_am), 500):
        linhas += db.execute(select(Resultado.id, Resultado.amostra_id, Resultado.analito_id, Resultado.metodo_id,
                                    Certificado.emitido_em, Certificado.criado_em)
                             .join(Certificado, Certificado.id == Resultado.certificado_id)
                             .where(Resultado.amostra_id.in_(ids_am[i:i + 500]), Resultado.tipo_linha == "SMP")).all()
    melhor: dict[tuple, tuple] = {}
    for rid, am, an, me, emit, criado in linhas:
        chave = (am, an, me)
        ordem = (emit or criado, criado)
        if chave not in melhor or ordem > melhor[chave][0]:
            melhor[chave] = (ordem, rid)
    ids = [v[1] for v in melhor.values()]
    for i in range(0, len(ids), 500):
        db.execute(update(Resultado).where(Resultado.id.in_(ids[i:i + 500])).values(preferido=True), execution_options=sem_sync)
    db.expire_all()


@router.post("/minas/{mina_id}/resultados/vincular-pendentes")
def vincular_pendentes(mina_id: uuid.UUID, _u: Usuario = Depends(IMPORTAR), db: Session = Depends(obter_sessao)) -> dict:
    """Liga resultados guardados sem vínculo às amostras cadastradas depois (pelo código canônico)."""
    amostras = {a.codigo.upper(): a.id for a in db.scalars(select(Amostra).where(Amostra.mina_id == mina_id))}
    pend = db.scalars(select(Resultado).join(Certificado).where(Certificado.mina_id == mina_id, Resultado.amostra_id.is_(None),
                                                                 Resultado.codigo_canonico.is_not(None))).all()
    afetadas = set()
    for r in pend:
        aid = amostras.get(r.codigo_canonico.upper())
        if aid:
            r.amostra_id = aid
            afetadas.add(aid)
    db.flush()
    _recalcular_preferidos(db, afetadas)
    return {"vinculados": sum(1 for r in pend if r.amostra_id), "amostras": len(afetadas)}


# ------------------------------------------------------------------ consultas
@router.get("/analitos")
def analitos(_u: Usuario = Depends(LER), db: Session = Depends(obter_sessao)) -> list[dict]:
    return [{"id": a.id, "codigo": a.codigo, "tipo": a.tipo}
            for a in db.scalars(select(Analito).order_by(Analito.tipo, Analito.ordem, Analito.codigo))]


@router.get("/minas/{mina_id}/certificados")
def certificados(mina_id: uuid.UUID, _u: Usuario = Depends(LER), db: Session = Depends(obter_sessao)) -> list[dict]:
    q = (select(Certificado, Laboratorio.nome, func.count(Resultado.id), func.count(func.distinct(Resultado.amostra_id)))
         .join(Laboratorio).outerjoin(Resultado, Resultado.certificado_id == Certificado.id)
         .where(Certificado.mina_id == mina_id).group_by(Certificado.id).order_by(Certificado.emitido_em.desc()))
    return [{"id": c.id, "codigo": c.codigo, "laboratorio": lab, "emitido_em": c.emitido_em, "referencia": c.referencia,
             "projeto": c.projeto, "resultados": n, "amostras": na} for c, lab, n, na in db.execute(q)]


def _fmt(r: Resultado) -> str:
    return r.valor_texto if r.qualificador != "=" else f"{r.valor_num:g}"


@router.get("/amostras/{amostra_id}/resultados")
def resultados_amostra(amostra_id: uuid.UUID, _u: Usuario = Depends(LER), db: Session = Depends(obter_sessao)) -> list[dict]:
    q = (select(Resultado, Analito.codigo, MetodoAnalitico.codigo, Certificado.codigo)
         .join(Analito).join(MetodoAnalitico).join(Certificado)
         .where(Resultado.amostra_id == amostra_id).order_by(Analito.tipo, Analito.ordem, Certificado.emitido_em))
    return [{"analito": an, "metodo": me, "certificado": ce, "tipo_linha": r.tipo_linha, "valor": _fmt(r), "valor_num": r.valor_num,
             "qualificador": r.qualificador, "limite": r.limite, "unidade": r.unidade, "preferido": r.preferido}
            for r, an, me, ce in db.execute(q)]


def _tabela(db: Session, mina_id: uuid.UUID, analitos: list[str] | None, certificado_id: uuid.UUID | None,
            incluir_controles: bool) -> tuple[list[str], list[dict]]:
    # colunas em vez de objetos do ORM (uma base de 10 anos tem ~1 milhão de resultados)
    q = (select(Resultado.tipo_linha, Resultado.codigo_laboratorio, Resultado.linha_origem, Resultado.unidade,
                Resultado.qualificador, Resultado.valor_texto, Resultado.valor_num, Analito.codigo, Certificado.codigo, Amostra.codigo)
         .join(Analito, Analito.id == Resultado.analito_id).join(Certificado, Certificado.id == Resultado.certificado_id)
         .outerjoin(Amostra, Amostra.id == Resultado.amostra_id)
         .where(Certificado.mina_id == mina_id))
    if certificado_id:
        q = q.where(Resultado.certificado_id == certificado_id)
    else:
        q = q.where(Resultado.preferido.is_(True))
    if not incluir_controles:
        q = q.where(Resultado.tipo_linha == "SMP")
    if analitos:
        q = q.where(Analito.codigo.in_(analitos))
    ordem_analitos = [a.codigo for a in db.scalars(select(Analito).order_by(Analito.tipo, Analito.ordem, Analito.codigo))]
    linhas: dict[tuple, dict] = {}
    presentes = set()
    for tipo, cod_lab, linha, unid, qual, vtexto, vnum, an, cert, cod in db.execute(q):
        chave = (cert, tipo, cod_lab, linha if certificado_id else 0)
        ln = linhas.get(chave)
        if ln is None:
            ln = linhas[chave] = {"amostra": cod, "codigo_laboratorio": cod_lab, "tipo": tipo, "certificado": cert, "valores": {}}
        col = f"{an} ({unid})"
        ln["valores"][col] = vtexto if qual != "=" else f"{vnum:g}"
        presentes.add((an, col))
    colunas = [col for a in ordem_analitos for (an, col) in sorted(presentes) if an == a]
    return colunas, sorted(linhas.values(), key=lambda x: (x["certificado"], x["amostra"] or x["codigo_laboratorio"]))


@router.get("/minas/{mina_id}/resultados/tabela")
def tabela(mina_id: uuid.UUID, analitos: str | None = None, certificado_id: uuid.UUID | None = None,
           incluir_controles: bool = False, limite: int = Query(default=500, ge=1, le=5000),
           _u: Usuario = Depends(LER), db: Session = Depends(obter_sessao)) -> dict:
    """Uma linha por amostra (resultados preferidos) ou, com certificado_id, uma linha por linha do laudo.
    A tela mostra no máximo `limite` linhas (o CSV traz todas)."""
    colunas, linhas = _tabela(db, mina_id, analitos.split(",") if analitos else None, certificado_id, incluir_controles)
    return {"colunas": colunas, "linhas": linhas[:limite], "total": len(linhas)}


@router.get("/minas/{mina_id}/resultados/tabela.csv")
def tabela_csv(mina_id: uuid.UUID, analitos: str | None = None, certificado_id: uuid.UUID | None = None,
               incluir_controles: bool = False, _u: Usuario = Depends(LER), db: Session = Depends(obter_sessao)):
    colunas, linhas = _tabela(db, mina_id, analitos.split(",") if analitos else None, certificado_id, incluir_controles)
    buf = io.StringIO()
    w = csv.writer(buf, delimiter=";")
    w.writerow(["amostra", "codigo_laboratorio", "tipo", "certificado", *colunas])
    for ln in linhas:
        w.writerow([ln["amostra"] or "", ln["codigo_laboratorio"], ln["tipo"], ln["certificado"],
                    *[ln["valores"].get(c, "") for c in colunas]])
    conteudo = "﻿" + buf.getvalue()  # BOM: o Excel abre com acentos corretos
    return StreamingResponse(iter([conteudo]), media_type="text/csv; charset=utf-8",
                             headers={"Content-Disposition": 'attachment; filename="resultados_geomina.csv"'})


@router.get("/certificados/{cert_id}/qaqc")
def qaqc(cert_id: uuid.UUID, limite_rpd: float = 20.0, _u: Usuario = Depends(LER), db: Session = Depends(obter_sessao)) -> dict:
    """Duplicatas e replicatas do laboratório: diferença percentual relativa (RPD) para cada analito."""
    rs = db.execute(select(Resultado, Analito.codigo).join(Analito).where(Resultado.certificado_id == cert_id)).all()
    smp = {(r.codigo_laboratorio, an): r for r, an in rs if r.tipo_linha == "SMP"}
    pares = []
    for r, an in rs:
        if r.tipo_linha not in ("DUP", "REP"):
            continue
        o = smp.get((r.codigo_laboratorio, an))
        if not o or o.valor_num is None or r.valor_num is None or (o.valor_num + r.valor_num) == 0:
            continue
        rpd = abs(o.valor_num - r.valor_num) / ((o.valor_num + r.valor_num) / 2) * 100
        pares.append({"tipo": r.tipo_linha, "amostra": r.codigo_laboratorio, "analito": an, "original": o.valor_num,
                      "repeticao": r.valor_num, "unidade": r.unidade, "rpd": round(rpd, 1), "alerta": rpd > limite_rpd})
    padroes = sorted({r.codigo_laboratorio for r, _ in rs if r.tipo_linha == "STD"})
    brancos = [{"codigo": r.codigo_laboratorio, "analito": an, "valor": _fmt(r), "unidade": r.unidade}
               for r, an in rs if r.tipo_linha == "BLK" and r.qualificador == "="]
    return {"pares": sorted(pares, key=lambda p: -p["rpd"]), "limite_rpd": limite_rpd,
            "alertas": sum(1 for p in pares if p["alerta"]), "padroes": padroes,
            "brancos_acima_do_limite": brancos,
            "observacao": "Os valores certificados dos padrões (CRM) ainda não estão cadastrados: o desvio dos padrões não é calculado."}

