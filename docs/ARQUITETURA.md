# ARQUITETURA — GeoMina

> **Revisada em 2026-11-25** após a definição do usuário: *aplicativo para rodar no PC, sem rede* (DT-016).
> Seções marcadas **[IMPLEMENTADO]** existem no código e têm testes; as demais são o projeto para as próximas etapas.
> Justificativas: `DECISOES_TECNICAS.md`.

## 1. Visão geral

```
 Computador do geólogo (Windows) — nada sai desta máquina
 ┌──────────────────────────────────────────────────────────────────┐
 │  Navegador  ──HTTP──▶  http://127.0.0.1:8765                     │
 │                         │                                        │
 │  ┌──────────────────────▼────────────────────────────────────┐   │
 │  │ Processo GeoMina (Python) — iniciado por GeoMina.bat      │   │
 │  │  • Interface React/TypeScript compilada (arquivos estáticos)│ │
 │  │  • API REST /api/v1 (FastAPI)                              │   │
 │  │  • Núcleo: login, permissões, auditoria, arquivos, migrações│  │
 │  │  • Geoprocessamento: Shapely · pyproj/PROJ · NumPy         │   │
 │  └──────────────┬──────────────────────────┬─────────────────┘   │
 │                 │                          │                     │
 │   %LOCALAPPDATA%\GeoMina\geomina.db   …\GeoMina\arquivos\        │
 │   (SQLite: dados + geometrias WKB      (originais imutáveis,     │
 │    + índice R*Tree + auditoria)         endereçados por SHA-256) │
 │                                       …\GeoMina\backups\         │
 └──────────────────────────────────────────────────────────────────┘

 Tablets e celulares (sem rede) ── futuro (E20): captura offline e troca
 de dados por arquivo de sincronização (cabo/USB), sem servidor.
```

## 2. Princípios
1. **Somente local**: o servidor escuta apenas em `127.0.0.1` **[IMPLEMENTADO]**. Não há chamadas a serviços externos; a base de sistemas de coordenadas (PROJ) vem embutida **[IMPLEMENTADO — testado com rede desativada]**.
2. **O banco é a fonte da verdade**: FK, UNIQUE e CHECK no SQLite, com `foreign_keys=ON` **[IMPLEMENTADO]**.
3. **Original imutável + dado interpretado**: todo arquivo importado é guardado intacto e somente-leitura **[IMPLEMENTADO]**.
4. **Nada silencioso**: transformações de coordenadas, conversões de unidade, tratamento de <LD, normalização de códigos e de litologias são sempre mostrados ao usuário e registrados.
5. **Configuração em vez de código**: dicionários, tipos de unidade, tipos de amostra e analitos são dados.
6. **Preparado para tablets offline**: UUID como chave, `versao` por registro **[IMPLEMENTADO]**, `instalacao_id` por computador **[IMPLEMENTADO]**.

## 3. Estrutura do repositório **[IMPLEMENTADO]**

```
geomina/
├── README.md
├── docs/                         documentação do projeto
├── backend/
│   ├── pyproject.toml
│   ├── geomina/
│   │   ├── __main__.py           inicia o aplicativo (python -m geomina)
│   │   ├── main.py               criação da aplicação FastAPI
│   │   ├── config.py             pasta de dados, porta, limites
│   │   ├── db.py                 SQLite (WAL, FK), base declarativa, colunas padrão
│   │   ├── migrar.py             migrações automáticas + backup prévio
│   │   ├── modelos.py            registro de todos os modelos
│   │   ├── janela.py             janela própria, instância única, encerramento
│   │   ├── migrations/           Alembic (0001_nucleo, 0002_estrutura)
│   │   ├── core/                 auditoria, segurança, armazenamento, erros, dependências
│   │   ├── espacial/             geometria WKB 3D (base para a topografia)
│   │   ├── modules/
│   │   │   ├── auth/             usuários, papéis, permissões, sessões
│   │   │   ├── arquivos/         arquivos originais
│   │   │   ├── estrutura/        minas, tipos, regras, unidades, avanços (E3)
│   │   │   └── sistema/          saúde, parâmetros da instalação
│   │   └── static/               interface compilada (gerada, fora do git)
│   └── tests/                    pytest (banco SQLite real em pasta temporária)
├── frontend/                     React + TypeScript + Mantine (Vite)
├── e2e/                          teste ponta a ponta no navegador (Playwright)
└── distribuicao/                 empacotador offline e scripts Windows (.bat)
```

Novos módulos seguirão o mesmo padrão: `modules/<nome>/{models,schemas,service,router}.py`, uma migração por etapa e testes.

## 4. Camadas
| Camada | Responsabilidade |
|---|---|
| Router | HTTP, autenticação, permissão, validação Pydantic |
| Serviço | regras de negócio, validações cruzadas |
| Modelos | mapeamento ORM (SQLAlchemy 2) |
| Núcleo | auditoria, sessão de banco por requisição (commit/rollback), erros padronizados `{codigo, mensagem, detalhes}`, armazenamento |

- **Concorrência otimista** **[IMPLEMENTADO]**: coluna `versao` (version_id do SQLAlchemy); alteração com versão antiga → 409.
- **Auditoria** **[IMPLEMENTADO]**: DT-019.

