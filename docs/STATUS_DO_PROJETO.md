# STATUS DO PROJETO

**Última atualização:** 2026-11-25 · **Versão:** 0.3.0 · **Etapa atual:** E3 concluída, aguardando validação

## Etapas

| Etapa | Estado |
|-------|--------|
| E1 Arquitetura e especificação | ✅ Aprovada |
| E2 Infraestrutura, banco local, autenticação, auditoria, arquivos | ✅ Validada (instalada e aberta pelo usuário no Windows) |
| E3 Estrutura operacional da mina + janela própria | 🟡 **Concluída e testada, aguardando validação do usuário** |
| E4 Painel (dashboard), consulta de auditoria, backup pela interface | ⚪ Próxima |
| E5 – E21 | ⚪ Pendentes |

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

Resumo dos testes: **63 testes do backend**, **E2E da estrutura (10 cenários)** e **E2E básico (7 cenários)** aprovados; lint e checagem de tipos sem erros. Detalhes em `TESTES.md`.

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
- Ainda não há painel com indicadores, consulta geral da auditoria nem backup/restauração pela interface (E4).
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
1. Usuário valida a E3 no Windows (ícone, janela, cadastro da estrutura).
2. **E4 — Painel e administração**: painel inicial com números reais do banco (unidades por tipo, frentes ativas, últimos avanços, atividades recentes), consulta da auditoria com filtros, backup e restauração pela interface.
3. Em seguida, **E5 — Mapeamento geológico** com a ficha digital (depende da revisão de `FICHA_MAPEAMENTO.md`).
