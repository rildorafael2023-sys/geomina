# DECISÕES TÉCNICAS — GeoMina

Registro de decisões de arquitetura (formato ADR simplificado).
Estado: **Proposta** (aguardando aprovação) · **Aceita** · **Substituída**.

---

## DT-001 — Monólito modular, não microsserviços
**Estado:** Aceita (2026-11-25) · **Data:** 2026-11-25
**Contexto.** Equipe pequena, implantação on-premise, módulos com forte acoplamento de dados (amostra ↔ resultado ↔ geometria ↔ mapeamento).
**Decisão.** Uma aplicação backend com módulos internos de fronteiras claras e um único banco.
**Alternativas.** Microsserviços — rejeitado: transações distribuídas, mais infraestrutura, sem ganho para o volume previsto.
**Consequências.** Implantação simples; os módulos podem ser extraídos no futuro se houver necessidade real.

## DT-002 — PostgreSQL 16 + PostGIS 3
**Estado:** **Substituída por DT-016** (2026-11-25) — o usuário definiu que o aplicativo roda localmente no PC, sem rede. PostgreSQL/PostGIS continua sendo o caminho de evolução se um dia houver servidor na rede da mina.
**Decisão.** Banco relacional com extensão espacial.
**Justificativa.** Geometrias com Z (`PointZ`, `LineStringZ`, `PolygonZ`), índices GiST, `spatial_ref_sys` extensível para grades locais, transformações via PROJ, JSONB para auditoria e atributos originais, `ltree` para hierarquias, maturidade e custo zero de licença. Compatível nativamente com QGIS.
**Alternativas.** SQL Server Spatial (licença, suporte a Z mais limitado nas funções); SpatiaLite/GeoPackage (bom para offline, não para multiusuário — pode servir como formato de **cache offline** futuro).

## DT-003 — Backend Python + FastAPI
**Estado:** Aceita (2026-11-25)
**Justificativa.** O ecossistema geoespacial e de dados de referência é Python: GDAL/pyogrio, Shapely 2, pyproj, NumPy, pandas, openpyxl. FastAPI fornece validação tipada (Pydantic v2), OpenAPI automática e bom desempenho. ORM: SQLAlchemy 2 + GeoAlchemy2; migrações: Alembic.
**Alternativas.** Node/TypeScript (stack única, mas bibliotecas GIS muito mais fracas); Django + GeoDjango (maduro, mas acoplado a ORM próprio e menos adequado a uma API pura com tipagem forte — alternativa aceitável).

## DT-004 — Frontend React + TypeScript + Vite
**Estado:** Aceita (2026-11-25)
**Justificativa.** Ecossistema amplo, tipagem, cliente gerado do OpenAPI (contrato único). Componentes: **Mantine** (formulários e tabelas produtivos, bom em tablet). Dados: **TanStack Query**. Tabelas grandes: **TanStack Table** com virtualização.

## DT-005 — Three.js para o visualizador 3D (não CesiumJS)
**Estado:** Aceita (2026-11-25)
**Contexto.** Dados subterrâneos em sistema cartesiano (UTM ou grade local), sem necessidade de globo, terreno ou imagens de satélite.
**Decisão.** Three.js com wrapper React próprio.
**Justificativa.** Controle total de câmera e cena cartesiana; leve; linhas espessas, instanciamento e raycasting nativos; sem dependência de serviços externos (funciona offline na rede da mina).
**Alternativas.**
- *CesiumJS*: centrado no globo/elipsoide, exige coordenadas geodésicas, lida mal com grades locais e com visualização abaixo da superfície; peso e complexidade elevados. Útil apenas se houver necessidade de contexto de superfície georreferenciado — pode ser reavaliado.
- *deck.gl*: ótimo para grandes volumes 2,5D, mas a navegação subterrânea 3D livre é menos natural.
- *react-three-fiber*: considerado; adotado apenas se simplificar sem custo de desempenho (decisão na etapa do visualizador).
**Risco tratado.** Precisão float32 → origem local (ver ARQUITETURA §6.4).

## DT-006 — Chainage 3D na aplicação, não no PostGIS
**Estado:** Aceita (2026-11-25)
**Justificativa.** As funções de referenciamento linear do PostGIS (`ST_LineLocatePoint`, `ST_LineSubstring`) trabalham no plano XY; em rampas inclinadas, o chainage ficaria subestimado. O cálculo 3D é simples, testável e determinístico em NumPy.
**Consequência.** Testes unitários com casos calculados à mão são obrigatórios (ver TESTES.md).

## DT-007 — Chaves primárias UUID
**Estado:** Aceita (2026-11-25)
**Justificativa.** Permite geração no cliente (pré-requisito para captura offline futura), evita exposição de sequências, facilita a fusão de dados de bases diferentes. Códigos de negócio (código de amostra, código da unidade) são colunas próprias com restrição única.
**Custo.** Índices um pouco maiores — irrelevante para o volume previsto.

