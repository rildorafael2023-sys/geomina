"""Série geoquímica longitudinal: amostras de frente posicionadas no eixo (chainage 3D da E10) com resultados preferidos.

Regras (Seção 27 §2; ANALISE_CRITICA §F3–F5):
- a posição é sempre o chainage gravado em `posicao_eixo` para a versão vigente do eixo — nada é estimado aqui;
- valores abaixo/acima do limite nunca viram zero: a regra (`limite`, `metade`, `omitir`) é escolhida e devolvida;
- unidades diferentes do mesmo analito não são convertidas: cada unidade vira uma série separada, com aviso.
"""

from __future__ import annotations

import csv
import io
import re
import uuid
from dataclasses import dataclass, field
from datetime import date

import shapely
from sqlalchemy import func, select
from sqlalchemy.orm import Session, aliased

from geomina.core.erros import ErroAplicacao
from geomina.espacial import chainage as C
from geomina.espacial.geometria import de_wkb
from geomina.modules.amostragem.models import Amostra, Campanha, TipoAmostra
from geomina.modules.auth.models import Usuario
from geomina.modules.dicionarios.models import Termo
from geomina.modules.documentos.models import Documento, DocumentoVinculo
from geomina.modules.estrutura.models import Mina, UnidadeOperacional
from geomina.modules.geoquimica.models import Analito, Certificado, Resultado
from geomina.modules.mapeamento.models import Mapeamento, MedidaEstrutural
from geomina.modules.topografia.models import EixoVersao
from geomina.modules.topografia.router import _transformar_ponto

REGRAS_LD = {"limite": "no valor do limite (símbolo vazado)", "metade": "metade do limite (símbolo vazado)",
             "omitir": "fora do gráfico (contados)"}


@dataclass
class Filtros:
    litologias: list[uuid.UUID] = field(default_factory=list)
    alteracoes: list[uuid.UUID] = field(default_factory=list)
    mineralizacoes: list[uuid.UUID] = field(default_factory=list)
    estruturas: list[uuid.UUID] = field(default_factory=list)
    data_de: date | None = None
    data_ate: date | None = None
    responsaveis: list[uuid.UUID] = field(default_factory=list)
    tipos: list[uuid.UUID] = field(default_factory=list)
    campanhas: list[uuid.UUID] = field(default_factory=list)
    chainage_de: float | None = None
    chainage_ate: float | None = None
    teor_analito: str | None = None
    teor_min: float | None = None
    teor_max: float | None = None
    incluir_duplicatas: bool = False


def valor_grafico(qualificador: str, valor_num: float | None, limite: float | None, regra: str) -> tuple[float | None, str]:
    """(valor a desenhar, situação) — situação: medido | abaixo_ld | acima_ld | sem_valor | omitido."""
    if qualificador == "=" and valor_num is not None:
        return valor_num, "medido"
    if qualificador in ("<", ">") and limite is not None:
        sit = "abaixo_ld" if qualificador == "<" else "acima_ld"
        if regra == "omitir":
            return None, "omitido"
        if regra == "metade" and qualificador == "<":
            return limite / 2, sit
        return limite, sit
    return None, "sem_valor"


def _posicao(db: Session, mina: Mina, a: Amostra, cache: dict) -> tuple[list[float] | None, str | None]:
    """XYZ no sistema da mina (convertido só com transformação aprovada) ou o motivo de não haver posição."""
    if a.x is None or a.y is None:
        return None, "sem coordenadas"
    xyz = [a.x, a.y] + ([a.z] if a.z is not None else [])
    srid = a.srid or mina.srid_trabalho
    if srid not in cache:
        cache[srid] = _transformar_ponto(db, mina, srid, [0.0, 0.0, 0.0])
    if cache[srid][0] is None:
        return None, cache[srid][2]
    d = cache[srid][0]
    return [xyz[0] + d[0], xyz[1] + d[1]] + ([xyz[2] + d[2]] if len(xyz) == 3 else []), None


def _agrupar(pos: list[list[float]], tol: float = 0.5) -> list[int]:
    """Amostras no mesmo ponto (sub-pontos da parede/seção): grupo de cada posição."""
    grupos: list[int] = []
    centros: list[list[float]] = []
    for p in pos:
        for g, c in enumerate(centros):
            if abs(p[0] - c[0]) <= tol and abs(p[1] - c[1]) <= tol:
                grupos.append(g)
                break
        else:
            centros.append(p)
            grupos.append(len(centros) - 1)
    return grupos


