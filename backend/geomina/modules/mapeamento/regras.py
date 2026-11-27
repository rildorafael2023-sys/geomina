"""Regras puras (sem banco) do mapeamento: orientações, intervalos e códigos de amostra."""

from __future__ import annotations

import re
from dataclasses import dataclass


class ErroRegra(ValueError):
    pass


# ------------------------------------------------------------------ orientações
CONVENCOES_PLANO = ("dipdir_dip", "strike_rhr_dip")


def normalizar_azimute(a: float) -> float:
    """0 ≤ a < 360 (360 vira 0)."""
    if a < 0 or a > 360:
        raise ErroRegra(f"Azimute {a:g}° fora do intervalo 0–360°.")
    return 0.0 if a == 360 else float(a)


def plano(a: float, b: float, convencao: str) -> tuple[float, float]:
    """Retorna (direção de mergulho, mergulho).

    - ``dipdir_dip``: a = direção de mergulho, b = mergulho (convenção usada na mina, ex.: 230/30);
    - ``strike_rhr_dip``: a = direção (rumo) pela regra da mão direita, b = mergulho → dipdir = rumo + 90.
    """
    if not 0 <= b <= 90:
        raise ErroRegra(f"Mergulho {b:g}° fora do intervalo 0–90°.")
    a = normalizar_azimute(a)
    if convencao == "dipdir_dip":
        return a, float(b)
    if convencao == "strike_rhr_dip":
        return (a + 90.0) % 360.0, float(b)
    raise ErroRegra(f"Convenção de plano desconhecida: {convencao}.")


def linha(trend: float, plunge: float) -> tuple[float, float]:
    if not 0 <= plunge <= 90:
        raise ErroRegra(f"Caimento {plunge:g}° fora do intervalo 0–90°.")
    return normalizar_azimute(trend), float(plunge)


# ------------------------------------------------------------------ intervalos
@dataclass
class Faixa:
    de: float
    ate: float
    rotulo: str


def verificar_intervalos(faixas: list[Faixa], altura: float | None = None) -> list[str]:
    """Erros (sobreposição) levantam ErroRegra; lacunas e excesso de altura viram avisos."""
    avisos: list[str] = []
    ordenadas = sorted(faixas, key=lambda f: f.de)
    for f in ordenadas:
        if f.de < 0 or f.ate <= f.de:
            raise ErroRegra(f"Intervalo {f.rotulo}: 'até' ({f.ate:g} m) deve ser maior que 'de' ({f.de:g} m).")
    for a, b in zip(ordenadas, ordenadas[1:], strict=False):
        if b.de < a.ate - 1e-9:
            raise ErroRegra(f"Intervalos sobrepostos: {a.rotulo} ({a.de:g}–{a.ate:g} m) e "
                            f"{b.rotulo} ({b.de:g}–{b.ate:g} m).")
        if b.de > a.ate + 1e-9:
            avisos.append(f"Lacuna sem descrição entre {a.ate:g} m e {b.de:g} m.")
    if ordenadas and ordenadas[0].de > 1e-9:
        avisos.append(f"A seção começa em {ordenadas[0].de:g} m (sem descrição a partir de 0 m).")
    if altura and ordenadas and ordenadas[-1].ate > altura + 1e-9:
        avisos.append(f"A seção descrita ({ordenadas[-1].ate:g} m) passa da altura informada ({altura:g} m).")
    return avisos


# ------------------------------------------------------------------ códigos de amostra
# Regras informadas pelo usuário (2026-11-25): BS-RP = amostragem de mina; BMT-TS = testemunho de
# sondagem; BE = amostras antigas (BE-01-nnn). Em 2026-11-27 o usuário pediu o banco completo: códigos de
# outras séries (solo, FSR, ANA, BGS…) também são aceitos, como estão escritos, com aviso.
PADROES = {
    "BS-RP": re.compile(r"^BS-RP-(\d+)([A-Z]{0,3})$"),
    "BMT-TS": re.compile(r"^BMT-TS-(\d+)([A-Z]{0,3})$"),
    "BE": re.compile(r"^BE-?[A-Z0-9][A-Z0-9-]*$"),
}
BE_01 = re.compile(r"^BE-?0?1-(\d+)-?([A-Z]{0,3})$")
OUTRO = re.compile(r"^[A-Z0-9*#][A-Z0-9.\-_*#+]*$")
TAMANHO_MAX = 30


@dataclass
class CodigoAmostra:
    original: str
    codigo: str | None  # forma canônica, se reconhecida sem ambiguidade
    sugestao: str | None  # quando há uma interpretação provável que exige confirmação
    aviso: str | None


def normalizar_codigo(texto: str) -> CodigoAmostra:
    """Forma canônica sem espaços: 'BS - RP - 237 - B' → 'BS-RP-237B'; 'Be-01-158' → 'BE-01-158'.

    'RP 478' (sem o prefixo BS) não é convertido sozinho: vira sugestão a confirmar.
    Códigos de outras séries (ex.: 'T1-034', 'FSR-12') são aceitos como estão, com aviso.
    """
    bruto = (texto or "").strip().upper()
    t = re.sub(r"\s*-\s*", "-", bruto)
    t = re.sub(r"\s*/\s*", "-", t)
    t = re.sub(r"\s+", "-", t)
    # sufixo de letra separado ("237-B") junta-se ao número
    t = re.sub(r"^((?:BS-RP|BMT-TS)-\d+)-([A-Z]{1,3})$", r"\1\2", t)
    m = BE_01.match(t)
    if m:
        t = f"BE-01-{int(m.group(1)):03d}{m.group(2)}"
    for prefixo, padrao in PADROES.items():
        if padrao.match(t) and len(t) <= TAMANHO_MAX:
            aviso = "Código de amostra antiga (BE)." if prefixo == "BE" else None
            return CodigoAmostra(texto, t, None, aviso)
    m = re.match(r"^RP-?(\d+)([A-Z]{0,3})$", t)
    if m:
        sug = f"BS-RP-{m.group(1)}{m.group(2)}"
        return CodigoAmostra(texto, None, sug, f"'{texto}' parece ser {sug}; confirme o código completo.")
    if OUTRO.match(t) and len(t) <= TAMANHO_MAX and re.search(r"[A-Z]", t) and re.search(r"\d", t):
        return CodigoAmostra(texto, t, None, f"'{t}' não é das séries BS-RP, BMT-TS ou BE: cadastrado como está.")
    return CodigoAmostra(texto, None, None,
                         f"'{texto}' não é um código de amostra válido (use letras e números, até {TAMANHO_MAX} caracteres).")


def serie_de_codigo(codigo: str) -> str:
    """Série = prefixo do código: 'BS-RP-12' → 'BS-RP'; 'T1-034' → 'T'; 'ANA-CP-3' → 'ANA-CP'."""
    for s in ("BS-RP", "BMT-TS", "BE"):
        if codigo.startswith(s):
            return s
    m = re.search(r"([A-Z]+(?:-[A-Z]+)*)", codigo)
    return (m.group(1)[:10].rstrip("-") if m else "") or "OUTRA"
