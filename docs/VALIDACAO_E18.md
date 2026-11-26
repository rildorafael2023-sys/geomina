# E18 — Validação integrada, segurança, carga e integridade

**Data:** 2026-11-26 · **Versão:** 0.20.0

Esta etapa revisou o aplicativo inteiro com quatro perguntas: **está seguro?**, **aguenta uma mina com 10 anos de dados?**,
**os dados continuam íntegros?** e **tudo continua funcionando junto?** Os problemas encontrados foram corrigidos e
cobertos por testes.

## 1. Segurança

| Ponto revisado | Situação encontrada | Ação |
|---|---|---|
| Servidor escuta só na própria máquina (127.0.0.1) | ok | mantido |
| **"DNS rebinding"**: uma página da internet aberta no navegador poderia apontar um nome próprio para 127.0.0.1 e falar com o GeoMina (inclusive criar o administrador numa instalação nova) | **vulnerável** | o servidor só atende pedidos endereçados a `127.0.0.1`, `localhost` ou `::1`; os outros recebem erro 421 |
| Tentativa de senhas | sem limite (só o custo do Argon2) | **bloqueio de 5 minutos depois de 5 senhas erradas seguidas** no mesmo login (também para login inexistente, para não revelar quais existem) |
| Cabeçalhos de segurança | ausentes | `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`; nas respostas da API, `Content-Security-Policy` com `sandbox` (um arquivo enviado nunca executa script na origem do aplicativo) e `Cache-Control: no-store` |
| Zip de topografia malformado ("zip bomb") | lido inteiro na memória | recusado se um arquivo interno passar de 2 GB ou tiver taxa de compressão acima de 1000:1 |
| Restauração de backup com caminho malicioso dentro do zip | já protegido (caminho conferido) | teste existente mantido |
| Rotas da API sem login | teste novo percorre **todas** as rotas sem token | só ficam abertas a saúde, a instalação, o login e a documentação da API (sem dados) |
| Nomes de analito virando coluna de GeoPackage | corrigido na 0.18.0 | — |
| Senhas guardadas | Argon2 | mantido |
| Token de sessão | no cabeçalho, nunca na URL; guardado com hash no banco; expira em 12 h | mantido |
| Tipo do arquivo enviado | detectado pelo conteúdo, não pela extensão | mantido |

## 2. Carga — mina simulada com 10 anos de dados

Base gerada pelo próprio aplicativo (API), sem dados reais: 20 níveis × 10 galerias, **20.000 amostras**, 10 laudos de
2.000 amostras × 48 elementos = **960.000 resultados**; banco de 631 MB.

| Operação | Antes | Depois |
|---|---|---|
| Confirmar um laudo (2.000 amostras × 48) | **> 3 min** | **5,6 s** |
| Consulta da Geoquímica operacional (1ª abertura) | 14,3 s | 1,1 s (a base é preparada ao abrir o aplicativo) |
| Filtrar por galeria | 10,8 s | 0,14 s |
| Ordenar por teor / faixa de teor | 12,7 s / 11,2 s | 1,0 s / 0,75 s |
| Comparação de grupos | 15,6 s | 1,1 s |
| Cena 3D (todas as amostras) | 13,8 s | 1,2 s |
| CSV / Excel / GeoPackage (todas as amostras, 3 elementos) | 14,7 / 17,2 / 15,4 s | 1,5 / 4,6 / 2,9 s |
| Tabela de resultados do laboratório (CSV com tudo) | 28 s | 3,5 s |
| Painel, relatório de produção, tracks de uma galeria | 0,08 / 0,3 / 0,02 s | igual |
| Backup completo (631 MB → zip de 115 MB) | 16 s | igual |
| Verificação de integridade completa | — | 5,9 s |

Na tela (navegador, mesma base, amostras ligadas a 200 galerias): abrir a consulta **0,9 s**; filtrar uma galeria
**1,3 s**; tracks da galeria **0,14 s**; visualização 3D da galeria **1,4 s**; tabela do laboratório (limitada) **3,8 s**;
sem erros de JavaScript.

Causas e correções:
- **Laudo**: ao marcar o resultado "preferido", o ORM conferia em memória todos os ~100 mil objetos a cada lote de 500
  (custo quadrático). Agora a atualização vai direto ao banco, e os resultados são gravados em lote.
- **Consulta**: o resumo por amostra percorria ~1 milhão de resultados em Python a cada pedido. Agora é agregado no
  próprio SQLite e guardado em memória; a cópia guardada é refeita automaticamente quando algo muda (cadastro, laudo
  novo, conciliação, restauração de backup).
- **Contagem dos filtros**: os valores de cada filtro por amostra são calculados uma vez e reaproveitados.
- **Tela "Laboratório (laudos)"**: tentava desenhar 20 mil linhas × 48 colunas (o navegador travaria). Agora mostra até
  500 linhas e avisa; o CSV continua trazendo tudo.

## 3. Integridade

Nova **verificação de integridade** (menu Sistema, administrador), somente leitura:
- estrutura do banco (`PRAGMA integrity_check`) e referências entre tabelas (`foreign_key_check`);
- presença das **regras de proteção gravadas no banco** (histórico e resultados de laboratório não podem ser alterados
  nem apagados, ficha aprovada travada, topografia e eixos imutáveis…);
- índice espacial da topografia (`rtreecheck` e contagem igual à das feições);
- **cada arquivo original** (foto, croqui, laudo, planilha) existe e tem o mesmo hash SHA-256 de quando foi enviado;
- aviso (não erro) de resultados de laudo ainda não conciliados.

Testado: arquivo trocado fora do aplicativo e regra de proteção removida são detectados.

## 4. Defeito funcional encontrado na validação

**A coluna "galeria/unidade" da planilha de amostras era reconhecida mas descartada** na confirmação. Agora:
- código igual ao de uma unidade cadastrada (sem diferenciar maiúsculas, espaços e hífens: "1f 5" = "1F-5") → a amostra
  já entra ligada à unidade;
- código não cadastrado → aviso na prévia, e o texto fica como local da amostra (para ligar depois em "Ligar às galerias").

Também na validação: as opções dos filtros passaram a seguir a **ordem natural** (N2 antes de N10, G1-3 antes de
G1-12); antes, em ordem alfabética, níveis como N5 ficavam escondidos em "mais".

## 5. Regressão integrada

| Conjunto | Resultado |
|---|---|
| `pytest` (API, banco, regras, segurança) | todos aprovados |
| `pytest` com os **dados reais** (laudos SGS, planilha de campo, topografia, PDF de fichas) | aprovados |
| `vitest` (classes, histograma) | 13 aprovados |
| E2E Playwright — 15 suítes, ~100 cenários, do primeiro acesso aos relatórios | todas aprovadas |
| Atualização a partir de bancos de versões anteriores (cópia de dados reais) | aprovada |

## 6. Limitações conhecidas (aceitas)

- O bloqueio de senhas fica na memória: reiniciar o aplicativo libera (aceitável para um servidor só da própria máquina).
- A primeira consulta logo após abrir o aplicativo numa base muito grande pode levar alguns segundos, enquanto a base é preparada em segundo plano.
- A documentação técnica da API (`/api/docs`) continua acessível sem login; ela não contém dados da mina.
