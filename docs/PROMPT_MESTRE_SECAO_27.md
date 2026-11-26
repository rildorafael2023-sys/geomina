# PROMPT MESTRE — Seção 27 (acrescentada em 2026-11-26)

> Texto enviado pelo usuário para ser **acrescentado ao Prompt Mestre** (seções 1–26). Mantido como recebido.
> Análise crítica, mapeamento para etapas e ordem de execução: `ANALISE_CRITICA.md` §27 e `PLANO_DE_DESENVOLVIMENTO.md`.

## MÓDULO INTEGRADO — VISUALIZAÇÃO, ANÁLISE GEOQUÍMICA ESPACIAL, PERFIS DE GALERIAS E SONDAGENS

### 1. OBJETIVO GERAL

Desenvolver um módulo integrado de visualização, consulta, análise e interpretação geológica e geoquímica, capaz de representar espacialmente os dados de amostragem subterrânea de frente e os resultados geoquímicos provenientes de sondagens.

O módulo deverá integrar os dados geoquímicos ao banco de dados geológico principal do software, permitindo a visualização dos teores, litologias, alterações, mineralizações, estruturas, intervalos amostrados, fotografias, croquis, galerias, rampas, travessas, frentes de lavra, furos de sondagem e topografia subterrânea.

O objetivo é permitir que o geólogo analise a distribuição dos teores tanto ao longo do desenvolvimento subterrâneo quanto ao longo das sondagens, utilizando gráficos, perfis geológicos, seções, consultas analíticas e visualizações espaciais tridimensionais.

O sistema deverá permitir que os dados de amostragem de frente e sondagem sejam analisados individualmente ou em conjunto, respeitando as características geométricas, espaciais e metodológicas de cada origem de dados.

Não deverá ser apenas um sistema de apresentação de gráficos. Deverá ser um módulo funcional, conectado ao banco de dados real, capaz de consultar, filtrar, relacionar, visualizar, comparar e exportar informações geológicas e geoquímicas.

### 2. VISUALIZAÇÃO GEOQUÍMICA DAS AMOSTRAGENS DE FRENTE

#### 2.1. Organização e associação dos dados

O sistema deverá utilizar os registros de amostragem de frente já cadastrados no módulo de amostragem e no banco de dados geoquímico principal.

Cada amostra deverá manter seus relacionamentos com: ID da amostra; mina; nível; galeria; travessa; rampa; subdivisão ou trecho; frente de lavra; coordenadas X, Y e Z; data da coleta; responsável pela coleta; litologia; alteração; mineralização; estruturas geológicas; descrição geológica; fotografias; croquis; intervalo ou posição de coleta, quando disponível; laboratório; resultados analíticos; demais informações cadastradas no sistema.

Os dados deverão ser recuperados diretamente do banco de dados principal, sem criação de bancos paralelos desnecessários.

#### 2.2. Análise longitudinal de teores ao longo das galerias

O software deverá possuir uma ferramenta para análise geoquímica longitudinal ao longo das galerias, travessas, rampas e demais estruturas subterrâneas.

O geólogo deverá poder selecionar uma galeria, travessa, rampa ou trecho específico e visualizar a distribuição dos resultados geoquímicos ao longo do desenvolvimento subterrâneo.

A representação deverá utilizar a geometria espacial real da estrutura subterrânea, quando disponível.

O eixo horizontal dos gráficos deverá representar a distância acumulada ao longo da trajetória da galeria ou estrutura selecionada.

Essa distância deverá ser calculada a partir da geometria real, considerando os segmentos, curvas, mudanças de direção, inclinação e demais características da trajetória.

Não deverá ser utilizada apenas a distância em linha reta entre o ponto inicial e o ponto final da galeria quando existir geometria detalhada disponível.

O sistema deverá permitir: selecionar galerias, travessas, rampas e trechos; visualizar os resultados geoquímicos ao longo da distância acumulada; selecionar qualquer variável geoquímica disponível no banco; construir gráficos individuais por elemento ou variável; comparar diferentes variáveis; comparar diferentes trechos; comparar galerias ou campanhas; filtrar resultados por litologia, alteração, mineralização, estruturas, data, período de amostragem, geólogo ou responsável, tipo de amostragem, intervalo de teor, nível, galeria, travessa, rampa ou frente; selecionar amostras individualmente; consultar os dados completos associados à amostra; exportar gráficos e conjuntos de dados filtrados.