## 5. API
REST em `/api/v1`, documentação automática em `http://127.0.0.1:8765/api/docs`.

Endpoints **[IMPLEMENTADO]**:
| Método | Caminho | Permissão |
|---|---|---|
| GET | `/saude` | pública (não expõe dados da mina) |
| GET | `/instalacao` · POST `/instalacao/admin` | só funciona sem usuários |
| POST | `/auth/login` · `/auth/logout` · `/auth/senha` · GET `/auth/eu` | autenticado |
| GET | `/papeis` | autenticado |
| GET/POST | `/usuarios` · PATCH `/usuarios/{id}` · POST `/usuarios/{id}/senha` | `usuario:gerenciar` |
| POST | `/arquivos` · GET `/arquivos/{id}` · GET `/arquivos/{id}/conteudo?verificar=` | `arquivo:enviar` / `arquivo:ler` |
| POST | `/sistema/presenca` · `/sistema/fechando` (cabeçalho `X-GeoMina: 1`) | sinais da janela (DT-022) |
| GET/POST/PATCH | `/minas` · `/minas/{id}` | ler: `estrutura:ler`; gravar: `estrutura:configurar` |
| GET | `/minas/{id}/unidades?nivel_id=&tipo=&texto=&incluir_inativas=` | `estrutura:ler` |
| GET/POST/PATCH · PUT | `/tipos-unidade` · `/regras-hierarquia` | `estrutura:configurar` (leitura: `estrutura:ler`) |
| POST/GET/PATCH/DELETE | `/unidades` · `/unidades/{id}` · POST `/unidades/{id}/mover` · PUT `/unidades/{id}/niveis` · GET `/unidades/{id}/historico` | `estrutura:editar` / `estrutura:ler` |
| GET/POST · PUT | `/unidades/{id}/avancos` · `/avancos/{id}` | `avanco:registrar` / `estrutura:ler` |

## 6. Arquitetura espacial (adaptada ao SQLite — DT-017)

### 6.1 Sistemas de coordenadas
- Confirmados pelo usuário: **SIRGAS 2000 / UTM 23S (EPSG:31983)** e **SAD69 / UTM 23S (EPSG:29193)** **[disponibilidade testada]**.
- Cada mina terá um CRS de trabalho (proposta: SIRGAS 2000). Dados em SAD69 são convertidos **somente** com confirmação, e a transformação usada (parâmetros) fica registrada.
- **Validação planejada**: a topografia enviada tem o mesmo piso em SAD69 e em SIRGAS. A transformação escolhida será comparada com essa conversão feita pela topografia da mina antes de ser adotada (ver DADOS_REAIS.md).

### 6.2 Armazenamento
| Dado | Representação |
|---|---|
| geometria | coluna `geom` BLOB (WKB 2D/3D) + `srid` + `dimensao` (2/3) |
| índice | tabela virtual R*Tree `(id, minx, maxx, miny, maxy, minz, maxz)` por tabela espacial |
| atributos originais | coluna JSON |

### 6.3 Topografia (Etapa 10), conforme os arquivos reais
- O formato real é **DXF convertido em shapefile** (Line/3DPolyline/Circle/Insert por layer CAD). O importador vai preservar `Layer`, `Entity`, `Color` e os demais atributos, e agrupar por layer.
- **Não existem eixos de galeria nos arquivos**: o eixo para chainage será desenhado/derivado com revisão do usuário (DADOS_REAIS.md §1).
- Z suspeito (layers SC e PONTO CONVERGÊNCIA) é marcado e não exibido em 3D sem confirmação.

### 6.4 Chainage e visualizador 3D
Sem mudança em relação à Etapa 1: chainage 3D em NumPy (DT-006); Three.js com origem local para evitar a perda de precisão em float32 (DT-005).

## 7. Armazenamento de arquivos **[IMPLEMENTADO]**
Endereçado por conteúdo (`objetos/ab/cd/<sha256>`), gravação atômica (arquivo temporário + rename), deduplicação, somente-leitura, verificação de integridade sob demanda, tipo detectado pelo conteúdo, limite de tamanho (500 MB padrão).

## 8. Segurança **[IMPLEMENTADO no núcleo]**
- Senhas Argon2id; mínimo de 8 caracteres combinando letras e números.
- Sessões com token opaco revogável (DT-018); troca de senha encerra as sessões.
- Novo usuário e senha redefinida pelo administrador obrigam troca no próximo acesso.
- Proteções: não é possível desativar a si mesmo nem remover o último administrador.
- Papéis: Administrador, Geólogo revisor, Geólogo, Técnico/amostrador, Consulta.
- Login sem diferenciar maiúsculas; mesma resposta e tempo para usuário inexistente e senha errada.

## 9. Backup
- Automático antes de cada migração **[IMPLEMENTADO]**.
- Backup manual e restauração pela interface: Etapa 4 (pendente).

## 10. Tablets e celulares (E20)
Os geólogos usam tablets e celulares **sem rede**. Proposta: a mesma interface instalada como aplicativo offline no tablet, com banco local, e troca de dados com o PC por **arquivo de sincronização** (cabo USB), com resolução de conflitos usando `instalacao_id`, UUID e `versao`. Detalhamento quando a etapa for iniciada.
