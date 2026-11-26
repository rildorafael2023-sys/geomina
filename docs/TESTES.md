# TESTES — Estratégia e registro

> Estratégia de testes e registro das execuções reais. Ajustada ao aplicativo local (SQLite) em 2026-11-25.

## 1. Níveis de teste

| Nível | Ferramenta | O que cobre | Banco |
|-------|-----------|-------------|-------|
| Unitário (backend) | pytest | regras puras: chainage 3D, conversões de orientação, parsing de <LD/unidades, validação de códigos | sem banco |
| Integração (backend) | pytest + FastAPI TestClient | API + serviços + banco: restrições, auditoria, hierarquia, importações | **SQLite real** num arquivo temporário, com as mesmas migrações do aplicativo (o mesmo motor usado em produção) |
| Contrato | OpenAPI + cliente gerado | frontend e backend no mesmo contrato | — |
| Unitário (frontend) | Vitest + Testing Library | componentes, formulários, validações de interface | — |
| Ponta a ponta | Playwright (`e2e/`) | fluxos do geólogo com o aplicativo real (`python -m geomina`) | SQLite real |
| Instalação | pacote offline instalado num ambiente limpo com `pip --no-index` | empacotamento, migrações na primeira execução, interface servida | real |
| Desempenho | scripts medidos (pytest-benchmark / Playwright traces) | importação e visualização de grandes arquivos | real |
| Manual documentado | roteiro em `TESTES.md` | QGIS/ArcGIS, captura por câmera em tablet, uso em campo | — |

## 2. Dados de teste

- **Reais (preferenciais):** shapefiles topográficos, laudos de laboratório, planilhas de amostras e croquis fornecidos pela mina — podem ser anonimizados ou deslocados. Ficarão **fora do repositório público** se forem confidenciais (pasta ignorada pelo git ou repositório privado).
- **Sintéticos:** gerados por script, em `backend/tests/fixtures/sinteticos/`, sempre com `SINTETICO` no nome do arquivo e do registro. Nunca usados como "dados da mina".

## 3. Casos críticos já definidos

### 3.1 Chainage 3D (DT-006)
| Caso | Eixo | Esperado |
|------|------|----------|
| Reta horizontal | (0,0,0)→(100,0,0) | comprimento 100,000 m |
| Rampa | (0,0,0)→(100,0,-15) | √(100²+15²) = 101,119 m (2D daria 100 — erro de 1,1%) |
| Curva em L | (0,0,0)→(50,0,0)→(50,50,0) | 100 m; ponto (50,25,0) → chainage 75 m |
| Ponto fora do eixo | eixo reto; ponto (40,3,0) | chainage 40 m, afastamento 3 m |
| Galeria em U | ponto equidistante de dois ramos | escolhe o menor afastamento e **sinaliza ambiguidade** |
| Coordenadas UTM grandes | eixo em X≈500000, Y≈7800000 | mesma precisão dos casos locais (< 1 mm) |

### 3.2 Orientações estruturais
- strike RHR 090 / dip 45 → dip-direction 180 / dip 45.
- dip 95 → rejeitado; azimute 360 → normalizado para 0; plunge > dip do plano hospedeiro → aviso.

### 3.3 Geoquímica (com os laudos SGS reais)
- Laudos GQ2613496 e GQ2604840: cabeçalho (certificado, data, projeto), método/analito/unidade por coluna, tipos SMP/DUP/REP/STD.
- Ordem de colunas diferente entre os dois laudos → mesmo resultado por analito.
- `N.A.` e `--` não viram zero.
- `BS-RP-468B` (SMP) e `BS-RP-468B` (DUP) coexistem sem conflito.
- `"<0,005"` → qualificador `<`, LD 0,005, valor_num nulo (ou regra), valor_texto preservado.
- `"1.234,5"` com locale pt-BR → 1234,5; `"1,234.5"` em arquivo en-US → 1234,5 — locale declarado na importação, nunca adivinhado silenciosamente.
- Mesmo arquivo importado duas vezes → segunda detectada pelo hash.