def _geologia_das_fichas(db: Session, amostras: dict[uuid.UUID, dict]) -> None:
    """Estruturas medidas e fotos/croquis da ficha de cada amostra (registros originais, sem extrapolar)."""
    fichas = {a["_ficha"] for a in amostras.values() if a["_ficha"]}
    medidas: dict = {}
    docs: dict = {}
    if fichas:
        T = aliased(Termo)
        for m, t in db.execute(select(MedidaEstrutural, T).join(T, T.id == MedidaEstrutural.tipo_id)
                               .where(MedidaEstrutural.mapeamento_id.in_(fichas)).order_by(MedidaEstrutural.ordem)):
            atitude = (f"{m.dip_dir:03.0f}/{m.dip:02.0f}" if m.dip_dir is not None and m.dip is not None
                       else f"{m.trend:03.0f}→{m.plunge:02.0f}" if m.trend is not None and m.plunge is not None else "")
            medidas.setdefault(m.mapeamento_id, []).append({"tipo": t.nome, "sigla": t.sigla or t.codigo, "cor": t.cor, "classe": m.classe,
                                                            "atitude": atitude, "familia": m.familia})
        for fid, cat, n in db.execute(select(DocumentoVinculo.mapeamento_id, Documento.categoria, func.count())
                                      .join(Documento, Documento.id == DocumentoVinculo.documento_id)
                                      .where(DocumentoVinculo.mapeamento_id.in_(fichas), Documento.arquivado.is_(False)).group_by(DocumentoVinculo.mapeamento_id, Documento.categoria)):
            docs.setdefault(fid, {})[cat] = n
    for a in amostras.values():
        f = a.pop("_ficha")
        a["medidas"], a["documentos"] = medidas.get(f, []), docs.get(f, {})


