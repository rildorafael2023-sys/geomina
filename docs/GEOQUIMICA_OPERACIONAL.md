# GEOQUÍMICA OPERACIONAL — auditoria, decisões e andamento

Prompt de origem: "Reestruturação completa do módulo de geoquímica operacional" (enviado pelo usuário em 2026-11-26), executado em 10 etapas.
Este documento registra a auditoria (Etapa 1), as decisões do usuário e o andamento de cada etapa.

## Decisões do usuário (prevalecem sobre o texto do prompt)
| # | Decisão | Efeito |
|---|---|---|
| U1 | **Não usar eixo de distância** nem gráfico teor × distância nas galerias ("distância e ordem não precisa") | Os itens 6.3/8 e o critério "distância longitudinal acumulada" do prompt ficam substituídos: as amostras aparecem lado a lado, na sequência da galeria (faixa estilo *drillhole ribbon*), sem metros. O cálculo de chainage continua no banco para topografia/3D. |
| U2 | **Todos os resultados geoquímicos dos laudos devem poder ser usados** | A base da análise é o resultado do laudo, não só a amostra cadastrada: códigos que só existem no laudo entram como "só no laudo"; conciliação laudo × cadastro. |
| U3 | Executar todas as etapas em sequência até o fim (autorização de 2026-11-26) | Cada etapa é testada, documentada e publicada antes da seguinte. |
| — | Padrões adotados sem resposta (podem mudar): motor de gráficos próprio (SVG) + Three.js no 3D; feito para monitor (tablet: versão simplificada); sufixos A/B/C = sub-amostras do ponto; sondagem em formato genérico até chegarem exemplos reais | |

## Etapa 1 — Auditoria (resumo)
**Sólido e reaproveitado:** importação de laudos (48 analitos reais: 36 elementos, 10 óxidos, SOMA, LOI; valores especiais preservados), resultados imutáveis e preferidos, QA/QC, amostras com XYZ/CRS, topografia real com calibração SAD69→SIRGAS, eixos/chainage, classificação de teores, consulta da amostra.

**Problemas encontrados:**
1. A tela "Teores na galeria" era uma página que rola (filtros em acordeões, faixa, planta e tabela empilhadas); seleção não sincronizada; tracks fixos; geologia só da amostra; filtros não encadeados; comparação pobre; duas telas de geoquímica desconectadas; pouca área útil em monitor.
2. **Nos laudos reais, 74% dos resultados não entravam em nenhuma análise** (2.352 de 3.168 resultados de amostras; 49 de 66 amostras): sufixos de sub-amostra (BS-RP-428A/B com cadastro só de BS-RP-428), amostras ausentes da planilha (BS-RP-462…470), testemunhos BMT-TS (sem módulo de sondagem) e código fora das regras (SAB-CP-026).
3. Não existe sondagem nem 3D. A topografia não tem eixos. A geologia ao longo da galeria é pontual (fichas e amostras), não há trechos mapeados.

## Plano (etapas do prompt)
| Etapa | Conteúdo | Estado |
|---|---|---|
| 1 | Auditoria e plano | ✅ |
| 2 | Área de trabalho: navegação, filtros encadeados, área analítica, painel de contexto, base por resultado, conciliação | ✅ v0.12.0 |
| 3 | Galerias: tracks configuráveis (faixa/pontos/barras), seleção sincronizada, tabela integrada, layouts salvos | ✅ v0.13.0 |
| 4 | Tracks geológicos: litologia, alteração, mineralização, estruturas, descrição, fotos/croquis, amostras | ✅ v0.13.0 |
| 5 | Sondagens: banco, importação, survey/trajetória, perfil por profundidade | ✅ v0.14.0 |
| 6 | Comparação: grupos, estatísticas, histograma, boxplot, dispersão | ✅ v0.15.0 |
| 7 | Visualização espacial 3D integrada | ✅ v0.16.0 |
| 8 | Consulta completa | ✅ v0.17.0 |
| 9 | Exportação (CSV/Excel/PDF/imagens/GIS) | ✅ v0.17.0 |
| 10 | Testes e auditoria final | ✅ v0.18.0 |

