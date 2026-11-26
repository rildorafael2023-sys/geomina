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
| 3 | Galerias: tracks configuráveis (faixa/pontos/barras), seleção sincronizada, tabela integrada, layouts salvos | pendente |
| 4 | Tracks geológicos: litologia, alteração, mineralização, estruturas, descrição, fotos/croquis, amostras | pendente |
| 5 | Sondagens: banco, importação, survey/trajetória, perfil por profundidade | pendente |
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
