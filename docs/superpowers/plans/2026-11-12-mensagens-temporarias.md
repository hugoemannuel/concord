# Mensagens temporárias e visualização única: plano de implementação

> **Para agentes:** SUB-SKILL OBRIGATÓRIA: use superpowers:subagent-driven-development (recomendado) ou superpowers:executing-plans para executar tarefa a tarefa. Passos com checkbox (`- [ ]`).

**Objetivo:** DMs e grupos ganham modo de mensagens temporárias (24 h / 7 d / 90 d) e foto/vídeo de visualização única, com a regra garantida no servidor, no desktop e no app web.

**Arquitetura:** `expires_at` gravado na mensagem pelo próprio INSERT (a partir de `conversations.disappearing_seconds`), filtro `notExpired` em toda leitura e um `ExpirySweeper` a cada minuto que apaga e publica o `message:delete`. Visualização única: o anexo pendente é marcado antes do envio (com o retrato dos destinatários), sai de `attachments` para `view_once` na serialização, e o arquivo só é servido com um JWT `view_once` de 5 min emitido por `POST /attachments/:id/open`.

**Stack:** Go 1.26 (Gin, pgx), Postgres, React + Zustand + Tailwind v4, Electron.

**Spec:** `docs/superpowers/specs/2026-11-12-mensagens-temporarias-design.md` (decisões D1–D16, textos aprovados). ADR: `docs/adr/0064-mensagens-temporarias-e-visualizacao-unica.md`.

## Restrições globais

- Prazos válidos: `86400`, `604800`, `7776000` ou `null` (desativado). Outro valor → 400.
- Token `view_once`: TTL **5 min**, claim `type: "view_once"` + id do anexo. Mídia não aberta expira **14 dias** após o envio.
- Migration **000205** (up e down). ADR **0064** (mudar status para "aceito" na Tarefa 1).
- Só conversa (`conversation_id`). Canal: `view_once` → 400; o modo não existe.
- Textos de UI: **exatamente** os da seção "Textos aprovados" da spec. Nada de texto novo sem aprovação.
- CRAP ≤ 15 em toda função tocada; `handler.go` (426) e `search.go` (591) saem do PR menores. Nenhum campo novo em `chatStore`/`callStore`/`serverStore`.
- Ícones de `shared/ui/icons` (`ClockIcon`, `EyeIcon`), botões `IconButton`/`Button`/`CloseButton`, tokens de cor/texto, `focus-ring`. Sem emoji em UI nova.
- Sem dependência nova. Commits em português, convencionais, **sem Co-Authored-By nem atribuição a IA**. Commit estrutural separado do de comportamento.
- **Banco para testes:** Docker Desktop com o container `concord-postgres` (concord-user/concord-password, 127.0.0.1:5432). Crie um banco descartável e exporte `TEST_DATABASE_URL` antes de `affected-tests`/`crap` (sem ele, funções de repositório medem 0% e o CRAP estoura). Go: `GO='C:/PROGRA~1/Go/bin/go.exe'`.
- Falhas que já existem na develop neste Windows e não são deste PR: `linuxGpu`/`piperAssets` (vitest) e testes de `scripts` com YAML CRLF.

## Foco de revisão

1. **Mensagem vencida entre dois ticks do sweeper**: não aparece em lista, busca, prévia da DM, não lidas, favoritos nem resposta. Coberto pelos testes de banco da Tarefa 4.
2. **Duas aberturas ao mesmo tempo** (dois cliques, duas abas): só uma ganha o token. Coberto pelo `ON CONFLICT DO NOTHING` + teste na Tarefa 8.
3. **Envio falha depois de marcar o anexo como visualização única**: o anexo continua pendente e o `Janitor` o apaga em 24 h. Nada vaza, porque o anexo nunca virou mensagem. Teste na Tarefa 7.
4. **App antigo (Android) recebe mensagem de visualização única**: `attachments` vem sem o anexo e o token `media` dá 404 no arquivo. Teste na Tarefa 8.
5. **Quem entrou no grupo depois do envio tenta abrir**: 403. Teste na Tarefa 8.

---

### Tarefa 0 (estrutural): tirar responsabilidades de `handler.go` e `search.go`

**Arquivos:**
- Criar: `backend/internal/message/conversation_handler.go`. Mover de `handler.go` só `CreateConversationMessage` e `canSendToConversation`, sem mudar nada.
- Criar: `backend/internal/message/search_dates.go`. Mover de `search.go` `ParseSearchDate` e `searchDateRange`, sem mudar nada.

