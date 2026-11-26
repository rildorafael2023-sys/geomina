"""Chainage 3D (DT-006): distância acumulada AO LONGO do eixo, nunca em linha reta entre pontos.

Inclui a inclinação (rampas): cada segmento conta √(Δx²+Δy²+Δz²).
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np


@dataclass
class Projecao:
    chainage: float  # distância ao longo do eixo até o pé da projeção (m)
    afastamento: float  # distância 3D do ponto ao eixo (m)
    segmento: int
    ambigua: bool  # outro trecho do eixo, distante em chainage, está quase à mesma distância
    alternativa: float | None


def comprimentos(vertices: np.ndarray) -> np.ndarray:
    """Chainage de cada vértice (0 no primeiro)."""
    v = np.asarray(vertices, dtype=float)
    if v.ndim != 2 or len(v) < 2:
        raise ValueError("O eixo precisa de pelo menos 2 vértices.")
    d = np.linalg.norm(np.diff(v, axis=0), axis=1)
    return np.concatenate([[0.0], np.cumsum(d)])


def comprimento_2d(vertices: np.ndarray) -> float:
    v = np.asarray(vertices, dtype=float)[:, :2]
    return float(np.linalg.norm(np.diff(v, axis=0), axis=1).sum())


def projetar(vertices: np.ndarray, ponto, tolerancia_ambiguidade: float = 0.5) -> Projecao:
    v3 = np.asarray(vertices, dtype=float)
    p = np.asarray(ponto, dtype=float)
    acum = comprimentos(v3)  # o chainage é sempre medido em 3D ao longo do eixo
    # Ponto sem cota (2D): a projeção é feita em planta, mas o chainage continua 3D.
    v = v3[:, :2] if p.shape[0] == 2 else v3
    if v.shape[1] != p.shape[0]:
        raise ValueError("Ponto e eixo com dimensões incompatíveis.")
    a, b = v[:-1], v[1:]
    ab = b - a
    l2 = (ab * ab).sum(axis=1)
    t = np.where(l2 > 0, ((p - a) * ab).sum(axis=1) / np.where(l2 > 0, l2, 1), 0.0).clip(0, 1)
    pe = a + ab * t[:, None]
    dist = np.linalg.norm(pe - p, axis=1)
    ch = acum[:-1] + t * np.diff(acum)
    k = int(np.argmin(dist))
    # ambiguidade: segmento afastado em chainage (> 2 m) com distância quase igual
    outros = np.where((np.abs(ch - ch[k]) > 2.0) & (dist - dist[k] <= tolerancia_ambiguidade))[0]
    alt = float(ch[outros[np.argmin(dist[outros])]]) if len(outros) else None
    return Projecao(float(ch[k]), float(dist[k]), k, bool(len(outros)), alt)
