"""Trajetória de furo: casos calculados à mão (vertical, inclinado reto, curva, ascendente, declinação)."""

import math

import numpy as np
import pytest

from geomina.espacial import trajetoria as T

C = (500000.0, 7800000.0, 600.0)


def test_vertical_descendente():
    t = T.calcular(C, 0, -90, 100)
    assert t.estimada and "sem survey" in t.motivo
    assert np.allclose(t.xyz[-1], [C[0], C[1], C[2] - 100])
    assert np.allclose(T.posicao(t, 37.5), [C[0], C[1], C[2] - 37.5])


def test_inclinado_reto_az90_menos60():
    t = T.calcular(C, 90, -60, 100)
    # 100 m a −60°: horizontal = 50 m para leste, vertical = −86,603 m
    assert np.allclose(t.xyz[-1] - np.array(C), [50, 0, -100 * math.sin(math.radians(60))], atol=1e-6)


def test_ascendente_de_subsolo():
    t = T.calcular(C, 0, 30, 40)
    assert t.xyz[-1][2] == pytest.approx(C[2] + 20) and t.xyz[-1][1] == pytest.approx(C[1] + 40 * math.cos(math.radians(30)))


def test_survey_com_curva_curvatura_minima():
    # do vertical (−90) a horizontal para norte (0°) em 100 m: arco de 1/4 de círculo, raio R = 100/(π/2)
    t = T.calcular(C, 0, -90, 100, survey=[(0, 0, -90), (100, 0, 0)])
    assert not t.estimada and "curvatura mínima" in t.motivo
    R = 100 / (math.pi / 2)
    assert np.allclose(t.xyz[-1] - np.array(C), [0, R, -R], atol=1e-6)


def test_survey_reto_coincide_com_reta():
    a = T.calcular(C, 45, -70, 150, survey=[(0, 45, -70), (50, 45, -70), (150, 45, -70)])
    b = T.calcular(C, 45, -70, 150)
    assert np.allclose(a.xyz[-1], b.xyz[-1]) and not a.estimada and b.estimada


def test_prolonga_ultima_direcao_e_uma_medida_e_estimada():
    t = T.calcular(C, None, None, 120, survey=[(30, 0, -90)])
    assert t.estimada and "única medida" in t.motivo and np.allclose(t.xyz[-1], [C[0], C[1], C[2] - 120])
    t = T.calcular(C, 0, -90, 120, survey=[(0, 0, -90), (60, 0, -90)])
    assert t.profundidades[-1] == 120 and np.allclose(t.xyz[-1], [C[0], C[1], C[2] - 120])


def test_declinacao_magnetica_e_sem_orientacao():
    t = T.calcular(C, 0, 0, 10, declinacao=-21)  # azimute magnético 0 → quadrícula 339°
    assert np.allclose(t.xyz[-1] - np.array(C), [10 * math.sin(math.radians(-21)), 10 * math.cos(math.radians(-21)), 0])
    with pytest.raises(ValueError):
        T.calcular(C, None, None, 10)


def test_densificar_segue_a_curva():
    t = T.calcular(C, 0, -90, 100, survey=[(0, 0, -90), (100, 0, 0)])
    pts = T.densificar(t, 10)
    raio = 100 / (math.pi / 2)
    centro = np.array([C[0], C[1] + raio, C[2]])
    assert np.allclose(np.linalg.norm(pts[:, 1:] - centro[1:], axis=1), raio, atol=1e-6), "pontos sobre o arco, não sobre a corda"
    # a meio caminho (50 m de arco = 45°): posição exata no círculo
    assert np.allclose(T.posicao(t, 50) - np.array(C), [0, raio * (1 - math.cos(math.pi / 4)), -raio * math.sin(math.pi / 4)], atol=1e-6)
