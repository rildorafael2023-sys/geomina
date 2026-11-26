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
| 6 | Comparação: grupos, estatísticas, histograma, boxplot, dispersão | pendente |
| 7 | Visualização espacial 3D integrada | pendente |
| 8 | Consulta completa | pendente (base pronta na Etapa 2) |
| 9 | Exportação (CSV/Excel/PDF/imagens/GIS) | pendente |
| 10 | Testes e auditoria final | pendente |

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
