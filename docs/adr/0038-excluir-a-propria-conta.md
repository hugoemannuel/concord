# 0038. Excluir a própria conta apagando a linha do usuário e passando as mensagens que ficam para "Usuário removido"

- Status: aceito
- Data: 2026-10-31

## Contexto
A LGPD (art. 18, VI) dá direito à eliminação dos dados, e a auditoria de
segurança (2026-10-31) achou que não havia como excluir a conta. As forças:

- quase tudo que é da pessoa já tem `ON DELETE CASCADE` para `users` (59 FKs),
  mas quatro não: `messages.author_id`, `message_attachments.uploader_id`,
  `channels.created_by` e `servers.owner_id`;
- as mensagens em servidores são parte da conversa dos outros (o Discord as
  mantém como "Deleted User");
- os arquivos (avatar, banner, sons, figurinhas, emojis, imagens de proposta)
  ficam no disco, em pastas diferentes, e o banco não os apaga;
- dono de servidor com membros não pode simplesmente sumir (o servidor ficaria
  sem dono); não havia transferência de posse;
- tudo que é cache em memória (permissões, conexões WS) precisa esquecer.

## Opções consideradas
1. **Lápide (soft delete)**: manter a linha de `users`, limpar os campos
   pessoais e marcar `deleted_at`. Prós: nenhuma FK muda. Contras: cada tabela
   com dado pessoal precisa de um DELETE explícito (as cascatas não rodam), e
   qualquer coluna nova esquecida vira vazamento.
2. **Apagar de verdade, `author_id` anulável (`ON DELETE SET NULL`)**: o banco
   resolve tudo, mas todo código que lê `author_id` como string (Go e os três
   apps) quebra com NULL.
3. **Apagar de verdade com uma conta "Usuário removido"**: numa transação, o
   que fica (mensagens e anexos em servidores e grupos, canais criados) passa
   para uma conta fixa criada pela migration; o resto vai pela cascata. Nenhum
   leitor muda (o autor continua sendo um usuário, com nome "Usuário removido").

## Decisão
Opção 3, no pacote `internal/accountdeletion`:

- `POST /users/me/delete {password, confirm: true}`: senha conferida pelo
  `auth.AccountHandler` (mesmo limite de tentativas e vagas do bcrypt da troca
  de e-mail) e a marcação explícita de que não dá para desfazer.
- Dono de servidor com outros membros recebe 409 `owns_servers` com a lista; o
  app manda transferir (`PUT /servers/:id/owner`, novo) ou apagar. Servidor só
  da pessoa é apagado junto.
- Conversas a dois são apagadas para os dois lados (manter exigiria repassar
  `user_a_id`/`user_b_id` para a conta fixa, o que colide no `UNIQUE` quando
  duas pessoas que falavam com a mesma terceira excluem a conta). Em grupos e
  servidores as mensagens ficam, como de "Usuário removido".
- Figurinhas, emojis e sons que a pessoa enviou a servidores saem (a cascata do
  `uploader_id` já existia), com os arquivos.
- Os arquivos são apagados depois do commit (falha só vai para o log); os
  anexos de conversas e servidores apagados ficam com o `message.Janitor`
  (lixeira de 7 dias), como já acontecia ao apagar um servidor.
- Depois do commit: o cache de permissões esquece os servidores, os apps
  recebem `server_delete`/`member_leave` e as conexões WS da conta fecham com
  4001. As sessões param de valer com a revogação do ADR 0039.
- A conta "Usuário removido" (`00000000-0000-4000-8000-000000000000`) tem
  senha `!`, `active = false` (fora da busca e do pedido de amizade) e não é
  visitante (a limpeza dos visitantes não a apaga).

Ficam, e a política de privacidade diz: registro de auditoria (90 dias),
backups (14 dias), logs (rotação) e issues públicas de propostas no GitHub.

## Consequências
- Coluna nova com dado pessoal precisa de `ON DELETE CASCADE` (ou entrar no
  `reassignSQL`); o teste `TestDBEraseApagaContaEPassaMensagensParaUsuarioRemovido`
  é a rede para as quatro FKs sem cascata.
- Excluir uma conta que mandou muitas mensagens faz um UPDATE grande numa
  transação; para o tamanho atual da base é aceitável.
- Quem estava em call ao excluir sai pela queda do WS (a regra de
  desconexão da call).
- O app Android tem a mesma tela em Minha conta (exigência da Play Store), mas
  sem a transferência de posse (o 409 manda fazer pelo desktop ou pela web).

## Fontes
- Discord, perguntas sobre exclusão de conta (as mensagens ficam como
  "Deleted User"): https://support.discord.com/hc/en-us/community/posts/360037833011-Some-questions-on-account-deletion
- Redact, o que acontece ao excluir a conta do Discord: https://redact.dev/blog/how-to-delete-discord-account
- LGPD, art. 18: https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709.htm