## DT-008 — Resultados analíticos em formato longo (uma linha por analito)
**Estado:** Aceita (2026-11-25)
**Decisão.** `resultado(amostra, analito, metodo, valor_texto, valor_num, qualificador, ld, unidade, certificado, …)` e tabela `analito` aberta.
**Justificativa.** Atende §10.4 (novas variáveis sem mudança de esquema), preserva metadados por valor e permite múltiplos métodos para o mesmo elemento. Não é EAV genérico: o "valor" é sempre analítico, com tipos definidos.
**Desempenho.** Índices `(analito_id, amostra_id)`; visão pivotada sob demanda para consultas/exportações.

## DT-009 — Dicionários configuráveis + atributos extras em JSONB validado
**Estado:** Aceita (2026-11-25)
**Decisão.** Termos (litologia, alteração, etc.) em tabelas de dicionário com FK. Campos customizados definidos em `definicao_atributo` e gravados em JSONB, validados pelo serviço contra a definição.
**Justificativa.** Flexibilidade de §6.2 sem perder integridade dos termos principais (FK real).

## DT-010 — Auditoria por triggers no banco
**Estado:** **Substituída por DT-019** (o SQLite não tem triggers genéricos nem variáveis de sessão)
**Justificativa.** Captura qualquer alteração, inclusive fora da API; implementação única para todas as tabelas. O usuário é propagado por `SET LOCAL app.usuario_id`.
**Complementos.** Registros "aprovados" (mapeamento) usam **revisões explícitas** (tabela de revisões), além da auditoria técnica.

## DT-011 — Armazenamento endereçado por conteúdo com interface plugável
**Estado:** Aceita (2026-11-25)
**Decisão.** Disco local inicialmente; MinIO/S3 opcional com a mesma interface.
**Justificativa.** Sem dependência externa na Etapa 2; deduplicação; imutabilidade garantida por design.

## DT-012 — Gráficos com Plotly.js
**Estado:** Aceita (2026-11-25)
**Justificativa.** Eixos múltiplos, escala logarítmica (importante para teores), espaçamento irregular nativo, seleção/hover, exportação PNG/SVG embutida, bom desempenho com milhares de pontos (WebGL `scattergl`).
**Alternativas.** ECharts (bom, porém exportação e eixos científicos menos diretos); Recharts (insuficiente para uso científico).

## DT-013 — GeoPackage como formato de exportação GIS recomendado
**Estado:** Aceita (2026-11-25)
**Justificativa.** Sem as limitações do Shapefile (nomes de campo de 10 caracteres, 2 GB, um tipo geométrico por arquivo, encoding); suporte completo a Z; padrão OGC; abre em QGIS e ArcGIS. Shapefile e GeoJSON continuam disponíveis.

## DT-014 — Implantação on-premise com Docker Compose
**Estado:** **Substituída por DT-016 e DT-021** (Docker não é adequado para o PC do geólogo)
**Justificativa.** Funciona sem internet na rede da mina; reprodutível; o mesmo arquivo serve para desenvolvimento e produção (com sobreposições).

## DT-015 — Captura offline como etapa própria, arquitetura preparada desde já
**Estado:** Aceita — o usuário confirmou que os geólogos usam **tablets e celulares sem rede** (E20 é necessária)
**Decisão.** Não implementar sincronização offline no núcleo; preparar com UUID, `versao` por registro e operações idempotentes.

---

## DT-016 — Aplicativo local no PC (servidor embutido em 127.0.0.1) + SQLite
**Estado:** Aceita · **Data:** 2026-11-25 · **Substitui:** DT-002, DT-014
**Contexto.** O usuário definiu: "um aplicativo para rodar no PC, não na rede".
**Decisão.** Um único processo Python (FastAPI + Uvicorn) que escuta **somente em 127.0.0.1** e abre a interface no navegador do próprio computador. Banco em **SQLite** (arquivo `geomina.db`), com WAL e chaves estrangeiras ativadas, na pasta de dados do usuário (`%LOCALAPPDATA%\GeoMina`).
**Por que não PostgreSQL local?** Exigiria instalar e manter um serviço de banco em cada PC (porta, senha, atualizações, backup), complexidade desproporcional para um usuário por máquina. O SQLite é um arquivo: o backup é uma cópia, sem administração, com integridade transacional (ACID).
**Por que manter o desenho de "API + interface web" e não um programa desktop tradicional?** (a) Reaproveita toda a arquitetura da Etapa 1; (b) a mesma interface servirá aos tablets (E20); (c) uma eventual migração para um servidor na rede exigiria só trocar o banco e o endereço de escuta.
**Consequências.** Sem PostGIS: ver DT-017. Concorrência: um usuário por vez por PC (adequado). Escrita concorrente de vários PCs no mesmo arquivo de rede **não é suportada** (documentado).

