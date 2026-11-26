"""Leitura de planilhas de amostras (Excel .xlsx ou CSV) — sem gravar nada.

Reconhece o formato da planilha de campo da mina ("Pontos Campo Descrição": Ponto, Direção da seção,
Intervalo "0 m - 4,5 m", Litologia, X/Y/Z às vezes como texto com vírgula, Data, Amostra, "O que fazer
com a amostra"…) e um modelo simples (codigo, data, x, y, z, litologia, descricao, unidade…).
"""

from __future__ import annotations

import csv
import io
import re
from dataclasses import dataclass, field
from datetime import date, datetime
from pathlib import Path

import openpyxl

from geomina.modules.dicionarios.models import normalizar

# cabeçalho normalizado → campo
CABECALHOS = {
    "amostra": "codigo", "codigo": "codigo", "codigo da amostra": "codigo", "sample id": "codigo",
    "designacao de campo (amostra)": "designacao",
    "ponto": "ponto", "sub ponto": "sub_ponto",
    "direcao da secao": "local", "local": "local", "localizacao": "local",
    "intervalo": "intervalo", "de": "de", "de (m)": "de", "ate": "ate", "ate (m)": "ate",
    "espessura": "espessura",
    "litologia": "litologia",
    "descricao de campo (afloramento)": "descricao", "descricao": "descricao", "descricao de campo": "descricao",
    "x": "x", "y": "y", "z": "z", "cota": "z", "este": "x", "norte": "y",
    "data": "data", "data de coleta": "data",
    "o que fazer com a amostra": "destino", "destino": "destino",
    "tipo": "tipo", "tipo de amostra": "tipo",
    "unidade": "unidade", "galeria": "unidade",
    "furo": "furo", "observacoes": "observacoes", "observacao": "observacoes",
    "foto": "foto", "sn_rumo": "sn_rumo", "sn_dip": "sn_dip",
}


class PlanilhaInvalida(ValueError):
    pass


@dataclass
class Linha:
    numero: int  # linha na planilha (1 = primeira linha do arquivo)
    valores: dict = field(default_factory=dict)


def _celula(v):
    if isinstance(v, str):
        v = v.replace("\r", "").strip()
        return v or None
    return v


def ler_tabela(caminho: Path, nome: str) -> tuple[list[str], list[Linha]]:
    """Retorna (campos reconhecidos, linhas) a partir da primeira linha de cabeçalho encontrada."""
    ext = Path(nome).suffix.lower()
    if ext in (".xlsx", ".xlsm"):
        # o arquivo armazenado não tem extensão (nome = hash): abrir pelo conteúdo
        wb = openpyxl.load_workbook(io.BytesIO(caminho.read_bytes()), read_only=True, data_only=True)
        brutas = [list(r) for r in wb.worksheets[0].iter_rows(values_only=True)]
        wb.close()
    elif ext in (".csv", ".txt"):
        dados = caminho.read_bytes()
        try:
            texto = dados.decode("utf-8-sig")
        except UnicodeDecodeError:
            texto = dados.decode("latin-1")
        dialeto = csv.Sniffer().sniff(texto[:5000], delimiters=";,\t")
        brutas = [list(r) for r in csv.reader(io.StringIO(texto), dialeto)]
    else:
        raise PlanilhaInvalida("Use um arquivo Excel (.xlsx) ou CSV.")
    for i, linha in enumerate(brutas[:30]):
        campos = [CABECALHOS.get(normalizar(str(c))) if c is not None else None for c in linha]
        if "codigo" in campos:
            linhas = []
            for k, r in enumerate(brutas[i + 1:], start=i + 2):
                valores = {campo: _celula(v) for campo, v in zip(campos, r, strict=False) if campo}
                if any(v is not None for v in valores.values()):
                    linhas.append(Linha(k, valores))
            return [c for c in campos if c], linhas
    raise PlanilhaInvalida("Não encontrei a coluna de código da amostra (ex.: 'Amostra' ou 'codigo').")


def numero(v) -> float | None:
    """Aceita 696783.5, '696783,5', '696783,5\\n', '1.234,5'."""
    if v is None or v == "":
        return None
    if isinstance(v, (int, float)):
        return float(v)
    t = str(v).strip().replace(" ", "")
    if "," in t and "." in t:
        t = t.replace(".", "").replace(",", ".")
    else:
        t = t.replace(",", ".")
    try:
        return float(t)
    except ValueError:
        return None


INTERVALO = re.compile(r"^\s*([\d.,]+)\s*m?\s*[-–a]\s*([\d.,]+)\s*m?\s*$", re.IGNORECASE)


def intervalo(v) -> tuple[float, float] | None:
    if v is None:
        return None
    m = INTERVALO.match(str(v))
    if not m:
        return None
    de, ate = numero(m.group(1)), numero(m.group(2))
    return (de, ate) if de is not None and ate is not None and ate > de else None


def data_valor(v) -> date | None:
    if isinstance(v, datetime):
        return v.date()
    if isinstance(v, date):
        return v
    if v is None:
        return None
    t = str(v).strip()
    for fmt in ("%d/%m/%Y", "%d/%m/%y", "%Y-%m-%d", "%d.%m.%Y", "%d-%m-%Y"):
        try:
            return datetime.strptime(t, fmt).date()
        except ValueError:
            continue
    return None