## Etapa 2 — Área de trabalho (v0.12.0)
**Desenvolvido**
- Menu **Geoquímica operacional** (`/geoop`) com abas: Galerias e frentes · Sondagens · Comparação · Visualização espacial · Consulta de amostras. A tela de laudos passou a se chamar **Laboratório (laudos)**.
- Layout de trabalho em tela inteira: cabeçalho de uma linha (mina › nível › galeria, total de amostras, analitos, regra de <LD, exportar), **painel de seleção recolhível** à esquerda, **área analítica** no centro, **painel de contexto** à direita (abre ao selecionar). O menu geral pode ser recolhido (lembrado no navegador).
- **Estado compartilhado** entre as abas (filtros, analitos, regra de LD, seleção).
- **Filtros encadeados com contagens reais** (servidor): nível, galeria/travessa/rampa, trecho, litologia, alteração, mineralização, campanha, responsável, tipo, série, status do resultado, cadastro, laboratório, certificado, texto (código ou local), datas, faixa de teor. Cada faceta é calculada com os demais filtros (escolher o nível restringe as galerias).
- **Base por resultado do laudo (U2)**: amostras cadastradas + códigos só no laudo; status: com resultado / enviada aguardando / não enviada / só no laudo / cancelada.
- **Painel de contexto**: identificação, local (nível, galeria, trecho), coordenadas, seção, coleta, geologia, ficha, laboratório, **todos os resultados do laudo** (uma linha por analito com duplicata/replicata do laboratório ao lado), fotos e croquis da ficha.
- **Conciliação laudo × cadastro**: sub-amostras (herdam local, XYZ, galeria, ficha, data, campanha do ponto; litologia a informar), cadastro em lote das amostras só no laudo, lista dos códigos fora das regras e dos controles do laboratório.
- **Consulta**: tabela compacta paginada no servidor, ordenação, valores dos analitos escolhidos, seleção sincronizada com o painel de contexto; exportação CSV com os filtros no cabeçalho.
- **Galerias**: escolha rápida da galeria; faixa de teores da Etapa anterior dentro da nova área (substituída pelos tracks na Etapa 3); clique na coluna abre o contexto.
- Abas ainda não construídas informam o que virá e quantos dados já existem (sem dados de exemplo).

**Arquivos**: `backend/geomina/modules/geoop/` (servico.py, router.py), `amostragem/router.py` (BMT-TS fora do aviso de galeria), `frontend/src/paginas/geoop/` (GeoOp, estado, PainelFiltros, PainelContexto, Consulta, Galerias, Pendente), `componentes/Layout.tsx`, `App.tsx`, `e2e/geoop.cjs` (substitui `e2e/longitudinal.cjs`).

**Testes**: `tests/test_geoop.py` (6: todos os resultados entram, facetas encadeadas e contagens, conciliação, CSV, chave antiga após conciliar, **laudos reais: 66 amostras, 3.168 resultados e 48 analitos representados**); E2E `geoop.cjs` (8 cenários) + regressão das demais suítes.

**Defeitos encontrados e corrigidos**: painel de contexto travava após conciliar (a chave "só no laudo" mudou para a da amostra cadastrada); testemunho BMT-TS era cobrado como "amostra sem galeria"; busca "rp 3" não ignorava hífens.

**Limitações**: a faixa de teores ainda usa a classificação por quantis fixa (configuração nos tracks da Etapa 3); a seleção ainda não é destacada na faixa (Etapa 3); filtros não são guardados entre sessões (layouts salvos na Etapa 3).

