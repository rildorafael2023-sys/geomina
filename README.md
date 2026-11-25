# GeoMina

Software de gestão de dados geológicos para a rotina operacional de mina subterrânea: estrutura da mina, mapeamento geológico, croquis, fotografias, amostragem, geoquímica, topografia XYZ, visualização 3D, análise longitudinal, consultas, GIS e relatórios.

## Estado atual

**Etapa 1 (arquitetura e especificação) entregue para revisão. Ainda não há código executável.**
Detalhes em [`docs/STATUS_DO_PROJETO.md`](docs/STATUS_DO_PROJETO.md).

## Stack proposta
PostgreSQL 16 + PostGIS 3 · Python / FastAPI / SQLAlchemy / GeoAlchemy2 / GDAL · React + TypeScript · Three.js · Plotly · Docker Compose.
Justificativas em [`docs/DECISOES_TECNICAS.md`](docs/DECISOES_TECNICAS.md).

## Documentação

| Documento | Conteúdo |
|-----------|----------|
| [REQUISITOS](docs/REQUISITOS.md) | Requisitos rastreáveis |
| [ANALISE_CRITICA](docs/ANALISE_CRITICA.md) | Problemas e riscos da especificação e soluções propostas |
| [ARQUITETURA](docs/ARQUITETURA.md) | Arquitetura técnica e espacial |
| [BANCO_DE_DADOS](docs/BANCO_DE_DADOS.md) | Modelo de dados |
| [DECISOES_TECNICAS](docs/DECISOES_TECNICAS.md) | Registro de decisões |
| [PLANO_DE_DESENVOLVIMENTO](docs/PLANO_DE_DESENVOLVIMENTO.md) | Roadmap e critérios de aceitação |
| [TESTES](docs/TESTES.md) | Estratégia e registro de testes |
| [STATUS_DO_PROJETO](docs/STATUS_DO_PROJETO.md) | Situação atual e pendências |
| [INSTRUCOES_DE_INSTALACAO](docs/INSTRUCOES_DE_INSTALACAO.md) | Instalação (a partir da E2) |
| [INSTRUCOES_DE_USO](docs/INSTRUCOES_DE_USO.md) | Manual (conforme módulos forem concluídos) |