### 3.4 Topografia (com os arquivos reais de 2026-09-28)
- LineStringZ: todos os vértices e Z idênticos ao original após importação (comparação vértice a vértice): 44.273 + 10.143 + 10.143 feições.
- Contagens por layer/entidade conferidas com a análise de `DADOS_REAIS.md`.
- Registros sem vértices (5 no arquivo SIRGAS) relatados.
- Faixa Z calculada pelos registros, ignorando o cabeçalho corrompido.
- Layers SC e PONTO CONVERGÊNCIA marcados como "Z suspeito".
- Transformação SAD69 → SIRGAS comparada com o piso fornecido nos dois sistemas (diferença máxima registrada).
- Shapefile 2D → `dimensao_original = 2`, sem Z inventado.
- Z constante em toda a feição → aviso.
- Sem `.prj` → importação bloqueada até declaração do CRS.

## 4. Registro de execuções

| Data | Etapa | Suíte | Resultado | Observações |
|------|-------|-------|-----------|-------------|
| 2026-11-25 | E1 | — | não aplicável | Etapa documental; nenhum código. |
| 2026-11-25 | E2 | `pytest` backend (34 testes: infra 6, auth 13, auditoria 4, arquivos 6, espacial 5) | **34 aprovados** | 1ª execução: 5 falhas + 21 erros (migração sem commit); 2ª: 5 falhas (dados de teste inválidos; versão incrementada pelo login). Todas corrigidas. |
| 2026-11-25 | E2 | `ruff check` | sem erros | regra B008 desativada (padrão `Depends` do FastAPI) |
| 2026-11-25 | E2 | `tsc -b` + `vite build` | sem erros | |
| 2026-11-25 | E2 | E2E `e2e/fluxo_basico.cjs` (7 cenários: primeiro acesso, sistema, criar usuário, troca de senha obrigatória, permissões na interface, senha errada, layout 390 px sem rolagem horizontal; sem erros de JavaScript) | **aprovado** | 1ª execução falhou no seletor do campo de senha (rótulo com asterisco); teste corrigido. Capturas revisadas: 2 defeitos visuais corrigidos e retestados. |
| 2026-11-25 | E2 | Instalação offline (pacote linux, `pip --no-index`, ambiente limpo) + `/api/v1/saude` + interface | **aprovado** | O pacote Windows foi gerado (52 MB), mas **não foi instalado em Windows**. |

| 2026-11-25 | E2 | Instalação em Windows real (pelo usuário) | **aprovado** | O usuário instalou e abriu o aplicativo no navegador. |
| 2026-11-25 | E3 | `pytest` backend: 63 testes (E2 34 + janela 6 + estrutura 23) | **63 aprovados** | 1ª execução da estrutura: 22/22. **Teste de mutação:** com a regra anticiclo desativada no trigger, 2 testes falharam, como esperado; regra restaurada. |
| 2026-11-25 | E3 | Janela própria (Linux + Chromium em modo `--app`): abertura, 2ª abertura reaproveita a instância, encerramento ao fechar | **aprovado** | encerrou 10 s após fechar a janela. **Edge/Windows não testado.** |
| 2026-11-25 | E3 | E2E `e2e/estrutura.cjs` (10 cenários: cadastro da mina SIRGAS, níveis, galeria > travessa > frente, tipos oferecidos conforme as regras, avanço, rampa multinível, histórico, inativação recusada, busca, regras, celular 390 px) | **aprovado** | Falhas encontradas e corrigidas: unidade criada ficava escondida em ramo fechado; notificações cobriam os botões; concordância "Nível … cadastrada"; detalhes fora da tela no celular. |
| 2026-11-25 | E3 | E2E `e2e/fluxo_basico.cjs` (regressão da E2) | **aprovado** | |
| 2026-11-25 | E3 | `ruff`, `tsc -b`, `vite build` | sem erros | |
| 2026-11-25 | E3 | Atualização real 0.2.0 → 0.3.0 (pacote linux): dados criados na 0.2.0, zip novo por cima, `pip --upgrade` offline | **aprovado** | banco 0001 → 0002; login do admin antigo mantido; tipos padrão criados; backup `antes-migracao-0001` gerado automaticamente |

