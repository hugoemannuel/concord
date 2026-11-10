# 0062. Encaminhar mensagens copiando o conteúdo e guardando a origem em forwarded_from

- Status: aceito
- Data: 2026-11-09

## Contexto

A issue #589 pede encaminhar uma mensagem para outro canal, servidor ou DM, com
comentário opcional, marcada como encaminhada e com a origem (autor, canal),
anexos e embeds preservados. As forças:

- quem está no destino muitas vezes **não lê a origem** (canal privado, DM de
  outra pessoa): o conteúdo precisa viver no destino, não ser um link;
- os anexos são servidos só para quem lê a sala do anexo (`message_attachments`
  tem `channel_id`/`conversation_id`), e apagar a original apaga os arquivos;
- notificação, prévia da lista de DMs, busca, Markdown, prévias de link e o app
  mobile já sabem mostrar `content` e `attachments`;
- encaminhar não pode pingar quem a original citava, nem deixar quem encaminhou
  mudar o texto da original.

## Opções consideradas

1. **Referência** (Slack "share message" antigo: um cartão que aponta para a
   original). Leve, mas quem não lê a origem não vê nada, e a mensagem some
   quando a original é apagada. Não atende o caso principal (encaminhar de um
   canal privado para uma DM).
2. **Snapshot separado do texto** (Discord: `message_reference` do tipo FORWARD
   + `message_snapshots` com texto, anexos e embeds; o comentário vai numa
   mensagem à parte). Fiel, mas pede um renderizador novo do snapshot em cada
   app (desktop, web, mobile), e a busca, a prévia da DM e o push ficariam sem
   texto.
3. **Cópia com a origem ao lado** (Telegram: a mensagem encaminhada é uma
   mensagem comum com `forward_origin`). O texto, a figurinha, o GIF e uma cópia
   dos arquivos viram a mensagem nova de quem encaminhou; a origem é uma foto em
   JSON (`forwarded_from`), como já fazemos com `call_invite`.

## Decisão

A opção 3. É a que reaproveita tudo que já mostra mensagem (inclusive apps
antigos, que só não mostram o selo "Encaminhada") e mantém o conteúdo visível
para quem não lê a origem. Os arquivos são copiados no disco para ids novos na
sala de destino, então o acesso aos anexos continua sendo o da sala, e apagar a
original não quebra a encaminhada. O comentário vai logo depois como mensagem
comum (como no Discord), pelo mesmo caminho de um envio normal. Encaminhar de
novo mantém a origem primeira. Enquete, convite para call e mensagem do sistema
não são encaminhados (não são "conteúdo" copiável).

Permissões no backend: ler a origem (canal: VIEW_CHANNEL; DM: participante) e
enviar no destino (canal: SEND_MESSAGES, mais ATTACH_FILES quando leva arquivo;
DM: a regra de escrever nela). `GET /forward/targets` lista só os canais em que a
pessoa pode enviar.

## Consequências

- Cada encaminhamento com arquivo ocupa disco de novo (a cópia passa pelo
  `HasRoom`). Se isso pesar, dá para trocar por arquivo compartilhado com
  contagem de referências, como os perfis salvos (ADR 0011).
- A encaminhada não pode ser editada (`ErrNotEditable`) e não pinga ninguém: o
  `@all` dela sai nil e o push ignora as `@menções` do texto.
- Emojis e figurinhas vão como estavam na original, sem passar pela regra de
  expressões de outros servidores (ADR 0054): é a foto do que foi dito, não um
  uso novo.
- A foto da origem (nomes do canal e do servidor) não acompanha renomeações.

## Fontes

- Discord, Message Resource (message reference types, message snapshots):
  https://discord.com/developers/docs/resources/message
- Telegram Bot API, `forwardMessage` e `MessageOrigin`:
  https://core.telegram.org/bots/api#forwardmessage
- Slack, compartilhar mensagens (`chat.postMessage` com anexo de mensagem
  compartilhada): https://api.slack.com/messaging/sending
