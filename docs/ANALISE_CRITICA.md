# ANÁLISE CRÍTICA DA ESPECIFICAÇÃO — Etapa 1

Este documento registra os problemas, lacunas e riscos identificados na especificação original e a solução proposta para cada um.
Nada aqui foi implementado ainda; são propostas para aprovação.

Gravidade: 🔴 alta (afeta arquitetura/dados se não for resolvido agora) · 🟡 média · 🟢 baixa.

---

## A. Inconsistências e problemas estruturais

### A1 🔴 Hierarquia operacional linear não representa a mina real
**Problema.** O exemplo `Mina → Região → Nível → Galeria → Travessa → Rampa → Subdivisão → Frente` é uma cadeia linear. Na prática:
- uma **rampa** liga vários níveis — não é "filha" de uma galeria nem de um único nível;
- uma **travessa** pode partir de uma galeria ou de uma rampa;
- uma **frente** é a extremidade ativa de qualquer escavação (galeria, travessa, rampa, realce), e **muda de posição ao longo do tempo**.

**Solução.** Modelo de **unidades operacionais genéricas** com tipos configuráveis:
- tabela `unidade_operacional` (árvore por `pai_id`, caminho materializado `ltree` para consultas de sub-árvore);
- tabela `tipo_unidade` + `regra_hierarquia` (quais tipos podem ser filhos de quais) — configurável pelo administrador;
- relação N:N `unidade_nivel` para unidades multinível (rampas, chaminés);
- frente como unidade do tipo "Frente" com **histórico de posição** (`frente_avanco`: data, chainage, XYZ, responsável).

### A2 🔴 Ordem das etapas: análise longitudinal (E10) antes da topografia (E13)
**Problema.** §11.2 e §11.8 exigem distância acumulada **ao longo da geometria real**, mas a topografia só seria importada na Etapa 13. A Etapa 10 teria que usar um chainage provisório e ser refeita depois — retrabalho e risco de dados inconsistentes.

**Solução.** Dividir a antiga Etapa 13:
- **Importação topográfica + banco espacial + eixos de referência + cálculo de chainage** → antes da análise longitudinal;
- **Visualizador 3D** → logo depois.

A análise longitudinal também aceitará "chainage manual" (trena a partir de um ponto de referência, prática comum na mina), sempre identificado como tal, para galerias sem topografia.

### A3 🔴 Autenticação na Etapa 4, mas dados entram na Etapa 3
**Problema.** Rastreabilidade exige saber **quem** criou cada registro desde o primeiro dado. Implementar autenticação depois obrigaria a preencher autoria retroativamente.

**Solução.** O **núcleo** de autenticação, usuários, papéis e a trilha de auditoria entram na **Etapa 2** (infraestrutura). A Etapa 4 fica com a interface de administração de usuários, o layout geral e o dashboard.

### A4 🟡 Croquis (E6), Fotos (E7) e Documentos (§16, sem etapa) têm a mesma base
**Problema.** Os três precisam de armazenamento imutável, hash, versões, miniaturas e vínculos. Desenvolvidos separadamente, gerariam três implementações divergentes. O módulo de Documentos nem tem etapa no roadmap.

**Solução.** Um **serviço único de arquivos** (Etapa 6), com croquis e documentos como as primeiras especializações. Fotos (Etapa 7) reutilizam o serviço e acrescentam EXIF, lote e galeria.

### A5 🟡 "Exportação e integração GIS" (E12) antes do dado espacial existir (E13)
**Solução.** A exportação GIS passa a vir depois da topografia/integração espacial. Um CSV com XYZ de amostras pode existir antes (vem com o módulo de amostragem).

---

## B. Lacunas de domínio (não especificadas, mas necessárias)

### B1 🔴 QA/QC geoquímico ausente
Padrões certificados (CRM), brancos e duplicatas são práticas obrigatórias na geologia de mina (e em auditorias de recursos — JORC/NI 43-101/CBRR). Sem isso, o banco não permite avaliar a confiabilidade dos teores.
**Solução.** Amostras com papel de controle (`normal`, `padrao`, `branco`, `duplicata_campo`, `duplicata_preparacao`, `duplicata_pulpa`), vínculo duplicata→original, cadastro de padrões com valores certificados. Relatórios de QA/QC como item desejável da Etapa 9.

