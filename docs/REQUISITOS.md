# REQUISITOS — GeoMina

> Documento derivado do "Prompt Mestre" (especificação original, nov/2026), reorganizado em requisitos rastreáveis.
> Cada requisito tem um identificador estável. `§n` remete à seção da especificação original.
> Itens marcados **[ADIÇÃO]** não estavam na especificação e foram incluídos pela análise crítica da Etapa 1 (ver `ANALISE_CRITICA.md`).
> Itens marcados **[A CONFIRMAR]** dependem de informação do usuário (ver `STATUS_DO_PROJETO.md` → Pendências).

Prioridade: **M** = obrigatório (must) · **D** = desejável · **F** = futuro/avaliação.

---

## 1. Requisitos não funcionais (RNF)

| ID | Requisito | Prior. | §  |
|----|-----------|--------|----|
| RNF-01 | Todos os dados exibidos vêm do banco real; nenhum indicador ou dado fictício apresentado como real. Dados de teste sempre identificados como tal. | M | 2, 5, 24 |
| RNF-02 | Integridade referencial garantida pelo banco (FK, UNIQUE, CHECK), não apenas pela interface. | M | 17.3 |
| RNF-03 | Rastreabilidade: toda criação/alteração/exclusão registra quem, quando, o quê (valores anteriores e novos). | M | 17.3, 20 |
| RNF-04 | Arquivos originais (croquis, fotos, planilhas de laboratório, shapefiles) preservados de forma imutável, com hash de verificação. | M | 7, 8, 10, 12.5 |
| RNF-05 | Coordenada Z nunca descartada; nenhuma transformação de coordenadas silenciosa. | M | 12.2, 12.6 |
| RNF-06 | Nenhuma informação espacial inventada (cota, largura, seção, 3D a partir de 2D). | M | 12.7, 12.8 |
| RNF-07 | Extensibilidade: novas variáveis analíticas, tipos de amostra, litologias, estruturas e tipos de unidade operacional sem alteração de esquema. | M | 6.2, 9.2, 10.4 |
| RNF-08 | Autenticação e controle de acesso por papéis. | M | 20 |
| RNF-09 | **Aplicativo local no PC**, sem rede e sem internet; servidor interno só em 127.0.0.1 (decisão do usuário, 2026-11-25). | M | 20 |
| RNF-10 | Captura em campo em **tablets e celulares sem rede** (confirmado pelo usuário), com sincronização com o PC. | M | 19, 20 |
| RNF-11 | Desempenho com grandes volumes topográficos: carregamento seletivo, índices espaciais. | M | 12.17 |
| RNF-12 | Backup e recuperação documentados e testados. | M | 20 |
| RNF-13 | Interface em português (pt-BR), responsiva (desktop e tablet). | M | 19 |
| RNF-14 | Importação tolerante a formatos brasileiros (separador `;`, vírgula decimal, datas dd/mm/aaaa, encoding Latin-1/UTF-8). **[ADIÇÃO]** | M | 10 |
| RNF-15 | Documentação reflete apenas o que está implementado e testado. | M | 21 |

## 2. Estrutura operacional (§4) — RF-EST

| ID | Requisito | Prior. |
|----|-----------|--------|
| RF-EST-01 | Cadastro de mina(s). | M |
| RF-EST-02 | Tipos de unidade operacional configuráveis (Região, Nível, Galeria, Travessa, Rampa, Subdivisão, Frente, Painel, Realce…). | M |
| RF-EST-03 | Hierarquia flexível de unidades (árvore), com regras configuráveis de quais tipos podem conter quais. | M |
| RF-EST-04 | Unidades que atravessam vários níveis (ex.: rampa) sem duplicação. **[ADIÇÃO]** | M |
| RF-EST-05 | Frentes com estado (ativa, paralisada, encerrada) e histórico de avanço (data, posição/chainage, responsável). | M |
| RF-EST-06 | Histórico de atividades por unidade (todos os registros vinculados, em ordem cronológica). | M |
| RF-EST-07 | Inativação em vez de exclusão de unidades que possuam registros vinculados. **[ADIÇÃO]** | M |

