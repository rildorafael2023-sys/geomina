# INSTRUÇÕES DE USO — versão 0.17.0

> Descreve apenas o que está implementado e testado. O 3D e a sondagem ainda não estão disponíveis.

## 1. Abrir e fechar
- Abrir: ícone **GeoMina** na área de trabalho. O programa abre em janela própria.
- Fechar: feche a janela. O programa se encerra sozinho em alguns segundos.
- Se abrir de novo com o programa já aberto, aparece outra janela do mesmo programa.
- Problemas: use `GeoMina.bat` (modo diagnóstico, mostra as mensagens). O registro fica em `%LOCALAPPDATA%\GeoMina\logs\geomina.log`.

## 2. Primeiro acesso
Na primeira abertura aparece **"Primeiro acesso"**. Informe login, nome e senha do administrador. A senha precisa ter pelo menos 8 caracteres, combinando letras e números. Essa tela não aparece de novo.

## 3. Usuários (somente administrador)
Menu **Usuários**:
- **Novo usuário**: login, nome, senha inicial e papéis. No primeiro acesso, o usuário é obrigado a trocar a senha.
- **Editar**: nome, e-mail, papéis, ativo/inativo. Um usuário inativo não consegue entrar, e as sessões abertas dele deixam de funcionar.
- **Redefinir senha**: define uma senha provisória, que o usuário troca no próximo acesso.
- O sistema não deixa desativar a si mesmo nem ficar sem administrador.

| Papel | Pode (nesta versão) |
|---|---|
| Administrador | tudo, inclusive usuários |
| Geólogo revisor | enviar/consultar arquivos, consultar auditoria (tela futura) |
| Geólogo | enviar/consultar arquivos |
| Técnico / amostrador | enviar/consultar arquivos |
| Consulta | consultar arquivos |

## 4. Trocar a própria senha
Menu **Trocar minha senha**. Depois da troca, é preciso entrar de novo.

## 5. Sistema
Menu **Sistema**: versão, pasta de dados, situação do banco, índice espacial e disponibilidade dos sistemas de coordenadas SAD69 e SIRGAS 2000 / UTM 23S.

## 6. Estrutura da mina
Menu **Estrutura da mina**.
1. **Primeira vez** (administrador): cadastre a mina, informando código, nome e **sistema de coordenadas** (SIRGAS 2000 / UTM 23S sugerido, ou SAD69 / UTM 23S). Todas as coordenadas do sistema seguirão esse padrão.
2. **Nova unidade na raiz**: níveis (ex.: N144), rampas, chaminés ou regiões.
3. Selecione uma unidade na árvore e use **Nova unidade dentro**. Só aparecem os tipos permitidos ali (ex.: dentro de um nível: galeria, travessa, subdivisão, realce, frente).
4. **Rampas e chaminés**: informe os níveis que atravessam. Elas aparecem nas consultas de cada nível.
5. **Frentes**: aba **Avanços**. Registre a data, a distância e **de onde ela foi medida** (ex.: "entrada da travessa"), o avanço e, se houver, as coordenadas medidas. O sistema nunca estima coordenadas.
6. **Editar / Mover / Inativar / Excluir**:
   - Mover leva junto tudo o que está dentro.
   - Inativar exige inativar antes as unidades internas.
   - Excluir é só para cadastro feito por engano (recusado se houver vínculos).
7. **Histórico**: aba Histórico (quem fez o quê e quando).
8. **Busca**: digite parte do código ou do nome acima da árvore.

## 7. Tipos e regras (administrador)
Menu **Tipos e regras**: crie tipos de unidade (ex.: Painel) e marque, na matriz, o que pode ser criado dentro de cada tipo. Uma regra já usada por unidades existentes não pode ser removida.

| Papel | Estrutura da mina |
|---|---|
| Administrador | tudo, inclusive mina, tipos e regras |
| Geólogo revisor / Geólogo | cadastrar, alterar, mover, inativar unidades; registrar avanços |
| Técnico / amostrador | consultar; registrar avanços |
| Consulta | consultar |

## 8. Painel
Primeira tela depois de entrar. Os números são lidos do banco a cada abertura (e a cada minuto): unidades por tipo, frentes ativas, avanço dos últimos 30 dias, últimos avanços e atividades recentes. Cada usuário vê só os blocos dos módulos a que tem acesso.

## 9. Histórico de alterações (Administrador e Geólogo revisor)
Menu **Histórico de alterações**. Filtre por assunto, operação, usuário, período ou texto (ex.: "N144"). Em **detalhes** aparecem os valores antes e depois de cada campo. Nada pode ser apagado do histórico.