def serie(db: Session, unidade_id: uuid.UUID, analitos: list[str], f: Filtros, regra_ld: str = "limite",
          referencia: str = "auto", inverter: bool = False) -> dict:
    """Teores ao longo da galeria, do início ao fim.

    referencia: `amostras` = caminho que segue a galeria passando pelos pontos de amostragem (não precisa de eixo);
    `eixo` = projeção no eixo desenhado (versão vigente); `auto` = eixo se existir, senão amostras.
    A ordem e as distâncias são calculadas com TODAS as amostras da galeria; os filtros só escondem pontos.
    """
    if regra_ld not in REGRAS_LD:
        raise ErroAplicacao(422, "regra_ld", "Regra para valores abaixo do limite: limite, metade ou omitir.")
    if referencia not in ("auto", "amostras", "eixo"):
        raise ErroAplicacao(422, "referencia", "Referência da distância: auto, amostras ou eixo.")
    un = db.get(UnidadeOperacional, unidade_id)
    if un is None:
        raise ErroAplicacao(404, "nao_encontrado", "Unidade não encontrada.")
    mina = db.get(Mina, un.mina_id)
    v = db.scalar(select(EixoVersao).where(EixoVersao.unidade_id == unidade_id, EixoVersao.vigente.is_(True)))
    if referencia == "eixo" and v is None:
        raise ErroAplicacao(422, "sem_eixo", f"{un.codigo} não tem eixo desenhado: use a distância pelas amostras.")
    usar_eixo = v is not None and referencia in ("auto", "eixo")

    Lit, Alt, Min = aliased(Termo), aliased(Termo), aliased(Termo)
    sub = select(UnidadeOperacional.id).where(UnidadeOperacional.caminho.like(un.caminho + "%"))
    papeis = ["normal", "dup_campo"] if f.incluir_duplicatas else ["normal"]
    q = (select(Amostra, Lit, Alt, Min, Campanha.codigo, TipoAmostra.nome, Usuario.nome, Mapeamento.numero, UnidadeOperacional.codigo)
         .outerjoin(Lit, Lit.id == Amostra.litologia_id).outerjoin(Alt, Alt.id == Amostra.alteracao_id)
         .outerjoin(Min, Min.id == Amostra.mineralizacao_id).outerjoin(Campanha, Campanha.id == Amostra.campanha_id)
         .outerjoin(TipoAmostra, TipoAmostra.id == Amostra.tipo_id).outerjoin(Usuario, Usuario.id == Amostra.geologo_id)
         .outerjoin(Mapeamento, Mapeamento.id == Amostra.mapeamento_id)
         .join(UnidadeOperacional, UnidadeOperacional.id == Amostra.unidade_id)
         .where(Amostra.unidade_id.in_(sub), Amostra.estado != "cancelada", Amostra.papel_controle.in_(papeis)))
    linhas = db.execute(q).all()

    cache: dict = {}
    posicionadas, sem_posicao = [], []
    for row in linhas:
        xyz, motivo = _posicao(db, mina, row[0], cache)
        if xyz is None:
            sem_posicao.append({"codigo": row[0].codigo, "motivo": motivo})
        else:
            posicionadas.append((row, xyz))

    # distância ao longo da galeria (com todas as amostras, antes dos filtros)
    dist: dict[uuid.UUID, tuple[float, float, int]] = {}
    percurso: list[list[float]] = []
    saltos: list[dict] = []
    irregular: dict | None = None
    if usar_eixo:
        eixo = shapely.get_coordinates(de_wkb(v.geom), include_z=True)
        if inverter:
            eixo = eixo[::-1]
        percurso = eixo.round(3).tolist()
        for (row, xyz) in posicionadas:
            pr = C.projetar(eixo, xyz)
            dist[row[0].id] = (pr.chainage, pr.afastamento, 0)
        comprimento = float(C.comprimentos(eixo)[-1])
        inicio = (v.inicio_descricao or "primeiro vértice do eixo") if not inverter else "outra ponta do eixo (invertido)"
        ordem_pontos = sorted({round(d[0], 1) for d in dist.values()})
        for aid, (ch, af, _) in list(dist.items()):
            dist[aid] = (ch, af, ordem_pontos.index(round(ch, 1)) + 1)
    else:
        pos = [xyz for _, xyz in posicionadas]
        grupos = _agrupar(pos)
        centros = [next(pos[i] for i, g in enumerate(grupos) if g == gi) for gi in range(max(grupos) + 1)] if grupos else []
        datas = [min((posicionadas[i][0][0].data_coleta for i, g in enumerate(grupos) if g == gi and posicionadas[i][0][0].data_coleta),
                     default=None) for gi in range(len(centros))]
        a, b = C.extremidades(centros) if centros else (0, 0)
        # início padrão: a ponta com a amostra mais antiga (a galeria avança com o tempo); sem datas, a de menor número
        # de amostra (a numeração de campo é sequencial); "inverter" troca
        def chave_ponta(gi: int) -> tuple:
            cods = [posicionadas[i][0][0].codigo for i, g in enumerate(grupos) if g == gi]
            num = min((int(m.group()) for c in cods if (m := re.search(r"\d+", c))), default=10**9)
            return (datas[gi] or date.max, num)
        partida = b if centros and chave_ponta(b) < chave_ponta(a) else a
        if inverter:
            partida = b if partida == a else a
        p = C.percurso_pelos_pontos(centros, partida)
        dist_grupo = {gi: (d, n + 1) for n, (gi, d) in enumerate(zip(p.ordem, p.distancia, strict=True))}
        for i, (row, _xyz) in enumerate(posicionadas):
            d, n = dist_grupo[grupos[i]]
            dist[row[0].id] = (d, 0.0, n)
        percurso = [[round(c, 3) for c in centros[gi]] for gi in p.ordem]
        comprimento = p.distancia[-1] if p.distancia else 0.0
        cods = lambda gi: ", ".join(sorted(posicionadas[i][0][0].codigo for i, g in enumerate(grupos) if g == gi))  # noqa: E731
        inicio = f"ponto da amostra {cods(p.ordem[0])}" if p.ordem else "—"
        if p.ordem and datas[p.ordem[0]]:
            inicio += f" (coleta {datas[p.ordem[0]]:%d/%m/%Y})"
        saltos = [{"depois_de": cods(p.ordem[k - 1]), "trecho_m": round(p.distancia[k] - p.distancia[k - 1], 1)} for k in p.saltos]
        # amostras que não seguem uma linha única (ramos diferentes juntos): o caminho fica muito maior que a distância entre as pontas
        if len(centros) >= 4:
            vao = float(((centros[a][0] - centros[b][0]) ** 2 + (centros[a][1] - centros[b][1]) ** 2) ** 0.5)
            plano = sum(((centros[i][0] - centros[j][0]) ** 2 + (centros[i][1] - centros[j][1]) ** 2) ** 0.5 for i, j in zip(p.ordem, p.ordem[1:], strict=False))
            if plano > 1.6 * vao and plano - vao > 30:
                irregular = {"caminho_m": round(plano, 1), "entre_pontas_m": round(vao, 1)}

    estruturas = set()
    if f.estruturas:
        estruturas = set(db.scalars(select(MedidaEstrutural.mapeamento_id).where(MedidaEstrutural.tipo_id.in_(f.estruturas))))

    def passa(a: Amostra, ch: float) -> bool:
        for val, ids in ((a.litologia_id, f.litologias), (a.alteracao_id, f.alteracoes), (a.mineralizacao_id, f.mineralizacoes),
                         (a.geologo_id, f.responsaveis), (a.tipo_id, f.tipos), (a.campanha_id, f.campanhas)):
            if ids and val not in ids:
                return False
        if f.estruturas and a.mapeamento_id not in estruturas:
            return False
        if (f.data_de and (not a.data_coleta or a.data_coleta < f.data_de)) or (f.data_ate and (not a.data_coleta or a.data_coleta > f.data_ate)):
            return False
        return (f.chainage_de is None or ch >= f.chainage_de) and (f.chainage_ate is None or ch <= f.chainage_ate)

    termo = lambda t: {"id": str(t.id), "nome": t.nome, "cor": t.cor} if t else None  # noqa: E731
    amostras: dict[uuid.UUID, dict] = {}
    for (a, lit, alt, mi, camp, tipo, geo, ficha, local), xyz in posicionadas:
        ch, af, ponto = dist[a.id]
        if not passa(a, ch):
            continue
        amostras[a.id] = {"id": str(a.id), "codigo": a.codigo, "chainage_m": round(ch, 3), "afastamento_m": round(af, 2), "ponto": ponto,
                          "x": round(xyz[0], 3), "y": round(xyz[1], 3), "z": round(xyz[2], 3) if len(xyz) == 3 else None,
                          "papel": a.papel_controle, "data": a.data_coleta.isoformat() if a.data_coleta else None,
                          "responsavel": geo or a.responsavel_nome, "responsavel_id": str(a.geologo_id) if a.geologo_id else None,
                          "litologia": termo(lit), "alteracao": termo(alt), "mineralizacao": termo(mi), "campanha": camp, "tipo": tipo,
                          "ficha": ficha, "ficha_id": str(a.mapeamento_id) if a.mapeamento_id else None, "local": a.local_descricao,
                          "unidade": local, "secao_de_m": a.secao_de_m, "secao_ate_m": a.secao_ate_m, "descricao": a.descricao,
                          "estado": a.estado, "_ficha": a.mapeamento_id, "medidas": [], "documentos": {}, "valores": {}}
    _geologia_das_fichas(db, amostras)

    pedidos = list(dict.fromkeys(analitos)) + ([f.teor_analito] if f.teor_analito and f.teor_analito not in analitos else [])
    resumo: dict[str, dict] = {}
    if amostras and pedidos:
        rq = (select(Resultado, Analito.codigo, Certificado.codigo).join(Analito).join(Certificado)
              .where(Resultado.preferido.is_(True), Resultado.amostra_id.in_(list(amostras)), Analito.codigo.in_(pedidos)))
        for r, an, cert in db.execute(rq):
            y, sit = valor_grafico(r.qualificador, r.valor_num, r.limite, regra_ld)
            chave = an if an not in resumo or resumo[an]["unidade"] == r.unidade else f"{an} ({r.unidade})"
            resumo.setdefault(chave, {"analito": an, "unidade": r.unidade, "n": 0, "abaixo_ld": 0, "acima_ld": 0, "sem_valor": 0, "omitido": 0})
            s = resumo[chave]
            s["n"] += 1
            if r.qualificador in ("<", ">"):  # conta pelo laudo, mesmo quando o ponto é omitido do gráfico
                s["abaixo_ld" if r.qualificador == "<" else "acima_ld"] += 1
            if sit in ("omitido", "sem_valor"):
                s[sit] += 1
            amostras[r.amostra_id]["valores"][chave] = {"y": y, "texto": r.valor_texto if r.qualificador != "=" else f"{r.valor_num:g}",
                                                        "situacao": sit, "unidade": r.unidade, "certificado": cert}
    if f.teor_analito and (f.teor_min is not None or f.teor_max is not None):
        def passa(a: dict) -> bool:
            val = a["valores"].get(f.teor_analito)
            if not val or val["y"] is None:
                return False
            return (f.teor_min is None or val["y"] >= f.teor_min) and (f.teor_max is None or val["y"] <= f.teor_max)
        amostras = {k: a for k, a in amostras.items() if passa(a)}

    avisos = []
    for chave, s in resumo.items():
        if chave != s["analito"]:
            avisos.append(f"{s['analito']} aparece em unidades diferentes ({chave}): séries separadas, sem conversão.")
    series = []
    for an in analitos:
        for chave, s in resumo.items():
            if s["analito"] == an:
                ys = [a["valores"][chave]["y"] for a in amostras.values() if chave in a["valores"] and a["valores"][chave]["y"] is not None]
                series.append({"chave": chave, **s, "min": min(ys) if ys else None, "max": max(ys) if ys else None, "pontos": len(ys)})
        if not any(s["analito"] == an for s in resumo.values()):
            series.append({"chave": an, "analito": an, "unidade": None, "n": 0, "pontos": 0, "min": None, "max": None})

    return {"unidade": {"id": str(un.id), "codigo": un.codigo, "nome": un.nome},
            "referencia": {"tipo": "eixo" if usar_eixo else "amostras", "eixo_versao": v.numero if v else None, "tem_eixo": v is not None,
                           "inicio": inicio, "comprimento_m": round(comprimento, 2), "invertido": inverter, "percurso": percurso,
                           "pontos": len({d[2] for d in dist.values()}), "saltos": saltos, "irregular": irregular, "srid": mina.srid_trabalho},
            "regra_ld": regra_ld, "regra_ld_descricao": REGRAS_LD[regra_ld], "series": series, "avisos": avisos,
            "amostras": sorted(amostras.values(), key=lambda a: (a["chainage_m"], a["secao_de_m"] or 0, a["codigo"])),
            "sem_posicao": sorted(sem_posicao, key=lambda s: s["codigo"])}