## 3. Dashboard (§5) — RF-DASH

| ID | Requisito | Prior. |
|----|-----------|--------|
| RF-DASH-01 | Indicadores calculados por consulta ao banco (contagens por tipo de unidade, mapeamentos, amostras, amostras aguardando resultado, importações, levantamentos, pendências de revisão). | M |
| RF-DASH-02 | Lista de atividades recentes (a partir da trilha de auditoria). | M |
| RF-DASH-03 | Atalhos para os módulos. Cada indicador só aparece quando o módulo correspondente existir. | M |

## 4. Mapeamento geológico (§6) — RF-MAP

| ID | Requisito | Prior. |
|----|-----------|--------|
| RF-MAP-01 | Registro de mapeamento vinculado a uma unidade operacional, data, geólogo, tipo de atividade, posição (XYZ e/ou chainage), referência espacial, descrição, observações. | M |
| RF-MAP-02 | Observações geológicas tipadas: litologia, contato, alteração, mineralização, mineralogia, estrutura — com intervalo opcional (de/até ao longo do eixo ou da face). | M |
| RF-MAP-03 | Dicionários configuráveis (litologias, alterações, tipos de estrutura, minerais, intensidades, tipos de atividade) com código, descrição, cor, ativo/inativo. | M |
| RF-MAP-04 | Medidas estruturais: planares (direção de mergulho/mergulho) e lineares (caimento/rumo do caimento — trend/plunge), com conversão a partir de rumo/mergulho (regra da mão direita). Valor como digitado e convenção preservados. | M |
| RF-MAP-05 | Referência de norte da medida (magnético/quadrícula/verdadeiro) e declinação aplicada registradas. **[ADIÇÃO]** | M |
| RF-MAP-06 | Validações de faixa (mergulho 0–90°, azimutes 0–360°) e coerência lineação-sobre-plano quando informado (aviso). | M |
| RF-MAP-07 | Atributos extras configuráveis por tipo de observação (campos customizados com tipo e validação). | D |
| RF-MAP-08 | Fluxo de estado: rascunho → submetido → aprovado; edição após aprovação gera nova revisão (histórico completo). | M |
| RF-MAP-09 | Associação a fotos, croquis, documentos, amostras; consulta cronológica por unidade. | M |

## 5. Documentos, croquis e fotografias (§7, §8, §16) — RF-DOC

| ID | Requisito | Prior. |
|----|-----------|--------|
| RF-DOC-01 | Serviço único de arquivos: armazenamento imutável do original, hash SHA-256, tipo MIME detectado, tamanho, autor, data de envio. | M |
| RF-DOC-02 | Versionamento: nova versão não apaga a anterior. | M |
| RF-DOC-03 | Vínculos de um arquivo com múltiplos registros (unidade, mapeamento, amostra, medida estrutural, levantamento). | M |
| RF-DOC-04 | Croquis: PDF, JPG/JPEG, PNG, TIFF; visualização no navegador (TIFF via pré-visualização gerada no servidor). | M |
| RF-DOC-05 | Fotos: importação em lote, extração de EXIF (data, GPS quando houver), miniaturas, legenda, descrição, identificação. | M |
| RF-DOC-06 | Captura por câmera do dispositivo (input de câmera do navegador em tablet). | D |
| RF-DOC-07 | Consulta de fotos/croquis por nível, galeria, frente, data, geólogo, amostra, tipo de registro; visualização em grade. | M |
| RF-DOC-08 | OCR/IA assistida em croquis — apenas sugestões, com estado "não validado" até revisão humana. | F |
| RF-DOC-09 | Outros documentos (relatórios, planilhas, arquivos GIS) com o mesmo serviço. | M |

## 6. Amostragem (§9) — RF-AMO

