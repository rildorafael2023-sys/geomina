"""Exportações da Geoquímica Operacional.

- Excel: aba "Amostras" (valor como no laudo + valor numérico usado nos gráficos) e aba "Metadados" (filtros, regra de LD,
  sistema de coordenadas, versão, data, usuário).
- GeoJSON e GeoPackage: amostras de frente como POINT Z e amostras de furo como LINESTRING Z (de → até na trajetória),
  no sistema de coordenadas da mina, com atributos e os analitos escolhidos. GeoPackage escrito direto em SQLite segundo a
  especificação OGC 1.3 (sem GDAL), com a definição do sistema de coordenadas.
"""

from __future__ import annotations

import io
import json
import sqlite3
import struct
import tempfile
from datetime import datetime
from pathlib import Path

import openpyxl
import pyproj
import shapely
from openpyxl.styles import Font, PatternFill

from geomina.config import VERSAO_APP


def _num(v):
    return v if isinstance(v, (int, float)) else None


def xlsx(regs: list[dict], vals: dict, analitos: list[str], meta: dict, status: dict) -> bytes:
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Amostras"
    cab = ["Amostra", "Cadastrada", "Status", "Nível", "Galeria", "Trecho", "Local", "Furo", "De (m)", "Até (m)", "X", "Y", "Z", "SRID",
           "Data", "Campanha", "Responsável", "Litologia", "Alteração", "Mineralização", "Laboratório", "Certificados"]
    for a in analitos:
        un = next((v[a]["unidade"] for v in vals.values() if a in v), "")
        cab += [f"{a} ({un}) — laudo", f"{a} ({un}) — valor numérico"]
    ws.append(cab)
    for c in ws[1]:
        c.font = Font(bold=True)
        c.fill = PatternFill("solid", fgColor="E9ECEF")
    nome = lambda d, k="nome": (d or {}).get(k)  # noqa: E731
    for r in regs:
        v = vals.get(r["chave"], {})
        linha = [r["codigo"], "sim" if r["cadastrada"] else "não", status[r["status"]], nome(r["nivel"], "codigo"), nome(r["galeria"], "codigo"),
                 nome(r["trecho"], "codigo"), r["local"], nome(r.get("furo_ref"), "codigo"), r["prof_de_m"], r["prof_ate_m"], r["x"], r["y"], r["z"],
                 r["srid"], r["data"], nome(r["campanha"], "codigo"), nome(r["responsavel"]), nome(r["litologia"]), nome(r["alteracao"]),
                 nome(r["mineralizacao"]), ", ".join(r["laboratorios"].values()), ", ".join(r["certificados"].values())]
        for a in analitos:
            x = v.get(a)
            linha += [x["texto"] if x else None, _num(x["y"]) if x else None]
        ws.append(linha)
    ws.freeze_panes = "B2"
    for col, w in zip("ABCDEFG", (16, 10, 22, 8, 12, 12, 28), strict=True):
        ws.column_dimensions[col].width = w
    m = wb.create_sheet("Metadados")
    linhas = [("Gerado por", f"GeoMina {VERSAO_APP}"), ("Data", datetime.now().strftime("%d/%m/%Y %H:%M")), ("Usuário", meta.get("usuario")),
              ("Mina", meta.get("mina")), ("Sistema de coordenadas da mina", f"EPSG:{meta.get('srid')}"),
              ("Filtros aplicados", meta.get("filtros")), ("Amostras", len(regs)), ("Analitos", ", ".join(analitos) or "(nenhum escolhido)"),
              ("Abaixo/acima do limite", f"coluna 'laudo' = como veio do laboratório; coluna 'valor numérico' = regra '{meta.get('regra_ld')}'"),
              ("Observação", "Amostras 'só no laudo' ainda não estão no cadastro (sem local/coordenadas). X/Y/Z no sistema informado em SRID de cada linha.")]
    for k, v in linhas:
        m.append([k, v])
        m.cell(m.max_row, 1).font = Font(bold=True)
    m.column_dimensions["A"].width = 32
    m.column_dimensions["B"].width = 110
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


def _propriedades(x: dict, analitos: list[str]) -> dict:
    p = {"amostra": x["codigo"], "status": x["status"], "galeria": x.get("galeria"), "litologia": (x.get("litologia") or {}).get("nome")}
    if "furo" in x:
        p.update(furo=x["furo"], de_m=x["de"], ate_m=x["ate"], trajetoria_estimada=x["estimada"])
    for a in analitos:
        v = x["valores"].get(a)
        p[f"{a}_laudo"] = v["texto"] if v else None
        p[f"{a}_valor"] = v["y"] if v else None
        p[f"{a}_unidade"] = v["unidade"] if v else None
    return p


def geojson(cena: dict, analitos: list[str], filtros: str) -> bytes:
    feats = [{"type": "Feature", "geometry": {"type": "Point", "coordinates": x["xyz"]}, "properties": {"origem": "frente", **_propriedades(x, analitos)}}
             for x in cena["pontos"]]
    feats += [{"type": "Feature", "geometry": {"type": "LineString", "coordinates": [x["xyz0"], x["xyz1"]]},
               "properties": {"origem": "furo", **_propriedades(x, analitos)}} for x in cena["segmentos"]]
    fc = {"type": "FeatureCollection", "name": "geoquimica_amostras",
          "crs": {"type": "name", "properties": {"name": f"urn:ogc:def:crs:EPSG::{cena['srid']}"}},
          "geomina": {"versao": VERSAO_APP, "gerado_em": datetime.now().isoformat(timespec="seconds"), "filtros": filtros,
                      "sem_posicao": len(cena["sem_posicao"])}, "features": feats}
    return json.dumps(fc, ensure_ascii=False).encode("utf-8")