## Etapas 3 e 4 — Tracks das galerias e geologia (v0.13.0)
**Desenvolvido**
- **Motor de tracks** próprio (SVG): uma coluna por amostra na sequência da galeria (decisão U1: sem escala de distância); número do ponto no topo; sub-pontos lado a lado.
- **Janela compartilhada por todos os tracks**: roda do mouse = zoom em torno do cursor; arrastar = deslocar; "Ver todas". **Shift+arrastar = seleção de trecho**, com ações: ampliar o trecho, exportar o trecho (CSV), limpar; o trecho é destacado também na tabela.
- **Track de analito** (um por analito escolhido no topo; qualquer analito do laudo): representação **faixa colorida, barras ou pontos**; escala **linear ou logarítmica**, mínimo/máximo; **classes** por quantis, intervalos iguais ou limites do usuário; 3 paletas; mostrar valores; ligar pontos (opcional, só valores medidos, com aviso de que não indica continuidade); altura P/M/G; subir/descer; remover. Sem resultado = hachurado; abaixo/acima do limite = contorno tracejado/triângulo vazado.
- **Tracks geológicos** (Etapa 4): Amostras (código, intervalo da seção, estado do resultado), Litologia, Alteração, Mineralização (células só onde há registro — nenhum contato inventado), **Estruturas** medidas na ficha da amostra (ex.: "S1 230/30", "FR 160/85"), **Descrição**, **Fotos e croquis** da ficha (📷/✎ com quantidade; abrem no painel de contexto).
- **Seleção sincronizada**: clique na coluna, na linha da tabela ou no ponto da planta → mesma amostra destacada nos três e aberta no painel de contexto; a janela vai até a amostra selecionada se ela estiver fora.
- **Tabela integrada**: mesma sequência, ordenável por coluna, colunas configuráveis (seção, data, litologia, alteração, mineralização), cor da classe ao lado do valor.
- **Planta**: topografia em volta, galeria colorida pelo teor (média do ponto, classes do track escolhido), amostra selecionada destacada.
- **Layouts salvos** (banco, migração 0009 `layout_analise`): tracks + analitos com nome; compartilháveis; aplicáveis a qualquer galeria; só o dono exclui.
- **Exportação**: tabela da galeria (CSV), tracks em SVG/PNG (colunas visíveis), trecho selecionado (CSV).

**Arquivos**: `frontend/src/paginas/geoop/tracks/` (tipos, TracksGaleria, ConfigTrack), `Galerias.tsx` (reescrito), `PlantaGaleria.tsx`, `estado.ts`; `backend/geomina/modules/geoop/models.py` + rotas de layouts; `analise/longitudinal.py` (estruturas, descrição, fotos/croquis por amostra); migração `0009_layout_analise.py`.

**Testes**: `test_geoop.py` +2 (layouts: substituir por nome, compartilhado visível, só o dono exclui; geologia da ficha: estruturas "230/30" e "315→20", descrição, ficha); E2E `geoop_galerias.cjs` (7 cenários: ordem dos tracks e colunas, configuração barras/log/limites/pontos/reordenar, tracks geológicos, sincronização coluna↔tabela↔planta↔contexto, zoom e seleção de trecho com exportação e ampliação, layout salvo e reaplicado, SVG).

**Defeitos corrigidos**: o contorno de seleção tinha o mesmo atributo das colunas (contagem errada de colunas); o ⚙ ficava sobre o valor máximo da escala.

**Limitações**: a exportação dos tracks cobre as colunas visíveis (amplie "Ver todas" para exportar tudo); estruturas/descrição/fotos vêm da ficha ligada à amostra (amostras sem ficha não têm esses tracks preenchidos); a tela antiga `analise/Longitudinal.tsx` ainda contém componentes não usados (limpeza na Etapa 10).

## Etapa 5 — Sondagens (v0.14.0)
**Desenvolvido**
- **Banco** (migração 0010): `furo` (collar com sistema de coordenadas, azimute, inclinação, referência do azimute e correção, profundidades, projeto, área, datas, responsável, método), `survey_furo`, `intervalo_furo` (litologia/alteração/mineralização dos dicionários, estruturas, descrição; texto fora do dicionário guardado como original) e `amostra.furo_id` (a amostra BMT-TS usa a profundidade de/até que já existia). Resultados continuam na tabela única (U2). Permissões `sondagem:ler` e `sondagem:importar`.
- **Trajetória** (`espacial/trajetoria.py`): curvatura mínima com o survey; posição em qualquer profundidade **sobre o arco** (não sobre a corda); sem survey suficiente = reta pela orientação do collar, sempre marcada **estimada**; furos ascendentes de subsolo; correção de azimute (declinação/convergência).
- **Importação** (CSV/Excel, até 4 arquivos: collar, survey, geologia, amostras), cabeçalhos em português ou inglês, **convenção de inclinação escolhida pelo usuário** (horizontal negativa, horizontal positiva para baixo, a partir da vertical). Prévia com erros (furo repetido/já cadastrado/sem coordenada, survey fora do furo ou repetido, de ≥ até, além do fundo, sobreposição, código de amostra inválido, furo sem trajetória possível) e avisos (lacunas, termo fora do dicionário, furo ascendente, trajetória estimada). Grava tudo, ou só as linhas sem erro por escolha do usuário; liga/cadastra as amostras e os resultados já importados.
- **Tela Sondagens**: lista de furos (trajetória real/estimada, intervalos, amostras com resultado); **perfil por profundidade** com tracks configuráveis (litologia, alteração, mineralização, estruturas, amostras, descrição, um por analito em faixa/barras/pontos com escala e classes); **vários furos lado a lado com a mesma escala de profundidade e as mesmas classes**; zoom (roda), deslocamento, **seleção de intervalo** (Shift+arrastar) com contagem e ampliação; clique na amostra → painel de contexto; clique no intervalo → detalhes geológicos e amostras do intervalo; **planta e seção X–Z das trajetórias** (estimada tracejada) com as amostras coloridas; exportação SVG/PNG do perfil e CSV de intervalos e resultados.

