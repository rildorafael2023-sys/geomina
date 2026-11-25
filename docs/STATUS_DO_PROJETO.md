# STATUS DO PROJETO

**Última atualização:** 2026-11-25 · **Versão:** 0.2.0 · **Etapa atual:** E2 concluída, aguardando validação

## Etapas

| Etapa | Estado |
|-------|--------|
| E1 Arquitetura e especificação | ✅ Aprovada pelo usuário (com a mudança para aplicativo local) |
| E2 Infraestrutura, banco local, autenticação, auditoria, arquivos | 🟡 **Concluída e testada, aguardando validação do usuário** |
| E3 Estrutura operacional da mina | ⚪ Próxima |
| E4 – E21 | ⚪ Pendentes |

## Decisões do usuário (2026-11-25)
- Aplicativo para rodar **no PC, sem rede** → arquitetura revisada (DT-016 a DT-021).
- Sistemas de coordenadas: **SIRGAS 2000 / UTM 23S** e **SAD69 / UTM 23S**.
- Os geólogos usam **tablets e celulares sem rede** → a etapa E20 (captura offline) é necessária.
- Códigos de amostra: **BS-RP** = mina; **BMT-TS** = testemunho de sondagem; **BE** = antigas (mina e testemunho).
- As demais propostas da Etapa 1 foram aprovadas ("os demais pode fazer tudo").
- Ficha de mapeamento: **não** copiar a ficha atual; propor uma melhor, **sem RQD** → proposta em `FICHA_MAPEAMENTO.md` (aguarda revisão).

## Funcionalidades implementadas e testadas (E2)

| Funcionalidade | Teste |
|---|---|
| Aplicativo local: `python -m geomina` / `GeoMina.bat`; escuta só em 127.0.0.1; abre o navegador; usa outra porta se a 8765 estiver ocupada | automático + manual (porta ocupada observada durante os testes) |
| Banco SQLite na pasta do usuário, WAL, chaves estrangeiras ativas | `test_infra.py` |
| Migrações automáticas na inicialização, reversíveis; backup antes de migrar | `test_infra.py` |
| Primeiro acesso: criação do administrador (só uma vez) | `test_auth.py`, E2E |
| Login/logout, sessão de 12 h, expiração, senha forte, troca de senha, troca obrigatória para usuário novo | `test_auth.py`, E2E |
| Usuários: criar, editar, desativar, redefinir senha; papéis; proteção do último administrador | `test_auth.py`, E2E |
| Permissões por papel, conferidas na API (não só na tela) | `test_auth.py`, E2E |
| Concorrência otimista (versão do registro) | `test_auth.py` |
| Auditoria de inserção/alteração/exclusão com usuário e origem; senha mascarada; tabela imutável | `test_auditoria.py` |
| Arquivos originais: SHA-256, deduplicação, somente leitura, detecção de corrupção, tipo pelo conteúdo, limite de tamanho | `test_arquivos.py` |
| Base espacial: WKB 3D preserva Z exatamente; 2D não vira 3D; índice R*Tree 3D; EPSG 29193/31983 sem internet | `test_espacial.py` |
| Interface: primeiro acesso, login, início, usuários, sistema, troca de senha; layout para celular | E2E (Playwright) |
| Pacote de instalação offline | instalação real sem internet em ambiente Linux limpo |

## Testes executados
Ver `TESTES.md` → Registro. Resumo: **34 testes automatizados do backend aprovados**, **teste E2E com 7 cenários aprovado**, **lint sem erros**, **typecheck do frontend sem erros**, **instalação offline testada (Linux)**.

## Análise dos arquivos reais
Feita e documentada em `DADOS_REAIS.md`. Principais impactos:
1. A topografia é **desenho CAD convertido** (paredes, teto e piso em segmentos), **sem eixos de galeria**: o chainage dependerá de eixos desenhados ou derivados com revisão.
2. Há layers com **Z inválido** (SC, PONTO CONVERGÊNCIA) e um cabeçalho de shapefile corrompido.
3. Os laudos SGS trazem QA/QC (DUP, REP, STD, branco), `<LD` com vírgula, `N.A.`, e a ordem das colunas muda entre laudos.
4. Os códigos de amostra e as litologias têm várias grafias, o que exige normalização com confirmação.

## Problemas encontrados e corrigidos nesta etapa
| Problema | Correção |
|---|---|
| Migrações não eram gravadas (transação aberta pelo PRAGMA no SQLAlchemy 2) | commit explícito em `migrations/env.py`; teste de migração do zero |
| O login incrementava a versão do usuário e gerava conflito falso na edição | registro de acesso sem versionar (`UPDATE` direto); teste de concorrência |
| Título da janela trocava durante o fechamento; elemento HTML aninhado inválido na página inicial | corrigidos e conferidos por captura de tela |
| Download de dependências Linux travava (variantes de plataforma) | empacotador com várias variantes compatíveis |

## Limitações conhecidas
- **Scripts `instalar.bat` e `GeoMina.bat` não foram executados em Windows** (o ambiente de desenvolvimento é Linux). O mecanismo foi testado em Linux, mas o primeiro uso no Windows deve ser acompanhado.
- O instalador exige Python 3.12 ou 3.13 instalado no PC (instalador .exe único previsto para a E19).
- Alterações feitas diretamente no arquivo `.db`, fora do aplicativo, não são auditadas.
- Ainda não há consulta da auditoria nem backup/restauração manual pela interface (E4).
- Nenhum módulo geológico implementado ainda (estrutura da mina, mapeamento, amostras etc.).

## Pendências que dependem do usuário
| # | Pergunta | Bloqueia |
|---|---|---|
| P1 | Validar a E2: instalar no PC com Windows e testar o primeiro acesso | E3 (recomendado) |
| P2 | Revisar a proposta da ficha (`FICHA_MAPEAMENTO.md`) e responder às 4 perguntas da §4 | E5 |
| P3 | CRS de trabalho padrão: SIRGAS 2000 (proposto) ou SAD69? | E3 |
| P4 | Lista de níveis, galerias, travessas e rampas e a nomenclatura usada (ex.: N144, N567, N603, Rampa Sul, Travessa 1F) | E3 |
| P5 | Significado do prefixo SAB-CP (visto no laudo) e dos layers SC e PONTO CONVERGÊNCIA | E8/E10 |
| P6 | Existe arquivo de eixos de galeria na topografia, ou o eixo deverá ser desenhado no GeoMina? | E10 |
| P7 | Croquis: enviar alguns exemplos individuais (além do PDF de fichas) | E6 |

## Próximos passos
1. Usuário valida a E2 e responde P3/P4.
2. **E3 — Estrutura operacional da mina**: mina com CRS, tipos de unidade configuráveis, árvore de níveis/galerias/travessas/rampas/frentes, unidades multinível, histórico de avanço, telas.
