# TESTES — Estratégia e registro

> **Nenhum teste de software foi executado até o momento**, porque ainda não existe código (Etapa 1 = especificação).
> Este documento define a estratégia; a seção "Registro de execuções" será preenchida com resultados reais a partir da Etapa 2.

## 1. Níveis de teste

| Nível | Ferramenta | O que cobre | Banco |
|-------|-----------|-------------|-------|
| Unitário (backend) | pytest | regras puras: chainage 3D, conversões de orientação, parsing de <LD/unidades, validação de códigos | sem banco |
| Integração (backend) | pytest + PostGIS real em container | API + serviços + banco: restrições, triggers de auditoria, hierarquia, importações, consultas espaciais | **PostGIS real** (nunca SQLite: o comportamento espacial e de restrições difere) |
| Contrato | OpenAPI + cliente gerado | frontend e backend no mesmo contrato | — |
| Unitário (frontend) | Vitest + Testing Library | componentes, formulários, validações de interface | — |
| Ponta a ponta | Playwright | fluxos do geólogo na stack completa | PostGIS real |
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

### 3.3 Geoquímica
- `"<0,005"` → qualificador `<`, LD 0,005, valor_num nulo (ou regra), valor_texto preservado.
- `"1.234,5"` com locale pt-BR → 1234,5; `"1,234.5"` em arquivo en-US → 1234,5 — locale declarado na importação, nunca adivinhado silenciosamente.
- Mesmo arquivo importado duas vezes → segunda detectada pelo hash.

### 3.4 Topografia
- LineStringZ: todos os vértices e Z idênticos ao original após importação (comparação vértice a vértice).
- Shapefile 2D → `dimensao_original = 2`, sem Z inventado.
- Z constante em toda a feição → aviso.
- Sem `.prj` → importação bloqueada até declaração do CRS.

## 4. Registro de execuções

| Data | Etapa | Suíte | Resultado | Observações |
|------|-------|-------|-----------|-------------|
| — | E1 | — | não aplicável | Etapa documental; nenhum código. |