- [ ] **Passo 1:** mover o código, rodar `gofmt -w` só nos 4 arquivos.
- [ ] **Passo 2:** `cd backend && go build ./... && go vet ./internal/message && go test ./internal/message`. Esperado: PASS, sem mudança de comportamento.
- [ ] **Passo 3:** commit `refactor(message): handler de DM e datas da busca em arquivos próprios`.

### Tarefa 1: migration e campos novos

**Arquivos:**
- Criar: `backend/migrations/000205_disappearing_view_once.up.sql` / `.down.sql`. SQL exato na seção "Banco" da spec, incluindo `view_once_recipients` e `attachment_views`.
- Modificar: `backend/internal/conversation/model.go`: `Conversation.DisappearingSeconds *int \`json:"disappearing_seconds"\``.
- Modificar: `backend/internal/conversation/repository.go`: `convColumns` + `scanConversation` leem `c.disappearing_seconds`.
- Modificar: `backend/internal/message/model.go`: `Message.ExpiresAt *time.Time \`json:"expires_at,omitempty"\`` e `Message.ViewOnce *ViewOnceMedia \`json:"view_once,omitempty"\``. O tipo novo fica em `view_once.go` (abaixo).
- Criar: `backend/internal/message/view_once.go` só com o tipo:
  `type ViewOnceMedia struct { ID string \`json:"id"\`; Kind string \`json:"kind"\`; Gone bool \`json:"gone"\`; ViewerIDs []string \`json:"viewer_ids"\`; RecipientCount int \`json:"recipient_count"\` }`
- Modificar: `docs/adr/0064-...md`: Status "aceito".

- [ ] **Passo 1:** escrever o teste de banco `TestConversationLeDisappearingSeconds` em `conversation/disappearing_db_test.go`. Ele cria uma DM, faz `UPDATE conversations SET disappearing_seconds = 604800` e espera `FindByID(...).DisappearingSeconds == 604800`. Com NULL, espera `nil`.
- [ ] **Passo 2:** rodar com `TEST_DATABASE_URL`. Esperado: FAIL (a coluna não existe).
- [ ] **Passo 3:** escrever a migration e os campos. Depois `node scripts/check-migrations.mjs`.
- [ ] **Passo 4:** `go test ./internal/conversation ./internal/message`. Esperado: PASS.
- [ ] **Passo 5:** commit `feat(dm): colunas de mensagens temporárias e visualização única`.

### Tarefa 2: ligar e desligar o modo na conversa

**Arquivos:**
- Criar: `backend/internal/conversation/disappearing.go`:
  - `var ErrInvalidDisappearing = errors.New("invalid disappearing duration")`
  - `func ValidDisappearing(seconds *int) error` (aceita nil, 86400, 604800, 7776000)
  - `func DisappearingNotice(actorName string, seconds *int) string`. Monta o texto aprovado: `"<nome> ativou as mensagens temporárias. Novas mensagens vão sumir após 24 horas|7 dias|90 dias."` ou `"<nome> desativou as mensagens temporárias."`
  - `func (r *Repository) SetDisappearing(ctx, conversationID string, seconds *int) error`
  - `type NoticePoster interface { PostConversationNotice(ctx context.Context, conversationID, authorID, content, kind string) error }`
  - `type DisappearingService struct` com `repo`, `isParticipant func`, `actorName func(ctx, userID) (string, error)`, `notices NoticePoster`, `publish func(eventType, conversationID string)`. O método é `Set(ctx, userID, conversationID string, seconds *int) error`: valida, confere que é participante (`ErrNotParticipant`, a sentinela que já existe), grava, posta o aviso com `kind = "disappearing"` e publica o `conversation:update` existente (`EventUpdate`) aos membros.
  - Handler `PUT /conversations/:id/disappearing`, corpo `{ "seconds": number|null }`: 400 no prazo inválido, 403 para quem não participa, 204 no sucesso. A rota fica no `routes.go` do domínio.
- Criar: `backend/internal/message/conversation_notice.go`: `func (s *Service) PostConversationNotice(ctx, conversationID, authorID, content, kind string) error`, que grava com `SystemKind = &kind` e publica `message:create` aos participantes. É o espelho de `CreateSystemChannelMessage` para conversa.
- Modificar: `backend/cmd/wire_chat.go` (ou o `wire_` onde o conversation handler é montado) para ligar o `DisappearingService`. O nome de quem trocou vem do repositório de usuários que já existe (display_name, ou username como reserva).

**Interfaces produzidas:** `conversation.ValidDisappearing`, `message.Service.PostConversationNotice`.

