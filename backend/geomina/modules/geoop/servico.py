"""Geoquímica operacional: conjunto de registros para análise, filtros encadeados e conciliação laudo × cadastro.

Regra do usuário (2026-11-26): TODOS os resultados dos laudos devem poder ser usados. Por isso a base da análise é o
resultado do laudo — amostras cadastradas e também códigos que só existem no laudo (marcados como "só no laudo").
"""

from __future__ import annotations

import re
import uuid
from collections import defaultdict
from datetime import date

from sqlalchemy import select
from sqlalchemy.orm import Session, aliased

from geomina.modules.amostragem.models import Amostra, Campanha, TipoAmostra
from geomina.modules.analise.longitudinal import valor_grafico
from geomina.modules.auth.models import Usuario
from geomina.modules.dicionarios.models import Termo
from geomina.modules.estrutura.models import TipoUnidade, UnidadeOperacional
from geomina.modules.geoquimica.models import Analito, Certificado, Laboratorio, Resultado
from geomina.modules.mapeamento.models import Mapeamento
from geomina.modules.sondagem.models import Furo

STATUS = {"com_resultado": "Com resultado", "aguardando": "Enviada, aguardando laudo", "sem_envio": "Coletada, não enviada",
          "so_laudo": "Só no laudo (amostra não cadastrada)", "cancelada": "Cancelada"}
SUFIXO = re.compile(r"^((?:BS-RP|BMT-TS)-\d+)([A-Z]{1,3})$")

# facetas: nome → (rótulo, função que devolve [(valor, rótulo)] do registro)
FACETAS = ("nivel", "galeria", "trecho", "furo", "campanha", "responsavel", "litologia", "alteracao", "mineralizacao", "tipo",
           "laboratorio", "certificado", "status", "serie", "cadastro")


def _serie(codigo: str) -> str:
    for s in ("BS-RP", "BMT-TS", "BE"):
        if codigo.upper().startswith(s):
            return s
    return "outra"


def _unidades(db: Session, mina_id: uuid.UUID) -> dict[uuid.UUID, dict]:
    """Para cada unidade: nível (ancestral marcado como nível), galeria (ancestral com eixo: galeria/travessa/rampa) e trecho."""
    linhas = db.execute(select(UnidadeOperacional, TipoUnidade).join(TipoUnidade, TipoUnidade.id == UnidadeOperacional.tipo_id)
                        .where(UnidadeOperacional.mina_id == mina_id)).all()
    por_hex = {u.id.hex: (u, t) for u, t in linhas}
    out = {}
    for u, _t in linhas:
        cadeia = [por_hex[h] for h in (u.caminho or "").strip("/").split("/") if h in por_hex]
        nivel = next((x for x, t in cadeia if t.e_nivel), None)
        gal = next((x for x, t in cadeia if t.possui_eixo), None)
        trecho = u if gal is not None and u.id != gal.id else None
        ref = lambda x: {"id": str(x.id), "codigo": x.codigo, "nome": x.nome} if x else None  # noqa: E731
        out[u.id] = {"nivel": ref(nivel), "galeria": ref(gal), "trecho": ref(trecho), "unidade": ref(u)}
    return out