**Testes**: `test_trajetoria.py` (8 casos calculados à mão: vertical, inclinado, curva de 90° com ponto a meio arco exato, survey reto = reta, prolongamento, declinação, ascendente); `test_sondagem.py` (4: validação com 9 tipos de erro e avisos, gravação, perfil com profundidades e resultados, XYZ das amostras na trajetória, convenções de inclinação, furo em SAD69 sem transformação aprovada fica no sistema original com aviso, furo sem trajetória não é gravado); E2E `geoop_sondagens.cjs` (6 cenários). Migração 0010 testada numa cópia dos dados reais (triggers e índice espacial preservados, integridade ok).

**Defeitos encontrados e corrigidos**: interpolação da posição na corda em vez do arco (erro de até ~18 m com survey espaçado); furo sem trajetória marcado como erro mas que seria gravado com "ignorar erros"; aviso de seleção que deslocava o perfil durante o arraste; migração automática que apagaria o índice espacial e recriaria a tabela de amostras (sem os triggers) — reescrita à mão.

**Limitações**: sem dados reais de sondagem até agora (formato genérico; ajustar quando chegarem os arquivos); o painel de contexto da amostra de furo mostra furo e profundidade, mas ainda não a coordenada calculada na trajetória (aparece no perfil e no 3D); edição manual de survey/intervalos pela tela ainda não existe (importação ou cadastro do collar).

## Etapa 6 — Comparação (v0.15.0)
**Desenvolvido**
- **Grupos**: "+ Grupo da seleção atual" guarda os filtros do painel (nível, galeria, trecho, **furo** — nova faceta —, geologia, campanha, responsável, status, laboratório, certificado, texto, datas); "Agrupar por…" cria um grupo para cada galeria, furo, nível, trecho, campanha, litologia, alteração, mineralização, responsável ou certificado (até 12), respeitando os demais filtros. A descrição dos filtros fica ao lado de cada grupo e vai para o CSV.
- **Estatísticas no servidor** (`geoop/estatistica.py`, sobre os registros efetivamente selecionados): n, mínimo, Q1, mediana, Q3, máximo, média, desvio-padrão amostral, CV, média geométrica (só com valores positivos); quantos valores estão no limite e quantos sem valor. Por padrão só valores medidos; opção "incluir valores no limite" pela regra de LD escolhida.
- **Correlação** Pearson e Spearman (postos médios nos empates) entre os analitos, por grupo, só com pares em que os dois valores existem (mínimo 3 pares; variável constante → sem coeficiente).
- **Vistas**: tabela de estatísticas (exporta CSV), **boxplot** por analito (caixa, mediana, média ◆, bigodes mín–máx e as amostras), **histogramas** com as mesmas classes para todos os grupos (Sturges, linear ou log), **dispersão** X × Y colorida por grupo com r e ρ, **matriz de correlação** (Spearman) por grupo. Escala log opcional.
- Nenhuma equivalência espacial é assumida entre grupos (só distribuições).

**Testes**: `test_comparacao.py` (estatísticas e correlação conferidas à mão, inclusive empates; API com 3 grupos, grupo vazio sem números inventados, valores no limite fora/dentro, faceta furo); `vitest` histograma (bordas lineares/log, Sturges, contagem com o máximo); E2E `geoop_comparacao.cjs` (6 cenários: agrupar por galeria, estatísticas conferidas célula a célula, incluir limite, boxplot/log/histograma/dispersão/correlação, grupo da seleção com descrição do filtro, CSV).