#### 2.3. Representação gráfica longitudinal

O gráfico longitudinal deverá possuir: eixo X: distância acumulada ao longo da galeria; eixo Y: valor da variável geoquímica selecionada; pontos ou representações gráficas correspondentes às amostras; identificação dos intervalos ou posições de amostragem; identificação das amostras; escala ajustável; zoom; seleção de intervalos; consulta interativa; filtros dinâmicos; exportação.

O sistema deverá permitir que o usuário selecione diferentes variáveis geoquímicas de forma dinâmica, incluindo, mas não se limitando a: Cr, V, Ni, Be, MgO, K2O, TiO2, Fe2O3, CaO, Na2O, SiO2, Al2O3, F, Cl e demais elementos, óxidos ou parâmetros disponíveis no banco de dados.

Não deverá existir uma lista fixa e limitada de elementos. A ferramenta deverá utilizar as variáveis analíticas efetivamente disponíveis.

#### 2.4. Comparação de elementos

O sistema deverá permitir a visualização simultânea de diferentes variáveis geoquímicas ao longo do mesmo trecho subterrâneo.

Por exemplo, o usuário poderá visualizar Cr, V, Be e MgO ao longo da mesma galeria, organizados em gráficos individuais alinhados pelo eixo de distância acumulada.

Cada gráfico deverá permitir configuração independente da escala vertical, evitando que diferenças de magnitude entre os elementos prejudiquem a interpretação.

Deverá permitir: visualização de múltiplos elementos; gráficos independentes; alinhamento espacial dos gráficos; comparação de tendências; seleção de intervalos comuns; configuração independente de escalas; consulta das amostras; exportação dos gráficos.

O sistema deverá permitir que o geólogo escolha quais variáveis deseja comparar, sem obrigar a utilização de um conjunto predefinido.

#### 2.5. Comparação entre galerias e trechos

O sistema deverá permitir a comparação geoquímica entre diferentes galerias, travessas, rampas, trechos e campanhas de amostragem.

A comparação deverá respeitar as características espaciais de cada estrutura.

O sistema não deverá assumir automaticamente que distâncias acumuladas de galerias diferentes representam posições espacialmente equivalentes.

A comparação deverá permitir: seleção de duas ou mais galerias; seleção de trechos específicos; seleção de elementos; comparação de resultados; comparação de tendências; filtragem por litologia, alteração, mineralização, período e campanhas; exportação.

Quando houver correspondência espacial ou geológica entre estruturas diferentes, o sistema poderá permitir comparações adicionais, desde que a referência utilizada seja explicitamente identificada.

### 3. VISUALIZAÇÃO ESPACIAL DAS AMOSTRAGENS DE FRENTE EM 3D

#### 3.1. Integração das amostras à geometria subterrânea

As amostras de frente deverão ser representadas espacialmente no visualizador tridimensional da mina, utilizando suas coordenadas e relacionamentos com as estruturas subterrâneas.

O sistema deverá permitir visualizar as amostras em relação a: galerias; travessas; rampas; níveis; frentes; topografia subterrânea; mapeamentos geológicos; litologias; alterações; mineralizações; estruturas; fotografias; croquis; furos de sondagem.

As amostras deverão ser posicionadas conforme os dados espaciais efetivamente cadastrados.

Não deverá inventar posições, dimensões ou geometria de amostras quando essas informações não estiverem disponíveis.

#### 3.2. Representação dos teores espacialmente

O usuário deverá poder selecionar uma variável geoquímica e visualizar os resultados espacialmente na geometria subterrânea.

Por exemplo, ao selecionar Cr, o sistema deverá representar as amostras de frente conforme os valores de Cr, utilizando uma escala de cores configurável.

O usuário poderá alternar para Be, V, Ni, MgO, TiO2, Fe2O3 ou qualquer outra variável disponível.