def registros(db: Session, mina_id: uuid.UUID) -> list[dict]:
    """Um registro por amostra analítica: cadastrada (com ou sem resultado) ou código que só aparece no laudo."""
    uni = _unidades(db, mina_id)
    Lit, Alt, Mi = aliased(Termo), aliased(Termo), aliased(Termo)
    q = (select(Amostra, Lit, Alt, Mi, Campanha, TipoAmostra.id, TipoAmostra.nome, Usuario.nome, Mapeamento.numero, Furo.codigo)
         .outerjoin(Lit, Lit.id == Amostra.litologia_id).outerjoin(Alt, Alt.id == Amostra.alteracao_id)
         .outerjoin(Mi, Mi.id == Amostra.mineralizacao_id).outerjoin(Campanha, Campanha.id == Amostra.campanha_id)
         .outerjoin(TipoAmostra, TipoAmostra.id == Amostra.tipo_id).outerjoin(Usuario, Usuario.id == Amostra.geologo_id)
         .outerjoin(Mapeamento, Mapeamento.id == Amostra.mapeamento_id).outerjoin(Furo, Furo.id == Amostra.furo_id)
         .where(Amostra.mina_id == mina_id))
    # resumo dos resultados SMP por amostra ligada e por código não ligado
    rq = (select(Resultado.amostra_id, Resultado.codigo_canonico, Resultado.codigo_laboratorio, Laboratorio.id, Laboratorio.nome,
                 Certificado.id, Certificado.codigo, Analito.codigo)
          .join(Certificado, Certificado.id == Resultado.certificado_id).join(Laboratorio, Laboratorio.id == Certificado.laboratorio_id)
          .join(Analito, Analito.id == Resultado.analito_id)
          .where(Certificado.mina_id == mina_id, Resultado.tipo_linha == "SMP"))
    res: dict = defaultdict(lambda: {"n": 0, "lab": {}, "cert": {}, "analitos": set(), "codigo_lab": None})
    for aid, canon, cod_lab, lid, lnome, cid, ccod, an in db.execute(rq):
        chave = aid or ("laudo:" + (canon or cod_lab).upper())
        r = res[chave]
        r["n"] += 1
        r["lab"][str(lid)] = lnome
        r["cert"][str(cid)] = ccod
        r["analitos"].add(an)
        r["codigo_lab"] = r["codigo_lab"] or (canon or cod_lab)
    termo = lambda t: {"id": str(t.id), "nome": t.nome, "cor": t.cor} if t else None  # noqa: E731
    out = []
    for a, lit, alt, mi, camp, tid, tnome, geo, ficha, furo_cod in db.execute(q):
        r = res.pop(a.id, None)
        if a.estado == "cancelada":
            st = "cancelada"
        elif r:
            st = "com_resultado"
        else:
            st = "aguardando" if a.estado == "enviada" else "sem_envio"
        u = uni.get(a.unidade_id, {}) if a.unidade_id else {}
        out.append({
            "chave": str(a.id), "amostra_id": str(a.id), "codigo": a.codigo, "cadastrada": True, "serie": a.serie, "papel": a.papel_controle,
            "nivel": u.get("nivel"), "galeria": u.get("galeria"), "trecho": u.get("trecho"), "unidade": u.get("unidade"),
            "local": a.local_descricao, "x": a.x, "y": a.y, "z": a.z, "srid": a.srid, "data": a.data_coleta.isoformat() if a.data_coleta else None,
            "campanha": {"id": str(camp.id), "codigo": camp.codigo} if camp else None,
            "responsavel": {"id": str(a.geologo_id), "nome": geo} if a.geologo_id else ({"id": "nome:" + a.responsavel_nome, "nome": a.responsavel_nome} if a.responsavel_nome else None),
            "tipo": {"id": str(tid), "nome": tnome} if tid else None,
            "litologia": termo(lit), "alteracao": termo(alt), "mineralizacao": termo(mi),
            "ficha": {"id": str(a.mapeamento_id), "numero": ficha} if a.mapeamento_id else None,
            "secao_de_m": a.secao_de_m, "secao_ate_m": a.secao_ate_m, "furo": a.furo, "furo_ref": {"id": str(a.furo_id), "codigo": furo_cod} if a.furo_id else None, "prof_de_m": a.prof_de_m, "prof_ate_m": a.prof_ate_m,
            "descricao": a.descricao, "estado": a.estado, "status": st,
            "laboratorios": r["lab"] if r else {}, "certificados": r["cert"] if r else {}, "analitos": sorted(r["analitos"]) if r else [],
            "n_resultados": r["n"] if r else 0, "codigo_laboratorio": r["codigo_lab"] if r else None})
    for chave, r in res.items():  # resultados sem amostra cadastrada
        cod = r["codigo_lab"]
        out.append({
            "chave": chave, "amostra_id": None, "codigo": cod, "cadastrada": False, "serie": _serie(cod), "papel": "normal",
            "nivel": None, "galeria": None, "trecho": None, "unidade": None, "local": None, "x": None, "y": None, "z": None, "srid": None,
            "data": None, "campanha": None, "responsavel": None, "tipo": None, "litologia": None, "alteracao": None, "mineralizacao": None,
            "ficha": None, "secao_de_m": None, "secao_ate_m": None, "furo": None, "furo_ref": None, "prof_de_m": None, "prof_ate_m": None, "descricao": None,
            "estado": None, "status": "so_laudo", "laboratorios": r["lab"], "certificados": r["cert"], "analitos": sorted(r["analitos"]),
            "n_resultados": r["n"], "codigo_laboratorio": cod})
    return out