- [ ] **Passo 1:** testes que falham, em `conversation/disappearing_test.go` (fakes, sem banco):
  - `TestValidDisappearing`: nil, 86400, 604800 e 7776000 passam; 0, 3600 e -1 dão `ErrInvalidDisappearing`.
  - `TestDisappearingNotice`: `("Ana", 604800)` → `"Ana ativou as mensagens temporárias. Novas mensagens vão sumir após 7 dias."`; `("Ana", nil)` → `"Ana desativou as mensagens temporárias."`
  - `TestSetDisappearingNaoParticipante`: `ErrNotParticipant`, sem gravar e sem aviso.
  - `TestSetDisappearingGravaAvisaEPublica`: o fake do repositório recebe 86400, o `NoticePoster` recebe kind `"disappearing"`, e `publish` é chamado com `EventUpdate`.
  - Teste de handler: prazo 3600 → 400; sucesso → 204.
- [ ] **Passo 2:** `go test ./internal/conversation -run Disappearing`. Esperado: FAIL (símbolos não definidos).
- [ ] **Passo 3:** implementar.
- [ ] **Passo 4:** teste de banco `TestSetDisappearingGrava` + `TestPostConversationNoticeNaoExpira` (`message/conversation_notice_db_test.go`). O aviso fica com `expires_at IS NULL` mesmo com o modo ligado, e depende da Tarefa 3. Se a Tarefa 3 ainda não existir, esse caso entra nela.
- [ ] **Passo 5:** PASS, `go vet`, commit `feat(dm): ligar e desligar mensagens temporárias`.

### Tarefa 3: `expires_at` gravado no envio

**Arquivos:**
- Modificar: `backend/internal/message/repository.go` e `attachment_repository.go`. Os dois INSERTs (`Create` e `CreateWithAttachments`) passam a usar uma constante só, `insertMessageSQL`, num arquivo novo `backend/internal/message/insert.go`, que inclui:
  `expires_at = CASE WHEN <system_kind> IS NULL THEN (SELECT now() + make_interval(secs => c.disappearing_seconds) FROM conversations c WHERE c.id = <conversation_id>) END`
  Canal: `conversation_id` NULL → NULL. Aviso de sistema → NULL (D5). Encaminhar herda o modo do destino sozinho (D14).
- Modificar: `messageColumns` (+ `m.expires_at`) e `scanMessageRow` (+ `&msg.ExpiresAt`).

- [ ] **Passo 1:** testes de banco em `message/expiry_db_test.go`:
  - `TestEnvioComModoLigadoGravaExpiresAt`: DM com 86400 → `expires_at` ≈ `created_at + 24h` (±5 s), e o JSON da mensagem traz `expires_at`.
  - `TestEnvioSemModoNaoExpira`: DM sem o modo e mensagem de canal → `nil`.
  - `TestEnvioComAnexoTambemExpira`: o caminho `CreateWithAttachments`.
  - `TestDesligarNaoMudaAntigas` (D4): desligar o modo não mexe no `expires_at` já gravado.
- [ ] **Passo 2:** FAIL. **Passo 3:** implementar. **Passo 4:** PASS com `TEST_DATABASE_URL`.
- [ ] **Passo 5:** `node scripts/crap.mjs --files backend/internal/message/repository.go backend/internal/message/attachment_repository.go backend/internal/message/insert.go` com `TEST_DATABASE_URL`. `Create`/`CreateWithAttachments` ≤ 15.
- [ ] **Passo 6:** commit `feat(dm): mensagens enviadas no modo temporário ganham prazo`.

### Tarefa 4: nada vencido aparece em leitura nenhuma

**Arquivos:**
- Criar em `insert.go` (ou `expiry_sql.go`): `const notExpired = "(m.expires_at IS NULL OR m.expires_at > now())"`.
- Aplicar em:
  - `findOne`;
  - as duas queries de `ListByConversation`;
  - o `LEFT JOIN messages rm` de `messageFrom` (`AND (rm.expires_at IS NULL OR rm.expires_at > now())`): resposta a mensagem vencida fica sem prévia, como "mensagem apagada";
  - `buildSearchWhere` (sempre, para canal e conversa); nos filtros `has:image`/`has:video` (subselect de `message_attachments`), também `AND NOT a.view_once` (D11), com o teste `TestBuscaHasImageIgnoraViewOnce`;
  - `ListFavorites`/`FindFavorite`;
  - `conversation.Repository.ListByUserID`, no `LATERAL` da prévia e no `COUNT` de não lidas, com a mesma condição escrita lá (o pacote `conversation` não importa `message`).

- [ ] **Passo 1:** testes de banco. Cada um cria uma mensagem com `expires_at = now() - 1 minute` e outra sem prazo, e confere que só a segunda aparece:
  - `TestListaDaConversaEscondeVencida`
  - `TestFindByIDEscondeVencida` (`pgx.ErrNoRows`)
  - `TestBuscaEscondeVencida`
  - `TestFavoritosEscondemVencida`
  - `TestRespostaAVencidaFicaSemPrevia`
  - `TestPreviaENaoLidasDaDMIgnoramVencida` (`conversation/preview_db_test.go`): a `last_message` é a anterior, e `unread_count` não conta a vencida.
