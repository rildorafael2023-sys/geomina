# INSTRUÇÕES DE INSTALAÇÃO

> **Ainda não há software para instalar.** Este documento será escrito na Etapa 2, com base nos comandos efetivamente testados.

Previsto (proposta, não testado):
- Pré-requisitos: Docker e Docker Compose.
- `cp .env.example .env` → ajustar senhas.
- `docker compose up -d` → banco PostGIS + API.
- `docker compose exec api alembic upgrade head` → criar tabelas.
- Criar o primeiro administrador por comando de linha.
