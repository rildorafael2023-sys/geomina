# INSTRUÇÕES DE INSTALAÇÃO

## A. Usuário (PC com Windows) — pacote offline

> ⚠️ O mecanismo de instalação foi testado em Linux. Os scripts `.bat` **ainda não foram executados em Windows**; acompanhe a primeira instalação e informe qualquer mensagem de erro.

1. Instale o **Python 3.12 ou 3.13** (64 bits, python.org). Na primeira tela do instalador, marque **"Add python.exe to PATH"**.
2. Descompacte `GeoMina-0.2.0-windows.zip` numa pasta (ex.: `C:\GeoMina`).
3. Dê dois cliques em **`instalar.bat`**. As bibliotecas estão na pasta `pacotes`; **nada é baixado da internet**.
4. Para usar, dê dois cliques em **`GeoMina.bat`**. O navegador abre em `http://127.0.0.1:8765`. Mantenha a janela preta aberta enquanto usa.
5. No primeiro acesso, crie o usuário administrador.

**Dados:** `%LOCALAPPDATA%\GeoMina` (`geomina.db`, `arquivos\`, `backups\`). Para fazer backup, copie essa pasta com o aplicativo fechado.

**Opções** (em `GeoMina.bat` ou na linha de comando):
- `--dados D:\GeoMinaDados`: outra pasta de dados.
- `--porta 8800`: outra porta local.
- `--sem-navegador`: não abre o navegador.

## B. Desenvolvimento (Linux/macOS/Windows)

Requisitos: Python ≥ 3.11 e Node.js ≥ 20.

```bash
python3 -m venv .venv
```
```bash
.venv/bin/pip install -e 'backend[dev]'
```
```bash
cd frontend && npm ci && npm run build && cd ..
```
```bash
.venv/bin/python -m geomina --dados ./dados_locais
```

Interface em modo de desenvolvimento, com recarga automática (precisa do backend rodando na porta 8765):
```bash
cd frontend && npm run dev
```

Testes:
```bash
cd backend && ../.venv/bin/pytest && ../.venv/bin/ruff check geomina tests
```
```bash
cd frontend && npm run typecheck
```
Teste ponta a ponta (com o aplicativo rodando e a pasta de dados vazia):
```bash
node e2e/fluxo_basico.cjs http://127.0.0.1:8765
```

## C. Gerar o pacote offline
```bash
distribuicao/empacotar.sh windows ./saida
```
Gera `saida/GeoMina-<versão>-windows.zip`, com as bibliotecas para Python 3.12 e 3.13 (Windows 64 bits). Use `linux` no lugar de `windows` para o pacote equivalente de teste.
