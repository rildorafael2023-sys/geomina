# STATUS DO PROJETO

**Última atualização:** 2026-11-26 · **Versão:** 0.8.0 · **Etapa atual:** E9 concluída; seguindo para a E10 (etapas em sequência, a pedido do usuário)

## Etapas

| Etapa | Estado |
|-------|--------|
| E1 Arquitetura e especificação | ✅ Aprovada |
| E2 Infraestrutura, banco local, autenticação, auditoria, arquivos | ✅ Validada (instalada e aberta pelo usuário no Windows) |
| E3 Estrutura operacional da mina + janela própria | ✅ Usuário autorizou prosseguir (validação no Windows da janela própria ainda pendente) |
| E4 Painel, histórico de alterações, backup e restauração | ✅ Usuário autorizou prosseguir |
| E5 Mapeamento geológico (ficha digital) | 🟡 **Concluída e testada, aguardando validação do usuário** (feita com a proposta da ficha como estava, a pedido do usuário: "comece") |
| E6+E7 Croquis, documentos e fotografias | ✅ Concluídas e testadas (v0.6.0) |
| E8 Amostragem | ✅ Concluída e testada (v0.7.0) |
| E9 Importação geoquímica | ✅ Concluída e testada (v0.8.0) |
| E10 Topografia, eixos e chainage | 🔵 Em andamento |
| E5 – E21 | ⚪ Pendentes |

## Entregue na E9 (versão 0.8.0)
| Funcionalidade | Teste |
|---|---|
| Leitor do laudo **SGS Geosol** (.xls/.xlsx): certificado, data de emissão, projeto, referência; método, analito e unidade lidos dos cabeçalhos (ordem das colunas pode variar) | **2 laudos reais** |
| Leitor genérico (CSV/XLSX com "Analito (unidade)" ou "Analito_unidade") | API |
| Valores: `<0,5`, `>99`, `N.A.`, `--`, vírgula decimal; texto original sempre guardado; nada vira zero | API |
| Tipos de linha SMP, DUP, REP, STD e branco (BRANCO_PREP) | laudos reais |
| Importação em duas fases: prévia (amostras cadastradas/não cadastradas/controles, analitos novos, valores ilegíveis, certificado ou arquivo já importados) → confirmação | API + E2E |
| Analitos em lista aberta (criados na importação: elemento/óxido/parâmetro) | API |
| Resultados **imutáveis** (trigger); "preferido" = SMP do certificado mais recente; reanálise substitui o preferido sem apagar o anterior | API + banco |
| Resultados de códigos não cadastrados guardados sem vínculo e ligados depois | API |
| Tabela de resultados (escolha de analitos, preferidos ou linhas do certificado) e **exportação CSV** (abre no Excel com acentos) | API + E2E |
| QA/QC: diferença relativa (RPD) de duplicatas e replicatas com limite ajustável; padrões e brancos listados | API + E2E (laudo real: 8 pares acima de 20%) |
| Resultados na amostra; painel com "aguardando resultado" e "com resultado" | E2E |

**Laudos reais:** GQ2613496 (2.064 resultados) e GQ2604840 (2.928 resultados) importados; valores conferidos (ex.: BS-RP-468B: F 6916 ppm, Be 68,1 ppm, Cr 1508 ppm; DUP Be 66,9 ppm).

## Entregue na E8 (versão 0.7.0)
| Funcionalidade | Teste |
|---|---|
| Amostras com código canônico único por mina (BS-RP, BMT-TS, BE), série, tipo, campanha, local (unidade e descrição), seção de/até, furo e profundidade (testemunho), XYZ **com o sistema de coordenadas de origem** (obrigatório), geologia por dicionário, destino, massa | API + E2E |
| QA/QC: padrão (CRM), branco, duplicatas de campo/preparação/polpa ligadas à original (regras no banco) | API |
| "Próximo código" BS-RP / BMT-TS | API + E2E |
| Lotes de envio (cadeia de custódia): amostras passam a "enviada"; lote enviado fica fechado (trigger); código não muda após envio | API + E2E |
| **Importação de planilha** (.xlsx/CSV) em duas fases com prévia por linha: códigos normalizados, sugestões a confirmar ("RP 478" → BS-RP-478), repetidos, já cadastrados, intervalo "0 m - 4,5 m", vírgula decimal, datas, litologias reconhecidas por sinônimo/normalização; o usuário declara o sistema de coordenadas ou não importa XYZ; associa litologias não reconhecidas; arquivo original e relatório guardados | API + E2E + **planilha real** |
| Cadastro das amostras a partir da ficha de mapeamento (herda local, data, geólogo e litologia do intervalo) | API |
| Painel: amostras e quantas aguardam resultado | API + E2E |