## DT-017 — Geometria em WKB + índice R*Tree do SQLite (no lugar do PostGIS)
**Estado:** Aceita
**Decisão.** Geometrias gravadas em WKB (padrão OGC, o mesmo do GeoPackage e do PostGIS) **com Z**, SRID em coluna própria e caixa 3D num índice R*Tree (módulo nativo do SQLite, verificado em `/saude`). Operações geométricas em Python: Shapely 2 (geometria), pyproj/PROJ (sistemas de coordenadas, base EPSG embutida, sem internet), NumPy (chainage 3D, DT-006).
**Alternativa avaliada.** SpatiaLite: exige uma DLL nativa por plataforma e complica a distribuição; o ganho não compensa, porque o chainage já seria feito em Python (DT-006).
**Teste.** `tests/test_espacial.py`: Z preservado exatamente em coordenadas UTM reais; 2D continua 2D; consulta R*Tree 3D.

## DT-018 — Sessões com token opaco (no lugar de JWT)
**Estado:** Aceita
**Justificativa.** Num aplicativo local, o token opaco aleatório (256 bits), guardado no banco só como hash SHA-256, é mais simples e **revogável na hora** (logout, troca de senha, desativação do usuário), ao contrário do JWT. Validade: 12 h.

## DT-019 — Auditoria na camada ORM + imutabilidade por trigger
**Estado:** Aceita · **Substitui:** DT-010
**Decisão.** Eventos do SQLAlchemy (`after_flush`) registram I/U/D com valores antes/depois, usuário e origem para toda entidade com `__auditavel__ = True`. Campos sensíveis (senha) são mascarados. Triggers SQLite impedem UPDATE/DELETE na tabela `auditoria`.
**Limitação.** Alterações feitas diretamente no arquivo `.db`, fora do aplicativo, não são auditadas.

## DT-020 — Migrações automáticas com backup prévio
**Estado:** Aceita
**Decisão.** Ao iniciar, o aplicativo aplica as migrações Alembic pendentes. Se o banco já existir, antes faz uma **cópia consistente** (API de backup do SQLite) em `backups/`.

## DT-021 — Distribuição: pacote zip com instalação offline
**Estado:** Aceita (mecanismo testado em Linux; **scripts .bat ainda não testados em Windows**)
**Decisão.** `distribuicao/empacotar.sh windows` gera um zip com a interface compilada, o pacote `geomina` e **todas as bibliotecas** (wheels para Python 3.12 e 3.13, Windows 64 bits). `instalar.bat` cria o ambiente sem internet (`pip --no-index`); `GeoMina.bat` abre o aplicativo. Exige Python instalado.
**Evolução prevista (E19).** Instalador único (.exe) sem exigir Python, gerado em máquina/CI Windows.

## DT-022 — Janela própria (modo aplicativo do Edge/Chrome) e encerramento automático
**Estado:** Aceita (pedido do usuário, 2026-11-25) · **Testado:** Linux com Chromium; **Windows/Edge não testado**
**Decisão.** O atalho da área de trabalho executa `pythonw -m geomina`, sem janela de console. A interface abre com `msedge --app=… --user-data-dir=<dados>/janela`, sem barra de endereço nem abas. A interface envia sinais de presença; ao fechar a última janela, o servidor se encerra em cerca de 10 s. Se já houver um GeoMina aberto com a mesma pasta de dados, só abre outra janela para ele (instância única). Sem Edge/Chrome, usa uma aba do navegador padrão. Erros de inicialização aparecem numa caixa de mensagem do Windows e são gravados em `logs/geomina.log`.
**Alternativas.** pywebview/Electron: exigem componentes nativos extras no pacote. O Edge já vem no Windows 10/11.

## DT-023 — Árvore da mina com tipos configuráveis e integridade por triggers
**Estado:** Aceita (implementada na E3)
**Decisão.** `tipo_unidade` (flags: pode ficar na raiz, é nível, multinível, tem eixo, é frente) + `regra_hierarquia` (pai→filho). Triggers do SQLite recusam: tipo não permitido, unidade-pai de outra mina, ciclos, vínculo multinível inválido, avanço fora de frente, mudança de características de tipo em uso, remoção de regra em uso. O `caminho` materializado (`/id/…/`) é mantido por trigger, inclusive ao mover sub-árvores.
**Ajuste em relação ao modelo da E1.** "Pode ficar na raiz" virou um atributo do tipo, em vez de uma regra com pai nulo (o SQLite não garante unicidade com NULL em chave primária).

## DT-024 — Posição de frente como colunas X/Y/Z (não geometria)
**Estado:** Aceita
**Justificativa.** Um avanço é um único ponto opcional, medido em campo. Colunas numéricas (no CRS de trabalho da mina) são mais simples de validar (X e Y juntos, Z exige XY) e de consultar. Geometrias WKB ficam para linhas e polígonos (topografia, eixos). A distância exige a **referência** de onde foi medida.

