# STATUS DO PROJETO

**Última atualização:** 2026-11-25 · **Etapa atual:** E1 — entregue para revisão

## Etapas

| Etapa | Estado |
|-------|--------|
| E1 Arquitetura e especificação | 🟡 **Entregue, aguardando validação do usuário** |
| E2 – E21 | ⚪ Pendentes (não iniciadas) |

## Funcionalidades implementadas
**Nenhuma.** O projeto ainda não possui código executável. Existe apenas a documentação de especificação.

## Funcionalidades testadas
Nenhuma.

## Testes executados
Nenhum teste de software. Verificação do ambiente de desenvolvimento: Docker 29.9, cliente PostgreSQL 16.15, Python 3.13, Node 22 disponíveis (GDAL não instalado no sistema; será usado via pacote Python/container na E2).

## Produzido na E1
- `docs/REQUISITOS.md` — requisitos rastreáveis (RNF, RF por módulo)
- `docs/ANALISE_CRITICA.md` — inconsistências, lacunas, riscos e propostas
- `docs/ARQUITETURA.md` — arquitetura técnica, espacial e do visualizador 3D
- `docs/BANCO_DE_DADOS.md` — modelo de dados completo proposto
- `docs/DECISOES_TECNICAS.md` — DT-001 a DT-015
- `docs/PLANO_DE_DESENVOLVIMENTO.md` — roadmap revisado e critérios de aceitação
- `docs/TESTES.md` — estratégia e casos críticos
- `docs/INSTRUCOES_DE_INSTALACAO.md`, `docs/INSTRUCOES_DE_USO.md` — esqueleto (sem conteúdo aplicável ainda)

## Problemas identificados na especificação
Ver `ANALISE_CRITICA.md`. Principais: hierarquia linear (A1), longitudinal antes da topografia (A2), autenticação tardia (A3), ausência de QA/QC (B1), tratamento de <LD (B2), amostras de intervalo (B3), precisão float32 no 3D (C1), CRS local/sem `.prj` (C2), chainage 2D no PostGIS (C3), conectividade no subsolo (D1).

## Pendências que dependem do usuário

| # | Pergunta | Bloqueia |
|---|----------|----------|
| P1 | Aprovação do roadmap revisado (E10 antes da análise longitudinal; auth na E2; arquivos unificados). | E2 |
| P2 | Sistema de coordenadas usado na topografia: EPSG (qual? ex.: SIRGAS 2000 / UTM 23S) ou grade local da mina? Unidades em metros? | E3 |
| P3 | Haverá mais de uma mina no sistema? | E3 (não bloqueante: modelo já suporta) |
| P4 | Uso de tablets no subsolo sem rede? (define a E20) | E20 / priorização |
| P5 | Implantação: servidor local na mina ou nuvem corporativa? Quantos usuários simultâneos? | E19 (não bloqueante agora) |
| P6 | Amostras reais (podem ser anonimizadas): 1–2 shapefiles topográficos, 1–2 laudos de laboratório, planilha de amostras, alguns croquis e fotos. | E8–E10 (testes reais) |
| P7 | Regras atuais de código de amostras e nomenclatura de níveis/galerias. | E3/E8 |
| P8 | Existem dados históricos a migrar? Volume e formato aproximados. | E8–E9 |
| P9 | Integração com login corporativo (AD/LDAP) é necessária? | E2 (opcional) |
| P10 | O repositório GitHub deve permanecer **privado**? (dados da mina) | — |

## Limitações conhecidas
- Nenhum software funcional ainda.
- Todos os documentos são propostas; podem mudar após sua revisão.

## Próximos passos
1. Usuário revisa a E1 e responde às pendências (P1 é obrigatória para iniciar a E2; P2 é necessária até a E3).
2. Após autorização: iniciar a **E2 — Infraestrutura, banco, autenticação e auditoria**.