def csv_serie(d: dict) -> str:
    chaves = [s["chave"] for s in d["series"] if s.get("unidade")]
    buf = io.StringIO()
    w = csv.writer(buf, delimiter=";")
    r = d["referencia"]
    ref = f"eixo desenhado v{r['eixo_versao']}" if r["tipo"] == "eixo" else "caminho pelas amostras"
    w.writerow([f"# {d['unidade']['codigo']} — distância ao longo da galeria ({ref}, {r['comprimento_m']} m; 0 m = {r['inicio']}); "
                f"abaixo do limite: {d['regra_ld_descricao']}"])
    w.writerow(["amostra", "ponto", "distancia_m", "distancia_eixo_m", "data", "litologia", "alteracao", "mineralizacao", "responsavel", "campanha", "ficha"]
               + [f"{c} (texto)" for c in chaves] + [f"{c} (grafico)" for c in chaves])
    num = lambda x: "" if x is None else str(x).replace(".", ",")  # noqa: E731
    for a in d["amostras"]:
        nome = lambda t: t["nome"] if t else ""  # noqa: E731
        w.writerow([a["codigo"], a["ponto"], num(a["chainage_m"]), num(a["afastamento_m"]), a["data"] or "", nome(a["litologia"]), nome(a["alteracao"]),
                    nome(a["mineralizacao"]), a["responsavel"] or "", a["campanha"] or "", a["ficha"] or ""]
                   + [a["valores"].get(c, {}).get("texto", "") for c in chaves] + [num(a["valores"].get(c, {}).get("y")) for c in chaves])
    return buf.getvalue()
