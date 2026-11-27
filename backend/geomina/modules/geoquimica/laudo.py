"""Leitura de laudos de laboratório (sem gravar nada).

Formato SGS Geosol (.xls/.xlsx): cabeçalho (REP No., Customer, Reference, Project), depois a linha
"Type | Sample ID | método…", a linha de analitos e a de unidades; dados com o tipo da linha
(SMP, DUP, REP, STD). A ordem das colunas varia entre laudos: tudo é lido pelos cabeçalhos.
Formato genérico (.csv/.xlsx): coluna de amostra + colunas "Analito (unidade)" ou "Analito_unidade".
Outros layouts (SGS antigo, de 2002 a 2010, com os analitos na linha do "Type"; ALS): lidos pela linha de
unidades (ppm, %, ppb…), com a linha de analitos logo acima e a de métodos acima dela, em todas as abas.
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
    return _tabelas(dados, nome)[0]


def _tabelas(dados: bytes, nome: str) -> list[list[list]]:
    """Todas as abas (planilhas) do arquivo; .csv tem uma só."""
    ext = Path(nome).suffix.lower()
    if ext == ".xls":
        try:
            wb = xlrd.open_workbook(file_contents=dados)
        except Exception as e:
            raise LaudoInvalido("Não foi possível ler o arquivo .xls.") from e
        return [[[c.value for c in sh.row(r)] for r in range(sh.nrows)] for sh in wb.sheets()] or [[]]
    if ext in (".xlsx", ".xlsm"):
        try:
            wb = openpyxl.load_workbook(io.BytesIO(dados), read_only=True, data_only=True)
        except Exception as e:
            raise LaudoInvalido("Não foi possível ler o arquivo .xlsx.") from e
        abas = [[list(r) for r in ws.iter_rows(values_only=True)] for ws in wb.worksheets]
        wb.close()
        return abas or [[]]
    if ext in (".csv", ".txt"):
        try:
            texto = dados.decode("utf-8-sig")
        except UnicodeDecodeError:
            texto = dados.decode("latin-1")
        dialeto = csv.Sniffer().sniff(texto[:5000], delimiters=";,\t")
        return [[list(r) for r in csv.reader(io.StringIO(texto), dialeto)]]
    raise LaudoInvalido("Formatos aceitos: .xls, .xlsx, .csv.")


def _txt(v) -> str:
    if v is None:
        return ""
    if isinstance(v, float) and v.is_integer():
        return str(int(v))
    return str(v).strip()


def ler(dados: bytes, nome: str) -> Laudo:
    abas = _tabelas(dados, nome)
    t = abas[0]
    cab = {}
    for r in t[:15]:
        if r and _txt(r[0]) in ("REP No.", "Customer", "Attention", "Reference", "Project", "Notes"):
            cab[_txt(r[0])] = [_txt(x) for x in r[1:]]
    for i, r in enumerate(t[:40]):
        if len(r) > 2 and _txt(r[0]).lower() == "type" and _txt(r[1]).lower() == "sample id":
            try:
                return _sgs(t, i, cab)
            except LaudoInvalido:  # SGS antigo: os analitos ficam na própria linha do "Type"
                laudo = _por_unidades(abas, nome)
                if laudo is None:
                    raise
                return laudo
    laudo = _por_unidades(abas, nome)
    return laudo if laudo is not None else _generico(t)


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


SIMBOLO = re.compile(r"^(H|He|Li|Be|B|C|N|O|F|Ne|Na|Mg|Al|Si|P|S|Cl|Ar|K|Ca|Sc|Ti|V|Cr|Mn|Fe|Co|Ni|Cu|Zn|Ga|Ge|As|Se|Br|Kr|Rb|Sr|Y|Zr|Nb|Mo|Tc|Ru|Rh|Pd|Ag|Cd|In|Sn|Sb|Te|I|Xe|Cs|Ba|La|Ce|Pr|Nd|Pm|Sm|Eu|Gd|Tb|Dy|Ho|Er|Tm|Yb|Lu|Hf|Ta|W|Re|Os|Ir|Pt|Au|Hg|Tl|Pb|Bi|Th|U)$")


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
            elif SIMBOLO.match(_txt(x)):  # laudos antigos (ICP): elemento sem unidade = ppm, o padrão do laboratório
                colunas.append(Coluna(k, _txt(x), "ppm", "NAO_INFORMADO"))
        if not colunas:
            raise LaudoInvalido("Nenhuma coluna de analito no formato 'Cr (ppm)' ou 'Cr_ppm'.")
        linhas = []
        for n, rr in enumerate(t[i + 1:], start=i + 2):
            if alvo < len(rr) and _txt(rr[alvo]):
                tipo = _txt(rr[tipo_k]).upper() if tipo_k is not None and tipo_k < len(rr) and _txt(rr[tipo_k]) else "SMP"
                linhas.append(LinhaLaudo(n, tipo, _txt(rr[alvo]), {c.indice: rr[c.indice] for c in colunas if c.indice < len(rr)}))
        return Laudo("GENERICO", None, None, None, None, None, colunas, linhas)
    raise LaudoInvalido("Não reconheci o laudo: não há linha 'Type | Sample ID' (SGS) nem coluna de amostra.")


TIPOS_LINHA = {"SMP": "SMP", "DUP": "DUP", "REP": "REP", "STD": "STD", "BLK": "BLK", "BRANCO": "BLK", "PAD": "STD",
               "NOS": "STD", "QC": "REP"}
PADRAO_LAB = re.compile(r"^\$?(OREAS|SARM|OXD|OXP|LT\d|MRGEO|GBM|LKSD|PD-\d|SRM|REF\d|STD|GEOSTATS|AMIS|ITAK|CDN|GS-?\d)", re.I)


def tipo_por_codigo(tipo: str, codigo: str) -> str:
    """Linhas marcadas como amostra (SMP) que são, pelo nome, branco, padrão ou duplicata do laboratório."""
    c = codigo.strip().upper()
    if tipo != "SMP":
        return tipo
    if "BRANCO" in c or "BLANK" in c or c.startswith("BLK"):
        return "BLK"
    if PADRAO_LAB.match(c):
        return "STD"
    if c.endswith("-DUP") or c.endswith(" DUP"):
        return "DUP"
    return tipo
ROTULO_AMOSTRA = ("sample id", "sample", "amostra", "sample description", "código", "codigo")


def _por_unidades(abas: list[list[list]], nome: str) -> Laudo | None:
    """Layouts sem o cabeçalho SGS atual (SGS antigo, ALS): procura a linha de unidades em todas as abas."""
    certificado = None
    colunas: dict[tuple[str, str, str], Coluna] = {}
    linhas: list[LinhaLaudo] = []
    for n_aba, g in enumerate(abas):
        g = [[_txt(v) for v in r] for r in g]
        for r in g[:8]:
            if r and r[0] in ("REP No.", "REP No") and len(r) > 1 and r[1]:
                certificado = certificado or r[1]
            m = re.match(r"^(BH\d+)", r[0] if r else "")
            if m:
                certificado = certificado or m.group(1)
        for i, r in enumerate(g):
            unid = [j for j, v in enumerate(r) if v.lower() in UNIDADES]
            rotulos = {v.lower() for k in (i - 1, i - 2) if k >= 0 for v in g[k]}
            if i == 0 or not unid or (len(unid) < 3 and not rotulos & set(ROTULO_AMOSTRA)):
                continue
            analitos = g[i - 1]
            scol = tcol = None
            for k in (i - 1, i - 2):
                if k < 0:
                    continue
                for j, v in enumerate(g[k]):
                    if v.lower() in ROTULO_AMOSTRA and scol is None:
                        scol = j
                    if v.lower() in ("type", "tipo"):
                        tcol = j
            metodos = g[i - 2] if i >= 2 and any(re.match(r"^[A-Z]{2,}[-_]?[A-Z0-9_]*\d", v) for v in g[i - 2]) else None
            if scol is None:
                scol = min(unid) - 1
                if scol < 0:
                    continue
                if scol > 0 and any(scol - 1 < len(g[k]) and g[k][scol - 1].upper() in TIPOS_LINHA for k in range(i + 1, min(i + 5, len(g)))):
                    tcol = scol - 1
            usadas: dict[tuple[str, str], int] = {}
            mapa = {}
            for j in unid:
                a = analitos[j] if j < len(analitos) else ""
                if not a:
                    continue
                u = "%" if r[j].lower() == "pct" else r[j].lower()
                met = (metodos[j] if metodos and j < len(metodos) else "") or "NAO_INFORMADO"
                usadas[(a, met)] = usadas.get((a, met), 0) + 1
                if usadas[(a, met)] > 1:  # mesmo analito e método em outra unidade
                    met = f"{met}_{u.replace('%', 'pct')}"
                chave = (a, u, met)
                if chave not in colunas:
                    colunas[chave] = Coluna(len(colunas), a, u, met)
                mapa[j] = colunas[chave].indice
            k = i + 1
            while k < len(g):
                rr = g[k]
                codigo = rr[scol] if scol < len(rr) else ""
                if not codigo or codigo.lower() in ROTULO_AMOSTRA:
                    break
                tipo = (rr[tcol] if tcol is not None and tcol < len(rr) else "").upper() or "SMP"
                if tipo in TIPOS_LINHA:
                    linhas.append(LinhaLaudo(n_aba * 100000 + k + 1, TIPOS_LINHA[tipo], codigo,
                                             {mapa[j]: rr[j] for j in mapa if j < len(rr) and rr[j] != ""}))
                k += 1
    if not linhas:
        return None
    return Laudo("TABELA", certificado or Path(nome).stem, None, None, None, None, list(colunas.values()), linhas)


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
    if n is None:  # I.N.F., I.S., N.R. etc.: não analisado; o texto original fica guardado
        return t, None, "NA", None
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