**Planilha real (GEOQUIMICA_DESCRIÇÃO):** 368 linhas com amostra → 89 ok, 180 sugestões de código, 5 inválidas, 94 repetidas; 269 gravadas com sugestões aceitas. ~90 grafias de litologia compostas não estão no dicionário (ex.: "quartzo - anfibolio - flogopita xisto"): ficam como texto na amostra até o usuário associar ou criar termos.

## Entregue nas E6+E7 (versão 0.6.0)
| Funcionalidade | Teste |
|---|---|
| Documentos com **versões** (originais imutáveis, garantido por trigger), vínculos com unidade da mina ou ficha, arquivamento | API + banco |
| Croquis: PDF, JPG, PNG, TIFF; visualização no navegador (TIFF por prévia PNG gerada no computador) | API + E2E |
| Tipo conferido pelo conteúdo **e** pela extensão (extensão falsa recusada) | API |
| **Separar PDF em páginas** (ex.: fichas escaneadas em lote): um croqui por página, mesmos vínculos, original mantido | API + E2E com o **PDF real de 23 páginas** |
| Fotos: envio em lote, **EXIF** (data, câmera, GPS), data da foto pela EXIF, miniaturas, legenda e identificação, **Tirar foto** (câmera do tablet/celular) | API + E2E |
| Galeria e lista com busca e filtros (categoria, local com sub-árvore, ficha, período, autor, texto) | API + E2E |
| Anexos na ficha (seção E) e aba "Fotos e croquis" em cada unidade; anexo de ficha não rascunho não pode ser retirado (trigger) | API + banco + E2E |

## Entregue na E5 (versão 0.5.0)
| Funcionalidade | Teste |
|---|---|
| **Dicionários** configuráveis (11): litologias da planilha da mina (17, com siglas e cores), texturas, alterações, intensidade, mineralização, minerais, contatos, tipos de estrutura (planar/linear), exposição, água, destino da amostra. Inclusão, edição, inativação, **sinônimos**; reconhecimento de grafias ("Gnaisse Pelitico" = "gnaisse pelítico") | API + E2E |
| **Ficha digital** (proposta `FICHA_MAPEAMENTO.md`, sem RQD): identificação (local na árvore, exposição, distância + referência, seção, azimute, XYZ opcional), intervalos da seção, medidas estruturais, amostras coletadas, descrição, água, observações geotécnicas opcionais | API + E2E |
| Numeração automática `MAP-AAAA-nnnn` por mina | API |
| Medidas: direção de mergulho/mergulho ou rumo (mão direita), rumo/caimento para lineações; valor digitado e convenção guardados; norte de referência e declinação (herdada da mina) registrados, sem correção automática | testes com casos calculados à mão |
| Validações: intervalos sobrepostos (erro), lacunas e altura excedida (avisos), faixas de ângulos, termos do dicionário certo (garantido **pelo banco**), termos inativos só em registros antigos | API + banco |
| Códigos de amostra normalizados ("BS - RP - 237 - B" → BS-RP-237B); "RP 478" vira **sugestão** BS-RP-478 com confirmação; BE aceito com aviso | testes com as grafias reais da planilha + E2E |
| **Coluna da seção** e **estereograma** (Schmidt, hemisfério inferior, polos + grandes círculos + lineações) atualizados enquanto se digita | testes unitários da projeção + E2E |
| Fluxo **rascunho → submetida → aprovada** (devolver com motivo, reabrir com motivo, cancelar). Autor não aprova a própria ficha se houver outro revisor. Ficha aprovada/submetida **imutável no banco**; reabrir guarda a versão aprovada | API + banco + teste de mutação |
| Lista de fichas com filtros (local com sub-árvore, situação, litologia, período, texto/amostra); aba "Mapeamentos" em cada unidade; "Nova ficha neste local" | API + E2E |
| **Impressão / PDF** da ficha e **ficha em branco** para campo | E2E (capturas) |
| Painel: fichas e quantas aguardam revisão | API |

### Problemas encontrados e corrigidos na E5
| Problema | Correção |
|---|---|
| Remoção de amostra/intervalo de uma ficha não era auditada | exclusão explícita de cada item |
| Alterar só intervalos não mudava a versão da ficha (edições simultâneas não detectadas) | toda gravação avança a versão |
| Ficha nova seria gravada sem unidade/data | campos obrigatórios definidos na criação |
| Migração gerada com tipo interno (não executava) | tipo padrão + ajuste do gerador |
| Impressão: " × 3,2 m" sem largura; "magnetico" sem acento; notificações sobre os botões | corrigidos |

