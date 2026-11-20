# 0065. Mencionar cargo pelo nome no texto, com os ids escolhidos enviados pelo app

- Status: aceito
- Data: 2026-11-20

## Contexto

Queremos mencionar um cargo no chat de um canal (`@suporte` avisa quem tem o cargo Suporte). As
forças:

- o texto da mensagem aparece cru em muitos lugares (push, busca, prévia de resposta, TTS, campo
  de edição, app Android): o que estiver nele precisa ser legível sem tradução;
- nome de cargo tem espaço e acento, **não é único** no servidor, pode ser renomeado e pode ser
  igual ao nick de um membro;
- quem decide se uma menção em massa pinga é o servidor (permissão e anti-spam), como já é com o
  `mention_everyone` do `@all`/`@here`;
- quem escreve precisa saber se marcou um cargo ou uma pessoa quando os nomes coincidem;
- não há bit de permissão livre (ADR 0054).

## Opções consideradas

1. **Token com id no texto** (Discord: `<@&id>` e a lista `mention_roles`; Slack:
   `<!subteam^ID>`). Sobrevive a renomear, não tem ambiguidade. Custo: todo lugar que mostra o
   texto cru precisa trocar o token pelo nome, inclusive o Android e os apps já instalados, que
   mostrariam o token.
2. **Só o nome, resolvido pelo servidor.** É o que o `@nick` faz hoje. Simples, mas com um cargo
   e um membro de mesmo nome o servidor não sabe qual dos dois quem escreveu quis, e renomear o
   cargo apaga o chip das mensagens antigas.
3. **Nome no texto e a intenção ao lado** (Matrix, "intentional mentions": o corpo fica como
   texto e o evento leva `m.mentions` com quem foi mencionado de propósito). O texto continua
   legível; a ambiguidade some porque o app diz o que foi escolhido.
4. Seguir o padrão atual do repo: é a opção 2 (`@nick` por texto) somada ao campo decidido pelo
   servidor (`mention_everyone`).

## Decisão

A opção 3, por cima do padrão do repo. O texto guarda `@handle` (o nome do cargo em minúsculas,
com `-` no lugar dos espaços). O app envia `mention_role_ids` com os cargos escolhidos na lista
do `@` (ou resolvidos por ele ao enviar); o servidor valida cada id (cargo do servidor, handle
presente no texto, permissão ou cargo mencionável, anti-spam) e grava em `messages.mention_roles`
o id e o handle usado. O texto sozinho nunca pinga um cargo.

## Consequências

- Push, busca, resposta, TTS e o Android mostram a menção sem mudança nenhuma.
- Renomear o cargo não quebra as mensagens antigas: o handle gravado acha o trecho no texto e o
  id acha o cargo atual.
- Um `@handle` tem um significado só por mensagem: cargo ou pessoa, nunca os dois.
- A regra do handle existe no Go e no TypeScript; um arquivo de casos compartilhado
  (`message/testdata/role_mentions.json`) mantém os dois iguais.
- App sem a lista do `@` (o Android de hoje) não consegue mencionar cargo.
- O texto e a lista podem divergir numa edição; por isso editar só tira cargo da lista, nunca
  põe.
- O app precisa saber os próprios cargos em todos os servidores (rota e store novos) para contar
  a menção fora do servidor aberto.

## Fontes

- Discord, recurso Message (`mention_roles`, `allowed_mentions`): https://docs.discord.com/developers/resources/message.md
- Discord, permissões de menção de cargo: https://support.discord.com/hc/sv/articles/360039176412-Role-Mention-Permissions-Suppression
- Slack, formatação de texto (`<!subteam^ID>`, `<!here>`, `<!channel>`, `<!everyone>`): https://docs.slack.dev/messaging/formatting-message-text
- Matrix, MSC3952 "Intentional mentions" (`m.mentions`): https://git.sudo.is/matrix/matrix-doc/src/branch/main/proposals/3952-intentional-mentions.md
