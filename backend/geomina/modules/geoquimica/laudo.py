"""Leitura de laudos de laboratório (sem gravar nada).

Formato SGS Geosol (.xls/.xlsx): cabeçalho (REP No., Customer, Reference, Project), depois a linha
"Type | Sample ID | método…", a linha de analitos e a de unidades; dados com o tipo da linha
(SMP, DUP, REP, STD). A ordem das colunas varia entre laudos: tudo é lido pelos cabeçalhos.
Formato genérico (.csv/.xlsx): coluna de amostra + colunas "Analito (unidade)" ou "Analito_unidade".
"""

from __future__ import annotations

import csv
import io
import re
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path

import openpyxl
import xlrd


class LaudoInvalido(ValueError):
    pass


@dataclass
class Coluna:
    indice: int
    analito: str
    unidade: str
    metodo: str


@dataclass
class LinhaLaudo:
    numero: int
    tipo: str
    codigo: str
    valores: dict[int, object] = field(default_factory=dict)


@dataclass
class Laudo:
    formato: str
    certificado: str | None
    emitido_em: datetime | None
    cliente: str | None
    referencia: str | None
    projeto: str | None
    colunas: list[Coluna]
    linhas: list[LinhaLaudo]


UNIDADES = {"ppm", "ppb", "%", "g/t", "pct", "ppt", "mg/kg"}


def _tabela(dados: bytes, nome: str) -> list[list]:
    ext = Path(nome).suffix.lower()
    if ext == ".xls":
        try:
            wb = xlrd.open_workbook(file_contents=dados)
        except Exception as e:
            raise LaudoInvalido("Não foi possível ler o arquivo .xls.") from e
        sh = wb.sheet_by_index(0)
        return [[c.value for c in sh.row(r)] for r in range(sh.nrows)]
    if ext in (".xlsx", ".xlsm"):
        try:
            wb = openpyxl.load_workbook(io.BytesIO(dados), read_only=True, data_only=True)
        except Exception as e:
            raise LaudoInvalido("Não foi possível ler o arquivo .xlsx.") from e
        linhas = [list(r) for r in wb.worksheets[0].iter_rows(values_only=True)]
        wb.close()
        return linhas
    if ext in (".csv", ".txt"):
        try:
            texto = dados.decode("utf-8-sig")
        except UnicodeDecodeError:
            texto = dados.decode("latin-1")
        dialeto = csv.Sniffer().sniff(texto[:5000], delimiters=";,\t")
        return [list(r) for r in csv.reader(io.StringIO(texto), dialeto)]
    raise LaudoInvalido("Formatos aceitos: .xls, .xlsx, .csv.")


def _txt(v) -> str:
    if v is None:
        return ""
    if isinstance(v, float) and v.is_integer():
        return str(int(v))
    return str(v).strip()


def ler(dados: bytes, nome: str) -> Laudo:
    t = _tabela(dados, nome)
    cab = {}
    for r in t[:15]:
        if r and _txt(r[0]) in ("REP No.", "Customer", "Attention", "Reference", "Project", "Notes"):
            cab[_txt(r[0])] = [_txt(x) for x in r[1:]]
    for i, r in enumerate(t[:40]):
        if len(r) > 2 and _txt(r[0]).lower() == "type" and _txt(r[1]).lower() == "sample id":
            return _sgs(t, i, cab)
    return _generico(t)


def _sgs(t: list[list], i: int, cab: dict) -> Laudo:
    metodos, analitos, unidades = t[i], t[i + 1], t[i + 2]
    colunas = []
    for k in range(2, len(analitos)):
        a = _txt(analitos[k])
        if not a:
            continue
        u = _txt(unidades[k]) if k < len(unidades) else ""
        if u.lower() not in UNIDADES:
            raise LaudoInvalido(f"Unidade '{u}' do analito {a} não reconhecida.")
        colunas.append(Coluna(k, a, "%" if u == "pct" else u, _txt(metodos[k]) if k < len(metodos) else "?"))
    linhas = []
    for n, r in enumerate(t[i + 3:], start=i + 4):
        if not r or not _txt(r[0]) and not _txt(r[1] if len(r) > 1 else ""):
            continue
        tipo, codigo = _txt(r[0]).upper(), _txt(r[1])
        if tipo not in ("SMP", "DUP", "REP", "STD", "BLK") or not codigo:
            continue
        linhas.append(LinhaLaudo(n, tipo, codigo, {c.indice: r[c.indice] for c in colunas if c.indice < len(r)}))
    rep = cab.get("REP No.", [])
    emitido = None
    if len(rep) > 1 and rep[1]:
        try:
            emitido = datetime.strptime(rep[1], "%d/%m/%Y %H:%M:%S")
        except ValueError:
            emitido = None
    primeiro = lambda k: (cab.get(k) or [None])[0] or None  # noqa: E731
    return Laudo("SGS", primeiro("REP No."), emitido, primeiro("Customer"), primeiro("Reference"), primeiro("Project"),
                 colunas, linhas)