A representação deverá permitir: seleção da variável; configuração da escala de cores; configuração dos limites de classes; seleção do método de classificação; visualização de valores individuais; consulta de amostras; filtros; comparação de resultados; visualização simultânea com topografia e mapeamento.

As cores deverão ser configuráveis pelo usuário.

O sistema deverá permitir diferentes métodos de classificação, desde que implementados de forma tecnicamente adequada, como classificação por intervalos definidos pelo usuário, intervalos iguais, quantis ou outras metodologias aplicáveis.

A legenda deverá apresentar claramente os intervalos de valores e suas respectivas cores.

#### 3.3. Consulta direta no visualizador 3D

Ao selecionar uma amostra no visualizador tridimensional, o sistema deverá abrir uma consulta contendo seus dados associados: ID da amostra; coordenadas; mina; nível; galeria; travessa; rampa; frente; data; responsável; litologia; alteração; mineralização; estruturas; descrição geológica; resultados geoquímicos; fotografias; croquis; documentos; histórico de registros, quando disponível.

O usuário deverá poder navegar da representação espacial para os registros completos da amostra no sistema.

### 4. MÓDULO DE GESTÃO E VISUALIZAÇÃO DE SONDAGENS

#### 4.1. Importação e cadastro de sondagens

O sistema deverá possuir um módulo específico para cadastro, importação, organização, consulta e visualização de sondagens.

Deverá permitir importar dados de sondagens a partir de arquivos CSV, Excel e outros formatos tecnicamente suportados.

A importação deverá permitir organizar os dados de: identificação do furo; collar; coordenadas X, Y e Z; azimute; inclinação; profundidade final; data; responsável; projeto; área; nível ou referência espacial; método de perfuração; survey; litologia; alteração; mineralização; estruturas; intervalos geológicos; intervalos de amostragem; resultados geoquímicos; fotografias; documentos; descrições.

O sistema deverá permitir a validação dos dados antes da importação, identificando inconsistências, campos ausentes, intervalos inválidos, IDs duplicados e problemas de associação.

#### 4.2. Cadastro do Collar

Cada furo deverá possuir um registro de collar contendo: ID do furo; coordenadas X, Y e Z; cota; azimute inicial; inclinação inicial; profundidade planejada, quando disponível; profundidade final; data; responsável; projeto; área; localização; sistema de coordenadas; descrição; informações complementares.

Os registros deverão ser associados à estrutura espacial e ao banco de dados principal.

#### 4.3. Survey e reconstrução da trajetória

O software deverá permitir a importação e o armazenamento dos dados de survey das sondagens.

Os registros de survey deverão permitir a reconstrução da trajetória tridimensional real ou estimada do furo.

Quando existirem dados de survey ao longo da sondagem, deverão ser utilizados para reconstrução da trajetória.

Quando não existirem dados de survey suficientes, o sistema poderá representar uma trajetória estimada a partir dos parâmetros disponíveis, desde que a representação seja identificada claramente como estimada.

O software não deverá apresentar trajetórias estimadas como trajetórias reais.

Deverá permitir: importação do survey; armazenamento dos dados de profundidade; azimute; inclinação; reconstrução da trajetória; consulta de coordenadas ao longo do furo; visualização tridimensional; integração com topografia; consulta de trajetória; validação dos dados.

#### 4.4. Intervalos geológicos

O sistema deverá permitir cadastrar e importar intervalos geológicos ao longo dos furos.

Cada intervalo deverá possuir, quando disponível: ID do furo; profundidade inicial; profundidade final; litologia; alteração; mineralização; estruturas; descrição; observações; responsável; data; atributos geológicos adicionais configuráveis.

Os intervalos deverão ser associados à trajetória espacial correspondente.

O sistema deverá permitir visualizar os intervalos geológicos ao longo do furo, tanto em gráficos de profundidade quanto em visualizações tridimensionais e seções.

#### 4.5. Intervalos de amostragem e resultados geoquímicos

O sistema deverá permitir importar, cadastrar, consultar e relacionar os intervalos de amostragem dos furos de sondagem.

