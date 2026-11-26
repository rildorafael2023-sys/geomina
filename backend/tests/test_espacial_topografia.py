"""Chainage 3D (casos de TESTES.md §3.1) e leitor de shapefile."""

import io
import os
import struct
import zipfile
from pathlib import Path

import numpy as np
import pytest

from geomina.espacial import chainage as C
from geomina.espacial import shapefile as S

ZIP_REAL = Path(os.environ.get("GEOMINA_TOPO_ZIP", "/nao/existe"))


def test_reta_horizontal():
    assert C.comprimentos([[0, 0, 0], [100, 0, 0]])[-1] == 100


def test_rampa_inclinada_nao_e_2d():
    eixo = [[0, 0, 0], [100, 0, -15]]
    assert round(C.comprimentos(eixo)[-1], 3) == 101.119
    assert C.comprimento_2d(eixo) == 100


def test_curva_em_l():
    eixo = [[0, 0, 0], [50, 0, 0], [50, 50, 0]]
    assert C.comprimentos(eixo)[-1] == 100
    p = C.projetar(eixo, [50, 25, 0])
    assert p.chainage == 75 and p.afastamento == 0


def test_ponto_fora_do_eixo():
    p = C.projetar([[0, 0, 0], [100, 0, 0]], [40, 3, 0])
    assert (p.chainage, p.afastamento) == (40, 3)


def test_galeria_em_u_sinaliza_ambiguidade():
    eixo = [[0, 0, 0], [100, 0, 0], [100, 10, 0], [0, 10, 0]]
    p = C.projetar(eixo, [50, 5, 0])
    assert p.ambigua and {round(p.chainage), round(p.alternativa)} == {50, 160}


def test_coordenadas_utm_grandes_mantem_precisao():
    x0, y0 = 500000.0, 7800000.0
    eixo = [[x0, y0, 500], [x0 + 30, y0 + 40, 500]]
    assert abs(C.comprimentos(eixo)[-1] - 50) < 1e-6
    p = C.projetar(eixo, [x0 + 15, y0 + 20, 500])
    assert abs(p.chainage - 25) < 1e-6


def _shp_polilinha_z(pontos):
    """Shapefile mínimo PolyLineZ com uma feição (gerado à mão para o teste)."""
    n = len(pontos)
    xy = b"".join(struct.pack("<2d", x, y) for x, y, _ in pontos)
    zs = b"".join(struct.pack("<d", z) for *_, z in pontos)
    corpo = struct.pack("<i", 13) + struct.pack("<4d", 0, 0, 0, 0) + struct.pack("<ii", 1, n) + struct.pack("<i", 0) + xy + \
        struct.pack("<2d", 0, 0) + zs
    reg = struct.pack(">ii", 1, len(corpo) // 2) + corpo
    cab = struct.pack(">i", 9994) + b"\0" * 20 + struct.pack(">i", (100 + len(reg)) // 2) + struct.pack("<ii", 1000, 13) + b"\0" * 64
    campos = b"Layer" + b"\0" * 6 + b"C" + b"\0" * 4 + bytes([20, 0]) + b"\0" * 14
    hlen = 32 + 32 + 1
    dbf = struct.pack("<BBBBIHH", 3, 26, 1, 1, 1, hlen, 21) + b"\0" * 20 + campos + b"\r" + b" " + "PAREDE".ljust(20).encode() + b"\x1a"
    return cab + reg, dbf


def test_le_z_de_cada_vertice_sem_alterar():
    pts = [(696590.301, 7823279.721, 580.505219385), (696591.0, 7823280.5, 579.99)]
    shp, dbf = _shp_polilinha_z(pts)
    c = S.ler_bytes("teste", shp, dbf, None, None)
    assert c.tipo == 13 and c.feicoes[0].atributos["Layer"] == "PAREDE"
    assert c.feicoes[0].partes[0].tolist() == [list(p) for p in pts]


def test_zip_e_multipatch_recusado():
    shp, dbf = _shp_polilinha_z([(0, 0, 0), (1, 1, 1)])
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as z:
        z.writestr("pasta/linhas.shp", shp)
        z.writestr("pasta/linhas.dbf", dbf)
    assert S.listar_camadas(buf.getvalue()) == ["pasta/linhas.shp"]
    assert S.ler_do_zip(buf.getvalue(), "pasta/linhas.shp").feicoes[0].partes[0].shape == (2, 3)
    ruim = bytearray(shp)
    ruim[32:36] = struct.pack("<i", 31)
    with pytest.raises(S.ShapefileInvalido, match="MultiPatch"):
        S.ler_bytes("x", bytes(ruim), dbf, None, None)


@pytest.mark.skipif(not ZIP_REAL.exists(), reason="topografia real não disponível")
def test_topografia_real():
    dados = ZIP_REAL.read_bytes()
    camadas = S.listar_camadas(dados)
    assert len(camadas) == 3
    sad = S.ler_do_zip(dados, next(c for c in camadas if "SAD" in c and "Piso" not in c))
    assert len(sad.feicoes) == 44273 and sad.tipo == 13 and sad.encoding == "utf-8"
    zs = np.concatenate([p[:, 2] for f in sad.feicoes for p in f.partes])
    assert len(zs) == 119190 and round(zs.max(), 2) == 748.17
    assert "PONTO CONVERGÊNCIA" in {f.atributos["Layer"] for f in sad.feicoes}  # acento correto (UTF-8 do .cpg)
    assert S.crs_do_prj(sad.prj)[0] == 29193
    sir = S.ler_do_zip(dados, next(c for c in camadas if "SIRGAS" in c))
    assert S.crs_do_prj(sir.prj)[0] == 31983 and sum(f.vazia for f in sir.feicoes) == 5


def test_ponto_sem_cota_em_rampa_usa_chainage_3d():
    eixo = [[0, 0, 0], [100, 0, -15]]
    p = C.projetar(eixo, [50, 2])  # amostra sem Z: projeção em planta
    assert abs(p.chainage - 101.119 / 2) < 0.01 and p.afastamento == 2
