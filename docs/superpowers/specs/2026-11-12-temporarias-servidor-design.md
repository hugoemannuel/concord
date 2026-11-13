# Mensagens temporárias e visualização única nos canais de servidor

- Data: 2026-11-12
- Branch: `feat/temporarias-servidor` (de `origin/develop`, já com o PR #604)
- Base: spec [2026-11-12-mensagens-temporarias-design](2026-11-12-mensagens-temporarias-design.md) (DM e grupo) e [ADR 0064](../../adr/0064-mensagens-temporarias-e-visualizacao-unica.md)

## Objetivo

Levar as duas funções do PR #604 para os canais de servidor:

1. **Mensagens temporárias por canal**: quem tem *Gerenciar canais* escolhe um prazo em *Editar canal*,
   e cada mensagem nova do canal some sozinha depois dele.
2. **Foto/vídeo de visualização única no canal**: o mesmo fluxo da DM. Só abre quem via o canal na
   hora do envio, e uma vez cada.

Sucesso: os servidores ganham as duas funções com o mesmo comportamento e os mesmos textos da DM, a
regra continua garantida no servidor, e nada muda em canal que não usar as funções, exceto o
interruptor novo, que vem ligado.

## Escopo

- Canal de texto e chat do canal de voz (os mesmos onde o modo lento vale).
- Desktop e app web. **Android fora**: ele continua protegido pelo backend como no #604 (não recebe a
  mídia e trata a vencida como apagada).

## Decisões

