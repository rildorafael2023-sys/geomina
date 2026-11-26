"""Etapas 6 e 7 — documentos, croquis e fotografias."""

import io
import os
from pathlib import Path

import pytest
from PIL import Image
from pypdf import PdfWriter
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError

from tests.conftest import cab, criar_usuario

API = "/api/v1"
PDF_REAL = Path(os.environ.get("GEOMINA_PDF_FICHAS", "/nao/existe"))  # fichas escaneadas reais (fora do repositório)


@pytest.fixture
def h(token_admin):
    return cab(token_admin)


@pytest.fixture
def local(cliente, h):
    m = cliente.post(f"{API}/minas", headers=h, json={"codigo": "MINA01", "nome": "Mina 01", "srid_trabalho": 31983}).json()
    n = cliente.post(f"{API}/unidades", headers=h, json={"mina_id": m["id"], "tipo": "NIVEL", "codigo": "N144", "nome": "N144"}).json()
    g = cliente.post(f"{API}/unidades", headers=h, json={"mina_id": m["id"], "tipo": "GALERIA", "codigo": "GAL-01",
                                                         "nome": "GAL-01", "pai_id": n["id"]}).json()
    return {"mina": m, "nivel": n, "gal": g}


def jpeg(cor=(120, 90, 60), exif_data=True, tamanho=(800, 600)):
    im = Image.new("RGB", tamanho, cor)
    buf = io.BytesIO()
    if exif_data:
        ex = Image.Exif()
        ex[0x0110] = "Camera Teste"  # Model
        ex[0x0132] = "2026:10:14 09:30:00"  # DateTime
        ex.get_ifd(0x8769)[0x9003] = "2026:10:14 09:31:12"  # DateTimeOriginal
        im.save(buf, "JPEG", exif=ex)
    else:
        im.save(buf, "JPEG")
    return buf.getvalue()


def tiff_multipagina():
    buf = io.BytesIO()
    a, b = Image.new("L", (300, 200), 80), Image.new("L", (300, 200), 200)
    a.save(buf, "TIFF", save_all=True, append_images=[b])
    return buf.getvalue()


def pdf(paginas=3):
    w = PdfWriter()
    for _ in range(paginas):
        w.add_blank_page(width=595, height=842)
    buf = io.BytesIO()
    w.write(buf)
    return buf.getvalue()


def enviar(cliente, h, mina, categoria, arquivos, **campos):
    dados = {"categoria": categoria, "mina_id": mina["id"], **{k: str(v) for k, v in campos.items()}}
    return cliente.post(f"{API}/documentos", headers=h, data=dados,
                        files=[("arquivos", (nome, conteudo)) for nome, conteudo in arquivos])


def test_croqui_pdf_com_vinculo_e_paginas(cliente, h, local):
    r = enviar(cliente, h, local["mina"], "croqui", [("croqui.pdf", pdf(3))], titulo="Croqui GAL-01",
               unidade_id=local["gal"]["id"], data_documento="2026-10-14")
    assert r.status_code == 201, r.text
    d = r.json()[0]
    assert d["titulo"] == "Croqui GAL-01" and d["versoes"][0]["paginas"] == 3 and d["versoes"][0]["mime"] == "application/pdf"
    assert d["vinculos"][0]["rotulo"] == "GAL-01 — GAL-01"
    # consulta pela sub-árvore do nível
    lista = cliente.get(f"{API}/minas/{local['mina']['id']}/documentos", headers=h, params={"unidade_id": local["nivel"]["id"]}).json()
    assert [x["id"] for x in lista] == [d["id"]]
    orig = cliente.get(f"{API}/documentos/{d['id']}/versoes/1/arquivo", headers=h)
    assert orig.status_code == 200 and orig.content.startswith(b"%PDF")


