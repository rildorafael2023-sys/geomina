# ARQUITETURA — GeoMina

> Estado: **proposta (Etapa 1)**. Nenhum código implementado ainda.
> Justificativas detalhadas de cada escolha: `DECISOES_TECNICAS.md`.

## 1. Visão geral

**Monólito modular** web, implantado na rede local da mina com Docker Compose.

```
 Navegador (desktop / tablet)
 ┌──────────────────────────────────────────────────────────────┐
 │  Frontend SPA — React + TypeScript (Vite)                     │
 │  Módulos: estrutura · mapeamento · documentos · fotos ·        │
 │  amostras · geoquímica · longitudinal · topografia · 3D ·      │
 │  consultas · relatórios · administração                       │
 │  Libs: TanStack Query · React Router · Mantine · Plotly ·      │
 │        Three.js (visualizador 3D)                              │
 └───────────────▲──────────────────────────────────────────────┘
                 │ HTTPS · REST/JSON (/api/v1) · OpenAPI
 ┌───────────────┴──────────────────────────────────────────────┐
 │  Backend — Python 3.12+ · FastAPI                              │
 │  ┌─────────────┐ ┌──────────────┐ ┌───────────────────────┐   │
 │  │ API (routers)│→│ Serviços de  │→│ Repositórios          │   │
 │  │ validação    │ │ domínio      │ │ SQLAlchemy 2 +        │   │
 │  │ Pydantic v2  │ │ (regras)     │ │ GeoAlchemy2           │   │
 │  └─────────────┘ └──────────────┘ └──────────┬────────────┘   │
 │  Núcleo: autenticação · permissões · auditoria · armazenamento │
 │  Processamento: pyogrio/GDAL · Shapely 2 · pyproj · NumPy ·    │
 │                 pandas/openpyxl · Pillow · pypdf               │
 │  Tarefas pesadas (importações grandes, miniaturas): fila       │
 │  simples em processo (Etapa 2) → worker dedicado se necessário │
 └───────────────┬──────────────────────────┬───────────────────┘
                 │                          │
   ┌─────────────▼─────────────┐  ┌─────────▼──────────────────┐
   │ PostgreSQL 16 + PostGIS 3 │  │ Armazenamento de arquivos   │
   │ dados, geometrias Z,      │  │ originais imutáveis (hash), │
   │ auditoria, índices GiST   │  │ miniaturas, pré-visualiz.   │
   └───────────────────────────┘  │ backend: disco local → S3/  │
                                  │ MinIO (mesma interface)     │
                                  └────────────────────────────┘
```

## 2. Princípios

1. **O banco é a fonte da verdade**: restrições de integridade no PostgreSQL (FK, UNIQUE, CHECK), não só na interface.
2. **Original imutável + dado interpretado**: todo arquivo importado é guardado intacto; o que se extrai dele aponta para o arquivo de origem.
3. **Nada silencioso**: transformações de coordenadas, conversões de unidade, tratamento de <LD, normalizações e promoções 2D→3D são explícitas, registradas e visíveis.
4. **Configuração em vez de código**: dicionários geológicos, tipos de unidade, tipos de amostra e analitos são dados, não colunas.
5. **Módulos com fronteiras claras**: cada módulo tem modelos, esquemas, serviços e rotas próprios; comunicação entre módulos por serviços, nunca por acesso direto às tabelas de outro módulo nas rotas.
6. **Preparado para offline** (sem implementá-lo agora): UUIDs como chave primária, operações idempotentes, número de versão por registro para detectar conflitos.

## 3. Estrutura do repositório (proposta)

