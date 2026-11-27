"""Leitura da descrição geológica dos furos: ocorrências (esmeralda, molibdenita, água…), tipo do furo, cotas e grupos de analitos."""

from __future__ import annotations

import math
import re
import unicodedata

# ocorrência → palavras procuradas na descrição (sem acento, minúsculas)
OCORRENCIAS: dict[str, tuple[str, ...]] = {
    "esmeralda": ("esmeralda", "berilo verde"),
    "berilo": ("berilo",),
    "molibdenita": ("molibdenita",),
    "agua": ("agua", "surgencia", "nivel d", "umido", "encharcad"),
    "carbonato": ("carbonato", "calcita", "dolomita"),
    "sulfeto": ("sulfeto", "pirita", "calcopirita", "pirrotita"),
    "perda": ("nao recuperado", "sem recuperacao", "perda de testemunho", "perda de recuperacao"),
}
ROTULO_OCORRENCIA = {"esmeralda": "Esmeralda", "berilo": "Berilo", "molibdenita": "Molibdenita", "agua": "Água",
                     "carbonato": "Carbonato", "sulfeto": "Sulfetos", "perda": "Não recuperado"}
# materiais de superfície marcados pela descrição/litologia (furo inteiro, da boca ao fim)
MATERIAIS = {"solo": ("solo",), "saprolito": ("saprolito", "saprólito"), "nao_recuperado": ("nao recuperado", "sem recuperacao")}


def _plano(texto: str | None) -> str:
    t = unicodedata.normalize("NFKD", texto or "").encode("ascii", "ignore").decode().lower()
    return re.sub(r"\s+", " ", t)


def ocorrencias(*textos: str | None, marca_esmeralda: bool | None = None) -> list[str]:
    """Ocorrências citadas na descrição. ``marca_esmeralda`` (marca feita à mão) prevalece sobre a leitura do texto."""
    t = " ".join(_plano(x) for x in textos if x)
    achadas = []
    for oc, palavras in OCORRENCIAS.items():
        if any(re.search(r"(?<![a-z])" + re.escape(p), t) for p in palavras):
            if oc == "esmeralda" and re.search(r"(sem|nao ha|ausencia de|nenhuma) esmeralda", t):
                continue
            achadas.append(oc)
    if "esmeralda" in achadas and "berilo" in achadas:
        achadas.remove("berilo")
    if marca_esmeralda is True and "esmeralda" not in achadas:
        achadas.insert(0, "esmeralda")
    if marca_esmeralda is False and "esmeralda" in achadas:
        achadas.remove("esmeralda")
    return achadas


def material(litologia: str | None, descricao: str | None) -> str | None:
    """solo / saprolito / nao_recuperado quando o trecho é material de superfície ou perda (para colorir o testemunho)."""
    t = _plano(f"{litologia or ''} {descricao or ''}")
    for m, palavras in MATERIAIS.items():
        if any(_plano(p) in t for p in palavras):
            return m
    return None


def tipo_furo(codigo: str) -> str:
    """'ina' para furos de nível d'água (código começa com INA), 'exploratorio' para os demais (F…)."""
    return "ina" if _plano(codigo).replace(" ", "").startswith("ina") else "exploratorio"


def cota(z: float | None, inclinacao: float | None, profundidade: float) -> float | None:
    """Cota aproximada pela inclinação da boca (negativa = para baixo; sem inclinação, vertical). Sem Z, sem cota."""
    if z is None:
        return None
    inc = -90.0 if inclinacao is None else inclinacao
    return round(z + profundidade * math.sin(math.radians(inc)), 2)


def classe_rqd(rqd: float | None) -> str | None:
    if rqd is None:
        return None
    if rqd >= 90:
        return "excelente"
    if rqd >= 75:
        return "bom"
    if rqd >= 50:
        return "razoavel"
    if rqd >= 25:
        return "ruim"
    return "muito_ruim"


def grupo_unidade(unidade: str | None) -> str:
    u = (unidade or "").strip().lower()
    if u == "ppm":
        return "ppm"
    if u == "%":
        return "%"
    if u == "ppb":
        return "ppb"
    return "outras"


NOME_FOTO = re.compile(
    r"^(?P<furo>[A-Za-z]{1,5}[\s_-]?\d+[A-Za-z]?)"            # F310, INA07, F-310, F310A
    r"(?:[\s_-]+(?:cx|caixa|box)[\s_-]?(?P<caixa>\d+[A-Za-z]?))?"  # _CX29
    r"(?:[\s_-]+(?P<de>\d+(?:[.,]\d+)?)\s*(?:m)?\s*(?:-|a|_|to)\s*(?P<ate>\d+(?:[.,]\d+)?)\s*m?)?",
    re.IGNORECASE)


def ler_nome_foto(nome: str) -> dict:
    """Furo, caixa e De–Até a partir do nome do arquivo (ex.: F310_CX29_136,6-137,2.jpg, INA07 cx2 12,4-15,3.jpg)."""
    base = nome.rsplit("/", 1)[-1].rsplit(".", 1)[0].strip()
    m = NOME_FOTO.match(base)
    if not m:
        return {"furo": None, "caixa": None, "de": None, "ate": None}
    furo = re.sub(r"[\s_-]", "", m.group("furo")).upper()
    de = float(m.group("de").replace(",", ".")) if m.group("de") else None
    ate = float(m.group("ate").replace(",", ".")) if m.group("ate") else None
    if de is not None and ate is not None and ate <= de:
        de = ate = None
    return {"furo": furo, "caixa": m.group("caixa"), "de": de, "ate": ate}