Cada amostra deverá possuir, quando disponível: ID da amostra; ID do furo; profundidade inicial; profundidade final; laboratório; data; tipo de amostragem; resultados analíticos; descrição; observações; informações complementares.

Os resultados analíticos deverão ser associados aos intervalos correspondentes da sondagem, mantendo a rastreabilidade dos dados e seus relacionamentos.

Os resultados deverão ser consultáveis por amostra, intervalo, furo, variável e demais filtros.

### 5. VISUALIZAÇÃO GEOQUÍMICA AO LONGO DOS FUROS DE SONDAGEM

#### 5.1. Gráficos de teores por profundidade

O software deverá permitir a construção de gráficos geoquímicos verticais associados à profundidade dos furos.

O eixo vertical deverá representar a profundidade do furo, utilizando os intervalos de início e fim das amostras e dos registros geológicos.

O sistema deverá permitir: seleção de qualquer elemento ou variável geoquímica disponível; construção de gráficos individuais; visualização de múltiplos gráficos alinhados pelo mesmo eixo de profundidade; comparação de Cr, V, Ni, Be, MgO, K2O, TiO2, Fe2O3, CaO, Na2O, SiO2, Al2O3, F, Cl e demais parâmetros existentes; ajuste independente das escalas; identificação dos intervalos amostrados; identificação de intervalos sem resultados analíticos; associação com litologia, alteração, mineralização e estruturas; seleção de intervalos; consulta de amostras; exportação.

O sistema deverá permitir visualizar o furo com seus diferentes registros organizados em painéis ou tracks, de forma semelhante a um perfil geológico e geoquímico de sondagem.

#### 5.2. Comparação de elementos ao longo do furo

O sistema deverá permitir visualizar simultaneamente diferentes variáveis geoquímicas ao longo da mesma sondagem. Por exemplo: track de litologia; track de alteração; track de mineralização; track de amostras; track de Cr; track de V; track de Be; track de MgO; track de TiO2.

O usuário deverá poder selecionar quais tracks deseja exibir.

Cada track deverá possuir configurações independentes de escala, largura, limites, representação e legenda.

O sistema deverá permitir que o geólogo compare os resultados geoquímicos com a sequência litológica, alterações, mineralização e estruturas.

#### 5.3. Visualização espacial dos teores ao longo da trajetória do furo

Os resultados analíticos deverão ser associados aos intervalos de profundidade correspondentes na trajetória espacial tridimensional da sondagem.

O sistema deverá permitir: representação tridimensional dos intervalos amostrados; coloração dos intervalos conforme o valor de uma variável geoquímica selecionada; configuração de classes, limites, paleta de cores e método de representação; visualização de valores individuais; alternância entre variáveis geoquímicas; visualização simultânea de trajetória, litologia, alteração, mineralização e teores; consulta de amostras por seleção direta no visualizador; comparação entre diferentes furos; integração com topografia e galerias subterrâneas.

A representação deverá respeitar a trajetória real da sondagem, considerando os dados de survey, azimute, inclinação e profundidade.

Não deverá assumir trajetória linear quando existirem dados de survey suficientes para reconstrução.

#### 5.4. Consulta interativa de intervalos

Ao selecionar um intervalo no visualizador 3D ou no gráfico de profundidade, o sistema deverá permitir consultar: ID do furo; ID da amostra; profundidade inicial; profundidade final; comprimento do intervalo; litologia; alteração; mineralização; estruturas; descrição; resultados geoquímicos; fotografias; documentos; dados complementares.

O usuário deverá poder navegar entre o visualizador espacial, o perfil geológico, os resultados analíticos e o registro completo no banco de dados.

### 6. VISUALIZAÇÃO DE SEÇÕES E PERFIS COM MÚLTIPLOS FUROS

#### 6.1. Criação de seções geológicas

O software deverá permitir criar seções geológicas e perfis espaciais contendo múltiplos furos de sondagem.

O usuário deverá poder definir a orientação, posição e parâmetros da seção.

