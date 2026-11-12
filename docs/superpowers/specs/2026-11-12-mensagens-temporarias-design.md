# Mensagens temporárias e foto/vídeo de visualização única (DMs)

- Data: 2026-11-12
- Branch: `feat/mensagens-temporarias` (de `origin/develop`)
- ADR: [0064](../../adr/0064-mensagens-temporarias-e-visualizacao-unica.md)

## Objetivo

Trazer duas funções do WhatsApp para as conversas privadas (DM 1:1 e grupo):

1. **Mensagens temporárias:** um modo da conversa; com ele ligado, cada mensagem nova some
   sozinha depois de 24 h, 7 dias ou 90 dias.
2. **Foto/vídeo de visualização única:** quem envia marca a mídia; cada destinatário abre uma vez
   e, ao fechar, não abre mais.

Sucesso: a regra vale no servidor (nada vencido fica no banco ou volta em listagem; a mídia não
pode ser baixada de novo), o desktop e o app web mostram tudo com os textos aprovados, e nada do
que já existe (canais, DMs comuns, anexos comuns, Android) muda de comportamento.

## Escopo

- Só `conversation_id` (DM e grupo). Canal de servidor: fora.
- Desktop (Electron) e app web. **Android fora**: o app atual não recebe a mídia de visualização
  única (ver Compatibilidade) e trata a mensagem vencida pelo evento de apagar que já conhece.

## Decisões (com o porquê)

| # | Decisão | Por quê |
|---|---|---|
| D1 | Qualquer participante liga, troca ou desliga o modo temporário. | Igual ao WhatsApp; DM não tem cargos. |
| D2 | Prazos: desativado, 24 h (86400 s), 7 dias (604800 s), 90 dias (7776000 s). Outros valores: 400. | Igual ao WhatsApp. |
| D3 | O prazo conta **do envio** (`expires_at = created_at + prazo`, gravado na mensagem). | Igual ao WhatsApp/Signal para quem envia; uma data só por mensagem, sem estado por leitor. |
| D4 | Ligar/desligar só afeta mensagens enviadas depois. As antigas ficam como estão. | Igual ao WhatsApp; nada é apagado de surpresa. |
| D5 | Trocar o modo grava uma mensagem de sistema (`system_kind = "disappearing"`) **não temporária**, com o texto aprovado já montado no servidor em `content` (nome de quem trocou + prazo). | O aviso precisa ficar para quem chega depois; texto pronto funciona igual no Android, que mostra `content` como texto. *Decisão do agente.* |
| D6 | Mensagem de visualização única = exatamente **um** anexo `image` ou `video`, sem outros anexos, enquete, figurinha ou GIF. Texto é permitido. | Regra simples, igual ao WhatsApp (uma mídia por vez). *Decisão do agente.* |
| D7 | Cada destinatário tem a sua visualização. Quem enviou nunca reabre. Destinatários = participantes da conversa **na hora do envio**, menos o autor (guardados em `view_once_recipients`); quem entra depois não abre, quem sai não abre mais. | Igual ao WhatsApp em grupo; quem enviou escolheu aquele público e o "Vista por X de Y" não muda de denominador. Decidido pelo usuário. |
| D8 | "Visto" = abrir. Abrir libera o arquivo por 5 min (token `view_once`); dentro disso o vídeo toca, pausa e volta à vontade. Fechar encerra no app. | Se "visto" fosse "assistir até o fim", fechar no meio reabriria. |
| D9 | O arquivo é apagado quando todos os destinatários viram, ou 14 dias após o envio (o que vier primeiro). A mensagem fica com o estado "Aberta"/"Expirou". | Igual ao WhatsApp; libera disco. |
| D10 | Mensagem de visualização única que também é temporária: vale o que vencer primeiro. | Consequência direta de D3 e D9. |
| D11 | Responder, fixar, encaminhar, copiar imagem e buscar por `has:image`/`has:video` **não** mostram nem acham a mídia. A resposta mostra "Foto de visualização única". | A mídia só sai pelo `open`. *Decisão do agente.* |
| D12 | Proteção contra print (`setContentProtection`) só no desktop, só enquanto o visualizador está aberto. Web abre sem ela. | Única proteção real disponível; o efeito colateral (janela preta para quem assiste a tela compartilhada) só existe nesse intervalo. |
| D13 | Editar uma mensagem temporária não muda o `expires_at`. | O prazo é do envio (D3). |
| D14 | Encaminhar mensagem temporária é permitido; a cópia segue o modo da conversa de destino (temporária só se o destino estiver com o modo ligado). | Igual ao WhatsApp. *Decisão do agente.* |
| D15 | Arquivos de mensagem vencida e de visualização única `gone` são apagados direto (como o `deleteWithFiles` do apagar comum), sem lixeira. | Quem pediu "some" espera que suma; mesmo caminho do apagar de hoje. *Decisão do agente.* |
| D16 | O payload da mensagem é o mesmo para todos (o hub publica um evento por sala): `view_once.viewer_ids` lista quem já abriu, e cada app calcula "já vi" e "Vista por X de Y". | Não muda o `publishMessage`; os ids já são de participantes da conversa. O servidor continua sendo quem barra a segunda abertura. *Decisão do agente.* |

