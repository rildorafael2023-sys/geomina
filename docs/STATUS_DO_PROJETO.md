# STATUS DO PROJETO

**Última atualização:** 2026-11-25 · **Versão:** 0.4.0 · **Etapa atual:** E4 concluída, aguardando validação

## Etapas

| Etapa | Estado |
|-------|--------|
| E1 Arquitetura e especificação | ✅ Aprovada |
| E2 Infraestrutura, banco local, autenticação, auditoria, arquivos | ✅ Validada (instalada e aberta pelo usuário no Windows) |
| E3 Estrutura operacional da mina + janela própria | ✅ Usuário autorizou prosseguir (validação no Windows da janela própria ainda pendente) |
| E4 Painel, histórico de alterações, backup e restauração | 🟡 **Concluída e testada, aguardando validação do usuário** |
| E5 Mapeamento geológico (ficha digital) | ⚪ Próxima — depende da revisão de `FICHA_MAPEAMENTO.md` |
| E5 – E21 | ⚪ Pendentes |

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
- Backup diário automático contém só o banco (os arquivos originais entram no backup completo, feito pelo usuário). Recomenda-se um backup completo semanal em pendrive/disco externo.
- Restauração pela tela aceita backups da pasta de backups; um backup que está num pendrive deve ser copiado antes para essa pasta ("Abrir pasta de backups").
- "Abrir pasta de backups" funciona no Windows; em outros sistemas mostra o caminho.
- Avanço de frente: a distância é a medida informada (trena/topografia). O chainage calculado sobre o eixo topográfico chega na E10.

## Pendências que dependem do usuário
| # | Pergunta | Bloqueia |
|---|---|---|
| P1 | Validar a E3: atualizar a instalação (ver INSTRUCOES_DE_INSTALACAO → Atualização), abrir pelo ícone e cadastrar a mina e alguns níveis | E4 |
| P2 | Revisar a proposta da ficha (`FICHA_MAPEAMENTO.md`) e responder às 4 perguntas da §4 | E5 |
| P3 | CRS de trabalho: a tela de cadastro da mina sugere SIRGAS 2000; confirmar ao cadastrar | — |
| P4 | Lista de níveis, galerias, travessas e rampas (posso preparar uma importação por planilha se for longa) | uso real da E3 |
| P5 | Significado do prefixo SAB-CP (visto no laudo) e dos layers SC e PONTO CONVERGÊNCIA | E8/E10 |
| P6 | Existe arquivo de eixos de galeria na topografia, ou o eixo deverá ser desenhado no GeoMina? | E10 |
| P7 | Croquis: enviar alguns exemplos individuais (além do PDF de fichas) | E6 |

## Próximos passos
1. Usuário valida a E4 (Painel, Histórico de alterações, Backup) e a janela própria da E3 no Windows.
2. **E5 — Mapeamento geológico** com a ficha digital: precisa da revisão de `FICHA_MAPEAMENTO.md` (enviada ao usuário em 2026-11-25).
