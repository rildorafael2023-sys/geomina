"""Verificação de integridade (E18): banco, regras gravadas no banco, índice espacial e arquivos originais.

Somente leitura. Usada pela tela Sistema (administrador) e pelo backup agendado.
"""

from __future__ import annotations

import hashlib
import time
from pathlib import Path

from sqlalchemy import text
from sqlalchemy.orm import Session

# Regras que protegem os dados e que precisam existir no banco (criadas pelas migrações).
GATILHOS_CRITICOS = {
    "trg_auditoria_sem_update": "histórico de alterações não pode ser alterado",
    "trg_auditoria_sem_delete": "histórico de alterações não pode ser apagado",
    "trg_resultado_imutavel": "resultado de laboratório não pode ser alterado",
    "trg_resultado_sem_delete": "resultado de laboratório não pode ser apagado",
    "trg_mapeamento_imutavel": "ficha aprovada não pode ser alterada",
    "trg_mapeamento_revisao_sem_update": "revisões de ficha são permanentes",
    "trg_documento_versao_sem_update": "versões de documento são permanentes",
    "trg_feicao_imutavel": "topografia importada não pode ser alterada",
    "trg_feicao_rtree": "índice espacial acompanha a topografia",
    "trg_eixo_imutavel": "versões de eixo são permanentes",
    "trg_unidade_caminho_insercao": "hierarquia da mina",
}


def _sha256(p: Path) -> str:
    h = hashlib.sha256()
    with open(p, "rb") as f:
        while b := f.read(1 << 20):
            h.update(b)
    return h.hexdigest()


def verificar(db: Session, armazenamento, conferir_conteudo: bool = True) -> dict:
    inicio = time.perf_counter()
    itens = []

    def item(nome, ok, detalhe, gravidade="erro"):
        itens.append({"nome": nome, "ok": bool(ok), "detalhe": detalhe, "gravidade": "ok" if ok else gravidade})

    r = [x[0] for x in db.execute(text("PRAGMA integrity_check")).fetchall()]
    item("Estrutura do banco (SQLite integrity_check)", r == ["ok"], "sem defeitos" if r == ["ok"] else "; ".join(r[:5]))

    fk = db.execute(text("PRAGMA foreign_key_check")).fetchall()
    tabelas = sorted({x[0] for x in fk})
    item("Referências entre tabelas (chaves estrangeiras)", not fk,
         "todas as referências existem" if not fk else f"{len(fk)} referência(s) quebrada(s) em: {', '.join(tabelas)}")

    fk_on = db.execute(text("PRAGMA foreign_keys")).scalar()
    item("Verificação de chaves estrangeiras ativa", fk_on == 1, "ativa" if fk_on == 1 else "desativada nesta conexão")

    existentes = {x[0] for x in db.execute(text("SELECT name FROM sqlite_master WHERE type='trigger'"))}
    faltando = [f"{k} ({v})" for k, v in GATILHOS_CRITICOS.items() if k not in existentes]
    item("Regras de proteção gravadas no banco", not faltando,
         f"{len(GATILHOS_CRITICOS)} regras críticas presentes ({len(existentes)} no total)" if not faltando else "faltam: " + "; ".join(faltando))

    try:
        rt = db.execute(text("SELECT rtreecheck('feicao_rtree')")).scalar()
        n_rt = db.execute(text("SELECT count(*) FROM feicao_rtree")).scalar()
        n_f = db.execute(text("SELECT count(*) FROM feicao_topografica")).scalar()
        item("Índice espacial da topografia (R*Tree)", rt == "ok" and n_rt == n_f,
             f"{n_f} feições indexadas" if rt == "ok" and n_rt == n_f else f"rtreecheck: {rt}; índice {n_rt} × feições {n_f}")
    except Exception as e:  # noqa: BLE001
        item("Índice espacial da topografia (R*Tree)", False, f"não foi possível verificar: {e}")

    linhas = db.execute(text("SELECT chave, sha256, tamanho FROM arquivo")).fetchall()
    faltam, diferentes, verificados = [], [], 0
    for chave, sha, tam in linhas:
        try:
            p = armazenamento.caminho(chave)
        except ValueError:
            diferentes.append(chave)
            continue
        if not p.is_file():
            faltam.append(chave)
            continue
        if p.stat().st_size != tam or (conferir_conteudo and _sha256(p) != sha):
            diferentes.append(chave)
        verificados += 1
    modo = "conteúdo conferido pelo hash" if conferir_conteudo else "tamanho conferido"
    item("Arquivos originais (fotos, croquis, laudos, planilhas)", not faltam and not diferentes,
         f"{verificados} arquivo(s), {modo}" if not faltam and not diferentes
         else f"{len(faltam)} faltando, {len(diferentes)} alterado(s)" + (f" — ex.: {(faltam + diferentes)[0]}" if faltam or diferentes else ""))

    pend = db.execute(text("SELECT count(DISTINCT codigo_laboratorio) FROM resultado WHERE amostra_id IS NULL AND tipo_linha='SMP'")).scalar()
    item("Resultados de laboratório sem amostra cadastrada", True,
         f"{pend} código(s) do laudo ainda não conciliados (podem ser usados na Geoquímica operacional)" if pend else "nenhum",
         "aviso")
    if pend:
        itens[-1]["gravidade"] = "aviso"

    return {"ok": all(i["ok"] for i in itens), "itens": itens, "segundos": round(time.perf_counter() - inicio, 2)}
