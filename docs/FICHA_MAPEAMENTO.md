# FICHA DIGITAL DE MAPEAMENTO — proposta

> Estado: **proposta para revisão do usuário** (2026-11-25). Será implementada na Etapa 5.
> Pedido do usuário: a ficha "Mapeamento Geotécnico Estrutural" atual **não** é o modelo principal; deve ser aprimorada e **sem RQD**.
> A ficha atual serviu só como referência do que a equipe já registra hoje.

## 1. O que muda em relação à ficha atual

| Ficha atual (papel) | Ficha digital proposta | Motivo |
|---|---|---|
| "Área", "Frente", "Ref: 26 m da entrada" em texto livre | Local escolhido na árvore da mina + **distância (m) a uma referência cadastrada** | Permite consultar por local e calcular a posição ao longo da galeria |
| Coluna vertical desenhada à mão (0 m, 1,40 m, 1,80 m…) | **Tabela de intervalos da seção** (de/até, litologia, alteração, mineralização, contato) | Vira dado consultável; o desenho da coluna é gerado automaticamente |
| Tabelas separadas para foliação, fraturas, falhas e eixo de dobra | **Uma tabela de medidas estruturais** com tipo selecionável | Menos campos vazios; aceita qualquer estrutura |
| Estereograma desenhado à mão | **Estereograma gerado automaticamente** a partir das medidas | Elimina erro de plotagem |
| "Teor Be / Cr" escrito na ficha | Teores **vêm do laudo importado** e aparecem na ficha; leitura de campo (ex.: XRF portátil) em campo separado, identificada como "não laboratorial" | Evita confundir estimativa com resultado de laboratório |
| Código da amostra escrito ("RP-474AB") | **Tabela de amostras** com código validado (BS-RP / BMT-TS / BE) e intervalo coletado | Evita grafias diferentes ("RP 478" × "BS-RP-478") |
| RQD, malha de tirante, tipo de suporte | **Removidos** (RQD a pedido do usuário). Água e observações geotécnicas ficam como seção opcional recolhida | A ficha é geológica |
| Croqui desenhado no quadro da ficha | **Croqui anexado** (foto/escaneamento do desenho) e, no futuro, desenho no tablet | O original é preservado |

## 2. Estrutura da ficha

### A. Identificação
- Nº da ficha (automático), data e hora, geólogo responsável, acompanhantes.
- **Local**: nível → galeria / travessa / rampa → frente (seleção na árvore da mina).
- **Exposição mapeada**: frente · parede esquerda · parede direita · teto · piso · pilar.
- **Posição**: distância (m) a partir de uma referência cadastrada (entrada, ponto topográfico, estação). Com topografia disponível, o sistema calcula a posição ao longo do eixo e as coordenadas.
- Coordenadas X, Y, Z (opcional), com o sistema de coordenadas indicado (SIRGAS 2000 ou SAD69 / UTM 23S).
- Direção do eixo da galeria (azimute) e sentido do avanço.
- Dimensões medidas da seção (largura × altura), opcionais. Nunca estimadas pelo sistema.

### B. Seção mapeada (intervalos)
Uma linha por intervalo, medido do piso para o teto (ou ao longo da parede):

| Campo | Tipo |
|---|---|
| De (m) / Até (m) | número; sem sobreposição nem lacuna sem aviso |
| Litologia | lista configurável (ex.: gnaisse pelítico, anfibólio gnaisse, flogopita xisto, metaultramáfica…) |
| Textura / estrutura | foliado · bandado · maciço · brechado · milonítico · boudinado |
| Granulação, cor | listas curtas |
| Alteração | tipo (ex.: flogopitização, cloritização, silicificação) + intensidade (fraca / moderada / forte) |
| Mineralização | estilo (disseminada, em veio, maciça, em bolsão) + minerais + % visual estimado |
| Contato com o intervalo seguinte | brusco · gradacional · tectônico · não observado |
| Descrição | texto |

### C. Medidas estruturais
Uma linha por medida:

| Campo | Observação |
|---|---|
| Tipo | S0, S1, S2, fratura, falha, veio, contato, zona de cisalhamento, eixo de dobra, lineação mineral, estria (lista configurável) |
| Planos: **direção de mergulho / mergulho** | convenção já usada pela equipe (ex.: 230/30) |
| Linhas: **caimento / rumo do caimento** | |
| Família | ex.: FR-I, FR-II (agrupa fraturas) |
| Espessura / abertura (m), preenchimento | opcionais |
| Sentido de movimento | para falhas e zonas de cisalhamento |
| Intervalo associado | liga a medida ao intervalo da seção |
| Foto | vínculo opcional |

Norte de referência (magnético ou da quadrícula) e declinação vêm do padrão da mina e podem ser ajustados por ficha.

### D. Amostras coletadas
| Campo | Observação |
|---|---|
| Código | validado pela regra: **BS-RP-nnn[A-Z]** (mina), **BMT-TS-nnn** (testemunho de sondagem), **BE…** (antigas, só para consulta/importação) |
| Tipo / método | canal, chip, rocha, testemunho… (configurável) |
| De / Até na seção (m) | define a amostra como intervalo |
| Destino | geoquímica · identificação mineralógica · lâmina delgada · outro |
| Leitura de campo (opcional) | ex.: XRF portátil, marcada como "não laboratorial" |

Os resultados do laboratório (SGS) aparecem automaticamente na ficha quando o laudo for importado.

### E. Croqui e fotos
- Croqui: anexar foto ou PDF do desenho. O arquivo original é preservado.
- Fotos: legenda, direção da foto e vínculo a intervalo, estrutura ou amostra.

### F. Descrição e interpretação
- Texto livre (como a descrição manuscrita atual).
- Água: seca · úmida · gotejamento · fluxo.
- Observações geotécnicas: seção **opcional e recolhida** (sem RQD).

### G. Revisão
Rascunho → submetida → aprovada (por geólogo revisor). A aprovação congela a versão; correções posteriores geram nova revisão, com histórico.

## 3. Saídas automáticas
- **Coluna da seção** desenhada a partir dos intervalos (substitui o desenho à mão).
- **Estereograma** das medidas da ficha, da galeria ou de qualquer filtro.
- **Ficha em PDF** para arquivo e impressão.
- **Ficha em branco para impressão**, com os mesmos campos, para quando não houver tablet.

## 4. Pontos para o usuário confirmar
1. A lista inicial de litologias, alterações e tipos de estrutura pode partir da planilha "GEOQUIMICA_DESCRIÇÃO" (unificando grafias como "Anfibolio gnaisse" / "anfibólio gnaisse")?
2. A posição da seção é sempre medida do piso para o teto, ou também ao longo da parede?
3. Existe leitura de XRF portátil em campo?
4. O que significa "SC" e "PONTO CONVERGÊNCIA" na topografia (ver DADOS_REAIS.md)?
