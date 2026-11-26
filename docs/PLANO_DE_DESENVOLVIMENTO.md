# PLANO DE DESENVOLVIMENTO — Roadmap

> Estado: **aprovado pelo usuário em 2026-11-25**, com a mudança para **aplicativo local no PC** (DT-016).
> Alterações em relação à ordem original estão marcadas **[ALTERADO]** e justificadas em `ANALISE_CRITICA.md`.
> Regra: nenhuma etapa começa sem autorização explícita, e cada etapa termina com testes executados, documentação e status atualizados.

## Critérios gerais de aceitação (toda etapa)

1. Funcionalidades previstas implementadas e integradas ao banco real.
2. Testes automatizados escritos **e executados**, com resultado registrado em `TESTES.md`.
3. Testes das etapas anteriores continuam passando (regressão).
4. Migrações do banco aplicáveis do zero e reversíveis.
5. Documentação e `STATUS_DO_PROJETO.md` atualizados, com limitações conhecidas.
6. Commit no repositório e apresentação para validação.

---

## Mapa de correspondência

| Nova | Original | Conteúdo |
|------|----------|----------|
| E1 | 1 | Arquitetura e especificação |
| E2 | 2 + núcleo da 4 | Infraestrutura, banco, **autenticação e auditoria** [ALTERADO] |
| E3 | 3 | Estrutura operacional |
| E4 | 4 | Interface base, administração de usuários, dashboard |
| E5 | 5 | Mapeamento geológico + dicionários |
| E6 | 6 + 16 | **Serviço de arquivos**, croquis e documentos [ALTERADO] |
| E7 | 7 | Fotografias |
| E8 | 8 | Amostragem (+ lotes de envio, QA/QC) |
| E9 | 9 | Importação geoquímica |
| E10 | 13 (parte 1) | **Importação topográfica, banco espacial, eixos, chainage** [ALTERADO — antecipada] |
| E11 | 10 | Análise geoquímica longitudinal (com chainage real) |
| E12 | 13 (parte 2) | Visualizador 3D |
| E13 | 14 | Integração espacial geológica |
| E14 | 11 | Consultas avançadas |
| E15 | 12 | Integração GIS (exportação) [ALTERADO — após dados espaciais] |
| E16 | 15 | Perfil longitudinal integrado |
| E17 | 16 | Relatórios |
| E18 | 17 | Integração, auditoria e validação |
| E19 | 18 | Implantação |
| E20 | — | **Captura offline em tablet** (se confirmada) [NOVO] |
| E21 | — | OCR/IA assistida em croquis (avaliação) [NOVO, opcional] |

---

## E1 — Arquitetura, planejamento e especificação técnica ✅ aprovada
**Entregáveis:** REQUISITOS, ANALISE_CRITICA, ARQUITETURA, BANCO_DE_DADOS, DECISOES_TECNICAS, PLANO, TESTES, STATUS, README, instruções.
**Aceitação:** documentos revisados e aprovados pelo usuário; pendências críticas respondidas (CRS, offline, implantação).

## E2 — Infraestrutura, banco, autenticação e auditoria ✅ validada pelo usuário (instalada e aberta no Windows)
**Escopo realizado (revisado para aplicativo local):** aplicativo Python local (127.0.0.1) que abre o navegador; SQLite (WAL, FK); SQLAlchemy + Alembic com migração automática e backup prévio; usuários, papéis, permissões, sessões revogáveis; auditoria por ORM com tabela imutável; armazenamento de arquivos por hash; `/saude`; interface React (primeiro acesso, login, usuários, sistema, troca de senha); pacote de instalação offline para Windows.
**Fora do escopo realizado:** Docker e PostGIS (substituídos, DT-016/017); CI no GitHub (adiado: o usuário não quer nada na rede por enquanto).
**Escopo original (Etapa 1):** Docker Compose (PostGIS, API); FastAPI; SQLAlchemy + Alembic; extensões; tabelas do núcleo; trigger de auditoria; login/JWT; RBAC; armazenamento com hash; `/saude`; CI.
**Aceitação:**
- ✅ O aplicativo sobe do zero com uma pasta de dados vazia; `/saude` informa revisão do banco, R*Tree e PROJ.
- ✅ Migração inicial aplicada, revertida e reaplicada.
- ✅ Login válido/inválido, sessão expirada e revogação testados.
- ✅ Rota protegida nega acesso sem permissão.
- ✅ Alteração em tabela auditada gera registro com o usuário correto.
- ✅ O envio de arquivo armazena o original, calcula o SHA-256, deduplica e não sobrescreve.
- ✅ Geometria 3D preserva Z exatamente (WKB) e a consulta R*Tree funciona.
- ✅ Instalação em Windows real: o usuário instalou e abriu o aplicativo.