CAB_GENERICO = re.compile(r"^\s*([A-Za-z][A-Za-z0-9]*)\s*(?:\(([^)]+)\)|[_ ]([A-Za-z%/]+))\s*$")


def _generico(t: list[list]) -> Laudo:
    for i, r in enumerate(t[:20]):
        nomes = [_txt(x).lower() for x in r]
        alvo = next((k for k, x in enumerate(nomes) if x in ("amostra", "sample id", "sample", "codigo", "código")), None)
        if alvo is None:
            continue
        tipo_k = next((k for k, x in enumerate(nomes) if x in ("tipo", "type")), None)
        colunas = []
        for k, x in enumerate(r):
            if k in (alvo, tipo_k):
                continue
            m = CAB_GENERICO.match(_txt(x))
            if m and (m.group(2) or m.group(3) or "").lower() in UNIDADES:
                colunas.append(Coluna(k, m.group(1), (m.group(2) or m.group(3)).replace("pct", "%"), "INFORMADO"))
        if not colunas:
            raise LaudoInvalido("Nenhuma coluna de analito no formato 'Cr (ppm)' ou 'Cr_ppm'.")
        linhas = []
        for n, rr in enumerate(t[i + 1:], start=i + 2):
            if alvo < len(rr) and _txt(rr[alvo]):
                tipo = _txt(rr[tipo_k]).upper() if tipo_k is not None and tipo_k < len(rr) and _txt(rr[tipo_k]) else "SMP"
                linhas.append(LinhaLaudo(n, tipo, _txt(rr[alvo]), {c.indice: rr[c.indice] for c in colunas if c.indice < len(rr)}))
        return Laudo("GENERICO", None, None, None, None, None, colunas, linhas)
    raise LaudoInvalido("Não reconheci o laudo: não há linha 'Type | Sample ID' (SGS) nem coluna de amostra.")


def valor(v) -> tuple[str, float | None, str, float | None]:
    """(texto original, número, qualificador, limite). Ex.: '<0,5' → ('<0,5', None, '<', 0.5)."""
    if v is None or (isinstance(v, str) and not v.strip()):
        return "", None, "--", None
    if isinstance(v, (int, float)) and not isinstance(v, bool):
        return _txt(v) if float(v).is_integer() else repr(float(v)), float(v), "=", None
    t = str(v).strip()
    if t.upper().replace(".", "") in ("NA", "N/A"):
        return t, None, "NA", None
    if t in ("--", "-", "—"):
        return t, None, "--", None
    m = re.match(r"^([<>])\s*([\d.,]+)$", t)
    if m:
        return t, None, m.group(1), _numero(m.group(2))
    n = _numero(t)
    if n is None:
        raise LaudoInvalido(f"Valor '{t}' não reconhecido.")
    return t, n, "=", None


def _numero(t: str) -> float | None:
    t = t.replace(" ", "")
    if "," in t and "." in t:
        t = t.replace(".", "").replace(",", ".")
    else:
        t = t.replace(",", ".")
    try:
        return float(t)
    except ValueError:
        return None


OXIDO = re.compile(r"^([A-Z][a-z]?\d*)+O\d*$")


def tipo_analito(codigo: str) -> str:
    if codigo.upper() in ("LOI", "SOMA", "PF", "TOTAL", "SUM"):
        return "parametro"
    return "oxido" if OXIDO.match(codigo) and "O" in codigo[1:] else "elemento"
