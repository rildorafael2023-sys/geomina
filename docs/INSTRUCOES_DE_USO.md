# INSTRUÇÕES DE USO — versão 0.3.0

> Descreve apenas o que está implementado e testado. Mapeamento, amostras, laudos e topografia ainda não estão disponíveis.

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

## 8. Segurança dos dados
- Tudo fica no computador. Nada é enviado para a internet.
- Toda criação ou alteração de cadastro fica registrada (quem, quando, valores antes e depois).
- A sessão expira após 12 horas.