## Entregue na E4 (versão 0.4.0)
| Funcionalidade | Teste |
|---|---|
| **Painel** com números reais do banco: unidades ativas por tipo, frentes ativas/paralisadas, avanço dos últimos 30 dias, últimos avanços, arquivos, usuários ativos, atividades recentes. Cada bloco só aparece com a permissão correspondente | API (valores conferidos com dados criados no teste) + E2E |
| **Histórico de alterações** (auditoria) com filtros por assunto, operação, usuário, período e texto; paginação; detalhes antes/depois por campo. Acesso: Administrador e Geólogo revisor | API + E2E |
| **Backup completo** (banco + arquivos originais + manifesto com contagens e hash), com cópia opcional para pendrive/disco (conferida por hash), download e "abrir pasta" | API + E2E |
| **Backup diário automático** do banco na abertura (14 mais recentes) | teste automático (inclusive retenção) |
| **Restauração** pela tela: exige senha + digitar RESTAURAR; valida hash, integridade e versão; faz backup de segurança antes; registra na auditoria; bloqueia o uso durante a restauração; exige novo login | API (incluindo backup corrompido e de versão mais nova) + E2E |
| Busca no histórico com acentos ("Nível") | teste automático |

### Problemas encontrados e corrigidos na E4
| Problema | Correção |
|---|---|
| Acentos gravados codificados no histórico (`\u00ed`) impediam a busca por "Nível" | JSON gravado com acentos legíveis |
| Endereço `/api/...` inexistente devolvia a página da interface em vez de erro (sem vazamento de dados, conferido) | resposta 404 JSON + teste |
| Painel com rolagem lateral de 69 px no celular | tabelas com rolagem própria |
| Após restaurar e entrar de novo, a tela permanecia em Backup | volta ao Painel |
| Resumo do avanço em formato de computador ("2026-11-25 3.2 m") | "25/11/2026 · +3,2 m" |

## Entregue na E3 (versão 0.3.0)
| Funcionalidade | Teste |
|---|---|
| Janela própria (sem barra de endereço), ícone na área de trabalho, instância única, encerramento ao fechar | automático (lógica) + real com Chromium (Linux). **Windows/Edge não testado** |
| Cadastro da mina com sistema de coordenadas (SIRGAS 2000 ou SAD69 / UTM 23S) e declinação magnética | API + E2E |
| Tipos de unidade configuráveis (9 padrão) e regras de hierarquia editáveis (matriz) | API + E2E |
| Árvore: níveis, galerias, travessas, rampas, subdivisões, realces, chaminés, frentes | API + E2E |
| Regras garantidas pelo **banco** (hierarquia, mesma mina, ciclos, multinível, avanço só em frente) | testes com SQL direto + teste de mutação |
| Rampas e chaminés ligadas a vários níveis; consulta por nível inclui as unidades ligadas | API + E2E |
| Mover unidade com tudo o que está dentro (caminhos recalculados) | API |
| Inativar (bloqueado se houver unidades ativas dentro), reativar, excluir (só sem vínculos) | API + E2E |
| Avanço de frente: data, distância + referência, avanço, XYZ opcional, responsável; correção com controle de versão | API + E2E |
| Histórico legível por unidade (cadastro, alterações, unidades criadas dentro, avanços, vínculos de nível) | API + E2E |
| Datas e horas em UTC no banco, exibidas no horário local | teste automático |

Resumo dos testes (E3): **63 testes do backend**, **E2E da estrutura (10 cenários)** e **E2E básico (7 cenários)** aprovados; lint e checagem de tipos sem erros. Detalhes em `TESTES.md`.

## Problemas encontrados e corrigidos na E3
| Problema | Correção |
|---|---|
| Horários seriam exibidos 3 h deslocados (o SQLite não guarda fuso) | tipo `DataHoraUTC` em todas as colunas de data/hora + teste |
| Unidade recém-criada ficava escondida em ramo fechado da árvore | a árvore abre o caminho até a unidade selecionada |
| Notificações cobriam os botões de ação | movidas para baixo, no máximo 3 |
| "Nível N144 cadastrada" (concordância) | "Unidade N144 cadastrada (Nível)." |
| No celular, os detalhes ficavam fora da tela | rolagem automática até o painel |

