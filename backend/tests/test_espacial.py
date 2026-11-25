"""Base espacial: preservação de Z e índice R*Tree (RNF-05, RNF-06)."""

import sqlite3

import pyproj
from shapely.geometry import LineString, Point

from geomina.espacial.geometria import caixa, de_wkb, para_wkb

# Coordenadas UTM fictícias de mesma ordem de grandeza das reais (testa a precisão em float64)
LINHA_3D = LineString([(500123.512, 7800419.531, 535.104), (500130.004, 7800425.118, 534.377),
                       (500141.250, 7800430.999, 532.001)])


def test_wkb_preserva_z_exatamente():
    volta = de_wkb(para_wkb(LINHA_3D))
    assert volta.has_z
    assert list(volta.coords) == list(LINHA_3D.coords)  # igualdade exata em float64


def test_geometria_2d_continua_2d():
    p = Point(500123.5, 7800419.5)
    volta = de_wkb(para_wkb(p))
    assert not volta.has_z  # nenhum Z inventado


def test_caixa_3d():
    c = caixa(LINHA_3D)
    assert (c.minz, c.maxz) == (532.001, 535.104)


def test_rtree_consulta_por_caixa():
    con = sqlite3.connect(":memory:")
    con.execute("create virtual table idx using rtree(id, minx, maxx, miny, maxy, minz, maxz)")
    c = caixa(LINHA_3D)
    con.execute("insert into idx values (1,?,?,?,?,?,?)", (c.minx, c.maxx, c.miny, c.maxy, c.minz, c.maxz))
    achou = con.execute("select id from idx where maxx>=500125 and minx<=500126 and maxy>=7800420 "
                        "and miny<=7800421 and maxz>=530 and minz<=540").fetchall()
    assert achou == [(1,)]
    nao = con.execute("select id from idx where minz>=600").fetchall()
    assert nao == []


def test_crs_da_mina_disponiveis_sem_internet():
    pyproj.network.set_network_enabled(False)
    assert pyproj.CRS.from_epsg(29193).name == "SAD69 / UTM zone 23S"
    assert pyproj.CRS.from_epsg(31983).name == "SIRGAS 2000 / UTM zone 23S"