## E3 — Estrutura operacional da mina ✅ concluída (usuário autorizou prosseguir)
**Realizado também:** janela própria com ícone na área de trabalho, instância única e encerramento automático (pedido do usuário).
**Escopo:** mina (com CRS de trabalho, proposto SIRGAS 2000 / UTM 23S), tipos de unidade, regras de hierarquia, unidades (árvore ltree), unidades multinível, frentes e avanços, histórico por unidade, inativação.
**Aceitação:** ✅ cadastro, consulta e alteração pela API e pela interface testados; ✅ regra de hierarquia violada é rejeitada **pelo banco** (testado com SQL direto, sem a API); ✅ ciclos impossíveis; ✅ mover sub-árvore atualiza os caminhos; ✅ rampa vinculada a 3 níveis aparece na consulta de cada nível; ✅ exclusão de unidade com vínculos bloqueada; ✅ cada operação auditada, com histórico legível por unidade; ✅ avanços de frente com referência obrigatória.

## E4 — Painel, histórico de alterações, backup e restauração ✅ concluída (usuário autorizou prosseguir)
**Realizado:** painel com dados reais, consulta da auditoria, backup completo/diário, cópia para pendrive, restauração segura. A interface base e a administração de usuários já tinham sido feitas na E2.
**Escopo original:** **Escopo:** SPA React/TS (layout, navegação, login, tratamento de sessão), cliente da API gerado; telas de estrutura operacional (árvore, cadastro, histórico); administração de usuários/papéis; dashboard com indicadores **apenas dos módulos existentes**, calculados no banco.
**Aceitação:** testes E2E (Playwright): login, criar mina/nível/galeria/frente pela interface, ver no dashboard a contagem real; usuário "Consulta" não vê botões de edição e a API também recusa; uso testado em resolução de tablet.

## E5 — Mapeamento geológico 🟡 concluída e testada, aguardando validação
**Fora do escopo realizado:** atributos customizados (RF-MAP-07, desejável) e coerência lineação × plano hospedeiro (RF-MAP-06, aviso) — adiados; croquis/fotos na ficha (E6/E7).
**Escopo:** **ficha digital nova (`FICHA_MAPEAMENTO.md`, sem RQD)**; dicionários configuráveis com sinônimos (grafias da planilha de campo); estereograma automático; ficha em PDF e ficha em branco para impressão; mapeamento com observações e medidas estruturais; conversões de orientação; validações; fluxo rascunho→submetido→aprovado; revisões; consulta cronológica por unidade.
**Aceitação:** conversão rumo(RHR)/mergulho → dip-direction/dip testada com casos de referência; valores fora de faixa rejeitados; aprovação bloqueia edição direta e gera revisão; histórico reconstrói versões anteriores; termo inativo não aparece para novos registros mas permanece nos antigos.

## E6 — Serviço de arquivos, croquis e documentos ✅ (junto com a E7, v0.6.0)
**Escopo:** documentos versionados, vínculos com integridade, visualização PDF/imagens, pré-visualização de TIFF gerada no servidor, consulta por localização/data/geólogo.
**Aceitação:** envio de PDF, JPG, PNG, TIFF (multipágina) testado; nova versão preserva a anterior; hash verificado na leitura; vínculo a unidade/mapeamento testado; arquivo com extensão falsa rejeitado.

## E7 — Fotografias ✅ (v0.6.0)
**Escopo:** envio em lote, EXIF, miniaturas, captura por câmera do navegador, galeria com filtros, vínculos a amostra/medida/mapeamento.
**Aceitação:** lote de N fotos com EXIF extraído e miniaturas geradas; filtros retornam o conjunto correto; captura testada em navegador móvel (registro manual).

## E8 — Amostragem ✅ (v0.7.0)
**Escopo:** tipos, métodos, regras de código (BS-RP mina, BMT-TS testemunho, BE antigas; forma canônica e normalização com confirmação), importação da planilha "GEOQUIMICA_DESCRIÇÃO", campanhas, amostras (ponto/intervalo), QA/QC (padrões, brancos, duplicatas), lotes de envio, importação/exportação CSV/Excel, detecção de duplicidade.
**Aceitação:** código duplicado rejeitado pelo banco; geração de códigos concorrentes sem colisão (teste com concorrência); duplicata sem original rejeitada; importação histórica com relatório de linhas rejeitadas; estado "aguardando resultado" derivado corretamente.

