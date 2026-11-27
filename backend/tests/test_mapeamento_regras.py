"""Regras puras do mapeamento (casos calculados à mão — TESTES.md §3.2)."""

import pytest

from geomina.modules.dicionarios.models import normalizar
from geomina.modules.mapeamento.regras import ErroRegra, Faixa, linha, normalizar_codigo, plano, serie_de_codigo, verificar_intervalos


# ------------------------------------------------------------------ orientações
@pytest.mark.parametrize("a,b,conv,esperado", [
    (230, 30, "dipdir_dip", (230, 30)),          # ficha da mina: S1 230/30
    (90, 45, "strike_rhr_dip", (180, 45)),       # caso de referência do plano de testes
    (300, 60, "strike_rhr_dip", (30, 60)),       # passa de 360 → 30
    (360, 10, "dipdir_dip", (0, 10)),            # 360 normalizado para 0
    (0, 90, "dipdir_dip", (0, 90)),              # vertical
])
def test_conversao_de_planos(a, b, conv, esperado):
    assert plano(a, b, conv) == esperado


@pytest.mark.parametrize("a,b", [(230, 95), (230, -1), (400, 30), (-5, 30)])
def test_valores_fora_de_faixa_rejeitados(a, b):
    with pytest.raises(ErroRegra):
        plano(a, b, "dipdir_dip")


def test_linha():
    assert linha(315, 20) == (315, 20)
    with pytest.raises(ErroRegra):
        linha(315, 91)


# ------------------------------------------------------------------ intervalos
def test_intervalos_da_ficha_real_sem_avisos():
    # ficha de 14/10/26: 0–1,40 / 1,40–1,80 / 1,80–2,20 / 2,20–3,20 m
    faixas = [Faixa(0, 1.4, "1"), Faixa(1.4, 1.8, "2"), Faixa(1.8, 2.2, "3"), Faixa(2.2, 3.2, "4")]
    assert verificar_intervalos(faixas, altura=3.2) == []


def test_sobreposicao_e_erro_lacuna_e_aviso():
    with pytest.raises(ErroRegra, match="sobrepostos"):
        verificar_intervalos([Faixa(0, 2, "1"), Faixa(1.5, 3, "2")])
    avisos = verificar_intervalos([Faixa(0.5, 1, "1"), Faixa(1.2, 3, "2")], altura=2.5)
    assert any("começa em 0.5" in a for a in avisos)
    assert any("Lacuna" in a and "1 m" in a and "1.2 m" in a for a in avisos)
    assert any("passa da altura" in a for a in avisos)


def test_intervalo_invertido():
    with pytest.raises(ErroRegra):
        verificar_intervalos([Faixa(2, 1, "1")])


# ------------------------------------------------------------------ códigos de amostra (grafias da planilha real)
@pytest.mark.parametrize("texto,canonico", [
    ("BS - RP - 225", "BS-RP-225"),
    ("BS-RP-462A", "BS-RP-462A"),
    ("BS - RP - 237 - B", "BS-RP-237B"),
    ("BS - RP - 237 B", "BS-RP-237B"),
    ("bs-rp-468b", "BS-RP-468B"),
    ("BMT-TS-458", "BMT-TS-458"),
    ("BMT - TS - 386", "BMT-TS-386"),
])
def test_codigos_normalizados(texto, canonico):
    c = normalizar_codigo(texto)
    assert c.codigo == canonico and c.aviso is None


@pytest.mark.parametrize("texto,sugestao", [("RP 478", "BS-RP-478"), ("RP  301", "BS-RP-301"), ("RP-474AB", "BS-RP-474AB")])
def test_rp_sem_prefixo_vira_sugestao_nao_conversao(texto, sugestao):
    c = normalizar_codigo(texto)
    assert c.codigo is None and c.sugestao == sugestao and "confirme" in c.aviso


def test_codigo_antigo_be_aceito_com_aviso():
    c = normalizar_codigo("BE-1234")
    assert c.codigo == "BE-1234" and "antiga" in c.aviso


@pytest.mark.parametrize("texto,canonico", [("Be-01-158", "BE-01-158"), ("BE 01 158", "BE-01-158"), ("be-01-0012a", "BE-01-012A"),
                                            ("BE01-15", "BE-01-015")])
def test_codigo_be_01_dos_laudos_antigos(texto, canonico):
    assert normalizar_codigo(texto).codigo == canonico


@pytest.mark.parametrize("texto,canonico,serie", [("SAB-CP-026", "SAB-CP-026", "SAB-CP"), ("T1-034", "T1-034", "T"),
                                                  ("12-W-45", "12-W-45", "W"), ("SC4 / 12", "SC4-12", "SC"), ("ANA-CP-3", "ANA-CP-3", "ANA-CP")])
def test_outras_series_aceitas_como_estao(texto, canonico, serie):
    c = normalizar_codigo(texto)
    assert c.codigo == canonico and "cadastrado como está" in c.aviso and serie_de_codigo(canonico) == serie


@pytest.mark.parametrize("texto", ["x", "123", "", "Página", "A" * 31 + "1"])
def test_codigos_fora_da_regra(texto):
    assert normalizar_codigo(texto).codigo is None


# ------------------------------------------------------------------ normalização de termos
@pytest.mark.parametrize("a,b", [
    ("Gnaisse Pelitico", "gnaisse pelítico"),
    ("Anfibolio - flogopita xisto", "Anfibólio-flogopita xisto"),
    ("  anfibolio   gnaisse ", "Anfibólio Gnaisse"),
])
def test_grafias_da_planilha_equivalem(a, b):
    assert normalizar(a) == normalizar(b)