- [ ] **Passo 2:** FAIL. **Passo 3:** implementar. **Passo 4:** PASS.
- [ ] **Passo 5:** CRAP com banco em `repository.go`, `search.go`, `favorite_repository.go`, `conversation/repository.go`. `ListByUserID` e `Search` ≤ 15. Se `Search` não chegar, a condição fica só em `buildSearchWhere` (função pura, já testada).
- [ ] **Passo 6:** commit `feat(dm): mensagem vencida some de listas, busca e prévias`.

### Tarefa 5: `ExpirySweeper`

**Arquivos:**
- Criar: `backend/internal/message/expiry.go`:
  - `type ExpiredMessage struct { ID, ConversationID string; AttachmentIDs []string }`
  - `type expiryRepo interface { DeleteExpired(ctx context.Context, now time.Time, limit int) ([]ExpiredMessage, error); ExpireViewOnce(ctx context.Context, sentBefore time.Time) ([]string, error); ParticipantIDs(ctx context.Context, conversationID string) ([]string, error) }`
  - `type ExpirySweeper struct { repo expiryRepo; files FileRemover; publisher EventPublisher }`, `NewExpirySweeper(...)`, `Run(ctx, every time.Duration)`, `RunOnce(ctx, now time.Time) error`.
  - Lote de **500**, repetindo até vir menos que 500. Para cada mensagem: remove os arquivos (`files.Remove`, D15) e publica `PublishMessageDelete(DeleteEvent{ConversationID, UserIDs, MessageID})`. `ExpireViewOnce(now - 14*24h)` → remove esses arquivos.
  - `const ViewOnceTTL = 14 * 24 * time.Hour`
- Criar: `backend/internal/message/expiry_repository.go`:
  - `DeleteExpired`: CTE que seleciona os ids vencidos (`LIMIT`), junta os anexos e faz `DELETE ... RETURNING`.
  - `ExpireViewOnce`: `UPDATE message_attachments SET view_once_gone_at = now() WHERE view_once AND view_once_gone_at IS NULL AND message_id IS NOT NULL AND created_at < $1 RETURNING id`.
- Modificar: `backend/cmd/wire_chat.go`: `go message.NewExpirySweeper(...).Run(a.ctx, time.Minute)`, ao lado do `NewJanitor`.

- [ ] **Passo 1:** testes unitários com fakes, em `expiry_test.go`, no molde do `janitor_test.go`:
  - `TestSweeperApagaEPublica`: 2 vencidas → 2 `DeleteEvent` com os `UserIDs` certos e os arquivos removidos.
  - `TestSweeperRepeteEnquantoLoteCheio`: 500 e depois 3 → 2 chamadas.
  - `TestSweeperExpiraVisualizacaoUnicaApos14Dias`: `sentBefore == now - 14d` e os arquivos removidos.
  - `TestSweeperErroNoRepoNaoPublica`.
- [ ] **Passo 2:** testes de banco `TestDeleteExpiredSoApagaVencidas` e `TestExpireViewOnceSoAntigasNaoVistasPorTodos`.
- [ ] **Passo 3:** FAIL. **Passo 4:** implementar. **Passo 5:** PASS, CRAP ≤ 15.
- [ ] **Passo 6:** commit `feat(dm): limpeza periódica das mensagens vencidas`.

### Tarefa 6: token `view_once`

**Arquivos:**
- Criar: `backend/internal/auth/view_once_token.go`:
  - `const ViewOnceTokenTTL = 5 * time.Minute`
  - `func (s *Service) GenerateViewOnceToken(userID, attachmentID string) (string, time.Time, error)`
  - `func (s *Service) VerifyViewOnceToken(token, attachmentID string) (userID string, err error)`: só aceita `type == "view_once"` com o mesmo anexo; senão `ErrNotViewOnceToken`. O id do anexo vai num claim próprio. Se `Claims` não tiver campo livre, acrescentar `AttachmentID string \`json:"aid,omitempty"\``.

- [ ] **Passo 1:** testes em `view_once_token_test.go`:
  - gera e verifica com o mesmo anexo → userID;
  - outro anexo → erro;
  - token `media` → erro;
  - expirado (relógio injetado ou TTL de teste) → erro;
  - `AuthMiddleware` com token `view_once` → 401 (no teste do middleware que já existe).
- [ ] **Passo 2:** FAIL. **Passo 3:** implementar. **Passo 4:** PASS.
- [ ] **Passo 5:** commit `feat(auth): token de visualização única`.