Deverá permitir: seleção de furos; seleção de áreas; definição de orientação; definição de azimute; definição da posição; definição de espessura ou faixa de projeção; definição de distância de projeção; configuração de escala; seleção de elementos a exibir; visualização das trajetórias, de intervalos geológicos, de amostras, de resultados geoquímicos, de litologias, de alterações, de mineralizações e de estruturas; exportação.

O sistema deverá permitir a criação de seções de acordo com a necessidade do geólogo, sem depender de um conjunto fixo de seções previamente cadastradas.

#### 6.2. Representação de teores em seções

As seções deverão permitir representar os resultados geoquímicos ao longo dos intervalos de sondagem.

O usuário deverá poder selecionar uma variável e visualizar os intervalos dos furos coloridos conforme os valores analíticos.

Deverá permitir: seleção de elemento; configuração de classes; configuração de paleta; configuração de limites; visualização de valores; comparação entre furos; comparação de litologias; comparação de intervalos mineralizados; consulta interativa; exportação.

A representação deverá permitir identificar visualmente diferenças geoquímicas entre os furos presentes na seção.

#### 6.3. Perfis geológicos de sondagem

O software deverá permitir a criação de perfis individuais e compostos de sondagem, contendo os registros geológicos e geoquímicos organizados por profundidade.

Os perfis deverão permitir organizar diferentes tracks, incluindo: profundidade; trajetória; litologia; alteração; mineralização; estruturas; intervalos de amostragem; resultados analíticos; descrição geológica; fotografias; documentos.

O usuário deverá poder configurar os tracks, sua largura, escala, representação, legenda e ordem.

### 7. INTEGRAÇÃO ENTRE TOPOGRAFIA, GALERIAS, MAPEAMENTO E SONDAGENS

#### 7.1. Visualização integrada no ambiente tridimensional

O software deverá permitir a visualização integrada dos dados subterrâneos e das sondagens em um ambiente tridimensional.

O visualizador deverá permitir a exibição de: topografia subterrânea; galerias; travessas; rampas; níveis; frentes; furos de sondagem; trajetórias; collars; intervalos geológicos; litologias; alterações; mineralizações; estruturas; amostras de frente; resultados geoquímicos das frentes; intervalos de amostragem dos furos; resultados geoquímicos das sondagens; fotografias; croquis; documentos vinculados.

O usuário deverá poder ativar, desativar, selecionar, filtrar e organizar os diferentes elementos por camadas.

O visualizador deverá permitir navegação tridimensional, zoom, rotação, deslocamento, consulta espacial, seleção de elementos e inspeção de coordenadas.

#### 7.2. Visualização de teores no ambiente 3D integrado

O sistema deverá permitir visualizar simultaneamente amostras de frente e intervalos de sondagem coloridos conforme uma variável geoquímica selecionada.

Por exemplo, o geólogo poderá selecionar Cr e visualizar: amostras de frente coloridas conforme os resultados de Cr; intervalos de sondagem coloridos conforme os resultados de Cr; galerias e topografia subterrânea; trajetórias dos furos; litologias; alterações; mineralizações; estruturas.

O sistema deverá permitir alternar entre variáveis geoquímicas sem reconstruir a geometria espacial.

Deverá permitir a visualização de amostras e intervalos provenientes de diferentes origens, mantendo a identificação da origem dos dados.

O usuário deverá poder consultar diretamente os resultados associados aos elementos espaciais.

#### 7.3. Comparação entre mapeamento subterrâneo e sondagens

O sistema deverá permitir comparar os dados geológicos observados no mapeamento subterrâneo com os dados geológicos e geoquímicos registrados nas sondagens.

Deverá permitir: visualização de galerias e furos; de litologias; de alterações; de mineralizações; de estruturas; de amostras de frente; de amostras de sondagem; de teores; comparação de registros; consulta dos dados originais; filtros espaciais e geológicos.

A integração deverá permitir análise e comparação, mas não deverá assumir automaticamente continuidade geológica entre observações de frente e intervalos de sondagem.

A continuidade geológica deverá permanecer como interpretação do geólogo, salvo quando futuramente houver módulo específico de modelagem geológica com metodologia e validação próprias.