def _valores_faceta(r: dict, f: str) -> list[tuple[str, str]]:
    if f in ("nivel", "galeria", "trecho"):
        u = r[f]
        return [(u["id"], u["codigo"])] if u else [("_nenhum", "(sem " + {"nivel": "nível", "galeria": "galeria", "trecho": "trecho"}[f] + ")")]
    if f in ("litologia", "alteracao", "mineralizacao", "tipo", "responsavel"):
        t = r[f]
        return [(t["id"], t["nome"])] if t else [("_nenhum", "(não informado)")]
    if f == "furo":
        return [(r["furo_ref"]["id"], r["furo_ref"]["codigo"])] if r["furo_ref"] else [("_nenhum", "(sem furo)")]
    if f == "campanha":
        return [(r[f]["id"], r[f]["codigo"])] if r[f] else [("_nenhum", "(sem campanha)")]
    if f == "laboratorio":
        return list(r["laboratorios"].items()) or [("_nenhum", "(sem laudo)")]
    if f == "certificado":
        return list(r["certificados"].items()) or [("_nenhum", "(sem laudo)")]
    if f == "status":
        return [(r["status"], STATUS[r["status"]])]
    if f == "serie":
        return [(r["serie"], r["serie"])]
    if f == "cadastro":
        return [("sim", "Cadastrada")] if r["cadastrada"] else [("nao", "Só no laudo")]
    return []


def valores(db: Session, mina_id: uuid.UUID, regs: list[dict], analitos: list[str], regra_ld: str = "limite") -> dict[str, dict]:
    """Resultado de cada analito por registro: o preferido (amostra cadastrada) ou o do certificado mais recente (só no laudo)."""
    if not analitos or not regs:
        return {}
    q = (select(Resultado, Analito.codigo, Certificado.codigo, Certificado.emitido_em, Certificado.criado_em)
         .join(Analito).join(Certificado)
         .where(Certificado.mina_id == mina_id, Resultado.tipo_linha == "SMP", Analito.codigo.in_(analitos)))
    out: dict[str, dict] = defaultdict(dict)
    ordem: dict = {}
    chaves = {r["chave"] for r in regs}
    for r, an, cert, emit, criado in db.execute(q):
        if r.amostra_id is not None:
            if not r.preferido:
                continue
            k = str(r.amostra_id)
        else:
            k = "laudo:" + (r.codigo_canonico or r.codigo_laboratorio).upper()
            o = (emit or criado, criado)
            if (k, an) in ordem and ordem[(k, an)] >= o:
                continue
            ordem[(k, an)] = o
        if k not in chaves:
            continue
        y, sit = valor_grafico(r.qualificador, r.valor_num, r.limite, regra_ld)
        out[k][an] = {"y": y, "texto": r.valor_texto if r.qualificador != "=" else f"{r.valor_num:g}", "situacao": sit,
                      "unidade": r.unidade, "certificado": cert}
    return out