| ID | Requisito | Prior. |
|----|-----------|--------|
| RF-AMO-01 | Cadastro de amostra com código único (por mina), unidade operacional, data, geólogo, tipo, método, posição, descrição geológica (via dicionários), referências a mapeamento/croqui/foto. | M |
| RF-AMO-02 | Geometria da amostra: ponto (XYZ) **ou** intervalo (de/até — linha), pois amostras de canal/parede são intervalos. **[ADIÇÃO]** | M |
| RF-AMO-03 | Tipos e métodos de amostragem configuráveis. | M |
| RF-AMO-04 | Regras de código configuráveis (prefixo, sequência, padrão regex de validação), geração opcional automática. Regras atuais: **BS-RP** (mina), **BMT-TS** (testemunho de sondagem), **BE** (antigas). Forma canônica sem espaços; grafias variantes ("RP 478", "BS - RP - 237 B") normalizadas **com confirmação**. | M |
| RF-AMO-05 | Bloqueio de duplicidade de código (restrição única) e aviso de possíveis duplicatas (mesma posição/data). | M |
| RF-AMO-06 | Lote de envio ao laboratório (cadeia de custódia): data de envio, laboratório, amostras, estado. **[ADIÇÃO]** | M |
| RF-AMO-07 | Amostras de controle de qualidade: padrões (CRM), brancos, duplicatas — identificadas e vinculadas à amostra original quando duplicata. **[ADIÇÃO]** | M |
| RF-AMO-08 | Importação em lote (CSV/Excel) e exportação. | M |
| RF-AMO-09 | Edição controlada e histórico. | M |

## 7. Resultados laboratoriais (§10) — RF-GQ

| ID | Requisito | Prior. |
|----|-----------|--------|
| RF-GQ-01 | Assistente de importação nos 12 passos de §10.2 (arquivo → estrutura → prévia → colunas → mapeamento → códigos → validação → inconsistências → não encontradas → duplicidades → confirmação → histórico). | M |
| RF-GQ-02 | Modelos de mapeamento de colunas reutilizáveis por laboratório. | D |
| RF-GQ-03 | Analitos em cadastro aberto (elemento, óxido, parâmetro), sem colunas fixas no banco. | M |
| RF-GQ-04 | Cada resultado guarda: valor original como texto, valor numérico, qualificador (`<`, `>`, normal), limite de detecção, unidade, método, laboratório, certificado/bateria, data de análise. **[ADIÇÃO detalhada]** | M |
| RF-GQ-05 | Conversão de unidades explícita e documentada (ex.: ppm ↔ %), nunca silenciosa. | M |
| RF-GQ-06 | Múltiplos resultados do mesmo analito para a mesma amostra (métodos diferentes, reanálise) coexistem; regra configurável de "resultado preferido". **[ADIÇÃO]** | M |
| RF-GQ-07 | Arquivo original da importação preservado e vinculado aos resultados. Importação pode ser revertida (estado "cancelada"), mantendo histórico. | M |
| RF-GQ-08 | Consultas por amostra, unidade, data, campanha, laboratório, método, variável, bateria. | M |
| RF-GQ-09 | Relatórios básicos de QA/QC (desvio de padrões, contaminação em brancos, precisão de duplicatas). **[ADIÇÃO]** | D |

## 8. Topografia e espaço (§12, §17.2) — RF-TOP

| ID | Requisito | Prior. |
|----|-----------|--------|
| RF-TOP-01 | Importação de shapefile LineStringZ / PolygonZ (e Multi*), preservando todos os vértices XYZ e atributos. | M |
| RF-TOP-02 | Assistente de importação nos passos de §12.4, com relatório de validação (geometrias vazias/inválidas, Z ausente, Z constante, coordenadas fora da extensão da mina, CRS ausente/incompatível). | M |
| RF-TOP-03 | Levantamentos versionados que coexistem; nunca sobrescrevem o anterior. Arquivo original preservado. | M |
| RF-TOP-04 | Configuração do sistema de coordenadas da mina (EPSG ou grade local registrada), unidades e origem local. | M |
| RF-TOP-05 | Geometria 2D importada é marcada como 2D; não é promovida a 3D sem ação explícita e registrada do usuário. | M |
| RF-TOP-06 | Eixos de referência (linhas 3D) associados a unidades operacionais, versionados, usados para chainage. | M |
| RF-TOP-07 | Chainage = distância 3D acumulada ao longo dos vértices do eixo (não distância em linha reta), com projeção de pontos sobre o eixo e distância de afastamento registrada. | M |
| RF-TOP-08 | GeoJSON, DXF, CSV/XYZ — somente após testes com arquivos reais. LAS/LAZ/E57/OBJ/PLY — avaliação futura. | D/F |
| RF-TOP-09 | Visualizador 3D: rotação, zoom, navegação, seleção, coordenadas/cota do ponto, atributos, camadas, filtros por nível/unidade. | M |
| RF-TOP-10 | Camadas: topografia, eixos, frentes, mapeamentos, amostras (colorização por teor), fotos, croquis, estruturas (símbolos orientados). | M |
| RF-TOP-11 | Carregamento seletivo por extensão/nível/unidade; simplificação por nível de detalhe quando necessário. | M |

