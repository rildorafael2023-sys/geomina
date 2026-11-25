# DECISÕES TÉCNICAS — GeoMina

Registro de decisões de arquitetura (formato ADR simplificado).
Estado: **Proposta** (aguardando aprovação) · **Aceita** · **Substituída**.

---

## DT-001 — Monólito modular, não microsserviços
**Estado:** Proposta · **Data:** 2026-11-25
**Contexto.** Equipe pequena, implantação on-premise, módulos com forte acoplamento de dados (amostra ↔ resultado ↔ geometria ↔ mapeamento).
**Decisão.** Uma aplicação backend com módulos internos de fronteiras claras e um único banco.
**Alternativas.** Microsserviços — rejeitado: transações distribuídas, mais infraestrutura, sem ganho para o volume previsto.
**Consequências.** Implantação simples; os módulos podem ser extraídos no futuro se houver necessidade real.

## DT-002 — PostgreSQL 16 + PostGIS 3
**Estado:** Proposta
**Decisão.** Banco relacional com extensão espacial.
**Justificativa.** Geometrias com Z (`PointZ`, `LineStringZ`, `PolygonZ`), índices GiST, `spatial_ref_sys` extensível para grades locais, transformações via PROJ, JSONB para auditoria e atributos originais, `ltree` para hierarquias, maturidade e custo zero de licença. Compatível nativamente com QGIS.
**Alternativas.** SQL Server Spatial (licença, suporte a Z mais limitado nas funções); SpatiaLite/GeoPackage (bom para offline, não para multiusuário — pode servir como formato de **cache offline** futuro).

## DT-003 — Backend Python + FastAPI
**Estado:** Proposta
**Justificativa.** O ecossistema geoespacial e de dados de referência é Python: GDAL/pyogrio, Shapely 2, pyproj, NumPy, pandas, openpyxl. FastAPI fornece validação tipada (Pydantic v2), OpenAPI automática e bom desempenho. ORM: SQLAlchemy 2 + GeoAlchemy2; migrações: Alembic.
**Alternativas.** Node/TypeScript (stack única, mas bibliotecas GIS muito mais fracas); Django + GeoDjango (maduro, mas acoplado a ORM próprio e menos adequado a uma API pura com tipagem forte — alternativa aceitável).

## DT-004 — Frontend React + TypeScript + Vite
**Estado:** Proposta
**Justificativa.** Ecossistema amplo, tipagem, cliente gerado do OpenAPI (contrato único). Componentes: **Mantine** (formulários e tabelas produtivos, bom em tablet). Dados: **TanStack Query**. Tabelas grandes: **TanStack Table** com virtualização.

## DT-005 — Three.js para o visualizador 3D (não CesiumJS)
**Estado:** Proposta
**Contexto.** Dados subterrâneos em sistema cartesiano (UTM ou grade local), sem necessidade de globo, terreno ou imagens de satélite.
**Decisão.** Three.js com wrapper React próprio.
**Justificativa.** Controle total de câmera e cena cartesiana; leve; linhas espessas, instanciamento e raycasting nativos; sem dependência de serviços externos (funciona offline na rede da mina).
**Alternativas.**
- *CesiumJS*: centrado no globo/elipsoide, exige coordenadas geodésicas, lida mal com grades locais e com visualização abaixo da superfície; peso e complexidade elevados. Útil apenas se houver necessidade de contexto de superfície georreferenciado — pode ser reavaliado.
- *deck.gl*: ótimo para grandes volumes 2,5D, mas a navegação subterrânea 3D livre é menos natural.
- *react-three-fiber*: considerado; adotado apenas se simplificar sem custo de desempenho (decisão na etapa do visualizador).
**Risco tratado.** Precisão float32 → origem local (ver ARQUITETURA §6.4).

## DT-006 — Chainage 3D na aplicação, não no PostGIS
**Estado:** Proposta
**Justificativa.** As funções de referenciamento linear do PostGIS (`ST_LineLocatePoint`, `ST_LineSubstring`) trabalham no plano XY; em rampas inclinadas, o chainage ficaria subestimado. O cálculo 3D é simples, testável e determinístico em NumPy.
**Consequência.** Testes unitários com casos calculados à mão são obrigatórios (ver TESTES.md).

## DT-007 — Chaves primárias UUID
**Estado:** Proposta
**Justificativa.** Permite geração no cliente (pré-requisito para captura offline futura), evita exposição de sequências, facilita a fusão de dados de bases diferentes. Códigos de negócio (código de amostra, código da unidade) são colunas próprias com restrição única.
**Custo.** Índices um pouco maiores — irrelevante para o volume previsto.

## DT-008 — Resultados analíticos em formato longo (uma linha por analito)
**Estado:** Proposta
**Decisão.** `resultado(amostra, analito, metodo, valor_texto, valor_num, qualificador, ld, unidade, certificado, …)` e tabela `analito` aberta.
**Justificativa.** Atende §10.4 (novas variáveis sem mudança de esquema), preserva metadados por valor e permite múltiplos métodos para o mesmo elemento. Não é EAV genérico: o "valor" é sempre analítico, com tipos definidos.
**Desempenho.** Índices `(analito_id, amostra_id)`; visão pivotada sob demanda para consultas/exportações.

## DT-009 — Dicionários configuráveis + atributos extras em JSONB validado
**Estado:** Proposta
**Decisão.** Termos (litologia, alteração, etc.) em tabelas de dicionário com FK. Campos customizados definidos em `definicao_atributo` e gravados em JSONB, validados pelo serviço contra a definição.
**Justificativa.** Flexibilidade de §6.2 sem perder integridade dos termos principais (FK real).

## DT-010 — Auditoria por triggers no banco
**Estado:** Proposta
**Justificativa.** Captura qualquer alteração, inclusive fora da API; implementação única para todas as tabelas. O usuário é propagado por `SET LOCAL app.usuario_id`.
**Complementos.** Registros "aprovados" (mapeamento) usam **revisões explícitas** (tabela de revisões), além da auditoria técnica.

## DT-011 — Armazenamento endereçado por conteúdo com interface plugável
**Estado:** Proposta
**Decisão.** Disco local inicialmente; MinIO/S3 opcional com a mesma interface.
**Justificativa.** Sem dependência externa na Etapa 2; deduplicação; imutabilidade garantida por design.

## DT-012 — Gráficos com Plotly.js
**Estado:** Proposta
**Justificativa.** Eixos múltiplos, escala logarítmica (importante para teores), espaçamento irregular nativo, seleção/hover, exportação PNG/SVG embutida, bom desempenho com milhares de pontos (WebGL `scattergl`).
**Alternativas.** ECharts (bom, porém exportação e eixos científicos menos diretos); Recharts (insuficiente para uso científico).

## DT-013 — GeoPackage como formato de exportação GIS recomendado
**Estado:** Proposta
**Justificativa.** Sem as limitações do Shapefile (nomes de campo de 10 caracteres, 2 GB, um tipo geométrico por arquivo, encoding); suporte completo a Z; padrão OGC; abre em QGIS e ArcGIS. Shapefile e GeoJSON continuam disponíveis.

## DT-014 — Implantação on-premise com Docker Compose
**Estado:** Proposta (depende da pendência D2)
**Justificativa.** Funciona sem internet na rede da mina; reprodutível; o mesmo arquivo serve para desenvolvimento e produção (com sobreposições).

## DT-015 — Captura offline como etapa própria, arquitetura preparada desde já
**Estado:** Proposta (depende da pendência D1)
**Decisão.** Não implementar sincronização offline no núcleo; preparar com UUID, `versao` por registro e operações idempotentes.