### 8. PERFIL LONGITUDINAL GEOLÓGICO-GEOQUÍMICO INTEGRADO DA MINA

O software deverá permitir a construção de perfis longitudinais geológicos e geoquímicos ao longo de galerias, travessas, rampas e estruturas subterrâneas.

Os perfis deverão utilizar a geometria espacial real da mina, quando disponível, e permitir integrar os registros geológicos, amostras e resultados analíticos.

Deverá permitir visualizar: traçado da galeria; distância acumulada; cotas; topografia; litologias; contatos; alterações; mineralizações; estruturas; amostras de frente; resultados geoquímicos; fotografias; croquis; registros geológicos; furos de sondagem próximos, quando aplicável; elementos projetados, devidamente identificados.

O sistema deverá permitir selecionar quais elementos serão exibidos, configurar escalas, filtros e parâmetros de visualização.

A visualização deverá respeitar as coordenadas e geometrias existentes, sem criar continuidade geológica artificial.

A projeção de sondagens em perfis longitudinais deverá ser configurável e identificada, respeitando a posição real dos furos e os critérios de projeção.

### 9. FILTROS, CONSULTAS E ANÁLISES INTEGRADAS

O módulo deverá permitir consultas integradas entre os dados de amostragem de frente, sondagens, mapeamento geológico, topografia e banco de dados geoquímico.

Deverá permitir filtros por: mina; nível; galeria; travessa; rampa; frente; furo; projeto; área; intervalo de profundidade; distância acumulada; litologia; alteração; mineralização; estrutura; elemento; intervalo de teor; data; campanha; responsável; tipo de amostragem; laboratório; origem dos dados.

O sistema deverá permitir consultas que combinem diferentes critérios.

Por exemplo, selecionar amostras de frente e intervalos de sondagem que apresentem determinada faixa de Cr, associados a uma litologia ou alteração específica, dentro de uma determinada área espacial.

Os resultados deverão ser apresentados de maneira consultável, exportável e, quando aplicável, representados espacialmente.

### 10. BANCO DE DADOS E RASTREABILIDADE

Toda a visualização, análise e consulta deverá utilizar os dados armazenados no banco de dados geológico e geoquímico principal.

O sistema deverá preservar os relacionamentos entre: amostras de frente; sondagens; collars; surveys; trajetórias; intervalos geológicos; intervalos de amostragem; resultados analíticos; litologias; alterações; mineralizações; estruturas; galerias; travessas; rampas; topografia; fotografias; croquis; documentos.

Não deverá haver duplicação desnecessária dos dados.

Os gráficos, perfis, seções e visualizações espaciais deverão ser construídos a partir de consultas ao banco de dados e aos relacionamentos existentes.

O sistema deverá preservar a rastreabilidade dos dados, permitindo identificar sua origem, registro, associação e histórico de alterações, quando aplicável.

### 11. EXPORTAÇÃO

O sistema deverá permitir exportar dados, gráficos e visualizações produzidos pelo módulo.

Deverá permitir, quando tecnicamente viável: exportação de tabelas filtradas; de resultados analíticos; de gráficos longitudinais; de perfis de sondagem; de seções geológicas; de visualizações; de conjuntos de dados selecionados; de dados espaciais em formatos GIS compatíveis.

A exportação deverá preservar os filtros, informações e atributos relevantes, quando aplicável.

### 12. REQUISITOS DE INTERFACE E USABILIDADE

O módulo deverá possuir interface funcional, organizada e adequada à rotina de um geólogo de mina.

As ferramentas deverão permitir acesso intuitivo às consultas, gráficos, perfis, seções e visualizações espaciais.

O sistema deverá evitar interfaces excessivamente complexas ou sobrecarregadas.

A visualização de gráficos e perfis deverá permitir configuração, seleção, consulta e navegação.

O usuário deverá poder alternar entre: consulta tabular; gráficos geoquímicos; perfis de sondagem; seções geológicas; perfil longitudinal de galeria; visualização tridimensional integrada.

A interface deverá utilizar dados reais do banco de dados.

Não deverá utilizar dados fictícios como substitutos das funcionalidades operacionais.

