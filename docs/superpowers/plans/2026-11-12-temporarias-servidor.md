# Temporárias e visualização única nos canais de servidor: plano

> **Para agentes:** SUB-SKILL OBRIGATÓRIA: superpowers:subagent-driven-development. Passos com checkbox.

**Objetivo:** levar o modo temporário (por canal, em *Editar canal*, com *Gerenciar canais*) e a visualização única (destinatários = quem vê o canal na hora do envio) para os canais de servidor.

**Arquitetura:** colunas `channels.disappearing_seconds` e `allow_view_once`. O INSERT de mensagem passa a calcular a validade também pelo canal. O sweeper, o preparo, a abertura e a entrega do arquivo da visualização única ganham o ramo de canal, publicando pela sala do canal. No frontend, campos em *Editar canal* (molde do `ChannelSlowmodeField`), um indicador no cabeçalho, e a faixa e o olho também em canal.

**Spec:** `docs/superpowers/specs/2026-11-12-temporarias-servidor-design.md` (S1–S12, textos aprovados). Base: o PR #604 (spec e ADR 0064).

## Restrições globais

- Prazos: `0` (desligar) e `86400 | 604800 | 7776000` na API do canal. `0` grava NULL; o campo ausente não mexe, igual a `slowmode_seconds`. `allow_view_once`: `*bool`, ausente não mexe, default `true` no banco.
- Migration **000207** (up e down).
- Textos de UI: só os aprovados da spec, mais os do #604. Nenhum outro.
- CRAP ≤ 15 em toda função tocada. `channel/handler.go` (362) e `ChannelFormModal.tsx` (237) não podem crescer mais que a montagem dos campos. Nenhum campo novo em god store.
- `channel` não importa `message`: tudo de `message` entra por interface injetada (molde `birthday/service.go`).
- Banco de teste: `TEST_DATABASE_URL`, num banco descartável e migrado. Go: `C:/PROGRA~1/Go/bin/go.exe`. Nunca rodar `go fmt`/`gofmt -w`/`prettier --write` no repo (checkout em CRLF).
- Commits em português, sem atribuição a IA. Push e PR só com confirmação.

## Foco de revisão

1. Membro que ganhou o cargo do canal privado depois do envio tenta abrir: 403 (Tarefa 5).
2. Membro que perdeu o acesso ao canal depois do envio tenta abrir: recusado pelo `CanRead` (Tarefa 6).
3. Moderador com *Gerenciar mensagens* que não é destinatário: não abre (403), mas apaga a mensagem (Tarefa 6).
4. Mensagem de canal vencida: some da lista, dos fixados e da resposta antes da limpeza; a limpeza publica o delete pela sala do canal (Tarefas 3 e 4).
5. Canal com `allow_view_once = false`: o envio com `view_once` é recusado (400) mesmo vindo de um cliente antigo (Tarefa 5).

---

### Tarefa 1: migration e campos do canal

**Arquivos:**
- Criar `backend/migrations/000207_channel_disappearing.{up,down}.sql`, com o SQL da spec.
- Modificar `backend/internal/channel/model.go`: `DisappearingSeconds *int` (json `disappearing_seconds`) e `AllowViewOnce bool` (json `allow_view_once`).
- Modificar `repository.go`, nos SELECTs que leem `slowmode_seconds` e no `Update`: `disappearing_seconds = CASE WHEN $n::int IS NULL THEN disappearing_seconds WHEN $n = 0 THEN NULL ELSE $n END` e `allow_view_once = COALESCE($m, allow_view_once)`.
- Criar `backend/internal/channel/disappearing.go`, com `ValidChannelDisappearing(seconds int) bool` (0, 86400, 604800, 7776000).
- Modificar `slowmode.go`: `UpdateInput` ganha `DisappearingSeconds *int` e `AllowViewOnce *bool`, e o `validate()` recusa com `ErrInvalidDisappearing` (nova sentinela em `disappearing.go`), que o handler mapeia para 400 `invalid_disappearing`. O handler só repassa os campos do JSON.
- Modificar `audit.go`: `audit.Diff` de `disappearing_seconds` e `allow_view_once`.

- [ ] Testes RED:
  - unidade: `ValidChannelDisappearing`, e `validate` com 3600 → `ErrInvalidDisappearing`;
  - handler: 3600 → 400 `invalid_disappearing`;
  - banco: o update grava 604800, depois 0 vira NULL, o campo ausente não mexe, `allow_view_once` false/true, e o SELECT devolve os dois;
  - auditoria: a mudança gera o diff dos dois campos.
- [ ] GREEN. CRAP ≤ 15. Commit `feat(canais): prazo temporário e visualização única no canal`.

### Tarefa 2: aviso de sistema ao trocar o prazo do canal

