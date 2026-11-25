"""Armazenamento de arquivos endereçado por conteúdo (DT-011).

- O caminho é derivado do SHA-256: ``objetos/ab/cd/abcd…``.
- Arquivo já existente nunca é sobrescrito (deduplicação natural).
- Arquivos gravados ficam somente-leitura no sistema de arquivos.
"""

from __future__ import annotations

import hashlib
import os
import stat
import tempfile
from dataclasses import dataclass
from pathlib import Path
from typing import BinaryIO

BLOCO = 1024 * 1024


class ArquivoGrandeDemais(Exception):
    pass


class ArquivoCorrompido(Exception):
    pass


@dataclass(frozen=True)
class ResultadoGravacao:
    sha256: str
    tamanho: int
    chave: str
    ja_existia: bool


class ArmazenamentoLocal:
    def __init__(self, raiz: Path) -> None:
        self.raiz = raiz
        (raiz / "objetos").mkdir(parents=True, exist_ok=True)
        (raiz / "tmp").mkdir(parents=True, exist_ok=True)

    @staticmethod
    def chave_para(sha256: str) -> str:
        return f"objetos/{sha256[:2]}/{sha256[2:4]}/{sha256}"

    def caminho(self, chave: str) -> Path:
        p = (self.raiz / chave).resolve()
        if self.raiz.resolve() not in p.parents:
            raise ValueError("chave de armazenamento inválida")
        return p

    def gravar(self, origem: BinaryIO, limite_bytes: int | None = None) -> ResultadoGravacao:
        h = hashlib.sha256()
        tamanho = 0
        fd, tmp = tempfile.mkstemp(dir=self.raiz / "tmp")
        try:
            with os.fdopen(fd, "wb") as destino:
                while bloco := origem.read(BLOCO):
                    tamanho += len(bloco)
                    if limite_bytes is not None and tamanho > limite_bytes:
                        raise ArquivoGrandeDemais(f"arquivo maior que {limite_bytes} bytes")
                    h.update(bloco)
                    destino.write(bloco)
                destino.flush()
                os.fsync(destino.fileno())
            sha = h.hexdigest()
            chave = self.chave_para(sha)
            final = self.caminho(chave)
            if final.exists():
                os.unlink(tmp)
                return ResultadoGravacao(sha, tamanho, chave, ja_existia=True)
            final.parent.mkdir(parents=True, exist_ok=True)
            os.replace(tmp, final)
            os.chmod(final, stat.S_IRUSR | stat.S_IRGRP | stat.S_IROTH)
            return ResultadoGravacao(sha, tamanho, chave, ja_existia=False)
        except BaseException:
            if os.path.exists(tmp):
                os.unlink(tmp)
            raise

    def verificar(self, chave: str, sha256_esperado: str) -> None:
        h = hashlib.sha256()
        with open(self.caminho(chave), "rb") as f:
            while bloco := f.read(BLOCO):
                h.update(bloco)
        if h.hexdigest() != sha256_esperado:
            raise ArquivoCorrompido(f"conteúdo de {chave} não confere com o hash registrado")


ASSINATURAS: list[tuple[bytes, str]] = [
    (b"%PDF-", "application/pdf"),
    (b"\x89PNG\r\n\x1a\n", "image/png"),
    (b"\xff\xd8\xff", "image/jpeg"),
    (b"II*\x00", "image/tiff"),
    (b"MM\x00*", "image/tiff"),
    (b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1", "application/x-ole-storage"),  # .xls antigo, .doc
    (b"PK\x03\x04", "application/zip"),  # .zip, .xlsx, .docx
    (b"\x00\x00\x27\x0a", "application/x-esri-shape"),  # .shp/.shx (código 9994)
]


def detectar_mime(inicio: bytes, nome: str) -> str:
    """Detecta o tipo pelo conteúdo (não confia só na extensão)."""
    for assinatura, mime in ASSINATURAS:
        if inicio.startswith(assinatura):
            ext = Path(nome).suffix.lower()
            if mime == "application/zip" and ext == ".xlsx":
                return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            if mime == "application/x-ole-storage" and ext == ".xls":
                return "application/vnd.ms-excel"
            return mime
    try:
        inicio.decode("utf-8")
        return "text/plain"
    except UnicodeDecodeError:
        return "application/octet-stream"