def test_extensao_falsa_e_tipo_nao_aceito(cliente, h, local):
    r = enviar(cliente, h, local["mina"], "croqui", [("croqui.pdf", jpeg())])
    assert r.status_code == 422 and "extensão" in r.json()["mensagem"]
    r = enviar(cliente, h, local["mina"], "foto", [("foto.pdf", pdf(1))])
    assert r.status_code == 422 and r.json()["codigo"] == "tipo_invalido"
    r = enviar(cliente, h, local["mina"], "planilha", [("dados.xlsx", b"PK\x03\x04qualquer")])
    assert r.status_code == 201  # outras categorias aceitam qualquer tipo


def test_fotos_em_lote_exif_e_miniatura(cliente, h, local):
    r = enviar(cliente, h, local["mina"], "foto", [("f1.jpg", jpeg()), ("f2.jpg", jpeg((10, 200, 30), exif_data=False))],
               unidade_id=local["gal"]["id"])
    assert r.status_code == 201
    f1, f2 = r.json()
    assert f1["exif"]["Model"] == "Camera Teste" and f1["data_documento"] == "2026-10-14"
    assert f2["exif"] is None and f2["data_documento"] is None
    assert (f1["versoes"][0]["largura_px"], f1["versoes"][0]["altura_px"]) == (800, 600)
    mini = cliente.get(f"{API}/documentos/{f1['id']}/versoes/1/arquivo", headers=h, params={"tipo": "miniatura"})
    assert mini.status_code == 200
    im = Image.open(io.BytesIO(mini.content))
    assert max(im.size) == 360


def test_tiff_tem_previa_png(cliente, h, local):
    d = enviar(cliente, h, local["mina"], "croqui", [("scan.tif", tiff_multipagina())]).json()[0]
    p = cliente.get(f"{API}/documentos/{d['id']}/versoes/1/arquivo", headers=h, params={"tipo": "previa"})
    assert p.status_code == 200 and p.headers["content-type"] == "image/png"
    assert Image.open(io.BytesIO(p.content)).size == (300, 200)


def test_versoes_preservam_o_original(app, cliente, h, local):
    d = enviar(cliente, h, local["mina"], "croqui", [("c.png", b"\x89PNG\r\n\x1a\n" + b"0" * 10)]).json()
    # PNG inválido (só a assinatura) é recusado ao ler dimensões
    assert d["codigo"] == "arquivo_ilegivel"
    im = io.BytesIO()
    Image.new("RGB", (40, 30)).save(im, "PNG")
    d = enviar(cliente, h, local["mina"], "croqui", [("c.png", im.getvalue())]).json()[0]
    im2 = io.BytesIO()
    Image.new("RGB", (80, 60)).save(im2, "PNG")
    r = cliente.post(f"{API}/documentos/{d['id']}/versoes", headers=h, data={"motivo": "Croqui redesenhado"},
                     files={"arquivo": ("c2.png", im2.getvalue())})
    assert r.status_code == 201
    v = r.json()["versoes"]
    assert [x["numero"] for x in v] == [1, 2] and v[1]["motivo"] == "Croqui redesenhado"
    assert r.json()["versao"] > d["versao"]
    v1 = cliente.get(f"{API}/documentos/{d['id']}/versoes/1/arquivo", headers=h)
    assert Image.open(io.BytesIO(v1.content)).size == (40, 30)  # original intacto
    with pytest.raises(IntegrityError, match="versões"), app.state.engine.begin() as c:
        c.execute(text("DELETE FROM documento_versao"))
    assert cliente.post(f"{API}/documentos/{d['id']}/versoes", headers=h, data={"motivo": "igual"},
                        files={"arquivo": ("c3.png", im2.getvalue())}).status_code == 409


def test_dividir_pdf_em_paginas(cliente, h, local):
    d = enviar(cliente, h, local["mina"], "croqui", [("fichas_outubro.pdf", pdf(4))], titulo="Fichas outubro",
               unidade_id=local["gal"]["id"]).json()[0]
    r = cliente.post(f"{API}/documentos/{d['id']}/dividir", headers=h)
    assert r.status_code == 201
    paginas = r.json()
    assert [p["titulo"] for p in paginas] == [f"Fichas outubro — pág. {k}" for k in range(1, 5)]
    assert all(p["versoes"][0]["paginas"] == 1 and p["origem_id"] == d["id"] for p in paginas)
    assert all(p["vinculos"][0]["alvo_id"] == local["gal"]["id"] for p in paginas)
    assert cliente.post(f"{API}/documentos/{d['id']}/dividir", headers=h).status_code == 409
    assert cliente.get(f"{API}/documentos/{d['id']}", headers=h).json()["paginas_separadas"] is True


