"""Trajetória de furo de sondagem.

Convenções (explícitas na importação e na tela):
- azimute: graus a partir do norte, sentido horário (0–360), no norte da quadrícula da mina (se o survey for magnético,
  a declinação informada no furo é somada antes do cálculo);
- inclinação: graus em relação à HORIZONTAL; negativo = para baixo (−90 = vertical descendente; +30 = ascendente,
  comum em furos de subsolo).

Com survey (2+ estações): método da **curvatura mínima** (padrão da indústria). Sem survey, ou só com a orientação do
collar: trajetória **reta estimada** a partir do azimute/inclinação do collar — sempre marcada como estimada.
"""

from __future__ import annotations

import math
from dataclasses import dataclass

import numpy as np


@dataclass
class Trajetoria:
    profundidades: np.ndarray   # profundidade ao longo do furo de cada estação (m)
    xyz: np.ndarray             # (n, 3) coordenadas de cada estação
    direcoes: np.ndarray        # (n, 3) vetor unitário da direção do furo em cada estação
    estimada: bool
    motivo: str                 # como foi obtida


def vetor(azimute: float, inclinacao: float) -> np.ndarray:
    az, inc = math.radians(azimute), math.radians(inclinacao)
    return np.array([math.cos(inc) * math.sin(az), math.cos(inc) * math.cos(az), math.sin(inc)])


def calcular(collar: tuple[float, float, float], azimute: float | None, inclinacao: float | None, profundidade_final: float,
             survey: list[tuple[float, float, float]] | None = None, declinacao: float = 0.0) -> Trajetoria:
    """survey: [(profundidade, azimute, inclinação), …]. Devolve estações do collar (0 m) até a profundidade final."""
    est = sorted({round(p, 6): (p, a + declinacao, i) for p, a, i in (survey or [])}.values())
    real = len(est) >= 2
    if not est:
        if azimute is None or inclinacao is None:
            raise ValueError("Sem survey e sem azimute/inclinação do collar: não há como desenhar a trajetória.")
        est = [(0.0, azimute + declinacao, inclinacao)]
        motivo = "estimada: sem survey, reta pela orientação do collar"
    elif len(est) == 1:
        motivo = "estimada: survey com uma única medida, reta por ela"
    else:
        motivo = f"curvatura mínima com {len(est)} medidas de survey"
    if est[0][0] > 0:  # orientação na boca = primeira medida (ou a do collar, se informada)
        a0, i0 = (azimute + declinacao, inclinacao) if azimute is not None and inclinacao is not None else est[0][1:]
        est.insert(0, (0.0, a0, i0))
    if est[-1][0] < profundidade_final:  # prolonga a última direção até o fundo
        est.append((profundidade_final, est[-1][1], est[-1][2]))
    prof = np.array([e[0] for e in est])
    dirs = np.vstack([vetor(a, i) for _, a, i in est])
    pts = [np.array(collar, dtype=float)]
    for k in range(len(est) - 1):
        pts.append(pts[-1] + _passo(dirs[k], dirs[k + 1], prof[k + 1] - prof[k], 1.0))
    return Trajetoria(prof, np.vstack(pts), dirs, estimada=not real, motivo=motivo)


def _slerp(v1: np.ndarray, v2: np.ndarray, f: float) -> np.ndarray:
    beta = math.acos(max(-1.0, min(1.0, float(v1 @ v2))))
    if beta < 1e-9:
        return v1
    return (math.sin((1 - f) * beta) * v1 + math.sin(f * beta) * v2) / math.sin(beta)


def _passo(v1: np.ndarray, v2: np.ndarray, md: float, f: float) -> np.ndarray:
    """Deslocamento da curvatura mínima entre a estação (direção v1) e a fração f do arco até v2 (f=1: estação seguinte)."""
    vf = _slerp(v1, v2, f)
    beta = math.acos(max(-1.0, min(1.0, float(v1 @ vf))))
    rf = 1.0 if beta < 1e-9 else 2 / beta * math.tan(beta / 2)
    return md * f / 2 * (v1 + vf) * rf


def posicao(t: Trajetoria, profundidade: float) -> np.ndarray:
    """XYZ numa profundidade qualquer, sobre o próprio arco da curvatura mínima entre as estações."""
    p = float(np.clip(profundidade, t.profundidades[0], t.profundidades[-1]))
    k = int(np.searchsorted(t.profundidades, p, side="right")) - 1
    k = min(max(k, 0), len(t.profundidades) - 2)
    p1, p2 = t.profundidades[k], t.profundidades[k + 1]
    if p2 == p1:
        return t.xyz[k].copy()
    return t.xyz[k] + _passo(t.direcoes[k], t.direcoes[k + 1], p2 - p1, (p - p1) / (p2 - p1))


def densificar(t: Trajetoria, passo: float = 5.0) -> np.ndarray:
    """Pontos a cada `passo` metros, sobre o arco (para desenhar a curva)."""
    ps = np.unique(np.concatenate([np.arange(0, t.profundidades[-1], passo), t.profundidades]))
    return np.vstack([posicao(t, p) for p in ps])
