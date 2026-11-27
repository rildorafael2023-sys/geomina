# GeoMina

Software de gestão de dados geológicos para a rotina operacional de mina subterrânea: estrutura da mina, mapeamento geológico, croquis, fotografias, amostragem, geoquímica, topografia XYZ, visualização 3D, análise longitudinal, consultas, GIS e relatórios.

**Aplicativo local para o PC**: roda somente no computador do usuário (127.0.0.1), sem internet e sem rede.

## Estado atual — versão 0.22.0
- ✅ **Versão simplificada (pedido do usuário)**: o software fica só com a gestão de dados de amostragem, mapeamento e sondagem.
  - Saiu a **Geoquímica operacional** (tracks, comparação, 3D, consulta) e a análise longitudinal da galeria.
  - **Amostras**: clicar numa amostra abre o **perfil da frente** (trechos metro a metro com a litologia, a amostra de cada trecho e os teores de todos os elementos do laudo), com edição e impressão. A importação da planilha de campo grava todos os trechos de cada ponto, inclusive os não amostrados.
  - **Mapeamento geológico**: na ficha nova dá para **cadastrar o local na hora** (ex.: Travessa 1F5) e escolher a região onde ele fica. Todos os tipos de local podem ficar na raiz ou dentro de qualquer outro.
  - **Sondagem** (menu próprio): cadastro e importação de furos (collar, survey, descrição geológica, amostras), **log do furo** com descrição, profundidade, intervalos amostrados e teores por intervalo, e **fotos do testemunho** por intervalo/caixa.
  - Menu: itens de administração agrupados em "Administração".
- ✅ Etapa 1: arquitetura e especificação (aprovada).
- ✅ Etapa 2: infraestrutura (banco local, usuários, auditoria, arquivos, instalação offline) — validada no Windows.
- ✅ Etapa 3: estrutura da mina (níveis, galerias, travessas, rampas, frentes, avanços) + janela própria com ícone.
- ✅ Etapa 4: painel com dados reais, histórico de alterações, backup e restauração.
- ✅ Etapa 5: mapeamento geológico com ficha digital, estereograma, coluna da seção, revisão e impressão.
- ✅ Etapas 6 e 7: fotos, croquis e documentos com versões, EXIF, miniaturas e separação de PDF.
- ✅ Etapa 8: amostras, controle de qualidade, lotes de envio, importação de planilha.
- ✅ Etapa 9: laudos SGS, resultados geoquímicos, QA/QC e exportação.
- ✅ Etapa 10: topografia (shapefile da mina), calibração SAD69 → SIRGAS, planta, eixos de galeria e chainage 3D.
- ✅ Etapa 11: **teores na galeria** — faixa de teores (estilo "drillhole ribbon") com as amostras lado a lado do início ao fim, planta com a galeria colorida pelo teor, comparação entre amostras e entre galerias.
- ✅ **Geoquímica operacional** (reestruturação pedida pelo usuário, 10 etapas concluídas): Etapas 2–4 — área de trabalho com filtros encadeados, todos os resultados dos laudos, conciliação; tracks configuráveis das galerias (faixa/barras/pontos, escalas e classes próprias, zoom e seleção sincronizados, layouts salvos) com tracks geológicos; **sondagens** (importação com validação, trajetória por curvatura mínima, perfis por profundidade lado a lado); **comparação** entre grupos (estatísticas, boxplot, histograma, dispersão, correlação); **visualização 3D** (topografia, amostras de frente e furos coloridos pelo teor, seleção sincronizada); **consulta e exportação** (Excel com metadados, GeoPackage/GeoJSON 3D, relatório para PDF, imagens). Ver [`docs/GEOQUIMICA_OPERACIONAL.md`](docs/GEOQUIMICA_OPERACIONAL.md).
- ✅ Etapa 17: **relatórios** — produção por período, fichas de mapeamento (Excel/CSV), histórico de alterações.
- ✅ Etapa 18: **validação integrada** — segurança, teste de carga (20 mil amostras, 960 mil resultados), verificação de integridade. Ver [`docs/VALIDACAO_E18.md`](docs/VALIDACAO_E18.md).
- ✅ Etapa 19: **instalador `GeoMina-Setup.exe`** (não precisa de Python), backup automático diário e semanal com teste de restauração e cópia para uma segunda pasta.
- ⏳ Etapa 20: captura offline em tablet/celular.

Detalhes em [`docs/STATUS_DO_PROJETO.md`](docs/STATUS_DO_PROJETO.md). Instalação em [`docs/INSTRUCOES_DE_INSTALACAO.md`](docs/INSTRUCOES_DE_INSTALACAO.md).

## Tecnologia
Python · FastAPI (servidor interno local) · SQLite (WAL, R*Tree) · SQLAlchemy/Alembic · Shapely · pyproj/PROJ · React + TypeScript + Mantine. Three.js (3D, carregado só na aba espacial).
Justificativas em [`docs/DECISOES_TECNICAS.md`](docs/DECISOES_TECNICAS.md).

## Documentação

| Documento | Conteúdo |
|-----------|----------|
| [REQUISITOS](docs/REQUISITOS.md) | Requisitos rastreáveis |
| [ANALISE_CRITICA](docs/ANALISE_CRITICA.md) | Problemas e riscos da especificação e soluções propostas |
| [ARQUITETURA](docs/ARQUITETURA.md) | Arquitetura técnica e espacial |
| [BANCO_DE_DADOS](docs/BANCO_DE_DADOS.md) | Modelo de dados |
| [DECISOES_TECNICAS](docs/DECISOES_TECNICAS.md) | Registro de decisões |
| [PLANO_DE_DESENVOLVIMENTO](docs/PLANO_DE_DESENVOLVIMENTO.md) | Roadmap e critérios de aceitação |
| [TESTES](docs/TESTES.md) | Estratégia e registro de testes |
| [STATUS_DO_PROJETO](docs/STATUS_DO_PROJETO.md) | Situação atual e pendências |
| [DADOS_REAIS](docs/DADOS_REAIS.md) | O que os arquivos reais da mina mostraram |
| [GEOQUIMICA_OPERACIONAL](docs/GEOQUIMICA_OPERACIONAL.md) | Auditoria, decisões e etapas do módulo de geoquímica operacional |
| [FICHA_MAPEAMENTO](docs/FICHA_MAPEAMENTO.md) | Proposta da ficha digital de mapeamento |
| [INSTRUCOES_DE_INSTALACAO](docs/INSTRUCOES_DE_INSTALACAO.md) | Instalação (usuário e desenvolvimento) |
| [INSTRUCOES_DE_USO](docs/INSTRUCOES_DE_USO.md) | Manual (conforme módulos forem concluídos) |