**Limitações**: até 12 grupos; seleção espacial desenhada (polígono) para formar grupo vem com o 3D/planta na Etapa 7.

## Etapa 7 — Visualização espacial 3D (v0.16.0)
**Desenvolvido**
- **Servidor** (`/minas/{id}/geoop/espacial`): para a seleção do painel, amostras de frente como **ponto** (X/Y/Z medidos) e amostras de furo como **segmento de/até sobre a trajetória**, no sistema da mina (conversão só com transformação aprovada); trajetórias de todos os furos (estimada identificada); lista do que ficou **sem posição** e por quê (sem cota, sistema sem transformação aprovada, só no laudo, sem coordenadas/furo). Nada é posicionado sem dado.
- **Visor** (Three.js 0.186.1, carregado só nesta aba): origem local (precisão com coordenadas UTM), Z para cima; camadas liga/desliga: topografia (linhas com cota em volta da seleção), amostras de frente (esferas), trajetórias (contínua = survey, **tracejada = estimada**, cone na boca), intervalos de furo (cilindros de/até). Girar, deslocar, zoom, "Enquadrar".
- **Cor pelo analito** escolhido (qualquer analito dos laudos) com classes por quantis ou intervalos iguais, 3–7 classes, 3 paletas e legenda; cinza = sem resultado. **Trocar analito/classes/camadas não reconstrói a geometria** (só recolore).
- **Clique** num objeto: seleciona a amostra (painel de contexto, e a mesma seleção vale nas outras abas), mostra a **coordenada real** (E/N/Z, EPSG) do ponto clicado; a amostra selecionada fica destacada.
- Painel de contexto: amostras de furo passam a mostrar a coordenada calculada na trajetória (meio do intervalo), identificada como calculada/estimada.
- Sem WebGL no computador: aviso claro (as outras abas continuam).

**Desempenho medido (dados reais: 10.138 feições de topografia, 318 amostras)**: geometria da topografia 193 ms / 1,2 MB; consulta de amostras 74 ms; cena 3D 50 ms; comparação de 3 grupos 185 ms.

**Testes**: `test_comparacao.py::test_espacial_frente_e_furo` (ponto, segmento do furo calculado, motivos de "sem posição", trajetória, unidades); E2E `geoop_espacial.cjs` com a **topografia real** como fundo (coordenadas calculadas da extensão, nenhuma no código): contagem de objetos, cor por classe, troca de analito sem reconstruir, clique em amostra de frente e em intervalo de furo → contexto e coordenada, camada desligada não seleciona, filtro do painel vale no 3D.

**Limitações**: topografia no 3D limitada à vizinhança da seleção (desempenho); sem desenho de polígono para seleção espacial (filtros do painel cobrem nível/galeria/furo); testado com WebGL por software (SwiftShader) — conferir no PC do usuário.

## Etapas 8 e 9 — Consulta e exportação (v0.17.0)
**Etapa 8 — Consulta**
- Nova faceta **Elemento analisado** (amostras com resultado de um analito); ordenação pelo **maior teor** de qualquer analito escolhido (no servidor, sem valor no fim); **colunas configuráveis** (nível, galeria, trecho/local, furo e profundidade, coordenadas, coleta, litologia, alteração, mineralização, laboratório/certificado).
- **Navegação a partir da amostra** (painel de contexto → "Ir para"): tracks da galeria (aplica o filtro da galeria e mantém a amostra destacada), perfil do furo, 3D, ficha de mapeamento, cadastro de amostras. A seleção continua a mesma em todas as abas.

**Etapa 9 — Exportação** (menu "Exportar" no topo; sempre com a seleção atual)
- **Tabela CSV** (filtros no cabeçalho) e **Excel** com aba "Amostras" (valor como no laudo + valor numérico da regra de LD em colunas separadas) e aba **"Metadados"** (GeoMina e versão, data, usuário, mina, sistema de coordenadas, filtros, regra de LD, observações).
- **GeoPackage** (OGC 1.3, escrito direto em SQLite, sem GDAL) e **GeoJSON**: amostras de frente como POINT Z e amostras de furo como LINESTRING Z (de → até na trajetória), no sistema da mina, com atributos e os analitos (laudo, valor, unidade). Validado com GDAL (pyogrio) fora do aplicativo: tipos, CRS EPSG:31983 e campos lidos corretamente.
- **Relatório da seleção** para imprimir ou salvar como PDF: cabeçalho (mina, data, usuário, sistema), filtros, contagem por status, estatísticas por analito e tabela das amostras (até 1.000; a lista completa vai no Excel). Na impressão só o relatório aparece.
- **Imagens**: tracks e perfis (SVG/PNG, já existiam), gráficos da comparação (SVG/PNG) e vista 3D (PNG).