### B2 🔴 Resultados abaixo/acima do limite de detecção, unidades e métodos
Laudos contêm `<0,005`, `>10`, `ND`, `-`, `IS` (amostra insuficiente). Guardar apenas número perde informação; guardar só texto impede cálculos.
**Solução.** Resultado com `valor_texto` (original), `valor_num`, `qualificador`, `limite_deteccao`, `unidade`, `metodo`. Regras de tratamento de <LD **explícitas** na análise. O mesmo analito pode ter vários resultados (métodos/reanálises) → regra de "resultado preferido".

### B3 🔴 Amostras de intervalo
Amostras de canal na parede ou de face são **intervalos**, não pontos. Um modelo só com XYZ distorce o perfil longitudinal.
**Solução.** Geometria da amostra como `PointZ` ou `LineStringZ`, mais `chainage_de`/`chainage_ate`.

### B4 🟡 Convenções de orientação estrutural e norte de referência
"Azimute, mergulho, direção de mergulho, rumo, inclinação, orientação" (§6.3) mistura grandezas redundantes ou ambíguas.
**Solução.** Forma canônica armazenada: **planos = direção de mergulho / mergulho**; **lineações = rumo do caimento / caimento (trend/plunge)**. O valor digitado e a convenção usada (ex.: strike regra da mão direita) também são guardados. Registrar o **norte de referência** (magnético × quadrícula) e a declinação aplicada — erro clássico ao combinar medidas de bússola com topografia em grade.

### B5 🟡 Cadeia de custódia e estado da amostra
"Amostras aguardando resultados" (dashboard) exige saber quando a amostra foi enviada.
**Solução.** `lote_envio` (laboratório, data, amostras) e estado derivado da amostra: coletada → enviada → com resultado (→ reanálise).

### B6 🟡 Migração de dados históricos
A mina certamente já possui planilhas de amostras, laudos e mapeamentos. Os importadores devem ser projetados para carga histórica (não só para novos registros), com relatório de rejeições. **[A CONFIRMAR volume e formato]**

### B7 🟡 Chainage depende da versão do eixo
Um novo levantamento altera o eixo e, portanto, os chainages calculados.
**Solução.** Todo chainage calculado guarda a **versão do eixo** usada e a distância de afastamento ao eixo. Recálculo é ação explícita e auditada; o chainage manual nunca é sobrescrito.

---

## C. Riscos técnicos

| # | Risco | Grav. | Mitigação |
|---|-------|-------|-----------|
| C1 | **Precisão numérica no 3D**: WebGL usa float32 (~7 dígitos). Coordenadas UTM (ex.: N = 7.800.000 m) perdem precisão de metros → "tremor" e geometria quebrada. | 🔴 | O visualizador trabalha com **origem local** (subtrai um ponto de referência no servidor/cliente em float64 antes de enviar à GPU). Coordenadas exibidas ao usuário são sempre as reais. Teste automatizado específico. |
| C2 | **Sistema de coordenadas local de mina** sem código EPSG; `.prj` ausente em shapefiles (muito comum). | 🔴 | CRS da mina configurado uma vez (EPSG ou grade local registrada em `spatial_ref_sys` com SRID próprio ≥ 900000). Arquivo sem `.prj` → usuário deve **declarar** o CRS no assistente; nunca supor. Transformações só via pyproj, registradas. |
| C3 | Funções de referenciamento linear do PostGIS (`ST_LineLocatePoint`) operam em 2D; rampas com forte inclinação teriam chainage errado. | 🔴 | Chainage 3D implementado na camada de aplicação (Python/NumPy), com testes contra casos calculados à mão (linha reta, curva, rampa a 15%). PostGIS fica com armazenamento, índices e filtros espaciais. |
| C4 | Shapefile: nomes de campo ≤ 10 caracteres, limite de 2 GB, encoding do DBF (`.cpg`), MultiPatch não suportado pelas bibliotecas livres. | 🟡 | Leitura via GDAL (pyogrio) com detecção de encoding; MultiPatch declarado não suportado até ser avaliado. **Exportação recomendada em GeoPackage**, Shapefile como opção. |
| C5 | Polígonos "3D" de contorno de galeria normalmente são **contornos em planta com Z por vértice**, não sólidos. | 🟡 | Representar como polígono/linha 3D fiel aos vértices; não gerar volume. Superfícies/sólidos ficam para formatos que os contenham (OBJ/DXF 3DFACE), em etapa futura. |
| C6 | OCR de croquis manuscritos tem baixa confiabilidade. | 🟡 | Item futuro, opcional, sempre como sugestão "não validada". Não bloqueia nenhuma etapa. |
| C7 | Conectividade no subsolo. | 🔴 | Ver D1. |
| C8 | Volume de fotos (milhares por ano, 5–10 MB cada). | 🟡 | Armazenamento fora do banco (sistema de arquivos ou S3/MinIO), miniaturas geradas, banco guarda metadados + hash. |
| C9 | Ausência de arquivos reais da mina para teste (topografia, laudos). | 🔴 | **Pendência do usuário**: fornecer amostras representativas (podem ser anonimizadas/deslocadas). Até lá, testes com arquivos sintéticos **claramente identificados como sintéticos**. |
| C10 | Escopo muito grande para desenvolvimento por uma pessoa + IA. | 🟡 | Monólito modular, etapas pequenas com critérios de aceitação, priorizar o fluxo central (estrutura → mapeamento → amostra → laudo → topografia → longitudinal). |