## 10. Backup e restauração (Administrador)
Menu **Backup**.
- **Fazer backup**: gera um arquivo .zip com o banco e todos os arquivos originais. Informe uma pasta de pendrive/disco (ex.: `E:\`) para gravar também uma cópia lá; a cópia é conferida.
- **Automático**: o GeoMina faz um backup diário do banco ao abrir (guarda os 14 mais recentes), um antes de cada atualização e um antes de cada restauração.
- **Restaurar**: substitui todos os dados atuais pelos do backup escolhido. Pede a sua senha e a palavra RESTAURAR. Antes, guarda automaticamente o estado atual. Depois, é preciso entrar de novo.
- Para restaurar um backup que está no pendrive: **Abrir pasta de backups**, copie o .zip para essa pasta e atualize a página.
- Recomendação: um backup completo por semana num pendrive guardado fora do computador.

## 11. Mapeamento geológico (ficha digital)
Menu **Mapeamento geológico** → **Nova ficha** (ou, na Estrutura da mina, aba **Mapeamentos** → "Nova ficha neste local").
1. **Identificação**: local, data, exposição (frente, parede…), distância e de onde foi medida, altura/largura da seção, azimute do eixo, coordenadas se medidas.
2. **Seção**: um cartão por intervalo, do piso para o teto (de/até, litologia, alteração e intensidade, mineralização, contato). "+ Intervalo" começa onde o anterior terminou. Intervalos sobrepostos não são aceitos; lacunas geram aviso.
3. **Medidas**: escolha a estrutura (S1, fratura, falha, lineação…). Planos em direção de mergulho/mergulho (ex.: 230/30) ou rumo pela regra da mão direita; lineações em rumo/caimento. Família (ex.: FR-I) e intervalo são opcionais.
4. **Amostras**: digite o código como quiser ("BS - RP - 474 - A") — ao sair do campo ele vira **BS-RP-474A**. "RP 478" mostra o botão "Usar BS-RP-478" para confirmar.
5. A **coluna da seção** e o **estereograma** (à direita) se atualizam enquanto você digita.
6. **Criar ficha** grava um rascunho. Quando terminar: **Submeter para revisão** (a ficha fica bloqueada).
7. **Revisor**: **Aprovar** ou **Devolver ao autor** (com motivo). Ficha aprovada não pode ser alterada; para corrigir: **Reabrir para correção** (a versão aprovada fica guardada).
8. **Imprimir / PDF**: versão A4 da ficha (na janela de impressão, escolha "Salvar como PDF"). Na lista, **Ficha em branco para imprimir** gera a ficha vazia para campo.
9. **Dicionários** (menu): litologias, estruturas, alterações… O revisor/administrador pode incluir termos, siglas, cores e sinônimos e inativar termos.

## 12. Fotos, croquis e documentos
- **Onde enviar**: na ficha (seção E), na unidade da mina (aba "Fotos e croquis") ou no menu **Fotos e croquis**.
- **Fotos**: "Enviar arquivos" (várias de uma vez) ou **Tirar foto** (abre a câmera no tablet/celular). Data e câmera vêm da própria foto (EXIF). Clique na foto para ver, pôr legenda e identificação (ex.: F-001).
- **Croquis**: PDF, JPG, PNG ou TIFF. Um PDF com várias páginas (ex.: fichas escaneadas) pode ser **separado em páginas**: cada página vira um croqui, e o PDF original continua guardado.
- **Nova versão**: informe o motivo e envie o arquivo novo; as versões anteriores nunca são apagadas.
- Arquivos anexados a uma ficha já submetida/aprovada não podem ser retirados (só acrescentados).

## 13. Amostras
Menu **Amostras**.
- **Nova amostra**: "Próximo BS-RP"/"Próximo BMT-TS" sugere o número seguinte. Coordenadas exigem o sistema (SIRGAS ou SAD69) em que foram medidas.
- **Controle de qualidade**: marque padrão (informe o CRM), branco ou duplicata (informe a amostra original).
- **Da ficha**: na ficha de mapeamento (seção D), "Cadastrar estas amostras" cria as amostras com local, data e litologia da ficha.
- **Lotes de envio**: crie o lote com os códigos e "Marcar como enviado" — as amostras ficam "Enviada ao laboratório" (aparecem no painel como aguardando resultado).
- **Importar planilha** (.xlsx ou CSV): a prévia mostra cada linha (ok, confirmar código, inválido, repetido, já cadastrado). Decida: aceitar as sugestões de código ("RP 478" → BS-RP-478), o sistema das coordenadas da planilha (ou não importar XYZ) e o termo das litologias não reconhecidas. Só então confirme.

## 14. Geoquímica (laudos de laboratório)
Menu **Geoquímica**.
- **Importar laudo**: escolha o .xls/.xlsx da SGS (ou planilha com colunas "Cr (ppm)"…). A prévia mostra o certificado, os analitos (★ = novo), e cada linha: amostra cadastrada, não cadastrada ou controle do laboratório (padrão/branco). Confirme. O mesmo certificado não entra duas vezes.
- Resultados de amostras ainda não cadastradas ficam guardados; depois de cadastrá-las, use **Ligar resultados pendentes** (aba Certificados).
- **Resultados**: escolha os analitos e exporte em CSV. Valores abaixo do limite aparecem como no laudo (ex.: <0,5).
- **Certificados e QA/QC**: clique no certificado para ver a diferença entre duplicatas/replicatas e a amostra original (limite ajustável) e todas as linhas do laudo.
- Na ficha de cada amostra (menu Amostras) aparecem os resultados do laboratório.

## 15. Topografia
Menu **Topografia**.
- **Transformações de coordenadas** (fazer uma vez, antes de importar arquivos em SAD69): envie um .zip que tenha o **mesmo levantamento** nos dois sistemas (ex.: pastas SAD e SIRGAS). O GeoMina escolhe o par, calcula o deslocamento usado pela topografia da mina e mostra o resíduo. Um revisor clica em **Aprovar**.
- **Importar shapefile**: envie o .zip (.shp, .shx, .dbf, .prj, .cpg). Escolha o arquivo, confira o sistema de coordenadas e as cotas, desmarque camadas do CAD que não quer, informe código e data e **Confirme**. Arquivo em SAD69: escolha a transformação (a calibrada vem marcada). Sem .prj: declare o sistema.
- **Cota suspeita**: camadas com cota 0 ou muito diferente das demais (textos, cotas do desenho) são importadas, mas ficam ocultas na planta ("Mostrar tudo" para ver).
- **Planta**: roda do mouse = zoom; arrastar = mover; duplo clique = ver tudo; clique = selecionar linha. A coordenada sob o cursor aparece embaixo.
- **Levantamentos**: cada importação fica guardada; nenhuma substitui a outra. "Arquivar" tira da planta sem apagar.

## 16. Eixo e chainage (galerias, travessas, rampas)
Na **Estrutura da mina**, selecione a galeria → aba **Eixo e chainage**.
1. **Definir eixo**: clique na linha do eixo na planta (de preferência uma linha 3D) **ou** digite os pontos X Y Z (um por linha). Informe onde fica o 0 m; marque "Inverter sentido" se o 0 m estiver na outra ponta.
2. **Calcular posições**: amostras, fichas e avanços com coordenadas (desta unidade e das que estão dentro dela) recebem o **chainage** (distância ao longo do eixo, em 3D) e a distância ao eixo. Alertas: mais de 10 m do eixo, posição ambígua (galeria em U), sem cota.
3. Amostras em SAD69 só entram se houver transformação aprovada; senão aparecem na lista "sem posição" com o motivo.
4. Corrigir o eixo cria uma **nova versão** (as anteriores ficam guardadas); depois, calcule as posições de novo.

## 17. Geoquímica operacional
Menu **Geoquímica operacional**. A tela usa toda a largura: o botão ☰ no topo recolhe o menu do GeoMina e o botão ⟨ recolhe o painel de seleção.
- **Topo**: onde você está (mina › nível › galeria), quantas amostras estão selecionadas, os **analitos** (qualquer analito dos laudos), como tratar valores abaixo do limite e **Exportar CSV** (com os filtros escritos no arquivo).
- **Painel de seleção (esquerda)**: marque nível, galeria, trecho, geologia, campanha, responsável, status, laboratório, certificado; busque por código ou local; datas; faixa de teor. O número ao lado de cada opção é quantas amostras ela tem **com os outros filtros**: ao escolher o nível, só aparecem as galerias dele.
- **Painel de contexto (direita)**: clique numa amostra (tabela ou faixa) para ver local, coordenadas, geologia, ficha, fotos e **todos os resultados do laudo**, com a duplicata do laboratório ao lado.
- **Consulta de amostras**: tabela com todas as amostras e resultados, inclusive códigos que só existem no laudo ("só no laudo"). **Conciliar laudo × cadastro…**: cria as sub-amostras (ex.: BS-RP-428A/B herdam local e coordenadas do ponto BS-RP-428) e cadastra em lote as amostras que só estão no laudo. **Ligar às galerias…**: liga amostras da planilha (texto do local) às galerias.
- **Galerias e frentes**: escolha a galeria. Cada coluna é uma amostra, do início ao fim da galeria (o número no topo é o ponto); cada linha é um **track**:
  - um track por analito escolhido no topo; **⚙** no nome do track: faixa colorida, barras ou pontos, escala linear/log, mínimo/máximo, classes (quantis, intervalos iguais ou os seus limites), cores, altura, subir/descer, remover;
  - **+ Track**: Amostras, Litologia, Alteração, Mineralização, Estruturas (medidas da ficha, ex.: S1 230/30), Descrição, Fotos e croquis;
  - roda do mouse = zoom; arrastar = deslocar; **Shift+arrastar** = selecionar um trecho (ampliar, exportar CSV); **Ver todas** volta;
  - clique numa coluna, numa linha da tabela ou num ponto da planta: a amostra fica destacada nos três e abre no painel de contexto;
  - **Layouts**: salve a composição (ex.: "Travessa — Cr/V/Be/MgO/K2O"), compartilhe e aplique em outra galeria;
  - **Exportar**: tabela (CSV), tracks (SVG/PNG das colunas visíveis).
- **Sondagens**: **Importar sondagem…** com os arquivos de collar, survey, geologia e amostras (CSV ou Excel; cabeçalhos em português ou inglês). Escolha o sistema de coordenadas, **como a inclinação está escrita** (−60, 60 para baixo, ou a partir da vertical) e a referência do azimute. A prévia mostra erros e avisos; grave tudo ou só as linhas sem erro. Marque os furos na lista: os perfis aparecem lado a lado na mesma escala de profundidade — tracks configuráveis como nas galerias; roda = zoom; Shift+arrastar = intervalo; clique na amostra = painel de contexto; clique na litologia = detalhes do intervalo. À direita, planta e seção das trajetórias (tracejado = **estimada**, sem survey). Exportar: perfil (SVG/PNG) e intervalos com resultados (CSV).
- **Comparação**: escolha os analitos no topo; monte a seleção no painel e clique **+ Grupo da seleção atual** (repita para cada grupo), ou use **Agrupar por…** (um grupo por galeria, furo, litologia, campanha…). Vistas: **Estatísticas** (n, mín, Q1, mediana, Q3, máx, média, desvio, CV, média geométrica; exporta CSV), **Boxplot**, **Histograma** (mesmas classes para todos), **Dispersão** (escolha X e Y; mostra r de Pearson e ρ de Spearman por grupo), **Correlação** (matriz por grupo). Por padrão só valores medidos; marque "Incluir valores no limite" para usar a regra de <LD. Os filtros de cada grupo ficam escritos ao lado dele.
- **Exportar** (botão no topo; sempre a seleção atual): Tabela CSV, Planilha Excel (com aba de metadados: filtros, data, sistema de coordenadas), GeoPackage e GeoJSON para QGIS/ArcGIS (amostras de frente = pontos 3D; amostras de furo = linhas 3D de/até), **Relatório da seleção** (imprimir ou salvar como PDF).
- **Consulta**: escolha colunas, ordene pelo maior teor de um analito, filtre por "Elemento analisado". No painel da amostra, **Ir para**: tracks da galeria, perfil do furo, 3D, ficha.
- **Visualização espacial (3D)**: mostra a seleção do painel — amostras de frente (bolinhas), intervalos de furo (cilindros), trajetórias (tracejado = estimada) e a topografia em volta. Escolha o analito da cor, as classes e as cores; ligue/desligue camadas. Arrastar = girar, botão direito = deslocar, roda = zoom, **Enquadrar** volta. Clique numa amostra para abri-la no painel de contexto; a coordenada real do ponto clicado aparece embaixo. "Sem posição" lista o que não pôde ser desenhado e por quê.
- **Laboratório (laudos)** (menu): importação de laudos, certificados e QA/QC (antiga tela "Geoquímica").

## 18. Segurança dos dados
- Tudo fica no computador. Nada é enviado para a internet.
- Toda criação ou alteração de cadastro fica registrada (quem, quando, valores antes e depois).
- A sessão expira após 12 horas.

### Topografia — permissões
| Papel | Topografia |
|---|---|
| Administrador, Geólogo revisor | tudo, inclusive calibrar e aprovar transformações |
| Geólogo | importar shapefile, definir eixos, calcular posições |
| Técnico, Consulta | consultar planta, levantamentos, eixos e posições |