**Testes**: `test_comparacao.py` +1 (ordem por valor, faceta elemento, Excel lido de volta com metadados, GeoJSON e GeoPackage lidos de volta — cabeçalho GP, SRS, geometrias Z e atributos); E2E `geoop_consulta.cjs` (5 cenários: ordenação/colunas/elemento; navegação galeria → furo → 3D; CSV, Excel, GeoPackage, GeoJSON e PNG do 3D; SVG da comparação; relatório com impressão).

**Limitações**: Shapefile não é gerado (GeoPackage é o formato recomendado; o QGIS converte se precisar); o relatório em PDF usa a impressão do navegador (sem gráficos embutidos — exporte as imagens).

## Etapa 10 — Testes e auditoria final (v0.18.0)
**Correções da auditoria**
- Segurança: na exportação (GeoPackage/Excel/GeoJSON) os analitos pedidos passam a ser conferidos contra o cadastro de analitos — o código vira nome de coluna no GeoPackage e um texto malicioso podia corromper o arquivo exportado (o banco da mina nunca esteve exposto). Teste com nome malicioso acrescentado.
- Limpeza: removida a tela antiga "Teores na galeria" (`analise/Longitudinal.tsx`, `ConsultaAmostra.tsx`), substituída pela área de trabalho; tipos movidos para `geoop/tipos.ts`; `SemLocal` movido para `geoop/`.
- Todas as rotas novas (geoop, sondagem, layouts, topografia) exigem login e permissão (verificado por inspeção automática das rotas).

**Critérios de aceitação do prompt (§22)**
| Critério | Situação |
|---|---|
| Dados reais do banco | ✅ todas as telas leem o banco; laudos reais: 66 amostras / 3.168 resultados / 48 analitos visíveis |
| Filtros funcionais (encadeados) | ✅ facetas calculadas no servidor com contagens |
| Tracks configuráveis | ✅ faixa/barras/pontos, escala, limites, classes, cores, altura, ordem, layouts salvos |
| Geometria real / distância longitudinal acumulada | ⚠️ **substituído pela decisão U1 do usuário** (sem eixo de distância; colunas na sequência da galeria). O chainage 3D continua calculado (E10) para topografia e 3D |
| Sincronização entre tracks, escalas independentes | ✅ zoom/deslocamento/seleção comuns; escala própria por track |
| Integra geologia, amostras, tabelas, consulta | ✅ tracks geológicos, painel de contexto, tabela integrada |
| Análise de sondagens, profundidades reais, survey | ✅ curvatura mínima; estimada identificada |
| Comparação | ✅ grupos, estatísticas, boxplot, histograma, dispersão, correlação |
| Visualização espacial integrada | ✅ 3D com seleção sincronizada |
| Exportação | ✅ CSV, Excel com metadados, GeoPackage, GeoJSON, relatório PDF, imagens |
| Nada fictício | ✅ abas sem dados informam a falta; nenhum dado de exemplo |
| Testes, funcionalidades anteriores preservadas, documentação | ✅ 202 testes de servidor, 13 de interface, 14 suítes ponta a ponta (todas as anteriores passando) |

**Limitações conhecidas (documentadas)**
- Sem dados reais de sondagem (importação genérica; ajustar ao formato da mina quando os arquivos chegarem).
- Geologia ao longo da galeria é pontual (amostra/ficha); não há trechos mapeados contínuos.
- Muitos locais da planilha de campo ainda precisam ser ligados às galerias e seus ramos (pendência P9).
- 3D testado com WebGL por software; conferir no PC do usuário.
- Shapefile não é exportado (GeoPackage recomendado).
- Edição manual de survey/intervalos de furo pela tela ainda não existe (via importação).