## Arquitetura

### Banco: migration `000205_disappearing_view_once`

```sql
ALTER TABLE conversations ADD COLUMN disappearing_seconds INTEGER
  CHECK (disappearing_seconds IN (86400, 604800, 7776000));         -- NULL = desativado
ALTER TABLE messages ADD COLUMN expires_at TIMESTAMPTZ;             -- NULL = não expira
CREATE INDEX messages_expires_at_idx ON messages (expires_at) WHERE expires_at IS NOT NULL;
ALTER TABLE message_attachments ADD COLUMN view_once BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE message_attachments ADD COLUMN view_once_gone_at TIMESTAMPTZ; -- arquivo apagado (todos viram / 14 dias)
CREATE TABLE view_once_recipients (   -- quem podia abrir, gravado no envio (D7)
  attachment_id UUID NOT NULL REFERENCES message_attachments(id) ON DELETE CASCADE,
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (attachment_id, user_id)
);
CREATE TABLE attachment_views (
  attachment_id UUID NOT NULL REFERENCES message_attachments(id) ON DELETE CASCADE,
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  viewed_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (attachment_id, user_id)
);
```

(Nomes conferidos: `message_attachments.id`; última migration 000204. O `.down.sql` desfaz na
ordem inversa.)

### Backend (Go), por domínio

- `internal/conversation/disappearing.go` (novo): validação do prazo (D2), `SetDisappearing`
  (repositório + serviço), handler `PUT /conversations/:id/disappearing` `{ "seconds": 86400 | 604800 | 7776000 | null }`.
  Só participante (mesma checagem das outras rotas da conversa). Grava a mensagem de sistema (D5)
  por uma interface injetada (`message` já importa `conversation`, então `conversation` não pode chamar `message` direto; o único caminho de sistema hoje é `CreateSystemChannelMessage`, só de canal: criar o equivalente de conversa em `message/`) e publica o `conversation:update` que já existe (vai para as salas `user:<id>`; o app relê a lista e pega `disappearing_seconds`). `Conversation` e `Summary` ganham
  `disappearing_seconds *int` no JSON.
- `internal/message/expiry.go` (novo): no envio para conversa, lê o prazo e preenche
  `expires_at` (o service de criação recebe uma interface pequena `disappearingLookup`; não
  cresce o handler). `ExpirySweeper` com `Run(ctx, every)`/`RunOnce(ctx, now)` no molde do
  `Janitor`: apaga em lotes (`DELETE ... WHERE expires_at <= now RETURNING id, conversation_id`),
  publica o evento de mensagem apagada que já existe para cada uma; os arquivos dos anexos
  são apagados direto como no `deleteWithFiles` (D15). Ligado em `cmd/wire_*.go`
  a cada 1 min.
- Filtro `expires_at IS NULL OR expires_at > now()` em: listagem de mensagens da conversa,
  busca, prévia `last_message` da lista de DMs, contagem de não lidas, mensagem única por id e
  a prévia de resposta (resposta a mensagem vencida = "mensagem apagada", como já é hoje).
- `internal/message/view_once.go` (novo):
  - Envio: o corpo do POST de mensagem da conversa aceita `view_once: true`; valida D6 e
    grava `view_once = true` no anexo (na mesma transação de `CreateWithAttachments`; o `AttachAttachments` só carrega para exibir). Em canal: 400.
  - Serialização: para anexo `view_once`, a mensagem **não** o põe em `attachments`; põe em
    `view_once: { "id", "kind", "gone": bool, "viewer_ids": [...], "recipient_count": n }` (igual para todos, D16).
    Kinds aceitos: só `image` e `video` (existe também `file`, recusado).
  - `POST /attachments/:id/open`: exige acesso à sala (`RoomAccess`) e estar em `view_once_recipients` (senão 403), recusa o autor (403),
    quem já viu ou anexo `gone` (410). Grava em `attachment_views` (conflito = 410, sem corrida)
    e devolve `{ "token", "expires_at" }`. Depois, se todos os destinatários viram, marca `gone`
    e apaga o arquivo (D15). Publica o `message:update` que já existe (o autor vê "Vista por").
  - `ServeFile`: hoje chama `VerifyMediaToken` primeiro (que recusa outro tipo); passa a buscar
    o anexo antes e escolher a verificação pelo `view_once`. O `CanRead` da sala continua em todo pedido.
    Anexo `view_once` só abre com token `view_once` cujo `attachment_id` é o dele;
    token `media` → 404 (o mesmo de "não existe", sem vazar). Anexo `gone` → 404.
  - Limpeza dos 14 dias: dentro do `ExpirySweeper` (mesmo tick): marca `gone` e manda o arquivo
    apaga o arquivo.
