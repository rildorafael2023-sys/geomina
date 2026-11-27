"""Importação de sondagem (CSV/Excel) em duas fases: leitura + validação (nada gravado) e confirmação.

Arquivos (todos opcionais, pelo menos um): collar, survey, geologia (intervalos), amostras (intervalos de amostragem).
Cabeçalhos reconhecidos em português e inglês (ex.: furo/hole_id/bhid, de/from, ate/to, azimute/azimuth, inclinacao/dip).
"""

from __future__ import annotations

import csv
import io
from collections import defaultdict
from pathlib import Path

import openpyxl

from geomina.modules.amostragem.planilha import data_valor, numero
from geomina.modules.dicionarios.models import normalizar
from geomina.modules.mapeamento.regras import normalizar_codigo

ALIASES = {
    "furo": ["furo", "hole", "hole id", "holeid", "hole_id", "bhid", "id furo", "id do furo", "sondagem", "codigo do furo", "furo id"],
    "x": ["x", "east", "este", "leste", "easting", "coord x", "coordenada x", "e"],
    "y": ["y", "north", "norte", "northing", "coord y", "coordenada y", "n"],
    "z": ["z", "rl", "cota", "elev", "elevation", "elevacao", "coord z", "coordenada z"],
    "azimute": ["azimute", "azimuth", "az", "azi", "rumo"],
    "inclinacao": ["inclinacao", "dip", "inc", "inclination", "mergulho"],
    "profundidade": ["profundidade", "prof", "depth", "eoh", "max depth", "maxdepth", "profundidade final", "comprimento", "length", "at", "prof (m)"],
    "profundidade_planejada": ["profundidade planejada", "planned depth", "prof planejada"],
    "projeto": ["projeto", "project", "prospect"],
    "area": ["area", "alvo", "target", "zona"],
    "data_inicio": ["data", "data inicio", "inicio", "start date", "date", "data de inicio"],
    "data_fim": ["data fim", "fim", "end date", "data final", "data de termino"],
    "responsavel": ["responsavel", "geologo", "logged by", "logger", "descrito por"],
    "metodo": ["metodo", "method", "tipo de perfuracao", "drill type", "sonda", "metodo de perfuracao"],
    "descricao": ["descricao", "description", "descricao geologica", "comentario", "comments"],
    "de": ["de", "from", "de (m)", "from (m)", "prof de", "inicio (m)"],
    "ate": ["ate", "to", "ate (m)", "to (m)", "prof ate", "fim (m)"],
    "litologia": ["litologia", "lith", "lithology", "rocha", "lito"],
    "alteracao": ["alteracao", "alteration", "alt"],
    "mineralizacao": ["mineralizacao", "mineralization", "min", "mineralisation"],
    "estruturas": ["estruturas", "estrutura", "structure", "structures"],
    "observacoes": ["observacoes", "observacao", "obs", "notes", "comentarios"],
    "amostra": ["amostra", "sample", "sample id", "sampleid", "codigo amostra", "id amostra", "codigo da amostra", "sample_id"],
    "tipo": ["tipo", "tipo de amostra", "sample type", "type"],
    "rqd": ["rqd", "rqd (%)", "rqd %"],
    "recuperacao": ["recuperacao", "recuperacao (%)", "rec", "rec (%)", "recovery", "recovery (%)"],
    "caixa": ["caixa", "cx", "box", "n caixa", "numero da caixa"],
}
MAPA = {normalizar(a): campo for campo, lista in ALIASES.items() for a in lista}
OBRIGATORIOS = {"collar": {"furo", "x", "y", "z", "profundidade"}, "survey": {"furo", "profundidade", "azimute", "inclinacao"},
                "geologia": {"furo", "de", "ate"}, "amostras": {"furo", "amostra", "de", "ate"}}
CONVENCOES = {
    "horizontal_negativo": "graus da horizontal, negativo = para baixo (−60 = 60° abaixo da horizontal)",
    "horizontal_positivo": "graus da horizontal, positivo = para baixo (60 = 60° abaixo da horizontal)",
    "vertical": "graus a partir da vertical para baixo (0 = vertical descendente, 90 = horizontal)",
}


