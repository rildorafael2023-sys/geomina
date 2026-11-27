# Interface do GeoMina — diagnóstico e design system (v0.24.0)

## 1. Diagnóstico (antes)

Percorremos as 26 telas com dados de exemplo (`e2e/tour.cjs`). Problemas encontrados:

**Navegação e layout**
- Menu lateral só com texto, sem ícones e sem agrupamento por finalidade: 10 itens soltos + "Administração".
- Barra superior vazia: só "GeoMina", o nome do usuário e "Sair". Não mostra a mina ativa, o sistema de coordenadas nem onde o usuário está.
- Área de trabalho branca, sem separação entre painéis; muitas telas (Sistema, Trocar senha, Usuários) ocupam um terço da largura e deixam o resto vazio.
- Cada módulo monta o cabeçalho de um jeito: título `h3` + subtítulo + ações em lugares diferentes; a Sondagem não tem título; abas em estilos diferentes (pílulas, sublinhado, segmentado).

**Hierarquia e densidade**
- Painel inicial com 13 cartões de número em fonte 28 px, competindo com o conteúdo.
- Filtros ocupam duas linhas de campos largos (Mapeamento, Histórico de alterações) antes de qualquer dado.
- Botões e badges com tamanhos e variações misturados (light, filled, subtle, outline); badges em caixa alta minúscula.

**Tabelas**
- Sem ordenação por coluna, sem cabeçalho fixo, sem contagem padronizada, números nem sempre alinhados à direita, linha selecionada quase invisível, espaçamento vertical alto.
- Estados vazios diferentes em cada tela (texto solto, alerta amarelo, caixa cinza).

**Gráficos e visualizações**
- Estereograma e coluna da seção sem moldura nem legenda padronizada; perfis de sondagem bons, mas com cabeçalhos e painéis próprios.

## 2. Plano

1. Design system (`src/tema.ts`, `src/componentes/ui.tsx`): paleta, tipografia, densidade, componentes padrão.
2. Layout principal (`src/componentes/Layout.tsx`): menu escuro agrupado por finalidade com ícones e modo recolhido; barra superior com caminho da página, mina ativa e menu do usuário; área de trabalho cinza com painéis brancos.
3. Módulos: cada página passa a usar `Pagina` (título, contexto, ações), `BarraFiltros`, `Painel`, `TabelaDados` e `Vazio`.
4. Tabelas: `TabelaDados` com ordenação, busca, cabeçalho fixo, coluna principal fixa, alinhamento numérico, seleção e contagem.
5. Responsividade: menu recolhido em notebook, gaveta em telas pequenas, tabelas com rolagem própria.
6. Revisão com capturas em 1920, 1440, 1280 e 1024 px.

## 3. Design system

| Item | Padrão |
|---|---|
| Cor principal | azul-petróleo `#1d6a8a` (escala `geo`) |
| Menu lateral | `#17212b`, texto `#c3ccd6`, item ativo com barra à esquerda |
| Área de trabalho | `#eef1f4`; painéis brancos com borda `#d5dbe1`, sem sombra |
| Texto | `#1d2733`; secundário `#5c6875` |
| Estados | sucesso verde, atenção âmbar, erro vermelho, informação azul |
| Fonte | fonte do sistema (Segoe UI no Windows), base 13 px; título de página 18 px; título de painel 13 px semibold |
| Raio | 3 px |
| Espaçamento | múltiplos de 4 px |
| Botões | tamanho `xs`/`sm`; principal preenchido, secundário `default`, perigo vermelho `light` |
| Tabelas | linhas de 28 px, cabeçalho cinza fixo, números à direita com fonte tabular |
| Ícones | Tabler Icons (traço 1,6), 16 px no menu e botões |

Componentes reutilizáveis em `src/componentes/ui.tsx`: `Pagina`, `Painel`, `BarraFiltros`, `Indicadores`, `Vazio`, `Carregando`, `TabelaDados`, `TelaEntrada`. A classe CSS `gm-lateral` empilha painel lateral + conteúdo abaixo de 760 px.

## 4. Revisão (versão 0.24.0)

- Percurso `e2e/tour.cjs` (26 telas com dados de exemplo) em 1440×900, 1024×768 e 390×844: **0 erros de JavaScript** e **nenhuma rolagem horizontal** (o percurso mede `scrollWidth` em cada tela).
- Testes ponta a ponta reexecutados e aprovados: `estrutura`, `fluxo_basico`, `mapeamento`, `painel_backup`, `relatorios`, `simplificado`, `sondagem_video`. Ajustes nos testes: “Sair” agora fica no menu do usuário (botão “Menu do usuário”); indicadores do Painel usam `.gm-indicador`; fotos procuradas dentro da área de trabalho (o logotipo também é uma imagem).
- `amostras`, `documentos`, `geoquimica` e `topografia` dependem de arquivos reais de campo (planilha, fotos com EXIF, laudo .xls, shapefile) que não estavam disponíveis nesta revisão; o servidor não mudou e os testes do servidor (pytest) passaram.
- Banco de dados e regras de negócio inalterados.