- `internal/auth/view_once_token.go` (novo): `GenerateViewOnceToken(userID, attachmentID)` /
  `VerifyViewOnceToken`, TTL 5 min, `type: "view_once"`. Conferir que AuthMiddleware e WebSocket
  continuam aceitando só `access`.
- Favoritos (`ListFavorites`/`AttachDetails`): mesmo filtro de vencidas e mesma regra de `view_once`.
- Notificação push (corpo montado em `platform/websocket/mobile_apps.go`, mudança no servidor, entra neste PR) e prévia na lista de DMs: mensagem com `view_once` vira "Foto de visualização
  única" / "Vídeo de visualização única" (texto da mensagem, se houver, não muda).

### Frontend (renderer), por feature

- `features/chat/disappearing/` (novo):
  - `lib/disappearing.ts`: opções (D2), rótulos ("24 h", "7 d", "90 d"), "Some em X" a partir de
    `expires_at`.
  - `components/DisappearingButton.tsx`: botão `IconButton` com `ClockIcon` no cabeçalho da DM e
    do grupo (ao lado do `DmCallButton`), menu com as 4 opções; em < 640 px abre como folha de
    baixo. Destaque + rótulo quando ligado.
  - `components/DisappearingBanner.tsx`: faixa acima do campo de texto.
  - `components/ExpiryMark.tsx`: `ClockIcon` pequeno ao lado do horário com o "Some em X".
  - `api/disappearing.ts`: `PUT /conversations/:id/disappearing`.
  - O estado vem de `ConversationSummary.disappearing_seconds` (já no `chatStore` pela lista) e é
    atualizado quando o `conversation:update` do WS faz reler a lista. **Nenhum campo novo nos god stores**: se a lista
    não bastar, um store próprio `disappearingStore`.
  - Mensagem vencida some pelo evento de apagar que já existe; além disso, um timer local tira
    da tela a mensagem cujo `expires_at` passou (sem esperar o tick do servidor).
- `features/chat/viewOnce/` (novo):
  - `lib/viewOnce.ts`: regras de envio (D6), estado da pílula, rótulos.
  - `components/ViewOnceToggle.tsx`: `IconButton` com `EyeIcon` no cartão do anexo
    (`ComposerAttachments`), só em conversa e com um único anexo imagem/vídeo.
  - `components/ViewOncePill.tsx`: pílula no lugar da mídia (estados abaixo).
  - `components/ViewOnceViewer.tsx`: confirmação na primeira abertura, chama `open`, mostra
    `<img>`/`<video>` com o token em tela cheia, `CloseButton`, Esc fecha; bloqueia menu de
    contexto, arrastar e o download do `<video>` (`controlsList="nodownload"`,
    `disablePictureInPicture`); libera o `src` ao fechar.
  - `api/viewOnce.ts`: `POST /attachments/:id/open`.
- `src/main/` + `preload`: `window.api.contentProtection.set(on: boolean)` →
  `BrowserWindow.setContentProtection(on)` (em `src/main/` na pasta da janela). O visualizador liga
  ao abrir e desliga ao fechar/desmontar. No web o `window.api` não existe: não faz nada.
- Prévias (lista de DMs `messagePreview`, notificação, resposta, mensagens fixadas,
  encaminhar): usam o texto de visualização única; encaminhar uma mensagem de visualização única
  fica desativado.

- Aviso de sistema na DM (`system_kind = "disappearing"`): linha centralizada e discreta com `ClockIcon` e o texto, no estilo do `MessageDayDivider` (não o cartão de servidor do `SystemMessage.tsx`). Componente `features/chat/disappearing/components/DisappearingNotice.tsx`; o `SystemMessage` desvia para ele quando `system_kind === "disappearing"`. Aprovado pelo usuário.

## Textos aprovados (2026-11-12)

