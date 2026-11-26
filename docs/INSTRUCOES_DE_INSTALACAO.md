# INSTRUÇÕES DE INSTALAÇÃO

## A. Usuário (PC com Windows) — instalador único (a partir da 0.21.0)

> Gerado e conferido no Linux (conteúdo, bibliotecas Windows, dependências). A instalação em Windows real ainda precisa ser validada pelo usuário.

1. Dê dois cliques em **`GeoMina-Setup-<versão>.exe`** e siga as telas. **Não precisa de Python nem de internet**: o Python oficial (3.13) e todas as bibliotecas vêm dentro do instalador.
2. Não pede senha de administrador: instala para o usuário atual em `%LOCALAPPDATA%\Programs\GeoMina`.
3. Se o Windows mostrar "O Windows protegeu o computador" (instalador sem assinatura digital), clique em **Mais informações → Executar assim mesmo**.
4. São criados os atalhos **GeoMina** (área de trabalho e menu Iniciar), **GeoMina (diagnóstico)**, **Pasta de dados e backups** e **Desinstalar o GeoMina**.
5. No primeiro acesso, crie o usuário administrador.

**Atualização:** feche o GeoMina e rode o instalador da versão nova. O Python e as bibliotecas são trocados inteiros; os dados não são tocados e o banco recebe backup automático antes de ser atualizado. Se o GeoMina estiver aberto, o instalador pede para fechá-lo.

**Quem usava a instalação antiga (`instalar.bat`, com Python):** basta rodar o instalador novo; os dados são os mesmos (`%LOCALAPPDATA%\GeoMina`). O atalho da área de trabalho passa a apontar para a instalação nova; a pasta antiga pode ser apagada depois de conferir.

**Desinstalar:** menu Iniciar → GeoMina → Desinstalar (ou Configurações → Aplicativos). Os dados **não** são apagados.

**Dados:** `%LOCALAPPDATA%\GeoMina` (`geomina.db`, `arquivos\`, `backups\`). Para fazer backup, copie essa pasta com o aplicativo fechado.

**Opções** (em `GeoMina-diagnostico.bat`, na pasta de instalação, ou na linha de comando `python\\python.exe -m geomina …`):
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

## C. Gerar o instalador
```bash
distribuicao/empacotar.sh windows ./saida
```
Gera `saida/GeoMina-Setup-<versão>.exe` (NSIS; precisa do `makensis`). O script baixa uma vez o pacote oficial **python** do NuGet (Python 3.13 para Windows 64 bits, assinado pela Python Software Foundation; guardado em `~/.cache/geomina`), instala nele o `geomina` e todas as dependências (wheels `win_amd64`, sem compilar nada) e empacota com atalhos e desinstalador. Use `linux` para o pacote zip de teste (exige Python instalado).