| # | Decisão | Por quê |
|---|---|---|
| S1 | Quem pode abrir: só quem **via o canal na hora do envio** (*Ver canais* + *Ver histórico*), gravado em `view_once_recipients`, e que **ainda vê o canal** na hora de abrir. | Decidido pelo usuário ("só quem já estava lá"). Reaproveita a tabela e a regra dos grupos (opção 1). |
| S2 | Moderação: *Gerenciar mensagens* apaga a mensagem, mas **ninguém abre a mídia sem ser destinatário**, nem o dono, nem o Administrador. | Decidido pelo usuário ("privacidade vale pra todos"). |
| S3 | Quem manda visualização única: quem pode mandar arquivo no canal (*Enviar mensagens* + *Enviar arquivos*, o `CanWrite` de hoje). | Sem permissão nova (os bits acabaram, ADR 0054). *Decisão do agente.* |
| S4 | Quem liga as temporárias e a visualização única do canal: *Gerenciar canais*, em *Editar canal*, como o modo lento. O dono e o Administrador sempre podem. | Decidido pelo usuário (opção 2). Permissão própria "Mensagens temporárias" fica para quando as permissões forem ampliadas (BigInt). |
| S5 | Prazos iguais aos da DM: Desativadas, 24 h, 7 d, 90 d. Valem só para as mensagens novas, contadas do envio. | Mesmo modelo da DM (D2–D4). |
| S6 | Trocar o prazo grava o aviso de sistema no canal, com o mesmo texto da DM, e o aviso não expira. | Mesmo modelo da DM (D5). |
| S7 | Visualização única **ligada por padrão** em todo canal, inclusive nos que já existem. *Gerenciar canais* desliga por canal. Desligada: o olho some e o servidor recusa o envio (400). | Decidido pelo usuário ("quero que os outros vejam"). |
| S8 | Os destinatários não incluem o autor nem os bots (membros com o cargo fixo *Bots* ou conta de bot). | Bot nunca abre, e o "Vista por X de Y" nunca fecharia. *Decisão do agente.* |
| S9 | Mudar as duas configurações entra no registro de auditoria do canal, como o modo lento. | Padrão do canal (`channel/audit.go`). |
| S10 | Canal de sistema (#musica, #avisos) não aceita visualização única e não tem modo temporário. O update de canal de sistema já responde 403 `system_channel` para qualquer edição, e isso fica como está. | Esses canais são do próprio servidor. *Decisão do agente.* |
| S11 | Enquete criada num canal ou numa DM com o modo ligado também expira. Hoje o INSERT de `poll_repository.go` não grava `expires_at`, uma brecha que já existe na DM. | Quem ligou o modo espera que tudo suma. *Decisão do agente.* |
| S12 | O aviso de sistema no canal tem como autor quem mudou o prazo, como na DM. O app mostra o aviso pelo `DisappearingNotice`, roteado por `system_kind`, e não pelo cartão de servidor. | Igual à DM. *Decisão do agente.* |

## Arquitetura

### Banco: migration `000207_channel_disappearing`

```sql
ALTER TABLE channels ADD COLUMN disappearing_seconds INTEGER
  CHECK (disappearing_seconds IN (86400, 604800, 7776000));   -- NULL = desativado
ALTER TABLE channels ADD COLUMN allow_view_once BOOLEAN NOT NULL DEFAULT true;
```

### Backend

- **`channel`**:
  - `Channel` ganha `DisappearingSeconds *int` (`json:"disappearing_seconds"`) e `AllowViewOnce bool` (`json:"allow_view_once"`), lidos nos SELECTs de canal.
  - O PUT de editar canal aceita os dois campos (opcionais), validados com o `conversation.ValidDisappearing`. Se `conversation` não puder ser importado, a validação é copiada para `channel` com teste.
  - Só quem tem *Gerenciar canais* edita (a regra de hoje do update), e as duas mudanças entram no `audit.Diff`.
  - Trocar `disappearing_seconds` grava o aviso de sistema no canal pelo `CreateSystemChannelMessage` que já existe, com `kind = "disappearing"`, o mesmo texto do `conversation.DisappearingNotice` e o nome de quem mudou. O `channel:update` de hoje (`notifyUpdated` → `PublishChannelUpdate`) já leva a struct inteira.
    `channel` não importa `message` (é o contrário): o aviso entra por uma interface injetada, como em `birthday/service.go`, e a validação dos campos vai em `UpdateInput.validate`, onde está a do modo lento.
  - **Não crescer `handler.go`** (362 linhas): a parte nova vai num arquivo próprio do domínio (`channel/disappearing.go`).
- **`message`**:
  - **Validade no INSERT**: `expiresAtDaConversaSQL` passa a cobrir canal. O prazo vem de `conversations.disappearing_seconds` ou de `channels.disappearing_seconds`, conforme a mensagem (`COALESCE` dos dois subselects; o `$3` é o `channel_id` em todo INSERT que usa a constante, documentado como o `$4`). O aviso de sistema continua sem validade. Encaminhar para um canal herda o modo dele.
  - **Leitura**: as listagens de canal (`ListByChannel`), a busca de canal, os fixados (`pin_repository`) e a prévia de resposta aplicam o `notExpired`. A busca já aplica.
  - **Limpeza**: hoje `DeleteExpired` e `ExpireViewOnce` filtram `conversation_id IS NOT NULL`, e `ExpiredMessage` e `ExpiredViewOnce` só têm `ConversationID`. Passam a cobrir canal:
    - as structs ganham `ChannelID` (e `ServerID`, resolvido pelo canal);
    - `publishDelete` e `publishViewOnceUpdates` publicam pela sala do canal (`DeleteEvent` e `UpdateEvent` com `ChannelID`/`ServerID`, sem `UserIDs`) quando a mensagem é de canal;
    - o cache de participantes só vale para conversa;
    - a limpeza da visualização única no canal (14 dias, ou todos viram e passou a janela) entra no escopo.
  - **Visualização única no canal**:
    - `Prepare` e `MarkViewOnce`, hoje presos a `conversationID`, passam a receber a `Room`. A interface `ViewOncePreparer` muda e os dois handlers usam a mesma chamada. `Prepare` passa a aceitar canal: recusa (400) se `allow_view_once = false`, se o canal é de sistema ou se não é canal de texto/voz.
    - Destinatários = membros do snapshot de permissões (`permission.Service.Snapshot`) com `ViewChannel|ReadHistory` no canal, menos o autor e os bots. Bot é identificado por `users.is_bot`, com uma consulta para os membros do snapshot (o `permission.Snapshot` não sabe disso). Quem tem o cargo fixo *Bots* sem ser conta de bot continua destinatário.
    - `MarkViewOnce` hoje filtra `conversation_id`: passa a aceitar `channel_id`.
  - **Abrir**: hoje `openable`, `Open` e `publishUpdate` assumem conversa (`ConversationID` obrigatório, `Room{ConversationID}`, participantes da conversa). Cada um ganha o ramo de canal:
    - `CanRead` com `Room{ChannelID}`, que confere *Ver canais* (S1, "ainda vê");
    - o `message:update` vai pela sala do canal;
    - o `ServeFile` (`attachment_handler.go`) monta a `Room` também pelo `ChannelID`;
    - a exigência de estar em `view_once_recipients` não muda.
  - **Handler de canal**: o 400 fixo para `view_once` (R5 do #604) vira a chamada a `Prepare`, como no handler da DM.
  - **Push e prévias**: a menção num canal já usa `previewBody`, então nada muda.
- **Canal de sistema**: o modo temporário é recusado no update (400) e não aparece no formulário.

### Frontend

- **`features/servers`** (*Editar canal*), seguindo `ChannelSlowmodeField`:
  - `ChannelDisappearingField` é um seletor com as opções de `features/disappearing/lib`.
  - `ChannelViewOnceField` é um `Switch`.
  - Os dois só aparecem no canal de texto ou voz que não é de sistema, para quem tem *Gerenciar canais*, como o modo lento.
  - Os textos estão abaixo.
- **Cabeçalho do canal**: um indicador só de leitura (o `ClockIcon` com o rótulo curto), com o nome "Mensagens temporárias", quando o canal tem prazo. Não abre menu. Componente em `features/disappearing/components/ChannelDisappearingMark.tsx`.
- **Composer**: a faixa "Mensagens temporárias ativadas: 7 dias" passa a valer em canal (o `useDisappearing` lê o prazo do canal em `useServerStore(s => s.channels)`, só leitura).
  - O botão de visualização única aparece em canal quando `allow_view_once` está ligado; hoje o `ChatComposer` passa `!isChannel`, o que muda.
  - A pílula, o visualizador, o `useHideExpired` e o `ExpiryMark` já funcionam em qualquer sala.
- **Registro de auditoria** (`features/auditlog/lib/auditDetails.ts`): os rótulos `disappearing_seconds` ("Mensagens temporárias") e `allow_view_once` ("Visualização única").
- **Não alterar `ChannelFormModal.tsx`** (237 linhas) além de montar os dois campos.

## Textos

Já aprovados no #604 e reaproveitados: "Mensagens temporárias", "Desativadas · 24 horas · 7 dias · 90 dias", "24 h / 7 d / 90 d", o aviso de sistema, "Mensagens temporárias ativadas: 7 dias", "Visualização única" e todos os textos da pílula e do visualizador.

**Aprovados pelo usuário em 2026-11-12:**
- Ajuda do seletor em *Editar canal*: **"As novas mensagens do canal somem depois do prazo. As que já foram enviadas não mudam."**
- Descrição do interruptor: **"Membros podem mandar fotos e vídeos que cada pessoa abre uma vez. Nem a moderação consegue abrir."**
- Valores no registro de auditoria: **"Ligada"** / **"Desligada"**.

## Fora de escopo

- Permissão própria "Mensagens temporárias" (depende de ampliar as permissões para BigInt).
- Android.
- Teto de destinatários em canal grande (se aparecer servidor grande, avaliar desligar a visualização única acima de N membros).

## Testes (o que importa)

Backend:
- Update de canal:
  - prazo inválido → 400;
  - sem *Gerenciar canais* → 403;
  - canal de sistema → 403 `system_channel` (comportamento atual);
  - trocar o prazo grava o aviso de sistema sem validade e entra na auditoria.
- Mensagem de canal com o modo ligado tem `expires_at` (DB). Com o modo desligado, e no aviso de sistema, não tem.
- Listagem de canal, fixados e resposta escondem a vencida (DB).
- A limpeza publica o delete de canal com `ChannelID` e `ServerID`.
- Visualização única no canal:
  - os destinatários são só quem vê o canal (canal privado com cargo), sem o autor e sem bot;
  - quem ganhou o cargo depois do envio → 403;
  - quem perdeu o acesso ao canal → 403/404;
  - com `allow_view_once` desligado → 400;
  - canal de sistema → 400;
  - enquete num canal com o modo ligado também expira (S11);
  - moderador (*Gerenciar mensagens*) que não é destinatário → 403, mas consegue apagar a mensagem.

Frontend:
- Os campos de *Editar canal* mandam os valores certos e só aparecem para quem pode.
- O indicador do cabeçalho mostra o prazo.
- A faixa e o olho aparecem em canal conforme as configurações.
- Os rótulos da auditoria aparecem certos.

E2E por API: estender `scripts/e2e-mensagens-temporarias.mjs` com um servidor e um canal privado. Ligar o prazo, enviar, vencer, verificar que some. Enviar visualização única e conferir:
- só os membros do cargo abrem;
- o membro que ganha o cargo depois não abre;
- com a opção desligada, o envio é recusado.

## Verificação de ponta a ponta

1. `node scripts/affected-tests.mjs pr` verde.
2. O e2e por API passa.
3. No app (você): *Editar canal*, depois o cabeçalho, a faixa, o olho e a pílula num canal, em 360/768/1280.