## Decisões do usuário (2026-11-25)
- Aplicativo para rodar **no PC, sem rede** → arquitetura revisada (DT-016 a DT-021).
- Sistemas de coordenadas: **SIRGAS 2000 / UTM 23S** e **SAD69 / UTM 23S**.
- Os geólogos usam **tablets e celulares sem rede** → a etapa E20 (captura offline) é necessária.
- Códigos de amostra: **BS-RP** = mina; **BMT-TS** = testemunho de sondagem; **BE** = antigas (mina e testemunho).
- As demais propostas da Etapa 1 foram aprovadas ("os demais pode fazer tudo").
- E2 validada: aplicativo instalado e aberto no PC.
- Pedido: abrir em janela própria, com ícone na área de trabalho → feito na E3.
- Ficha de mapeamento: **não** copiar a ficha atual; propor uma melhor, **sem RQD** → proposta em `FICHA_MAPEAMENTO.md` (aguarda revisão).

## Análise dos arquivos reais
Feita e documentada em `DADOS_REAIS.md`. Principais impactos:
1. A topografia é **desenho CAD convertido** (paredes, teto e piso em segmentos), **sem eixos de galeria**: o chainage dependerá de eixos desenhados ou derivados com revisão.
2. Há layers com **Z inválido** (SC, PONTO CONVERGÊNCIA) e um cabeçalho de shapefile corrompido.
3. Os laudos SGS trazem QA/QC (DUP, REP, STD, branco), `<LD` com vírgula, `N.A.`, e a ordem das colunas muda entre laudos.
4. Os códigos de amostra e as litologias têm várias grafias, o que exige normalização com confirmação.

## Limitações conhecidas
- **Janela própria e atalho não testados no Windows** (testados em Linux com Chromium). Se a janela não abrir, use `GeoMina.bat` (modo diagnóstico) e envie a mensagem.
- O instalador exige Python 3.12/3.13 (instalador .exe único previsto para a E19).
- Alterações feitas direto no arquivo `.db`, fora do aplicativo, não são auditadas. Os caminhos das unidades internas recalculados ao mover são derivados e não geram registro próprio (o movimento da unidade é registrado).
- Visualização de PDF depende do leitor de PDF do Edge (o navegador de teste automatizado não exibe PDF; conferido só o carregamento). A amostra citada na ficha é ligada pelo código; o cadastro completo de amostras é da E8.
- Medidas estruturais ficam como medidas (norte magnético + declinação registrada); a conversão para o norte da quadrícula será oferecida quando houver uso espacial (E13).
- Importação de amostras: linhas sem código de amostra (só descrição de intervalo) não são importadas; códigos repetidos em várias linhas da planilha — decisão do usuário pendente (hoje: primeira ocorrência).
- Vínculo de foto diretamente a uma amostra: ainda não (fotos se ligam à ficha ou à unidade).
- QA/QC: os valores certificados dos padrões (OREAS920B, SG_092…) ainda não estão cadastrados, então o desvio dos padrões não é calculado.
- Resultados não entram na auditoria linha a linha (milhares por laudo); a rastreabilidade é pela importação (arquivo original + relatório) e eles são imutáveis.
- Backup diário automático contém só o banco (os arquivos originais entram no backup completo, feito pelo usuário). Recomenda-se um backup completo semanal em pendrive/disco externo.
- Restauração pela tela aceita backups da pasta de backups; um backup que está num pendrive deve ser copiado antes para essa pasta ("Abrir pasta de backups").
- "Abrir pasta de backups" funciona no Windows; em outros sistemas mostra o caminho.
- Avanço de frente: a distância é a medida informada (trena/topografia). O chainage calculado sobre o eixo topográfico chega na E10.

## Pendências que dependem do usuário
| # | Pergunta | Bloqueia |
|---|---|---|
| P1 | Validar a E3: atualizar a instalação (ver INSTRUCOES_DE_INSTALACAO → Atualização), abrir pelo ícone e cadastrar a mina e alguns níveis | E4 |
| P2 | Ajustes na ficha digital depois do uso (a proposta foi implementada como estava) | — |
| P3 | CRS de trabalho: a tela de cadastro da mina sugere SIRGAS 2000; confirmar ao cadastrar | — |
| P4 | Lista de níveis, galerias, travessas e rampas (posso preparar uma importação por planilha se for longa) | uso real da E3 |
| P5 | Significado do prefixo SAB-CP (visto no laudo) e dos layers SC e PONTO CONVERGÊNCIA | E8/E10 |
| P6 | Existe arquivo de eixos de galeria na topografia, ou o eixo deverá ser desenhado no GeoMina? | E10 |
| P7 | Croquis: enviar alguns exemplos individuais (além do PDF de fichas) | E6 |

## Próximos passos
1. Usuário usa a ficha digital com dados reais e indica ajustes (campos, listas, layout de impressão).
2. **E6 — Croquis e documentos**: anexar croquis (PDF/imagens, incluindo o PDF de fichas escaneadas) a fichas e unidades, com versões e visualização.