```
geomina/
├── README.md
├── docs/                       documentação obrigatória (§21) + análise crítica
├── docker-compose.yml          db (PostGIS), api, web, [minio opcional]
├── .env.example
├── backend/
│   ├── pyproject.toml
│   ├── alembic/                migrações versionadas do banco
│   ├── app/
│   │   ├── main.py
│   │   ├── core/               config, segurança, auditoria, armazenamento, erros
│   │   ├── db/                 sessão, base declarativa, tipos espaciais
│   │   └── modules/
│   │       ├── auth/           usuários, papéis, permissões
│   │       ├── estrutura/      minas, tipos e unidades operacionais, frentes
│   │       ├── dicionarios/    listas configuráveis (litologias etc.)
│   │       ├── mapeamento/     mapeamentos, observações, medidas estruturais
│   │       ├── arquivos/       arquivos, versões, vínculos (croquis, docs, fotos)
│   │       ├── amostragem/     amostras, tipos, regras de código, lotes, QA/QC
│   │       ├── geoquimica/     analitos, laboratórios, métodos, importações, resultados
│   │       ├── espacial/       CRS, levantamentos, feições, eixos, chainage
│   │       ├── analise/        longitudinal, consultas avançadas
│   │       ├── gis/            exportações
│   │       └── relatorios/
│   │       (cada módulo: models.py · schemas.py · service.py · router.py)
│   └── tests/                  pytest — unit/ integration/ (banco real) fixtures/
└── frontend/
    ├── package.json
    ├── src/
    │   ├── app/                rotas, layout, autenticação
    │   ├── api/                cliente gerado a partir do OpenAPI
    │   ├── components/         componentes compartilhados
    │   └── modules/            um diretório por módulo (espelha o backend)
    └── tests/                  Vitest (unidade) · Playwright (ponta a ponta)
```

## 4. Camadas do backend

| Camada | Responsabilidade | Não faz |
|--------|------------------|---------|
| Router | HTTP, autenticação, permissão, (des)serialização Pydantic | regra de negócio |
| Serviço | regras de domínio, validações cruzadas, transações, auditoria de contexto | SQL específico de outro módulo |
| Repositório/modelos | mapeamento ORM, consultas | regras de negócio |
| Núcleo | autenticação, auditoria, armazenamento de arquivos, erros padronizados | — |

**Auditoria**: triggers do PostgreSQL gravam `antes/depois` (JSONB) em `auditoria` para as tabelas de domínio; o usuário da requisição é passado ao banco por `SET LOCAL app.usuario_id` no início de cada transação. Assim, nem uma alteração feita fora da API escapa do registro (ela aparece com usuário nulo, o que denuncia acesso direto).

## 5. API

REST, versionada em `/api/v1`, documentação OpenAPI automática (FastAPI). Convenções:

- recursos no plural em português: `/minas`, `/unidades`, `/mapeamentos`, `/amostras`, `/resultados`, `/levantamentos`, `/eixos`…
- listagens paginadas (`?pagina=&tamanho=`) com filtros por query string; ordenação explícita;
- erros padronizados `{codigo, mensagem, detalhes}`; validação 422 com campo e motivo;
- concorrência otimista: cada registro tem `versao`; `PATCH` exige `versao` atual (409 se divergente);
- importações em duas fases: `POST /importacoes` (envia, analisa, retorna prévia + relatório) → `POST /importacoes/{id}/confirmar`;
- geometria trafega em GeoJSON (com Z) nas rotas comuns; o visualizador 3D usa um formato compacto próprio (arrays de coordenadas relativas à origem local) para desempenho.

Endpoints iniciais (Etapas 2–3): `POST /auth/login`, `GET /auth/eu`, `/usuarios`, `/minas`, `/tipos-unidade`, `/regras-hierarquia`, `/unidades` (+ `/unidades/{id}/arvore`, `/unidades/{id}/historico`), `/frentes/{id}/avancos`, `/saude`.

## 6. Arquitetura espacial