## 9. Análise geoquímica longitudinal (§11) — RF-LON

| ID | Requisito | Prior. |
|----|-----------|--------|
| RF-LON-01 | Eixo de análise: unidade (galeria/travessa/rampa) + versão do eixo de referência; ou sequência manual de estações quando não houver topografia (identificado como "chainage manual"). | M |
| RF-LON-02 | X = chainage real (espaçamento irregular respeitado); amostras de intervalo plotadas como segmentos de/até. | M |
| RF-LON-03 | Seleção dinâmica de qualquer analito existente; múltiplas variáveis com eixos Y independentes ou normalização explícita (método exibido). | M |
| RF-LON-04 | Valores abaixo do limite de detecção tratados por regra visível ao usuário (ex.: LD/2, omitir, marcar). | M |
| RF-LON-05 | Filtros de §11.5. Comparação de galerias, campanhas, intervalos. | M |
| RF-LON-06 | Clique em ponto → ficha da amostra com geologia, fotos, croquis, resultados. | M |
| RF-LON-07 | Exportação do gráfico (PNG/SVG) e dos dados (CSV/Excel). | M |

## 10. Consultas, GIS, relatórios (§13–§15) — RF-CON, RF-GIS, RF-REL

| ID | Requisito | Prior. |
|----|-----------|--------|
| RF-CON-01 | Construtor de consultas com filtros combinados (E/OU) sobre unidade, data, geólogo, dicionários geológicos, analitos com condição numérica, intervalo de chainage, campanha. | M |
| RF-CON-02 | Consultas salvas. | D |
| RF-GIS-01 | Exportação GeoPackage (recomendado), Shapefile, GeoJSON e CSV com XYZ, preservando Z e atributos; CRS escrito explicitamente (.prj). | M |
| RF-GIS-02 | Compatibilidade verificada abrindo os arquivos exportados no QGIS (teste manual documentado). | M |
| RF-REL-01 | Relatórios (mapeamento, amostragem, geoquímica, por unidade, perfil longitudinal, levantamentos) em PDF, Excel e CSV, gerados a partir de dados reais com filtros selecionáveis. | M |

## 11. Perfil longitudinal integrado (§12.16) — RF-PERF

| ID | Requisito | Prior. |
|----|-----------|--------|
| RF-PERF-01 | Perfil ao longo do eixo com faixas: cota, litologia, alteração, estrutura, mineralização, amostras, teores, fotos/croquis; interação de seleção. | M (etapa tardia) |

## 12. Segurança e usuários (§20) — RF-SEG

| ID | Requisito | Prior. |
|----|-----------|--------|
| RF-SEG-01 | Login com senha (hash Argon2), sessão com expiração, troca de senha. | M |
| RF-SEG-02 | Papéis: Administrador, Geólogo revisor, Geólogo, Técnico/Amostrador, Consulta. Permissões por ação e módulo. | M |
| RF-SEG-03 | Trilha de auditoria imutável para o usuário comum. | M |
| RF-SEG-04 | Integração com diretório corporativo (LDAP/AD). Não se aplica ao aplicativo local. | F |
| RF-MAP-10 | Ficha digital de mapeamento conforme `FICHA_MAPEAMENTO.md` (sem RQD). | M |
| RF-GQ-10 | Leitor do layout de laudo SGS Geosol (.xls) com tipos SMP/DUP/REP/STD. | M |