## E9 — Importação geoquímica
**Escopo:** leitor do layout SGS Geosol (.xls: certificado, método/analito/unidade por coluna, SMP/DUP/REP/STD); assistente de 12 passos; CSV (`;`/`,`, vírgula decimal, encoding) e Excel; mapeamento de colunas salvo por laboratório; parsing de `<LD`, `>`, `ND`, `IS`; unidades; certificado/bateria; resultado preferido; cancelamento de importação; QA/QC básico (desejável).
**Aceitação:** arquivos de laboratório **reais** (ou anonimizados) importados com contagens conferidas; amostras não encontradas e duplicidades listadas antes da confirmação; nada é gravado antes da confirmação; reimportação do mesmo arquivo detectada; valor original sempre recuperável.

## E10 — Importação topográfica, banco espacial, eixos e chainage
**Escopo:** shapefiles CAD convertidos (layers, entidades, Z suspeito, cabeçalho inválido — DADOS_REAIS.md); validação SAD69 → SIRGAS com o piso fornecido nos dois sistemas; **eixos de galeria desenhados ou derivados com revisão** (não existem nos arquivos); configuração/validação do CRS; leitura de shapefile Z (linhas, polígonos, multi) via GDAL; relatório de validação (§12.4); levantamentos versionados; feições com atributos originais; criação de eixo de referência a partir de feição; chainage 3D; projeção de amostras/mapeamentos no eixo com afastamento.
**Aceitação:** Z preservado vértice a vértice (comparação com o arquivo original); arquivo 2D identificado como 2D; arquivo sem `.prj` exige declaração; transformação registrada; chainage conferido com casos calculados à mão e com eixo real; dois levantamentos coexistem; desempenho medido com o maior arquivo disponível.

## E11 — Análise geoquímica longitudinal
**Escopo:** seleção de eixo (real ou manual), variáveis dinâmicas, gráficos Plotly com espaçamento real, intervalos como segmentos, multi-variável com eixos independentes, normalização explícita, regra de <LD visível, filtros §11.5, ficha da amostra ao clicar, exportação.
**Aceitação:** posições no gráfico conferidas com chainage do banco; nenhuma normalização sem aviso; exportação CSV reproduz os pontos do gráfico.

## E12 — Visualizador 3D
**Escopo:** Three.js com origem local; camadas; navegação; seleção e atributos; coordenadas reais exibidas; carregamento seletivo.
**Aceitação:** coordenadas exibidas ao clicar conferem com o banco (tolerância < 1 mm); teste de precisão com coordenadas UTM grandes; desempenho medido (FPS, tempo de carga) com o conjunto real.

## E13 — Integração espacial geológica
Camadas de amostras (cor por teor), mapeamentos, medidas estruturais (símbolos orientados), fotos e croquis; da seleção no 3D para a ficha do registro e vice-versa.

## E14 — Consultas avançadas
Construtor de filtros combinados (inclui condição sobre analitos e intervalo de chainage), consultas salvas, exportação do resultado.

## E15 — Integração GIS
Exportação GeoPackage/Shapefile/GeoJSON/CSV com Z e atributos; teste de abertura no QGIS documentado.

## E16 — Perfil longitudinal integrado
Faixas de cota, geologia, estruturas, amostras e teores ao longo do eixo; interação.

## E17 — Relatórios
PDF/Excel/CSV a partir de dados reais com filtros selecionáveis.

## E18 — Integração, auditoria e validação
Testes integrados completos, revisão de segurança, carga, integridade, correções.

## E19 — Implantação
Instalador único para Windows (.exe, sem exigir Python), backup agendado no PC, **teste de restauração**, manual e treinamento. (Pacote zip offline já existe desde a E2.)

## E20 — Captura offline em tablet e celular (confirmada)
Os geólogos usam tablets e celulares sem rede. Aplicativo offline com a ficha de mapeamento, amostras e fotos; troca de dados com o PC por arquivo de sincronização (USB); resolução de conflitos. **Pode ser antecipada** para logo depois da E8, se o usuário preferir.

## E21 — OCR/IA em croquis (opcional)
Avaliação com croquis reais; sugestões sempre "não validadas" até revisão.