### 6.1 Sistema de coordenadas
- Cada **mina** define um CRS de trabalho (`srid_trabalho`): um EPSG (ex.: SIRGAS 2000 / UTM) ou uma **grade local** registrada em `spatial_ref_sys` com SRID ≥ 900000 e definição PROJ documentada.
- Todas as geometrias da mina são armazenadas no CRS de trabalho, com Z em metros (cota).
- Arquivo importado em CRS diferente → transformação **somente** com confirmação do usuário; registro em `transformacao_coordenadas` (origem, destino, método/pipeline PROJ, precisão estimada). A geometria original fica preservada no arquivo original e em `geom_original` quando houver transformação.
- Arquivo sem CRS → o usuário declara; o sistema nunca supõe.

### 6.2 Tipos geométricos
| Dado | Tipo PostGIS |
|------|--------------|
| feição topográfica | `geometry(GeometryZ, srid)` + `dimensao_original` (2/3) |
| eixo de referência | `geometry(LineStringZ, srid)` |
| amostra | `geometry(GeometryZ)` com CHECK PointZ ou LineStringZ |
| mapeamento, foto, medida estrutural | `geometry(PointZ)` (opcional) |
| avanço de frente | `geometry(PointZ)` (opcional) |

Índices GiST em todas as colunas de geometria; índices por `levantamento_id` e `unidade_id` para carregamento seletivo.

### 6.3 Chainage (distância acumulada)
- Calculado em Python (NumPy) sobre os vértices 3D do eixo: soma de √(Δx²+Δy²+Δz²) segmento a segmento.
- Projeção de um ponto no eixo: menor distância 3D ao segmento → chainage do pé da projeção + **distância de afastamento** (alerta se acima de uma tolerância configurável, ex.: 10 m).
- Resultado guardado com `eixo_versao_id`; recálculo explícito e auditado.
- Chainage manual (trena) aceito e marcado como `origem = 'manual'`.

### 6.4 Visualizador 3D
- **Three.js** (com wrapper React próprio, fino), câmera em perspectiva e ortográfica, controles orbitais.
- **Origem local**: o servidor calcula a origem (centro da extensão) e envia coordenadas relativas em float32; o cliente soma a origem em float64 para exibir coordenadas reais.
- Linhas: `LineSegments2`/`Line2` (espessura em tela); polígonos: contorno + preenchimento triangulado quando planar; pontos: `InstancedMesh`/`Points`.
- Seleção: raycasting sobre geometrias agrupadas por camada, com tabela de ids → registro.
- Carregamento seletivo por camada/nível/caixa envolvente (`ST_3DIntersects`/`&&&`), simplificação por nível de detalhe se o volume exigir (medido, não presumido).
- Camadas são registros de configuração (tipo, fonte de dados, estilo) → extensível.

## 7. Armazenamento de arquivos

- Interface `Armazenamento` com implementação **disco local** (Etapa 2) e **S3/MinIO** (quando necessário), sem alteração do restante do código.
- Endereçamento por conteúdo: caminho derivado do SHA-256; deduplicação natural; o arquivo nunca é sobrescrito.
- Banco guarda metadados (nome original, MIME, tamanho, hash, autor, data) e vínculos.
- Derivados (miniaturas, pré-visualizações de TIFF/PDF) são regeneráveis e ficam separados dos originais.

## 8. Segurança

- Senhas com Argon2id; tokens JWT de acesso de curta duração + token de renovação revogável (armazenado no banco).
- RBAC: papéis → permissões por `modulo:acao` (ex.: `amostra:criar`, `mapeamento:aprovar`).
- HTTPS via proxy reverso (Caddy/Nginx) na implantação; CORS restrito.
- Upload: limite de tamanho, verificação de tipo por conteúdo (não só extensão), nomes de arquivo nunca usados como caminho.
- Backup: `pg_dump` diário + cópia do diretório de arquivos; procedimento de restauração **testado** na Etapa 18.

## 9. Ambientes

| Ambiente | Composição |
|----------|------------|
| Desenvolvimento | `docker compose up` (PostGIS + API com reload + Vite) |
| Testes | PostGIS descartável (container), pytest com banco real; Playwright contra a stack completa |
| Produção | servidor local na mina: Docker Compose, proxy HTTPS, volumes persistentes, backup agendado |