def filtrar(db: Session, mina_id: uuid.UUID, regs: list[dict], filtros: dict[str, set[str]], texto: str | None, data_de: date | None,
            data_ate: date | None, teor: tuple[str, float | None, float | None] | None, regra_ld: str) -> tuple[list[dict], dict]:
    """Aplica os filtros e devolve (registros, opções de cada faceta com contagem — calculadas com os OUTROS filtros)."""
    def passa_base(r: dict) -> bool:
        so_letras = lambda t: re.sub(r"[\s\-_.]", "", (t or "").upper())  # noqa: E731
        if texto and so_letras(texto) not in so_letras(r["codigo"]) and texto.lower() not in (r["local"] or "").lower():
            return False
        if data_de and (not r["data"] or r["data"] < data_de.isoformat()):
            return False
        return not (data_ate and (not r["data"] or r["data"] > data_ate.isoformat()))

    base = [r for r in regs if passa_base(r)]
    if teor and (teor[1] is not None or teor[2] is not None):
        vals = valores(db, mina_id, base, [teor[0]], regra_ld)

        def no_teor(r: dict) -> bool:
            v = vals.get(r["chave"], {}).get(teor[0])
            return bool(v and v["y"] is not None and (teor[1] is None or v["y"] >= teor[1]) and (teor[2] is None or v["y"] <= teor[2]))
        base = [r for r in base if no_teor(r)]
    valores_r = {id(r): {f: _valores_faceta(r, f) for f in FACETAS} for r in base}

    def passa(r: dict, exceto: str | None = None) -> bool:
        for f, sel in filtros.items():
            if f == exceto or not sel:
                continue
            if not any(v in sel for v, _ in valores_r[id(r)][f]):
                return False
        return True

    opcoes = {}
    for f in FACETAS:
        cont: dict[str, list] = {}
        for r in base:
            if passa(r, f):
                for v, rot in valores_r[id(r)][f]:
                    cont.setdefault(v, [rot, 0])[1] += 1
        selecionados = filtros.get(f, set())
        opcoes[f] = sorted(({"valor": v, "rotulo": rot, "n": n} for v, (rot, n) in cont.items()), key=lambda o: (o["valor"] == "_nenhum", o["rotulo"]))
        for v in selecionados - set(cont):  # selecionado que ficou sem registros continua visível (n = 0)
            opcoes[f].append({"valor": v, "rotulo": v, "n": 0})
    return [r for r in base if passa(r)], opcoes


# ------------------------------------------------------------------ conciliação laudo × cadastro
def conciliacao(db: Session, mina_id: uuid.UUID) -> dict:
    cadastradas = {a.codigo.upper(): a for a in db.scalars(select(Amostra).where(Amostra.mina_id == mina_id))}
    q = (select(Resultado.codigo_canonico, Resultado.codigo_laboratorio, Resultado.tipo_linha, Certificado.codigo)
         .join(Certificado).where(Certificado.mina_id == mina_id, Resultado.amostra_id.is_(None)))
    grupos: dict = defaultdict(lambda: {"resultados": 0, "certificados": set(), "tipos": set()})
    for canon, cod_lab, tipo, cert in db.execute(q):
        g = grupos[(canon, cod_lab if not canon else None)]
        g["resultados"] += 1
        g["certificados"].add(cert)
        g["tipos"].add(tipo)
    sub, novas, fora, controles = [], [], [], []
    for (canon, cod_lab), g in sorted(grupos.items(), key=lambda kv: kv[0][0] or kv[0][1] or ""):
        item = {"codigo": canon or cod_lab, "resultados": g["resultados"], "certificados": sorted(g["certificados"])}
        if g["tipos"] <= {"STD", "BLK"}:
            controles.append(item)
        elif not canon:
            fora.append(item)
        elif (m := SUFIXO.match(canon)) and m.group(1).upper() in cadastradas:
            p = cadastradas[m.group(1).upper()]
            sub.append({**item, "pai": {"id": str(p.id), "codigo": p.codigo, "local": p.local_descricao, "tem_xyz": p.x is not None}})
        else:
            novas.append({**item, "serie": _serie(canon)})
    return {"subamostras": sub, "nao_cadastradas": novas, "fora_das_regras": fora, "controles_laboratorio": controles}
