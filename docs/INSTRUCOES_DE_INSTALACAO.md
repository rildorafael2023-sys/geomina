# INSTRUÇÕES DE INSTALAÇÃO

## A. Usuário (PC com Windows) — pacote offline

> A versão 0.2.0 foi instalada e aberta pelo usuário no Windows. O atalho com ícone e a janela própria (0.3.0) ainda não foram testados em Windows.

1. Instale o **Python 3.12 ou 3.13** (64 bits, python.org). Na primeira tela do instalador, marque **"Add python.exe to PATH"**.
2. Descompacte `GeoMina-<versão>-windows.zip` numa pasta (ex.: `C:\GeoMina`).
3. Dê dois cliques em **`instalar.bat`**. As bibliotecas estão na pasta `pacotes`; **nada é baixado da internet**.
4. O instalador cria o ícone **GeoMina** na área de trabalho. Abra por ele: o GeoMina abre em janela própria e se encerra ao fechar a janela.
5. No primeiro acesso, crie o usuário administrador.

**Atualização (ex.: de 0.2.0 para 0.3.0):** feche o GeoMina, descompacte a versão nova por cima da pasta antiga (substituindo os arquivos) e execute `instalar.bat` de novo. Os dados não são afetados e o banco recebe backup automático antes de ser atualizado.

**Dados:** `%LOCALAPPDATA%\GeoMina` (`geomina.db`, `arquivos\`, `backups\`). Para fazer backup, copie essa pasta com o aplicativo fechado.

**Opções** (em `GeoMina.bat` ou na linha de comando):
- `--dados D:\GeoMinaDados`: outra pasta de dados.
- `--porta 8800`: outra porta local.
- `--sem-navegador`: não abre a interface.
- `--aba`: abre numa aba do navegador padrão em vez de janela própria.

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
