from __future__ import annotations

import uuid
from datetime import date

from fastapi import APIRouter, Depends, Query
from fastapi.responses import Response
from sqlalchemy.orm import Session

from geomina.core.dependencias import obter_sessao, requer
from geomina.modules.auth.models import Usuario
from geomina.modules.mapeamento import service as mapeamento
from geomina.modules.mapeamento.schemas import Estado
from geomina.modules.relatorios import servico as R

router = APIRouter(tags=["relatórios"])
XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"


def _anexo(conteudo: bytes, nome: str, tipo: str) -> Response:
    return Response(conteudo, media_type=tipo, headers={"Content-Disposition": f'attachment; filename="{nome}"'})


def _fichas(db, mina_id, unidade_id, geologo_id, estado, de, ate, litologia_id, texto):
    lista = mapeamento.listar(db, mina_id, unidade_id=unidade_id, geologo_id=geologo_id, estado=estado, de=de, ate=ate,
                              litologia_id=litologia_id, texto=texto, limite=100000)
    filtros = {k: v for k, v in (("Unidade (com subunidades)", unidade_id), ("Geólogo", geologo_id), ("Estado", estado),
                                 ("De", de), ("Até", ate), ("Litologia", litologia_id), ("Texto", texto)) if v}
    return R.fichas(db, mina_id, [f.id for f in lista]), filtros


@router.get("/minas/{mina_id}/relatorios/fichas.xlsx")
def fichas_xlsx(mina_id: uuid.UUID, unidade_id: uuid.UUID | None = None, geologo_id: uuid.UUID | None = None,
                estado: Estado | None = None, de: date | None = None, ate: date | None = None,
                litologia_id: uuid.UUID | None = None, texto: str | None = Query(default=None, max_length=100),
                u: Usuario = Depends(requer("mapeamento:ler")), db: Session = Depends(obter_sessao)):
    dados, filtros = _fichas(db, mina_id, unidade_id, geologo_id, estado, de, ate, litologia_id, texto)
    meta = {"Mina": R.mina_texto(db, mina_id), "Usuário": u.nome, "Filtros": filtros or "nenhum",
            "Fichas": len(dados["fichas"]),
            "Observação": "Medidas estruturais já corrigidas para o norte de referência da ficha; leituras de campo não são laboratoriais."}
    return _anexo(R.xlsx_fichas(dados, meta), "fichas_mapeamento.xlsx", XLSX)


@router.get("/minas/{mina_id}/relatorios/fichas.csv")
def fichas_csv(mina_id: uuid.UUID, tabela: str = Query(default="fichas", pattern="^(fichas|intervalos|estruturas|amostras)$"),
               unidade_id: uuid.UUID | None = None, geologo_id: uuid.UUID | None = None, estado: Estado | None = None,
               de: date | None = None, ate: date | None = None, litologia_id: uuid.UUID | None = None,
               texto: str | None = Query(default=None, max_length=100),
               _u: Usuario = Depends(requer("mapeamento:ler")), db: Session = Depends(obter_sessao)):
    dados, _ = _fichas(db, mina_id, unidade_id, geologo_id, estado, de, ate, litologia_id, texto)
    cols = {"fichas": R.COLUNAS_FICHAS, "intervalos": R.COLUNAS_INTERVALOS, "estruturas": R.COLUNAS_ESTRUTURAS,
            "amostras": R.COLUNAS_AMOSTRAS}[tabela]
    return _anexo(R.csv_tabela(cols, dados[tabela]), f"fichas_{tabela}.csv", "text/csv; charset=utf-8")


@router.get("/minas/{mina_id}/relatorios/producao")
def producao(mina_id: uuid.UUID, de: date | None = None, ate: date | None = None,
             _u: Usuario = Depends(requer("mapeamento:ler", "amostra:ler")), db: Session = Depends(obter_sessao)):
    return R.producao(db, mina_id, de, ate)


@router.get("/minas/{mina_id}/relatorios/producao.xlsx")
def producao_xlsx(mina_id: uuid.UUID, de: date | None = None, ate: date | None = None,
                  u: Usuario = Depends(requer("mapeamento:ler", "amostra:ler")), db: Session = Depends(obter_sessao)):
    p = R.producao(db, mina_id, de, ate)
    meta = {"Mina": R.mina_texto(db, mina_id), "Usuário": u.nome,
            "Período": f"{de.strftime('%d/%m/%Y') if de else 'início'} a {ate.strftime('%d/%m/%Y') if ate else 'hoje'}",
            "Datas usadas": "ficha: data do mapeamento; amostra: data de coleta; laudo: emissão do certificado (ou importação)"}
    return _anexo(R.xlsx_producao(p, meta), "producao.xlsx", XLSX)