class ArquivoInvalido(ValueError):
    pass


def converter_inclinacao(v: float, convencao: str) -> float:
    if convencao == "horizontal_positivo":
        return -v
    if convencao == "vertical":
        return v - 90
    return v


def ler(dados: bytes, nome: str, tipo: str) -> tuple[list[str], list[tuple[int, dict]]]:
    """(campos reconhecidos, [(nº da linha, {campo: valor})])."""
    ext = Path(nome).suffix.lower()
    if ext in (".xlsx", ".xlsm"):
        wb = openpyxl.load_workbook(io.BytesIO(dados), read_only=True, data_only=True)
        brutas = [list(r) for r in wb.worksheets[0].iter_rows(values_only=True)]
        wb.close()
    elif ext in (".csv", ".txt"):
        try:
            texto = dados.decode("utf-8-sig")
        except UnicodeDecodeError:
            texto = dados.decode("latin-1")
        dialeto = csv.Sniffer().sniff(texto[:5000], delimiters=";,\t")
        brutas = [list(r) for r in csv.reader(io.StringIO(texto), dialeto)]
    else:
        raise ArquivoInvalido(f"{nome}: use Excel (.xlsx) ou CSV.")
    for i, linha in enumerate(brutas[:20]):
        campos = [MAPA.get(normalizar(str(c))) if c not in (None, "") else None for c in linha]
        if OBRIGATORIOS[tipo] <= set(campos):
            linhas = []
            for k, r in enumerate(brutas[i + 1:], start=i + 2):
                v = {c: (x.strip() if isinstance(x, str) else x) for c, x in zip(campos, r, strict=False) if c}
                v = {c: (None if x == "" else x) for c, x in v.items()}
                if any(x is not None for x in v.values()):
                    linhas.append((k, v))
            return [c for c in campos if c], linhas
    faltam = ", ".join(sorted(OBRIGATORIOS[tipo]))
    raise ArquivoInvalido(f"{nome}: não encontrei o cabeçalho do arquivo de {tipo} (colunas necessárias: {faltam}).")