## DT-025 — Backup em .zip com manifesto; restauração pela API de backup do SQLite
**Estado:** Aceita (E4)
**Decisão.** Backup completo = banco (cópia consistente) + arquivos originais + `manifesto.json` (versão, revisão do esquema, SHA-256 do banco, contagens por tabela, usuário). A restauração valida o manifesto, o hash, o `integrity_check` e a revisão (recusa backup de versão mais nova). Antes, faz um backup de segurança. Depois, copia o banco do backup para o banco em uso pela API de backup do SQLite, sem trocar arquivos com conexões abertas. Os arquivos originais só são acrescentados (endereçamento por hash). As migrações pendentes são aplicadas e o evento é registrado na auditoria do banco restaurado. A API fica bloqueada (503) durante a restauração.
**Segurança.** Exige a permissão `sistema:backup` (só Administrador), a senha do usuário e a confirmação digitada. O download valida o nome do arquivo para não sair da pasta de backups.

## DT-026 — Ficha de mapeamento como documento versionado com imutabilidade no banco
**Estado:** Aceita (E5)
**Decisão.** A ficha é editada e gravada como um todo (cabeçalho + intervalos + medidas + amostras); os itens são sincronizados por id (atualiza, cria, exclui), e cada mudança é auditada. Toda gravação avança a versão da ficha (concorrência otimista sobre o documento inteiro). Triggers impedem qualquer alteração fora do estado rascunho e qualquer exclusão de ficha já submetida. A correção de ficha aprovada passa por "reabrir", que guarda o instantâneo aprovado (`mapeamento_revisao`, imutável).
**Revisão independente.** O autor não aprova a própria ficha quando existe outro usuário ativo com permissão de aprovar.

## DT-027 — Orientações guardadas como medidas (sem correção automática de norte)
**Estado:** Aceita (E5)
**Decisão.** A forma canônica (direção de mergulho/mergulho; rumo/caimento) é calculada só a partir da convenção digitada (ex.: RHR → +90°). O norte de referência e a declinação ficam registrados na ficha. Nenhuma rotação é aplicada automaticamente (princípio "nada silencioso"); a conversão para o norte da quadrícula (declinação + convergência meridiana) será uma operação explícita quando as medidas forem usadas no espaço (E13).

## DT-028 — Impressão/PDF pelo navegador
**Estado:** Aceita (E5)
**Justificativa.** O Edge gera PDF pela janela de impressão; uma página A4 com CSS de impressão evita dependências de bibliotecas de PDF no pacote offline. Relatórios mais elaborados (E17) reavaliarão a geração de PDF no servidor.

## DT-029 — Transformação SAD69 → SIRGAS calibrada com a topografia da mina
**Estado:** Aceita (E10)
**Contexto.** O mesmo levantamento exportado em SAD69 e em SIRGAS 2000 pela topografia da mina difere do PROJ padrão (parâmetros oficiais) em ~2,2 m; a diferença entre os dois arquivos é uma translação constante (dx −46,367 m, dy −43,899 m) com resíduo de ~5 mm.
**Decisão.** Oferecer a transformação "calibrada": translação média calculada vértice a vértice a partir de um par de arquivos, com resíduos, origem (arquivo + sha256) e aprovação por revisor. O PROJ padrão continua disponível, identificado como tal. Nenhuma conversão é feita sem escolha explícita; amostras em outro sistema sem transformação aprovada ficam fora do chainage, com aviso.
**Consequência.** Os dados convertidos ficam coerentes com a topografia da mina. Fora da área da mina a translação não vale (registrado na transformação).

## DT-030 — Leitor de shapefile próprio, WKB + R*Tree e coordenadas relativas no desenho
**Estado:** Aceita (E10)
**Justificativa.** GDAL complica o pacote offline no Windows; o formato shapefile é simples e o leitor próprio (com testes vértice a vértice) cobre PolyLineZ/PolygonZ/pontos/multi e recusa MultiPatch. Geometrias em WKB (Shapely) e índice R*Tree nativo do SQLite. A planta recebe coordenadas relativas a uma origem (evita perda de precisão de coordenadas UTM em float32 no navegador e no futuro 3D); a coordenada absoluta é reconstruída e mostrada.

## DT-031 — Chainage 3D com versões do eixo
**Estado:** Aceita (E10)
**Decisão.** Chainage = comprimento 3D acumulado até a projeção do ponto no eixo (para ponto sem cota, a projeção é feita em planta, mas a distância continua 3D). Galerias em U: a projeção mais próxima é usada e a alternativa é registrada como "ambígua". O eixo é versionado; posições ficam ligadas à versão usada.