def _gpkg_geom(geom, srid: int) -> bytes:
    """Geometria GeoPackage: 'GP', versão 0, flags (little-endian, sem envelope), srs_id, WKB ISO."""
    return b"GP" + bytes([0, 0b00000001]) + struct.pack("<i", srid) + shapely.to_wkb(geom, byte_order=1, flavor="iso", output_dimension=3)


def gpkg(cena: dict, analitos: list[str], filtros: str) -> bytes:
    srid = cena["srid"]
    crs = pyproj.CRS.from_epsg(srid)
    with tempfile.TemporaryDirectory() as d:
        caminho = Path(d) / "x.gpkg"
        db = sqlite3.connect(caminho)
        db.execute("PRAGMA application_id = 1196444487")  # 'GPKG'
        db.execute("PRAGMA user_version = 10300")
        db.executescript("""
            CREATE TABLE gpkg_spatial_ref_sys (srs_name TEXT NOT NULL, srs_id INTEGER PRIMARY KEY, organization TEXT NOT NULL,
              organization_coordsys_id INTEGER NOT NULL, definition TEXT NOT NULL, description TEXT);
            CREATE TABLE gpkg_contents (table_name TEXT NOT NULL PRIMARY KEY, data_type TEXT NOT NULL, identifier TEXT UNIQUE, description TEXT DEFAULT '',
              last_change DATETIME NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')), min_x DOUBLE, min_y DOUBLE, max_x DOUBLE, max_y DOUBLE,
              srs_id INTEGER, CONSTRAINT fk_gc_r_srs_id FOREIGN KEY (srs_id) REFERENCES gpkg_spatial_ref_sys(srs_id));
            CREATE TABLE gpkg_geometry_columns (table_name TEXT NOT NULL, column_name TEXT NOT NULL, geometry_type_name TEXT NOT NULL,
              srs_id INTEGER NOT NULL, z TINYINT NOT NULL, m TINYINT NOT NULL, CONSTRAINT pk_geom_cols PRIMARY KEY (table_name, column_name),
              CONSTRAINT fk_gc_tn FOREIGN KEY (table_name) REFERENCES gpkg_contents(table_name),
              CONSTRAINT fk_gc_srs FOREIGN KEY (srs_id) REFERENCES gpkg_spatial_ref_sys (srs_id));
        """)
        db.executemany("INSERT INTO gpkg_spatial_ref_sys VALUES (?,?,?,?,?,?)", [
            ("Undefined cartesian SRS", -1, "NONE", -1, "undefined", "undefined cartesian coordinate reference system"),
            ("Undefined geographic SRS", 0, "NONE", 0, "undefined", "undefined geographic coordinate reference system"),
            ("WGS 84 geodetic", 4326, "EPSG", 4326, pyproj.CRS.from_epsg(4326).to_wkt("WKT1_GDAL"), "longitude/latitude WGS84"),
            (crs.name, srid, "EPSG", srid, crs.to_wkt("WKT1_GDAL"), crs.name)])
        colunas = ["origem TEXT", "amostra TEXT", "status TEXT", "galeria TEXT", "litologia TEXT", "furo TEXT", "de_m REAL", "ate_m REAL",
                   "trajetoria_estimada INTEGER"] + [c for a in analitos for c in (f'"{a}_laudo" TEXT', f'"{a}_valor" REAL', f'"{a}_unidade" TEXT')]
        nomes = [c.split(" ")[0].strip('"') for c in colunas]
        for tabela, tipo, itens, geom in (("amostras_frente", "POINT", cena["pontos"], lambda x: shapely.Point(*x["xyz"])),
                                          ("intervalos_furo", "LINESTRING", cena["segmentos"], lambda x: shapely.LineString([x["xyz0"], x["xyz1"]]))):
            db.execute(f'CREATE TABLE {tabela} (fid INTEGER PRIMARY KEY AUTOINCREMENT, geom {tipo}, {", ".join(colunas)})')
            gs = [geom(x) for x in itens]
            limites = shapely.total_bounds(gs) if gs else [None] * 4
            db.execute("INSERT INTO gpkg_contents (table_name, data_type, identifier, description, min_x, min_y, max_x, max_y, srs_id) VALUES (?,?,?,?,?,?,?,?,?)",
                       (tabela, "features", tabela, f"GeoMina {VERSAO_APP} — filtros: {filtros}", *[None if v is None else float(v) for v in limites], srid))
            db.execute("INSERT INTO gpkg_geometry_columns VALUES (?,?,?,?,1,0)", (tabela, "geom", tipo, srid))
            for x, g in zip(itens, gs, strict=True):
                p = {"origem": "furo" if "furo" in x else "frente", **_propriedades(x, analitos)}
                if "trajetoria_estimada" in p:
                    p["trajetoria_estimada"] = int(p["trajetoria_estimada"])
                db.execute(f'INSERT INTO {tabela} (geom, {", ".join(chr(34) + n + chr(34) for n in nomes)}) VALUES (?{", ?" * len(nomes)})',
                           [_gpkg_geom(g, srid), *[p.get(n) for n in nomes]])
        db.commit()
        db.close()
        return caminho.read_bytes()