### Tarefa 7: enviar com visualização única

**Arquivos:**
- Modificar `view_once.go`:
  - `var ErrInvalidViewOnce = errors.New("invalid view once message")`
  - `func validateViewOnce(attachmentIDs []string, stickerID, gifURL *string) error`: exatamente 1 anexo, sem figurinha e sem GIF (D6). Texto pode.
- Criar: `backend/internal/message/view_once_repository.go`: `MarkViewOnce(ctx, attachmentID, uploaderID, conversationID string, recipientIDs []string) error`, numa transação. Faz `UPDATE message_attachments SET view_once = true WHERE id=$1 AND uploader_id=$2 AND conversation_id=$3 AND message_id IS NULL AND kind IN ('image','video')`. Se 0 linhas, devolve `ErrInvalidViewOnce`. Em seguida insere os `view_once_recipients`.
- Criar: `backend/internal/message/view_once_service.go`: `type ViewOnceService struct` (repo, participantes, files, tokens, publisher). O método é `Prepare(ctx, conversationID, authorID string, attachmentIDs []string, stickerID, gifURL *string) error`, com destinatários = participantes − autor (D7).
- Modificar `conversation_handler.go` (Tarefa 0): o input ganha `ViewOnce bool \`json:"view_once"\``. Se for true, chama `h.viewOnce.Prepare(...)` **antes** de `service.CreateConversationMessage`. `ErrInvalidViewOnce` → 400. O handler de canal não muda e ignora o campo.

- [ ] **Passo 1:** testes:
  - `TestValidateViewOnce`: 0 ou 2 anexos, figurinha ou GIF → erro; 1 anexo + texto → ok.
  - `TestPrepareDestinatariosSemAutor`: fake de participantes `[a, b, c]`, autor `a` → `[b, c]`.
  - Banco `TestMarkViewOnceRecusaAudioEJaEnviado`: áudio, `file`, anexo de outro usuário ou já com `message_id` → `ErrInvalidViewOnce`.
  - Handler `TestCriarDMViewOnceInvalidoDa400`.
  - `TestEnvioFalhaDepoisDeMarcarDeixaPendente` (foco de revisão 3): marca, a criação falha, e o anexo continua com `message_id IS NULL`.
- [ ] **Passo 2:** FAIL. **Passo 3:** implementar. **Passo 4:** PASS, CRAP ≤ 15.
- [ ] **Passo 5:** commit `feat(dm): enviar foto ou vídeo de visualização única`.

### Tarefa 8: mostrar, abrir e servir

**Arquivos:**
- Modificar `attachment_repository.go`:
  - `AttachAttachments` ganha `AND NOT a.view_once` no SELECT e termina com `return r.attachViewOnce(ctx, messages)`.
  - `attachViewOnce` fica em `view_once_repository.go`. Ele preenche `Message.ViewOnce` com o id, o kind, `Gone` (`view_once_gone_at IS NOT NULL`), `ViewerIDs` (de `attachment_views`) e `RecipientCount`.
- Modificar `attachment.go`/`attachment_repository.go`: `storedAttachment` ganha `ViewOnce bool` e `ViewOnceGone bool`, lidos em `FindAttachment`.
- `view_once_service.go`:
  - `Open(ctx, attachmentID, userID string) (token string, expiresAt time.Time, err error)`, com as sentinelas `ErrViewOnceForbidden` (autor ou quem não é destinatário) e `ErrViewOnceGone` (já viu ou `gone`).
  - O INSERT em `attachment_views` usa `ON CONFLICT DO NOTHING`. 0 linhas → `ErrViewOnceGone`.
  - Depois do insert, se as visualizações forem iguais aos destinatários: marca `view_once_gone_at`, remove o arquivo e publica `PublishMessageUpdate` com a mensagem relida.
- Criar: `backend/internal/message/view_once_handler.go`: `POST /attachments/:id/open` → 200 `{ "token", "expires_at" }`, 403 ou 410. Rota em `attachment_routes.go`.
- Modificar `attachment_handler.go` `ServeFile`: busca o anexo antes de verificar o token.
  - Se `ViewOnce`: `VerifyViewOnceToken(token, id)`, e se `ViewOnceGone` → 404.
  - Senão: o `VerifyMediaToken` de hoje.
  - O `CanRead` continua igual. Se `ServeFile` passar de CRAP 15, extrair `verifyFileToken(a *storedAttachment, token string) (string, error)`.
  - `MediaTokens` ganha `VerifyViewOnceToken`.

