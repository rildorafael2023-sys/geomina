"""Estatística descritiva e correlação para a comparação de grupos (sempre sobre os registros efetivamente selecionados)."""

from __future__ import annotations

import math

import numpy as np


def descrever(valores: list[float]) -> dict:
    """n, mín, quartis (interpolação linear, igual ao Excel QUARTIL.INC), mediana, média, desvio-padrão amostral e CV."""
    v = np.asarray([x for x in valores if x is not None and math.isfinite(x)], dtype=float)
    if not len(v):
        return {"n": 0}
    q1, med, q3 = (float(np.percentile(v, p)) for p in (25, 50, 75))
    media = float(v.mean())
    dp = float(v.std(ddof=1)) if len(v) > 1 else None
    return {"n": int(len(v)), "min": float(v.min()), "q1": q1, "mediana": med, "q3": q3, "max": float(v.max()), "media": media,
            "desvio": dp, "cv": (dp / media * 100) if dp is not None and media else None,
            "media_geometrica": float(np.exp(np.log(v).mean())) if (v > 0).all() else None}


def _postos(a: np.ndarray) -> np.ndarray:
    """Postos médios para empates (Spearman)."""
    ordem = a.argsort(kind="mergesort")
    r = np.empty(len(a))
    r[ordem] = np.arange(1, len(a) + 1)
    for val in np.unique(a):
        m = a == val
        if m.sum() > 1:
            r[m] = r[m].mean()
    return r


def correlacao(x: list[float], y: list[float]) -> dict:
    """Pearson e Spearman com os pares em que os dois valores existem. Menos de 3 pares → sem coeficiente."""
    pares = [(a, b) for a, b in zip(x, y, strict=True) if a is not None and b is not None and math.isfinite(a) and math.isfinite(b)]
    if len(pares) < 3:
        return {"n": len(pares), "pearson": None, "spearman": None}
    a, b = np.array(pares, dtype=float).T
    if a.std() == 0 or b.std() == 0:
        return {"n": len(pares), "pearson": None, "spearman": None}
    p = float(np.corrcoef(a, b)[0, 1])
    s = float(np.corrcoef(_postos(a), _postos(b))[0, 1])
    return {"n": len(pares), "pearson": round(p, 4), "spearman": round(s, 4)}