---

## D. Decisões que dependem do usuário

### D1 🔴 Modo de operação no subsolo (offline)
Opções:
1. **Sistema web na rede da mina** (servidor local na superfície); em campo, anotações em papel/tablet e digitação na superfície. *Mais simples e robusto.*
2. **Item 1 + captura offline em tablet (PWA)**: formulários de mapeamento, amostra e foto funcionam sem rede, armazenam localmente (IndexedDB) e sincronizam ao voltar à rede, com resolução de conflitos. *Aumenta muito a complexidade; exige identificadores gerados no cliente (já previsto: UUID).*

**Proposta:** arquitetura preparada para a opção 2 (UUIDs, API idempotente, carimbo de versão por registro), mas implementação da captura offline como **etapa própria após o núcleo estar estável**. Requer sua confirmação sobre o uso real de tablets no subsolo.

### D2 Implantação
Servidor local (on-premise) na mina × nuvem corporativa. A proposta assume **on-premise via Docker Compose**, que também funciona em nuvem sem alterações.

### D3 Demais pendências
Listadas em `STATUS_DO_PROJETO.md` → *Pendências que dependem do usuário*.

---

## E. Revisão após as respostas do usuário (2026-11-25)

| Tema | Resposta | Consequência |
|---|---|---|
| D1 Offline | Geólogos usam tablets e celulares **sem rede** | E20 confirmada |
| D2 Implantação | **Aplicativo no PC, sem rede** | Arquitetura revisada: SQLite + servidor interno em 127.0.0.1 (DT-016 a DT-021). Docker e PostGIS saem; o desenho de módulos, API e modelo de dados é mantido |
| C2 CRS | SIRGAS 2000 / UTM 23S e SAD69 / UTM 23S | Os dois existem nos arquivos reais, com `.prj` correto |
| C9 Dados reais | Enviados | Análise em `DADOS_REAIS.md`; novos riscos abaixo |

### Novos riscos identificados nos dados reais
| # | Risco | Grav. | Mitigação |
|---|---|---|---|
| C11 | A topografia não tem eixos de galeria (só paredes, teto e piso em segmentos CAD) | 🔴 | Eixo desenhado/derivado com revisão do usuário; perguntar se a topografia pode fornecer eixos |
| C12 | Códigos de amostra com várias grafias ("RP 478" × "BS-RP-478") | 🔴 | Forma canônica + normalização com confirmação + relatório de não encontrados |
| C13 | Litologias com grafias diferentes | 🟡 | Dicionário com sinônimos |
| C14 | Layers com Z inválido e cabeçalho de shapefile corrompido | 🟡 | Validação por registro; "Z suspeito" |
| C15 | Instalação em Windows não testada no ambiente de desenvolvimento | 🟡 | Validação do usuário; instalador .exe na E19 |
| C16 | SQLite não suporta vários PCs gravando no mesmo arquivo de rede | 🟡 | Documentado; cada PC tem seu banco; a sincronização (E20) servirá também entre PCs |