- [ ] **Passo 1:** testes (banco + handler):
  - `TestListaTiraViewOnceDeAttachments`: a mensagem vem com `attachments` vazio e `view_once.kind == "image"` (foco de revisão 4).
  - `TestOpenAutorDa403`, `TestOpenQuemEntrouDepoisDa403` (foco 5).
  - `TestOpenSegundaVezDa410`.
  - `TestOpenConcorrenteSoUmGanha`: 2 goroutines → 1 token e 1 `ErrViewOnceGone` (foco 2).
  - `TestOpenUltimoDestinatarioApagaArquivoEPublica`.
  - `TestServeFileViewOnceRecusaTokenDeMidia` (404), `TestServeFileViewOnceRecusaTokenDeOutroAnexo` (404), `TestServeFileViewOnceAceitaTokenCertoComRange` (206), `TestServeFileViewOnceGoneDa404`.
- [ ] **Passo 2:** FAIL. **Passo 3:** implementar. **Passo 4:** PASS, CRAP ≤ 15.
- [ ] **Passo 5:** commit `feat(dm): abrir uma vez e servir só com o token da visualização`.

### Tarefa 9: encaminhar, push e prévia da DM

**Arquivos:**
- `forward.go` `checkForwardable`: `src.ViewOnce != nil` → `ErrNotForwardable` (D11).
- `backend/internal/push/mentions.go`: `func ViewOncePreview(kind string) string` → `"Foto de visualização única"` / `"Vídeo de visualização única"`. Em `notifier.go`, mensagem com `ViewOnce` usa essa prévia no corpo (com o texto da mensagem, se houver, antes do rótulo: `Preview(content, false)` quando não vazio).
- `conversation/repository.go` `ListByUserID`: no subselect de anexos, `WHEN bool_or(a.view_once) THEN CASE MIN(a.kind) WHEN 'video' THEN 'Vídeo de visualização única' ELSE 'Foto de visualização única' END` antes dos outros casos.

- [ ] **Passo 1:** testes:
  - `TestEncaminharViewOnceRecusa`;
  - `TestViewOncePreview`;
  - `TestNotificacaoViewOnceSemTexto` → `"Foto de visualização única"`;
  - banco `TestPreviaDaDMViewOnce`.
- [ ] **Passo 2:** FAIL. **Passo 3:** implementar. **Passo 4:** PASS, CRAP ≤ 15.
- [ ] **Passo 5:** commit `feat(dm): prévias e encaminhar respeitam a visualização única`.

### Tarefa 10: tipos e API do frontend

**Arquivos** (raiz `frontend/src/renderer/src/`):
- `features/chat/api/messages.ts`:
  - `Message.expires_at?: string | null`;
  - `Message.view_once?: ViewOnceMedia | null`, com `ViewOnceMedia = { id: string; kind: 'image' | 'video'; gone: boolean; viewer_ids: string[]; recipient_count: number }`;
  - `ExtraMessageData.viewOnce?: boolean`, que vira `view_once: true` no corpo de `sendConversationMessage`.
- `features/chat/api/conversations.ts`: `Conversation.disappearing_seconds?: number | null`.
- Criar `features/chat/disappearing/api/disappearing.ts`: `setDisappearing(conversationId: string, seconds: DisappearingSeconds | null): Promise<void>`.
- Criar `features/chat/viewOnce/api/viewOnce.ts`: `openViewOnce(attachmentId: string): Promise<{ token: string; expires_at: string }>`.
- Criar `features/chat/viewOnce/lib/viewOnceSrc.ts`: `viewOnceSrc(attachmentId: string, token: string): string`, a mesma URL de mídia que o `useMediaSrc` monta, trocando o token.

- [ ] **Passo 1:** testes vitest:
  - `sendConversationMessage` com `{ viewOnce: true }` manda `view_once: true`;
  - sem a flag não manda o campo;
  - `setDisappearing` faz PUT com `{ seconds }`;
  - `viewOnceSrc` monta a URL certa.
- [ ] **Passo 2:** FAIL (`npx vitest run <arquivos>`). **Passo 3:** implementar. **Passo 4:** PASS, `yarn typecheck`.
- [ ] **Passo 5:** commit `feat(chat): tipos e chamadas de mensagens temporárias e visualização única`.

### Tarefa 11: modo temporário na tela

**Arquivos** (`features/chat/disappearing/`):
- `lib/disappearing.ts`:
  - `type DisappearingSeconds = 86400 | 604800 | 7776000`;
  - `DISAPPEARING_OPTIONS` com os rótulos aprovados ("Desativadas", "24 horas", "7 dias", "90 dias");
  - `shortLabel(s): '24 h' | '7 d' | '90 d'`;
  - `bannerText(s)` → `"Mensagens temporárias ativadas: 7 dias"`;
  - `expiresInText(expiresAt: string, now: number)` → `"Some em 3 dias"`, `"Some em 5 horas"`, `"Some em 10 minutos"` (arredondado para cima);
  - `isExpired(m: Pick<Message,'expires_at'>, now: number): boolean`.