@pytest.mark.skipif(not PDF_REAL.exists(), reason="PDF real de fichas não disponível nesta máquina")
def test_dividir_pdf_real_de_fichas(cliente, h, local):
    d = enviar(cliente, h, local["mina"], "croqui", [("OUTUBRO_2026.pdf", PDF_REAL.read_bytes())]).json()[0]
    assert d["versoes"][0]["paginas"] == 23
    assert len(cliente.post(f"{API}/documentos/{d['id']}/dividir", headers=h).json()) == 23


def test_anexo_em_ficha_aprovada_nao_sai(cliente, h, local):
    dic = {x["codigo"]: {t["codigo"]: t for t in x["termos"]} for x in cliente.get(f"{API}/dicionarios", headers=h).json()}
    f = cliente.post(f"{API}/mapeamentos", headers=h, json={"unidade_id": local["gal"]["id"], "data": "2026-10-14",
        "intervalos": [{"de_m": 0, "ate_m": 2, "litologia_id": dic["LITOLOGIA"]["GNP"]["id"]}]}).json()
    d = enviar(cliente, h, local["mina"], "foto", [("frente.jpg", jpeg())], mapeamento_id=f["id"]).json()[0]
    assert d["vinculos"][0]["rotulo"] == f"Ficha {f['numero']}" and d["vinculos"][0]["removivel"]
    cliente.post(f"{API}/mapeamentos/{f['id']}/submeter", headers=h)
    cliente.post(f"{API}/mapeamentos/{f['id']}/aprovar", headers=h)
    d = cliente.get(f"{API}/documentos/{d['id']}", headers=h).json()
    assert d["vinculos"][0]["removivel"] is False
    r = cliente.delete(f"{API}/documentos/vinculos/{d['vinculos'][0]['id']}", headers=h)
    assert r.status_code == 422
    # acrescentar um anexo novo continua possível (fica registrado na auditoria)
    assert enviar(cliente, h, local["mina"], "croqui", [("croqui.pdf", pdf(1))], mapeamento_id=f["id"]).status_code == 201
    lista = cliente.get(f"{API}/minas/{local['mina']['id']}/documentos", headers=h, params={"mapeamento_id": f["id"]}).json()
    assert len(lista) == 2


def test_metadados_arquivamento_e_filtros(cliente, h, local):
    d = enviar(cliente, h, local["mina"], "foto", [("f.jpg", jpeg())]).json()[0]
    r = cliente.patch(f"{API}/documentos/{d['id']}", headers=h,
                      json={"versao": d["versao"], "legenda": "Contato flogopita xisto / gnaisse", "identificador": "F-001"})
    assert r.status_code == 200 and r.json()["legenda"].startswith("Contato")
    base = f"{API}/minas/{local['mina']['id']}/documentos"
    assert len(cliente.get(base, headers=h, params={"texto": "F-001"}).json()) == 1
    assert len(cliente.get(base, headers=h, params={"categoria": "croqui"}).json()) == 0
    cliente.patch(f"{API}/documentos/{d['id']}", headers=h, json={"versao": r.json()["versao"], "arquivado": True})
    assert cliente.get(base, headers=h).json() == []
    assert len(cliente.get(base, headers=h, params={"arquivados": True}).json()) == 1


def test_permissoes(cliente, token_admin, local):
    _, t = criar_usuario(cliente, token_admin, "leitor", ["CONSULTA"])
    assert enviar(cliente, cab(t), local["mina"], "foto", [("f.jpg", jpeg())]).status_code == 403
    assert cliente.get(f"{API}/minas/{local['mina']['id']}/documentos", headers=cab(t)).status_code == 200
