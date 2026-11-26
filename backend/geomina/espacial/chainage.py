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


@dataclass
class Percurso:
    """Caminho que segue a galeria passando pelos pontos de amostragem (quando não há eixo desenhado)."""

    ordem: list[int]            # índices dos pontos, do início ao fim
    distancia: list[float]      # distância acumulada (3D quando há cota nos dois pontos) de cada ponto, na ordem
    saltos: list[int]           # posições (na ordem) em que o trecho é bem maior que o espaçamento típico


def percurso_pelos_pontos(pontos: list[list[float]], inicio: int | None = None) -> Percurso:
    """Ordena os pontos ao longo da galeria: parte de uma extremidade e segue sempre para o vizinho mais próximo.

    Extremidades = par de pontos mais distantes em planta. `inicio` escolhe a extremidade de partida (índice do ponto);
    se não for uma extremidade, é usado mesmo assim. A distância de cada trecho é 3D quando os dois pontos têm cota.
    """
    n = len(pontos)
    if n == 0:
        return Percurso([], [], [])
    xy = np.array([[p[0], p[1]] for p in pontos], dtype=float)
    if inicio is None:
        c = xy.mean(axis=0)
        a = int(np.argmax(np.linalg.norm(xy - c, axis=1)))
        inicio = a
    restantes = set(range(n)) - {inicio}
    ordem = [inicio]
    while restantes:
        ult = xy[ordem[-1]]
        prox = min(restantes, key=lambda i: (float(np.hypot(*(xy[i] - ult))), i))
        ordem.append(prox)
        restantes.remove(prox)
    dist, trechos = [0.0], []
    for a, b in zip(ordem, ordem[1:], strict=False):
        pa, pb = pontos[a], pontos[b]
        if len(pa) > 2 and len(pb) > 2 and pa[2] is not None and pb[2] is not None:
            d = float(np.linalg.norm(np.array(pb[:3], float) - np.array(pa[:3], float)))
        else:
            d = float(np.hypot(pb[0] - pa[0], pb[1] - pa[1]))
        trechos.append(d)
        dist.append(dist[-1] + d)
    saltos = []
    if len(trechos) >= 4:
        tipico = float(np.median(trechos))
        saltos = [i + 1 for i, d in enumerate(trechos) if tipico > 0 and d > 4 * tipico and d > 20]
    return Percurso(ordem, dist, saltos)


def extremidades(pontos: list[list[float]]) -> tuple[int, int]:
    """Os dois pontos mais distantes em planta (as pontas da galeria amostrada)."""
    xy = np.array([[p[0], p[1]] for p in pontos], dtype=float)
    if len(xy) < 2:
        return 0, 0
    a = int(np.argmax(np.linalg.norm(xy - xy.mean(axis=0), axis=1)))
    b = int(np.argmax(np.linalg.norm(xy - xy[a], axis=1)))
    return a, b