- `components/DisappearingButton.tsx`: `IconButton` com `ClockIcon`, `aria-label="Mensagens temporárias"`, destaque + `shortLabel` quando ligado. O menu é um popover com as 4 opções (radio, a atual marcada) e vira folha de baixo em `max-sm`. Esc e clique fora fecham. Chama `setDisappearing`. Toast de erro com o texto genérico que já existe no app para falha de rede.
- `components/DisappearingBanner.tsx`: faixa em `ChatComposer` quando a sala é conversa com o modo ligado.
- `components/ExpiryMark.tsx`: `ClockIcon` pequeno ao lado do horário em `MessageItem` quando `expires_at` existe, com `title` igual a `expiresInText`.
- `hooks/useDisappearing.ts`: lê `disappearing_seconds` da conversa em `useChatStore(s => s.conversations)` (só leitura, sem campo novo no store).
- `hooks/useHideExpired.ts`: `useHideExpired(messages: Message[]): Message[]`, que filtra `isExpired` e reavalia a cada 30 s. Usado onde `ChatPane` monta as linhas.
- Montar o botão em `pages/DmChat.tsx` (ao lado de `DmCallButton`) e no cabeçalho de `pages/GroupChat.tsx`.

- [ ] **Passo 1:** testes:
  - `disappearing.test.ts`: todos os textos exatos acima e `isExpired` na borda (igual a `now` conta como vencida);
  - `DisappearingButton.test.tsx`: abre o menu, escolher "7 dias" chama `setDisappearing(id, 604800)`, e Esc fecha;
  - `useHideExpired.test.ts`: com timers falsos, a mensagem some quando o relógio passa do prazo.
- [ ] **Passo 2:** FAIL. **Passo 3:** implementar. **Passo 4:** PASS, typecheck.
- [ ] **Passo 5:** commit `feat(chat): botão, faixa e relógio das mensagens temporárias`.

### Tarefa 12: aviso de sistema na DM

**Arquivos:**
- Criar `features/chat/disappearing/components/DisappearingNotice.tsx`: linha centralizada com `ClockIcon` e `message.content`, no estilo de `MessageDayDivider` (linha, texto `text-ds-xs text-muted`), com o horário em `title`.
- `components/MessageItem.tsx:284`: `system_kind === 'disappearing'` → `<DisappearingNotice>`; os outros continuam no `SystemMessage`.

- [ ] **Passo 1:** teste `DisappearingNotice.test.tsx`: mostra o texto e não mostra o selo "Servidor". `MessageItem.test.tsx`: `system_kind 'disappearing'` não renderiza o `SystemMessage`.
- [ ] **Passo 2:** FAIL. **Passo 3:** implementar. **Passo 4:** PASS.
- [ ] **Passo 5:** commit `feat(chat): aviso de mensagens temporárias na DM`.

### Tarefa 13: enviar com visualização única (composer)

**Arquivos** (`features/chat/viewOnce/`):
- `lib/viewOnce.ts`: `canViewOnce(drafts: DraftAttachment[], isConversation: boolean): boolean`. Verdadeiro só com 1 rascunho `image` ou `video`, `status === 'done'` ou `'uploading'`, e em conversa.
- `hooks/useViewOnceDraft.ts`: `{ viewOnce, toggle, allowed }`, que volta a `false` quando `allowed` vira falso ou depois do envio.
- `components/ViewOnceToggle.tsx`: `IconButton` com `EyeIcon`, `aria-pressed`, label "Visualização única". Quando ligado, mostra o selo "Visualização única" no cartão.
- `components/ComposerAttachments.tsx`: prop opcional `viewOnce?: { on: boolean; toggle: () => void }`. Sem ela (comentários de propostas), nada muda.
- `components/ChatComposer.tsx` + `hooks/useComposerSend.ts`: passar `{ viewOnce: true }` como `extra` em `sendToRoom` quando ligado.

- [ ] **Passo 1:** testes:
  - `viewOnce.test.ts` (`canViewOnce`: 2 anexos, áudio ou canal → false);
  - `ComposerAttachments.test.tsx`: sem a prop não há botão; com ela, o botão alterna `aria-pressed`;
  - `useComposerSend`: com `viewOnce`, `sendToRoom` recebe `extra.viewOnce === true`.
- [ ] **Passo 2:** FAIL. **Passo 3:** implementar. **Passo 4:** PASS.
- [ ] **Passo 5:** commit `feat(chat): marcar foto ou vídeo como visualização única`.

### Tarefa 14: receber e abrir (pílula e visualizador)