- Botão do cabeçalho: **"Mensagens temporárias"**; opções **"Desativadas" · "24 horas" · "7 dias" · "90 dias"**; rótulo quando ligado: **"24 h" / "7 d" / "90 d"**.
- Aviso no chat: **"Fulano ativou as mensagens temporárias. Novas mensagens vão sumir após 7 dias."** / **"Fulano desativou as mensagens temporárias."**
- Faixa do campo de texto: **"Mensagens temporárias ativadas: 7 dias"**.
- Dica no relógio da mensagem: **"Some em 3 dias"** (unidade: minutos/horas/dias).
- Botão no anexo: **"Visualização única"**; selo no cartão quando ligado: **"Visualização única"**.
- Pílula: destinatário não visto **"Foto"** / **"Vídeo"** (com `EyeIcon`); destinatário visto **"Aberta"**; autor **"Foto de visualização única"** (grupo: **"Vista por 2 de 3"**); vencida **"Expirou"**.
- Confirmação (só na primeira vez): **"Esta foto só pode ser vista uma vez. Ao fechar, ela some."** (vídeo: "Este vídeo só pode ser visto uma vez. Ao fechar, ele some."), botões **"Ver"** / **"Cancelar"**.
- Aviso no visualizador do desktop compartilhando tela: **"Quem assiste sua tela vê esta janela em preto."**
- Prévias: **"Foto de visualização única"** / **"Vídeo de visualização única"**.

A variante de vídeo da confirmação segue o padrão aprovado para foto (decisão do agente; confirmar na revisão da spec).

## Compatibilidade

- **Android atual:** anexo de visualização única não vem em `attachments` → o app não mostra nem
  baixa; só o texto aparece. `disappearing_seconds` e `expires_at` são campos novos ignorados.
  Mensagem vencida chega como o evento de apagar que o app já trata.
- **Desktop/web antigos** (antes de atualizar): mesmo efeito do Android.
- Canais, DMs sem o modo e anexos comuns: nenhum caminho muda além do filtro
  `expires_at IS NULL OR ...`, que deixa passar tudo o que não tem prazo.

## Responsivo (360 / 768 / 1280 px)

- Botão do relógio: no cabeçalho em todas as larguras; em 360 px só o ícone + rótulo curto.
- Menu do prazo: popover ≥ 640 px; folha de baixo < 640 px.
- Visualizador: tela cheia em qualquer largura; mídia com `object-contain`.
- Alvos de toque ≥ 40 px, `focus-ring`, Esc fecha menu e visualizador, Tab percorre as opções.

## Testes (o que importa)

Backend:
- prazo inválido → 400; não participante → 403; trocar grava mensagem de sistema não temporária.
- mensagem enviada com o modo ligado tem `expires_at`; desligado, não.
- listagem, busca, prévia e não lidas não mostram mensagem vencida mesmo antes do sweeper (teste de banco).
- sweeper apaga vencidas, publica o evento de apagar, deixa as outras.
- envio `view_once` inválido (2 anexos, áudio, canal) → 400.
- serialização: anexo `view_once` fora de `attachments`; `viewer_ids` corretos; kind `file` recusado.
- `open`: autor 403; quem entrou no grupo depois do envio 403; segunda abertura 410; duas aberturas simultâneas = uma passa; último
  destinatário → `gone` e arquivo apagado.
- `ServeFile`: token `media` em anexo `view_once` → 404; token `view_once` de outro anexo → 404;
  token certo → 200 com Range.
- 14 dias → `gone`.
- token `view_once` recusado pelo AuthMiddleware.

Frontend (vitest):
- `disappearing.ts` (rótulos, "Some em X"), `viewOnce.ts` (regra D6, estado da pílula).
- `ViewOnceToggle` só aparece com um anexo imagem/vídeo em conversa.
- `ViewOncePill` em cada estado; `ViewOnceViewer` liga e desliga a proteção (mock de `window.api`) e não chama `open` ao cancelar.
- `DisappearingButton` chama a API com o valor certo; prévia da DM usa o texto de visualização única.

## Fora de escopo

- Canais de servidor; app Android (PR seguinte).
- Prazo padrão para todas as conversas novas (o "default timer" do Signal/WhatsApp).
- Avisar quem enviou quando alguém tira print.
- Temporária contada a partir da leitura.
- Visualização única para áudio.

## Verificação de ponta a ponta

1. `node scripts/affected-tests.mjs pr` verde.
2. Backend local + duas contas no web e no desktop (`yarn dev` / `yarn dev:web`):
   - ligar 24 h numa DM → aviso aparece nos dois lados; mensagem nova com relógio; mudar o
     `expires_at` no banco para o passado → some nos dois lados em até 1 min e não volta ao recarregar.
   - grupo com 3 pessoas: enviar foto de visualização única → cada uma abre uma vez; a segunda
     tentativa mostra "Aberta"; autor vê "Vista por 3 de 3"; o arquivo sai do disco.
   - vídeo de visualização única: tocar, voltar, avançar dentro da sessão; fechar e não reabrir.
   - copiar a URL do arquivo do DevTools e abrir com o token de mídia comum → 404.
   - print do Windows com o visualizador aberto no desktop → janela fora da captura.
3. 360/768/1280 px no web: cabeçalho, menu, faixa, pílula e visualizador.