**Arquivos:**
- Em `channel/disappearing.go`: `type ChannelNoticePoster interface { PostChannelNotice(ctx, channelID, authorID, content string) error }` e a injeção no `channel.Service` por setter.
- No update: quando `disappearing_seconds` muda de valor de fato, posta `conversation.DisappearingNotice(actorName, seconds)`. Se o import de `conversation` em `channel` criar ciclo, mova `DisappearingNotice` para um pacote neutro (`internal/disappearing`) e use nos dois lugares.
- O autor é quem mudou (S12). O nome vem do mesmo lookup do #604 (`ActorNameFrom`).
- Criar `message/channel_notice.go`: `func (s *Service) PostChannelNotice(...)` delega para `CreateSystemChannelMessage` com `kind = "disappearing"`.
- Ligar em `cmd/wire_chat_channels.go`.

- [ ] Testes RED:
  - fake: trocar 0 → 604800 posta o texto exato "Ana ativou as mensagens temporárias. Novas mensagens vão sumir após 7 dias.";
  - salvar o mesmo valor não posta;
  - desligar posta "Ana desativou as mensagens temporárias.";
  - falha ao postar não desfaz a gravação, e o `channel:update` sai mesmo assim (mesma ordem do R1 do #604);
  - banco: o aviso fica com `expires_at IS NULL` com o modo ligado.
- [ ] GREEN. CRAP ≤ 15. Commit `feat(canais): aviso ao trocar o prazo das mensagens temporárias`.

### Tarefa 3: validade no INSERT de canal, enquete e leituras

**Arquivos:**
- `message/insert.go`: `expiresAtDaConversaSQL` vira `expiresAtDaSalaSQL` = `COALESCE((SELECT … FROM conversations c WHERE c.id = $4), (SELECT … FROM channels ch WHERE ch.id = $3))`. O comentário documenta que `$3 = channel_id` e `$4 = conversation_id` em todo INSERT que usa a constante (`insertMessageSQL` e `insertForwarded`).
- `message/poll_repository.go` (S11): o INSERT da enquete grava `expires_at` pela mesma expressão, com sala e posições conferidas.
- `notExpired` em `ListByChannel` (as duas queries) e em `pin_repository.go` (alias `m`; conferir o join `cpm`).

- [ ] Testes RED (banco):
  - mensagem de canal com o modo ligado tem `expires_at` ≈ +24 h; sem o modo, NULL;
  - aviso de sistema NULL;
  - encaminhar para um canal com o modo ligado herda a validade;
  - enquete num canal e numa DM com o modo ligado tem `expires_at`;
  - vencida some de `ListByChannel` e dos fixados.
- [ ] GREEN. CRAP ≤ 15. Commit `feat(canais): mensagens do canal ganham prazo e somem das leituras`.

### Tarefa 4: limpeza também em canal

**Arquivos:** `message/expiry.go` e `expiry_repository.go`.
- `DeleteExpired` e `ExpireViewOnce` deixam de filtrar `conversation_id IS NOT NULL`. `ExpiredMessage` e `ExpiredViewOnce` ganham `ChannelID string`.
- `publishDelete` e `publishViewOnceUpdates`: numa mensagem de canal, o evento leva `ChannelID` e `ServerID` (resolvido pelo `ChannelResolver.ChannelServerID` já usado no `message.Service`, injetado no sweeper) e não leva `UserIDs`. O cache de participantes fica só para conversa. O `Expired: true` continua.

- [ ] Testes RED:
  - fake: uma mensagem de canal vencida gera `DeleteEvent{ChannelID, ServerID, Expired: true}` sem `UserIDs`;
  - visualização única de canal expirada publica `UpdateEvent` pelo canal;
  - banco: `DeleteExpired` apaga canal e conversa; `ExpireViewOnce` pega anexo de canal.
- [ ] GREEN. CRAP ≤ 15. Commit `feat(canais): limpeza de mensagens vencidas e visualização única em canal`.

### Tarefa 5: enviar visualização única no canal

**Arquivos:** `message/view_once.go`, `view_once_service.go`, `view_once_repository.go`, `create_handler.go`, `conversation_handler.go`.
- `ViewOncePreparer.Prepare(ctx, room Room, authorID string, attachmentIDs []string, stickerID, gifURL *string) error`. `MarkViewOnce(ctx, attachmentID, uploaderID string, room Room, recipientIDs []string)` filtra `channel_id` ou `conversation_id` conforme a sala.
- Destinatários no canal: o `permission.Service.Snapshot(serverID)` (interface pequena) dá os membros com `ViewChannel|ReadHistory` no canal, menos o autor, menos `users.is_bot` (uma consulta `SELECT id FROM users WHERE id = ANY($1) AND is_bot`).
- Recusas (`ErrInvalidViewOnce`, que vira 400):
  - `allow_view_once = false`;
  - canal de sistema;
  - tipo diferente de texto ou voz.

  Para isso, ler o canal com uma interface pequena que devolve `AllowViewOnce`, `IsSystem`, `Type` e `ServerID`.
- `create_handler.go`: o 400 fixo para `view_once` (R5 do #604) vira `prepareViewOnce` com `Room{ChannelID}`, igual ao handler da DM. O `CanWrite` continua antes.

- [ ] Testes RED:
  - fake de snapshot: canal privado com cargo "A" dá destinatários = só os membros com "A", sem o autor e sem o bot;
  - recusas por `allow_view_once` false, por canal de sistema e por tipo;
  - banco: `MarkViewOnce` em canal grava os destinatários e recusa anexo de outro canal;
  - handler de canal: `view_once` ok dá 201, e sem `CanWrite` não chama `Prepare`.
- [ ] GREEN. CRAP ≤ 15. Commit `feat(canais): enviar foto ou vídeo de visualização única no canal`.

### Tarefa 6: abrir e servir no canal

**Arquivos:** `view_once_service.go` (`openable`, `Open`, `publishUpdate`) e `attachment_handler.go` (a montagem da `Room` no `ServeFile`).
- O ramo de canal usa `CanRead(Room{ChannelID})`, publica o `UpdateEvent{ChannelID, ServerID}` e mantém a exigência de estar em `view_once_recipients`.

- [ ] Testes RED (banco e handler):
  - destinatário do canal abre (200) e serve com Range (206);
  - quem ganhou o cargo depois → 403;
  - quem perdeu o acesso ao canal → recusado (404 do `CanRead`);
  - moderador com *Gerenciar mensagens* que não é destinatário → 403 ao abrir, e o `DELETE` da mensagem → 200;
  - o token de mídia comum → 404;
  - a abertura publica a atualização pela sala do canal.
- [ ] GREEN. CRAP ≤ 15. Commit `feat(canais): abrir e servir a visualização única no canal`.

### Tarefa 7: *Editar canal* e auditoria (frontend)

**Arquivos** (`frontend/src/renderer/src/`):
- `features/servers/api` (tipos do canal: `disappearing_seconds?: number | null`, `allow_view_once?: boolean`) e o payload do update.
- Criar `features/servers/components/ChannelDisappearingField.tsx`: seletor com as opções de `features/disappearing/lib` (valor 0 = Desativadas) e o texto de ajuda aprovado "As novas mensagens do canal somem depois do prazo. As que já foram enviadas não mudam."
- Criar `features/servers/components/ChannelViewOnceField.tsx`: `Switch` com o rótulo "Visualização única" e a descrição aprovada "Membros podem mandar fotos e vídeos que cada pessoa abre uma vez. Nem a moderação consegue abrir."
- `ChannelFormModal.tsx`: monta os dois campos onde está o `ChannelSlowmodeField`, com a mesma condição (editar canal de texto ou voz que não é de sistema). O form state envia os campos.
- `features/auditlog/lib/auditDetails.ts`: `disappearing_seconds` ("Mensagens temporárias", com o formato "Desativadas" / "7 dias") e `allow_view_once` ("Visualização única": "Ligada" / "Desligada").

- [ ] Testes RED:
  - markup dos campos (textos exatos, aria);
  - o form envia `disappearing_seconds` e `allow_view_once`;
  - formato da auditoria.
- [ ] GREEN, typecheck e check-design. Commit `feat(canais): prazo temporário e visualização única em Editar canal`.

### Tarefa 8: canal no chat (frontend)

**Arquivos:**
- Criar `features/disappearing/components/ChannelDisappearingMark.tsx`: só leitura, `ClockIcon` com o rótulo curto e `aria-label` "Mensagens temporárias". Montar no cabeçalho do canal de texto, onde o canal é renderizado (achar a página do canal em `features/chat/pages` ou `features/servers`).
- `features/disappearing/hooks/useDisappearing.ts`: aceita a sala do canal, lendo `disappearing_seconds` de `useServerStore(s => s.channels)` (só leitura).
- `ChatComposer.tsx`: a faixa vale em canal. O olho aparece em canal quando `allow_view_once` está ligado e o canal não é de sistema (troca o `!p.isChannel` por uma regra pura `viewOnceAllowedIn(room, channel)` com teste).

- [ ] Testes RED:
  - `viewOnceAllowedIn` (DM sempre; canal só com `allow_view_once` e não de sistema);
  - `useDisappearing` em canal;
  - markup do indicador.
- [ ] GREEN, typecheck e check-design. Commit `feat(canais): faixa, indicador e visualização única no chat do canal`.

### Tarefa 9: e2e e verificação

- Estender `scripts/e2e-mensagens-temporarias.mjs` com:
  - servidor com canal privado (cargo "A") e membros com e sem o cargo;
  - prazo do canal com o aviso;
  - vencida que some e é apagada;
  - visualização única com só o cargo abrindo;
  - membro que ganha o cargo depois → 403;
  - moderador → 403 ao abrir, mas apaga;
  - `allow_view_once` false → 400.
- `node scripts/affected-tests.mjs pr` com `TEST_DATABASE_URL`; CRAP; check-structure e check-design.
- Commit `test(canais): e2e por API das temporárias e da visualização única em canal`.