**Arquivos** (`features/chat/viewOnce/`):
- `lib/viewOnce.ts`: `pillState(v: ViewOnceMedia, authorId: string, meId: string): 'unseen' | 'seen' | 'sender' | 'expired'` e `pillLabel(state, kind, v)` com os textos exatos: "Foto"/"Vídeo", "Aberta", "Foto de visualização única"/"Vídeo de visualização única" + "Vista por X de Y" quando `recipient_count > 1`, e "Expirou". `gone` sem ter visto conta como `expired`.
- `components/ViewOncePill.tsx`: botão (só no estado `unseen`). Nos outros estados é texto, com `EyeIcon`.
- `components/ViewOnceViewer.tsx`:
  - Abre a confirmação na primeira vez (`Button` "Ver" / "Cancelar", texto de foto ou de vídeo). Em "Ver", chama `openViewOnce`.
  - Mostra a mídia em tela cheia (`fixed inset-0`, `object-contain`), com `CloseButton` e Esc.
  - Bloqueia `onContextMenu`, `draggable={false}` e, no vídeo, `controlsList="nodownload noplaybackrate"` com `disablePictureInPicture`.
  - Ao fechar ou desmontar, solta o `src`.
  - Chama `window.api?.contentProtection?.set(true|false)`.
  - Se `useCallStore` disser que a pessoa está compartilhando a tela (só leitura), mostra "Quem assiste sua tela vê esta janela em preto." quando o `window.api` existe.
- `components/MessageParts.tsx` (ou onde `MessageAttachments` é renderizado): com `message.view_once`, renderizar `ViewOncePill` + `ViewOnceViewer`.
- `lib/polls.ts` `messagePreviewParts`: com `view_once` e sem texto → `{ icon: 'image' | 'video' (o que existir no tipo Preview), text: 'Foto de visualização única' | 'Vídeo de visualização única' }`.

- [ ] **Passo 1:** testes:
  - `viewOnce.test.ts`: os 4 estados e os textos exatos, incluindo "Vista por 2 de 3";
  - `ViewOnceViewer.test.tsx`: "Cancelar" não chama `openViewOnce`, "Ver" chama uma vez e liga a proteção (mock `window.api.contentProtection.set`), fechar desliga, e Esc fecha;
  - `polls.test.ts`: prévia da visualização única.
- [ ] **Passo 2:** FAIL. **Passo 3:** implementar. **Passo 4:** PASS.
- [ ] **Passo 5:** commit `feat(chat): pílula e visualizador da visualização única`.

### Tarefa 15: proteção de print no Electron

**Arquivos:**
- Criar `frontend/src/main/window/contentProtection.ts`: `registerContentProtection(ipcMain)`. Faz `ipcMain.handle('window:content-protection', (e, on: boolean) => BrowserWindow.fromWebContents(e.sender)?.setContentProtection(on === true))`. Registrar onde os outros handlers de janela são registrados, passando pelo `ipcGuard` se for o padrão da pasta.
- Criar `frontend/src/preload/contentProtectionApi.ts`: `{ set(on: boolean): Promise<void> }`. Uma linha em `preload/index.ts` (`contentProtection: contentProtectionApi`) e o tipo em `preload/index.d.ts`.

- [ ] **Passo 1:** teste `contentProtection.test.ts`: com `ipcMain` e `BrowserWindow` falsos, `true` → `setContentProtection(true)`, e um valor que não é boolean → `false`.
- [ ] **Passo 2:** FAIL. **Passo 3:** implementar. **Passo 4:** PASS.
- [ ] **Passo 5:** commit `feat(desktop): proteção contra print enquanto a visualização única está aberta`.

### Tarefa 16: verificação e responsivo

- [ ] **Passo 1:** `node scripts/affected-tests.mjs pr` com `TEST_DATABASE_URL` e `GO`. Esperado: verde, exceto as falhas conhecidas do Windows listadas em Restrições globais. Guardar a saída para o PR.
- [ ] **Passo 2:** `node scripts/crap.mjs` (base origin/develop) com banco. Nenhuma função tocada acima de 15. Comparar com `../crap-baseline.txt` para o PR.
- [ ] **Passo 3:** `node scripts/check-structure.mjs` e `node scripts/check-design.mjs`. `handler.go` < 426 e `search.go` < 591 linhas.
- [ ] **Passo 4:** skill `web-design-guidelines` nos componentes novos. Conferir 360/768/1280 px no `yarn dev:web`: botão do relógio, menu ou folha, faixa, pílula e visualizador.
- [ ] **Passo 5:** verificação de ponta a ponta da spec (duas contas, web e desktop). Registrar o que foi e o que não foi testado à mão.
