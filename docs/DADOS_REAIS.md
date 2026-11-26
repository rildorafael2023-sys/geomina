# ANÁLISE DOS ARQUIVOS REAIS DA MINA

> Arquivos enviados pelo usuário em 2026-11-25 e analisados com scripts próprios (leitura binária do shapefile/DBF, xlrd/openpyxl).
> **Os arquivos não estão no repositório** (são confidenciais). Aqui ficam apenas as conclusões que orientam o projeto.

## 1. Topografia — `2026.09.28_Atualização Topográfica.zip`

| Arquivo | CRS (.prj) | Registros | Vértices | Observação |
|---|---|---|---|---|
| `SAD/…Topográfica.shp` | SAD69 / UTM 23S | 44.273 | 119.190 | levantamento completo |
| `SAD/…Topográfica_Piso.shp` | SAD69 / UTM 23S | 10.143 | 20.331 | piso |
| `SIRGAS/2026.09.28_At.shp` | SIRGAS 2000 / UTM 23S | 10.143 | 20.321 | **mesmo piso em SIRGAS** (5 registros sem vértices) |

- Tipo geométrico: **PolyLineZ** (13) em todos. O Z é real (cota de ≈ 472 a 748 m).
- Extensão: ≈ 1,0 km × 0,9 km em planta (coordenadas não reproduzidas aqui por confidencialidade).
- `.cpg` = UTF-8 (ex.: "PONTO CONVERGÊNCIA").

### Achados que mudam o projeto
1. **São desenhos CAD convertidos (DXF→SHP), não eixos de galeria.** Os campos `Entity` (Line, 3DPolyline, Circle, Insert), `Layer`, `Color` e `Linetype` são do AutoCAD. 96% das feições são **segmentos de 2 vértices** (Line), em layers como PAREDE, TETO, PISO, TETO NORTE e PLANTA SUB-SOLO.
   → **Não há eixo de galeria pronto.** Para o chainage (Etapa 10) será preciso: (a) desenhar o eixo no aplicativo sobre a topografia; (b) receber eixos da topografia; ou (c) derivar uma linha central das paredes, de forma assistida e revisada pelo usuário. Nenhuma dessas opções será automática nem silenciosa.
2. **Layers com data embutida** ("ATUALIZA N144_02-07-2019", "RAMPA S.S_24-01-2019"): registram a evolução das escavações. O importador vai preservar o nome do layer e oferecer a data extraída como sugestão.
3. **Layers com Z inválido**: "PONTO CONVERGÊNCIA" (14.112 feições) e "SC" (8.544) têm Z < 400 m, fora da faixa da mina (provavelmente Z = 0 ou cotas de anotação). Serão marcados como "Z suspeito" e não aparecerão em 3D sem confirmação.
4. **Cabeçalho corrompido**: no `…_Piso.shp`, a faixa Z do cabeçalho é −1,8×10³⁰⁸ (valor "sem dado"). O importador deve calcular a extensão pelos registros, nunca pelo cabeçalho.
5. **Registros sem vértices** (5 no arquivo SIRGAS) devem ser contados e relatados, não descartados em silêncio.
6. **O mesmo piso está em SAD69 e em SIRGAS 2000**: é uma oportunidade de validar a transformação SAD69 → SIRGAS 2000 contra o resultado usado pela topografia da mina, antes de aplicá-la a qualquer dado.
7. Os campos `PONTO`, `DESC_` e `COTA` estão vazios ou zerados. A cota real está no Z dos vértices e em `Elevation`.

## 2. Laudos SGS — `GQ2613496.XLS`, `GQ2604840_1.XLS`

Formato Excel 97 (.xls), uma aba, layout fixo da SGS Geosol:

| Linha | Conteúdo |
|---|---|
| 0–5 | Cabeçalho: REP No. (= certificado, ex.: GQ2613496, com data/hora), Customer, Attention, Reference ("Pedido 24/09/2026"), Project ("Mina 01") |
| 7 | **Método por coluna** (ISE03A = F; XRF75V = Cl; GE_ICP40Q = multielementar; XRF = óxidos) |
| 8 | **Analito** (F, Cl, Ag, Al, …, SiO2, Al2O3, …, SOMA, LOI) |
| 9 | **Unidade** (ppm, %) |
| 10+ | Tipo da linha + código da amostra + valores |

- **Tipos de linha**: `SMP` (amostra), `DUP` (duplicata do laboratório), `REP` (replicata), `STD` (padrão, ex.: OREAS920B, SG_092). A amostra `BRANCO_PREP` é o branco de preparação.
  → O QA/QC proposto na Etapa 1 (B1) **é necessário**: os laudos já trazem esses controles.
