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

### Ainda não testado
- `instalar.bat` / `GeoMina.bat` em Windows real.
- Desempenho com volume real de dados (não se aplica à E2).