### 13. DESEMPENHO E PROCESSAMENTO

O sistema deverá ser desenvolvido considerando a possibilidade de grandes volumes de dados geológicos, geoquímicos, espaciais e de sondagem.

Deverá considerar: consultas eficientes; indexação espacial; indexação dos relacionamentos; otimização de gráficos; carregamento seletivo de camadas; filtragem antes da renderização; organização dos dados espaciais; processamento de trajetórias; processamento de perfis; gerenciamento de grandes volumes de amostras; gerenciamento de múltiplos furos; desempenho do visualizador 3D.

A arquitetura deverá permitir expansão futura sem comprometer os módulos já implementados.

### 14. TESTES, VALIDAÇÃO E CRITÉRIOS DE ACEITAÇÃO

Antes de considerar este módulo concluído, deverão ser realizados testes funcionais, de integração, de dados, de visualização e de desempenho.

**14.1. Testes de amostragem de frente**: integridade das amostras; associação com galerias e frentes; integridade das coordenadas; associação com resultados analíticos; consulta de dados; filtros; gráficos longitudinais; comparação de variáveis; comparação de trechos; visualização espacial; integração com fotos e croquis.

**14.2. Testes de sondagem**: importação de collars; importação de surveys; reconstrução de trajetórias; validação de profundidades; integridade de intervalos; associação entre amostras e resultados; visualização de perfis; visualização de teores; visualização espacial; comparação entre furos; integração com topografia; integração com mapeamento.

**14.3. Testes de integração espacial**: visualização de galerias e furos; de amostras de frente; de intervalos de sondagem; representação de teores; alternância de variáveis; consulta espacial; integração com topografia, litologias, alterações, mineralizações, estruturas, fotografias e croquis; integridade dos relacionamentos; validação das projeções em seções.

**14.4. Critérios para considerar o módulo concluído** — somente quando:
1. Estiver integrado ao banco de dados real.
2. Permitir consultas funcionais.
3. Permitir visualização geoquímica longitudinal das galerias.
4. Permitir visualização geoquímica por profundidade nas sondagens.
5. Permitir visualização espacial de teores das amostras de frente.
6. Permitir visualização espacial de teores ao longo dos furos.
7. Permitir comparação entre elementos.
8. Permitir construção de perfis e seções.
9. Permitir integração entre topografia, galerias, mapeamento e sondagens.
10. Permitir consulta dos registros associados.
11. Permitir exportação.
12. Possuir testes executados e documentados.
13. Possuir erros identificados e corrigidos.
14. Possuir documentação atualizada.
15. Não comprometer funcionalidades já implementadas nos módulos anteriores.

O módulo deverá ser funcional, conectado ao banco de dados real e integrado aos demais componentes do software, não constituindo apenas uma interface demonstrativa.

### 15. IMPLEMENTAÇÃO POR ETAPAS

Este módulo deverá ser implementado de maneira progressiva, respeitando a arquitetura geral do software e as dependências dos módulos anteriores.

O desenvolvimento deverá ser planejado de modo que: o banco de dados geológico e geoquímico esteja estruturado adequadamente; os módulos de amostragem de frente estejam funcionais; a importação dos resultados analíticos esteja funcional; a geometria das galerias e topografia esteja disponível quando necessária; o módulo de sondagem possua sua estrutura de dados e importação; as trajetórias dos furos sejam reconstruídas; os gráficos geoquímicos sejam implementados; os perfis e seções sejam implementados; a visualização tridimensional integrada seja desenvolvida; as funcionalidades sejam testadas individualmente e em conjunto.

A arquitetura deverá prever este módulo desde as etapas iniciais do projeto, mesmo que sua implementação completa ocorra posteriormente.

Não tentar implementar todas as funcionalidades simultaneamente.

O desenvolvimento deverá seguir as etapas definidas na arquitetura geral do projeto, com implementação, testes, revisão, documentação e aprovação antes de avançar para a etapa seguinte.

O módulo deverá ser desenvolvido como parte integrante do software de gestão geológica da mina, mantendo a continuidade arquitetônica e operacional com todos os demais módulos.