- **Valores especiais**: `<0,5`, `<30` (abaixo do limite de detecção, **com vírgula decimal**), `>99`, `N.A.` (não analisado), `--` (não aplicável). Os números comuns vêm como número do Excel (ponto decimal).
- **A ordem das colunas muda entre laudos** (Cl foi da 2ª para a última coluna). O importador deve ler os cabeçalhos (analito + unidade + método), nunca posições fixas.
- O mesmo elemento aparece por métodos diferentes (Ca em % por ICP e CaO por XRF), o que confirma a decisão DT-008.
- `SOMA` e `LOI` são parâmetros, não elementos.

## 3. Planilha de campo — `GEOQUIMICA_DESCRIÇÃO.xlsx`

Aba "Pontos Campo Descrição": 912 linhas com dados, 252 pontos, 369 linhas de amostra (276 códigos distintos).

Colunas: Ponto, Sub Ponto, Direção da seção, Intervalo, Espessura, Litologia, Descrição de campo, X, Y, Z, Data, Amostra, Designação de campo, O que fazer com a amostra, Sn_rumo, Sn_dip, Foto.

### Achados
1. **Códigos de amostra escritos de várias formas**: "BS - RP - 225", "RP 478", "RP  478", "RP 478 ", "BS - RP - 237 - B", "BS - RP - 237 B". No laudo SGS o mesmo código aparece como "BS-RP-462A".
   → **Normalização obrigatória**: forma canônica `BS-RP-462A`. Na importação, cada código normalizado é **mostrado ao usuário para confirmar** (ex.: "RP 478" → "BS-RP-478" só com confirmação, pois "RP" sozinho é ambíguo).
2. **Litologias com grafias diferentes**: "Gnaisse Pelitico", "gnaisse pelitico", "Gnaisse Pelítico"; "Anfibolio gnaisse", "Anfibólio Gnaisse"… → dicionário com **sinônimos**, e a importação mapeia cada grafia para um termo.
3. **Intervalos em texto**: "0 m - 4,5 m", "1,80 m - 2,50 m" → conversão para de/até numéricos, com relatório das linhas que não puderem ser lidas.
4. **Coordenadas às vezes como texto** (ex.: "NNNNNN,5\n"), com vírgula e quebra de linha.
5. **Várias medidas estruturais numa célula** ("340   320   340" / "55   55   60") → separar em várias medidas, com confirmação.
6. Datas: 329 como data do Excel e 7 como texto.
7. Códigos repetidos (ex.: BS-RP-237B, RP301): podem ser uma mesma amostra em vários intervalos, ou duplicidades reais. A importação vai listá-los para decisão.
8. "Direção da seção" descreve o local em texto ("Lado esquerdo Rampa Sul Descendente", "Travessa 1F - 2 - Reta"). Isso confirma a necessidade da árvore de locais e da "exposição mapeada" na ficha nova.

## 4. Fichas digitalizadas — `OUTUBRO_2026_2.pdf`
Mostram fichas "Mapeamento Geotécnico Estrutural" manuscritas e escaneadas (23 páginas, 8,7 MB), com croqui da seção, coluna, medidas em direção de mergulho/mergulho (ex.: S1 230/30; FR-I 160/90), código de amostra ("RP-474AB") e descrição livre.
→ Base para o **módulo de croquis** (armazenar o PDF original, dividir por página e associar cada página a um local e data) e para a **nova ficha digital** (`FICHA_MAPEAMENTO.md`).
→ OCR de manuscrito: baixa confiabilidade esperada (confirma C6), por isso fica como item opcional.

## 5. Regras de código informadas pelo usuário
| Prefixo | Uso |
|---|---|
| **BS-RP** | amostragem de mina |
| **BMT-TS** | amostragem de testemunho de sondagem |
| **BE** | amostras antigas (mina e testemunho) |
| SAB-CP (visto no laudo) | **a confirmar** |

## 6. Planilha de campo × topografia (E11)
- **Sistema das coordenadas da planilha: SAD69 / UTM 23S.** Conferido: com SAD69, as amostras ficam a 1,8 m (mediana) e 3,6 m (90%) das linhas da topografia em SAD69; supondo SIRGAS, 13 m (90%).
- O local vem só como texto ("Direção da seção") e com muitas variações de escrita do mesmo lugar (ex.: 14 variações de "Travessa 1F2": "Travessa 1F - 2", "Travessa - 1F2 - Direita", "Tavessa 1F - 2 - Esquerda"…). Lados e ramos (Direita, Esquerda, Subindo, Câmara Refúgio) são lugares diferentes.
- Poucas amostras da planilha têm resultado nos dois laudos recebidos (as demais aguardam laudos).