| 2026-11-25 | E4 | `pytest` backend: 77 testes (+14 painel/auditoria/backup/restauração) | **77 aprovados** | 1ª execução: 2 falhas reais (busca com acento; rota API inexistente servia a interface), corrigidas |
| 2026-11-25 | E4 | E2E `e2e/painel_backup.cjs` (7 cenários: painel vazio, painel com números, histórico com filtro e detalhes, backup completo, restauração com senha/confirmação e verificação dos dados, permissões do geólogo, celular) | **aprovado** | Falhas encontradas: rolagem lateral no celular, tela após restaurar (corrigidas); seletor do teste corrigido |
| 2026-11-25 | E4 | E2E `estrutura.cjs` e `fluxo_basico.cjs` (regressão) | **aprovados** | executados um a um com pasta de dados limpa (a execução em sequência com pasta reaproveitada gerou falsos negativos, que foram investigados) |

| 2026-11-25 | E4 | Atualização real 0.3.0 → 0.4.0 (pacote linux) com mina já cadastrada | **aprovado** | banco 0002 → 0003; mina preservada e exibida no painel; backups `antes-migracao` e `diario` criados; admin antigo recebeu a permissão de backup |

| 2026-11-26 | E5 | `pytest` backend: 126 testes (+49: regras do mapeamento 31, ficha 18) | **126 aprovados** | 1ª execução: 2 falhas reais (exclusão sem auditoria; versão não avançava), corrigidas. **Teste de mutação:** trigger de imutabilidade desativado → teste do banco falhou, como esperado |
| 2026-11-26 | E5 | `vitest` (interface): projeção do estereograma, 5 casos calculados à mão | **5 aprovados** | |
| 2026-11-26 | E5 | E2E `e2e/mapeamento.cjs` (7 cenários: geóloga cria ficha completa pela tela, normalização e sugestão de código, coluna/estereograma, submeter e bloqueio, revisor aprova, impressão e ficha em branco, lista/aba da unidade/dicionários, celular) | **aprovado** | ajustes de seletores no teste; 3 defeitos de acabamento corrigidos |
| 2026-11-26 | E5 | E2E de regressão: estrutura, painel/backup, básico | **aprovados** | |
| 2026-11-26 | E5 | Atualização real 0.4.0 → 0.5.0 (pacote linux) com mina e nível já cadastrados | **aprovado** | banco 0003 → 0004; dicionários criados; ficha nova no nível antigo |

| 2026-11-26 | E6+E7 | `pytest`: 136 testes (+10 documentos, incluindo o PDF real de 23 páginas via `GEOMINA_PDF_FICHAS`) | **136 aprovados** | |
| 2026-11-26 | E6+E7 | E2E `e2e/documentos.cjs` (6 cenários: fotos em lote com EXIF e miniaturas, legenda, croqui PDF real e separação em 23 páginas, anexo na ficha, busca, celular) + regressão das outras 4 suítes | **aprovados** | defeito corrigido: botão "Separar" continuava visível após separar |

| 2026-11-26 | E8 | `pytest`: 146 (+10 amostragem, incluindo a **planilha real** via `GEOMINA_PLANILHA_CAMPO`) | **146 aprovados** | defeitos corrigidos: Excel sem extensão no armazenamento não abria; teste de backup corrompido não corrompia (bytes zerados no fim do arquivo) |
| 2026-11-26 | E8 | E2E `e2e/amostras.cjs` (5 cenários: importação com prévia/sugestão/CRS/litologia não reconhecida, lista e detalhe, próximo código, lote de envio, painel) + regressão das outras 5 suítes | **aprovados** | |

| 2026-11-26 | E9 | `pytest`: 153 (+7 geoquímica, incluindo os **2 laudos SGS reais** via `GEOMINA_LAUDOS`) | **153 aprovados** | |
| 2026-11-26 | E9 | E2E `e2e/geoquimica.cjs` (4 cenários com o laudo real: prévia e confirmação, tabela com analitos escolhidos, QA/QC, resultados na amostra e painel) + regressão das outras 6 suítes | **aprovados** | ajuste de expectativa no teste (DUP/REP também ligam à amostra) |

### Ainda não testado
- Visualizador de PDF e câmera do tablet no Windows/Edge real.
- Impressão real em impressora/PDF do Windows (o layout foi conferido por captura de tela).
- Atalho da área de trabalho, `pythonw` e janela do Edge no Windows (E3).
- "Abrir pasta de backups" no Windows (E4).
- Desempenho com volume real de dados (não se aplica à E2).
