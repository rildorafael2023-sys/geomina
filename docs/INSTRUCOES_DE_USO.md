# INSTRUÇÕES DE USO — versão 0.2.0

> Descreve apenas o que está implementado e testado. Os módulos geológicos ainda não estão disponíveis.

## 1. Abrir e fechar
- Abrir: `GeoMina.bat` (o navegador abre sozinho). Se não abrir, acesse `http://127.0.0.1:8765`.
- Fechar: feche a janela preta do GeoMina.

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

## 6. Segurança dos dados
- Tudo fica no computador. Nada é enviado para a internet.
- Toda criação ou alteração de cadastro fica registrada (quem, quando, valores antes e depois).
- A sessão expira após 12 horas.