def analisar(arquivos: dict[str, tuple[bytes, str]], convencao: str, existentes: set[str], profundidades_existentes: dict[str, float],
             reconhecer_termo) -> dict:
    """Lê e valida. `existentes`: códigos de furo já cadastrados; `reconhecer_termo(dicionario, texto)` → (id, nome) ou None."""
    erros: list[dict] = []
    avisos: list[dict] = []
    dados: dict = {"collar": [], "survey": [], "geologia": [], "amostras": []}

    def erro(arq, linha, msg):
        erros.append({"arquivo": arq, "linha": linha, "mensagem": msg})

    def aviso(arq, linha, msg):
        avisos.append({"arquivo": arq, "linha": linha, "mensagem": msg})

    lidos = {t: ler(b, n, t) for t, (b, n) in arquivos.items()}
    # ---- collar
    vistos = set()
    for k, v in lidos.get("collar", ([], []))[1]:
        furo = str(v.get("furo") or "").strip().upper()
        if not furo:
            erro("collar", k, "furo sem código")
            continue
        if furo in vistos:
            erro("collar", k, f"furo {furo} repetido no arquivo")
            continue
        vistos.add(furo)
        if furo in existentes:
            erro("collar", k, f"furo {furo} já está cadastrado (não é sobrescrito)")
            continue
        x, y, z, prof = (numero(v.get(c)) for c in ("x", "y", "z", "profundidade"))
        az = numero(v.get("azimute"))
        inc_b = numero(v.get("inclinacao"))
        inc = converter_inclinacao(inc_b, convencao) if inc_b is not None else None
        falta = [c for c, val in (("X", x), ("Y", y), ("Z", z), ("profundidade final", prof)) if val is None]
        if falta:
            erro("collar", k, f"{furo}: falta {', '.join(falta)}")
            continue
        if prof <= 0:
            erro("collar", k, f"{furo}: profundidade final deve ser maior que zero")
            continue
        if az is not None and not 0 <= az < 360:
            erro("collar", k, f"{furo}: azimute {az} fora de 0–360")
            continue
        if inc is not None and not -90 <= inc <= 90:
            erro("collar", k, f"{furo}: inclinação {inc_b} fora da faixa na convenção escolhida")
            continue
        if az is None or inc is None:
            aviso("collar", k, f"{furo}: sem azimute/inclinação no collar — a trajetória dependerá do survey")
        if inc is not None and inc > 0:
            aviso("collar", k, f"{furo}: furo ascendente (inclinação {inc:+.0f}°) — confira se é furo de subsolo")
        dados["collar"].append({"linha": k, "furo": furo, "x": x, "y": y, "z": z, "azimute": az, "inclinacao": inc, "profundidade_final": prof,
                                "profundidade_planejada": numero(v.get("profundidade_planejada")), "projeto": _txt(v.get("projeto")),
                                "area": _txt(v.get("area")), "data_inicio": _data(v.get("data_inicio")), "data_fim": _data(v.get("data_fim")),
                                "responsavel": _txt(v.get("responsavel")), "metodo": _txt(v.get("metodo")), "descricao": _txt(v.get("descricao"))})
    prof_final = {**profundidades_existentes, **{c["furo"]: c["profundidade_final"] for c in dados["collar"]}}
    conhecidos = set(prof_final)

    def furo_de(arq, k, v) -> str | None:
        f = str(v.get("furo") or "").strip().upper()
        if not f:
            erro(arq, k, "linha sem código do furo")
            return None
        if f not in conhecidos:
            erro(arq, k, f"furo {f} não está no collar nem cadastrado")
            return None
        return f

    # ---- survey
    por_furo: dict = defaultdict(set)
    for k, v in lidos.get("survey", ([], []))[1]:
        f = furo_de("survey", k, v)
        if not f:
            continue
        p, az, inc_b = numero(v.get("profundidade")), numero(v.get("azimute")), numero(v.get("inclinacao"))
        if p is None or az is None or inc_b is None:
            erro("survey", k, f"{f}: profundidade, azimute e inclinação são obrigatórios")
            continue
        inc = converter_inclinacao(inc_b, convencao)
        if p < 0 or p > prof_final[f] + 0.01:
            erro("survey", k, f"{f}: survey a {p} m fora do furo (0–{prof_final[f]} m)")
            continue
        if not 0 <= az < 360 or not -90 <= inc <= 90:
            erro("survey", k, f"{f}: azimute/inclinação fora da faixa ({az}, {inc_b})")
            continue
        if p in por_furo[f]:
            erro("survey", k, f"{f}: duas medidas a {p} m")
            continue
        por_furo[f].add(p)
        dados["survey"].append({"linha": k, "furo": f, "profundidade": p, "azimute": az, "inclinacao": inc, "metodo": _txt(v.get("metodo"))})

    # ---- intervalos (geologia e amostras): de < até, dentro do furo, sem sobreposição
    def intervalos(tipo: str):
        grupos: dict = defaultdict(list)
        for k, v in lidos.get(tipo, ([], []))[1]:
            f = furo_de(tipo, k, v)
            if not f:
                continue
            de, ate = numero(v.get("de")), numero(v.get("ate"))
            if de is None or ate is None:
                erro(tipo, k, f"{f}: de/até obrigatórios")
                continue
            if de < 0 or ate <= de:
                erro(tipo, k, f"{f}: intervalo inválido {de}–{ate} m (precisa de < até)")
                continue
            if ate > prof_final[f] + 0.01:
                erro(tipo, k, f"{f}: intervalo {de}–{ate} m passa da profundidade final ({prof_final[f]} m)")
                continue
            grupos[f].append((de, ate, k, v))
        saida = []
        for f, ints in grupos.items():
            ints.sort()
            anterior = None
            for de, ate, k, v in ints:
                if anterior and de < anterior[1] - 1e-6:
                    erro(tipo, k, f"{f}: intervalo {de}–{ate} m sobrepõe {anterior[0]}–{anterior[1]} m")
                    continue
                if tipo == "geologia" and anterior and de > anterior[1] + 1e-6:
                    aviso(tipo, k, f"{f}: lacuna sem descrição entre {anterior[1]} e {de} m")
                anterior = (de, ate)
                saida.append((f, de, ate, k, v))
        return saida

    for f, de, ate, k, v in intervalos("geologia"):
        item = {"linha": k, "furo": f, "de": de, "ate": ate, "estruturas": _txt(v.get("estruturas")), "descricao": _txt(v.get("descricao")),
                "observacoes": _txt(v.get("observacoes")), "atributos": {}}
        for campo in ("rqd", "recuperacao"):
            n = numero(v.get(campo))
            if n is not None:
                item["atributos"][campo] = n
        if _txt(v.get("caixa")):
            item["atributos"]["caixa"] = _txt(v.get("caixa"))
        for campo, dic in (("litologia", "LITOLOGIA"), ("alteracao", "ALTERACAO"), ("mineralizacao", "MINERALIZACAO")):
            t = _txt(v.get(campo))
            item[campo + "_id"] = None
            if t:
                r = reconhecer_termo(dic, t)
                if r:
                    item[campo + "_id"] = r[0]
                else:
                    item["atributos"][campo + "_original"] = t
                    aviso("geologia", k, f"{f}: {campo} '{t}' não está no dicionário — guardada como texto original")
        dados["geologia"].append(item)

    for f, de, ate, k, v in intervalos("amostras"):
        c = normalizar_codigo(str(v.get("amostra") or ""))
        if c.codigo is None:
            erro("amostras", k, f"{f}: {c.aviso}")
            continue
        dados["amostras"].append({"linha": k, "furo": f, "amostra": c.codigo, "de": de, "ate": ate, "observacoes": _txt(v.get("observacoes"))})
    codigos = [a["amostra"] for a in dados["amostras"]]
    for cod in {c for c in codigos if codigos.count(c) > 1}:
        erro("amostras", None, f"amostra {cod} aparece em mais de um intervalo")

    sem_trajetoria = set()
    for c in dados["collar"]:
        if c["furo"] not in por_furo and (c["azimute"] is None or c["inclinacao"] is None):
            erro("collar", c["linha"], f"{c['furo']}: sem survey e sem azimute/inclinação — não há como calcular a trajetória")
            sem_trajetoria.add(c["furo"])
        elif len(por_furo.get(c["furo"], ())) < 2:
            aviso("collar", c["linha"], f"{c['furo']}: sem survey suficiente — trajetória será ESTIMADA (reta)")
    if sem_trajetoria:  # o furo com erro não é gravado, nem o que depende dele
        for t in dados:
            fora = [x for x in dados[t] if x["furo"] in sem_trajetoria]
            if fora and t != "collar":
                erro(t, None, f"{len(fora)} linha(s) de {', '.join(sorted({x['furo'] for x in fora}))} não serão gravadas (furo com erro)")
            dados[t] = [x for x in dados[t] if x["furo"] not in sem_trajetoria]
    furos = sorted({c["furo"] for c in dados["collar"]} | {x["furo"] for t in ("survey", "geologia", "amostras") for x in dados[t]})
    resumo = [{"furo": f, "novo": f not in existentes, "surveys": len(por_furo.get(f, ())),
               "intervalos": sum(1 for x in dados["geologia"] if x["furo"] == f), "amostras": sum(1 for x in dados["amostras"] if x["furo"] == f)}
              for f in furos]
    return {"convencao": convencao, "convencao_descricao": CONVENCOES[convencao], "furos": resumo, "erros": erros, "avisos": avisos,
            "contagem": {t: len(dados[t]) for t in dados}, "linhas_lidas": {t: len(lidos[t][1]) for t in lidos}, "dados": dados}


def _txt(v) -> str | None:
    return None if v is None else str(v).strip() or None


def _data(v):
    d = data_valor(v)
    return d.isoformat() if d else None
