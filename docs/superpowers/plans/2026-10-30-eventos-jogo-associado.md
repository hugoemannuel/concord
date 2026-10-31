# Jogo associado ao evento (Fase 2) Implementation Plan

> **Para agentes:** SUB-SKILL OBRIGATÓRIA: use `superpowers:subagent-driven-development` (recomendado) ou `superpowers:executing-plans`. Os passos usam checkbox (`- [ ]`).

**Goal:** O evento ganha um jogo opcional (catálogo da atividade ou nome livre) que aparece no cartão, no detalhe e nas DMs do bot, e um selo "Jogando" em quem confirmou e está com o jogo aberto.

**Architecture:** Coluna `server_events.game_name` (texto). Backend valida e repassa o nome; o app escolhe pelo catálogo `shared/gameCatalog.ts` e casa o selo com a atividade que já chega em tempo real (`usePresenceActivityStore`). Sem tabela nova, sem dependência nova.

**Tech Stack:** Go + pgx; React + Zustand + Vitest. Spec: `docs/superpowers/specs/2026-10-30-eventos-jogo-associado-design.md`.

## Global Constraints

- Português em código, comentários, testes, UI e commits; sem atribuição a IA em commits e PR; commits convencionais.
- CRAP ≤ 15 em toda função tocada (baseline: `scratchpad/crap2-antes.txt`, maior 12); arquivo ≤ 400 linhas; nada novo em god stores.
- Textos aprovados (DM): antecedência `🔔 O evento "{título}" começa em {N}, no servidor {servidor}. Jogo: {jogo}. A sala abre na hora de começar.`; começou `📅 O evento "{título}" está começando agora. Jogo: {jogo}. Entre na sala #{canal}, no servidor {servidor}.`; sem sala `📅 O evento "{título}" está começando agora, no servidor {servidor}. Jogo: {jogo}.` O trecho "Jogo: …" só existe quando há jogo (os textos sem jogo ficam como estão). Rótulos: "Jogo (opcional)", "Nenhum jogo", "Outro jogo…", "Nome do jogo", selo "Jogando".
- Jogo: até 64 caracteres, sem espaços nas pontas, sem caractere de controle; vazio = sem jogo. Em evento em andamento o jogo fica travado (`event_running`).
- Ambiente: `GO=<scratchpad>/godl/go/bin/go.exe`; Postgres descartável em `TEST_DATABASE_URL`; `frontend/postcss.config.mjs` temporário nunca vai para commit; commits com caminhos explícitos. Sem `gofmt -w`/`prettier --write` em arquivo existente grande (só nos que criei; em arquivos existentes, edite a mão).

## Estrutura de arquivos

Backend (`backend/internal/event/`): `model.go`, `validate.go`, `service.go`, `repository.go`, `repository_schedule.go`, `texts.go`, `scheduler.go`, `handler.go` (alterados); `backend/migrations/000179_event_game.{up,down}.sql` (novos).
App (`frontend/src/renderer/src/features/events/`): `api/events.ts`, `lib/eventForm.ts`, `components/EventForm.tsx`, `EventListItem.tsx`, `EventDetail.tsx`, `GoingList.tsx` (alterados); `lib/eventGame.ts`, `components/GameField.tsx`, `components/EventGame.tsx` (novos).

---

### Task 1: Banco, modelo e validação do jogo

**Files:** `backend/migrations/000179_event_game.up.sql`/`.down.sql`; `model.go`; `validate.go`; `validate_test.go`.

**Interfaces:** Produz `Event.GameName *string` (`json:"game_name"`), `Input.GameName string` (`json:"game_name"`), `ErrInvalidGame`, `func (in Input) cleanText() (Input, error)` agora também limpa/valida o jogo (mantém a assinatura).

- [ ] **Step 1: Teste (falha)** em `validate_test.go`: casos que recusam com `ErrInvalidGame` — jogo com 65 caracteres e com caractere de controle (`"CS\x00"`); casos que aceitam — `"  Minecraft  "` vira `"Minecraft"`, 64 caracteres passa, vazio fica `""`. O jogo inválido também é recusado pela edição simples (`cleanText` direto).
- [ ] **Step 2: Ver falhar** (`go test ./internal/event -run Game`): `undefined: ErrInvalidGame` / campo inexistente.
- [ ] **Step 3: Implementar.** Migration up: `ALTER TABLE server_events ADD COLUMN game_name VARCHAR(64);` (com comentário citando a spec); down: `ALTER TABLE server_events DROP COLUMN IF EXISTS game_name;`. `model.go`: campo em `Event` (depois de `DurationMinutes`) e em `Input`; `ErrInvalidGame = errors.New("o nome do jogo precisa ter até 64 caracteres, sem símbolos de controle")`; `MaxGameRunes = 64`. `validate.go`: em `cleanText`, `in.GameName = strings.TrimSpace(in.GameName)`; recusar se `utf8.RuneCountInString > MaxGameRunes` ou se algum rune satisfaz `unicode.IsControl`.
- [ ] **Step 4: Passar** e `go vet ./internal/event`.
- [ ] **Step 5: Commit** `feat(eventos): coluna e validação do jogo do evento`.

### Task 2: Service, repositório e HTTP

**Files:** `service.go`, `repository.go`, `handler.go`, `service_test.go`, `repository_db_test.go`, `handler_test.go`.

**Interfaces:** Consome Task 1. Produz: `Event.apply` grava `GameName` (`nil` se vazio); `sameSchedule` compara o jogo; `eventSelect`/`scanEvent`/`Create`/`Update` levam `game_name` (não o `UpdateBasics`); `invalid_game` (400) na tabela de erros.

- [ ] **Step 1: Testes (falham).** `service_test.go`: criar com jogo grava `GameName`; criar sem jogo deixa `nil`; editar troca o jogo; **em andamento**, mudar o jogo volta `ErrEventRunning` e manter o mesmo passa (edição simples). `repository_db_test.go`: o jogo vai e volta pelo `Create`/`Find`/`ListUpcoming`/`Update` e sem jogo volta `nil`; `UpdateBasics` não mexe no jogo. `handler_test.go`: `ErrInvalidGame` → 400 `invalid_game`.
- [ ] **Step 2: Ver falhar.**
- [ ] **Step 3: Implementar.** `apply`: `e.GameName = nilIfEmpty(in.GameName)` (helper de 3 linhas). `sameSchedule`: acrescenta `!sameValue(in.gamePtr(), e.GameName, equal string)` (reuse `sameValue`); compare `nilIfEmpty(in.GameName)` com `e.GameName`. `repository.go`: `e.game_name` no `eventSelect` (depois de `e.duration_minutes`), `&e.GameName` no `scanEvent` na mesma posição, `game_name` no INSERT e no UPDATE (renumere os parâmetros). `handler.go`: `{ErrInvalidGame, http.StatusBadRequest, "invalid_game"}`.
- [ ] **Step 4: Passar** com Postgres (`go test ./internal/event`).
- [ ] **Step 5: Commit** `feat(eventos): o jogo vai e volta pelo servico e pelo repositorio`.

### Task 3: Jogo nas DMs do bot

**Files:** `scheduler.go` (`DueReminder.Game string`), `repository_schedule.go` (`ClaimDue` lê `COALESCE(e.game_name, '')`), `texts.go`, `scheduler_test.go`, `repository_schedule_db_test.go`.

- [ ] **Step 1: Testes (falham).** `TestReminderText`: os 6 casos atuais continuam iguais **sem jogo**; novos casos com `Game: "Minecraft"` batendo exatamente com os 3 textos aprovados (antecedência, começou com sala, começou sem sala). DB: `ClaimDue` devolve `Game` do evento (e `""` sem jogo).
- [ ] **Step 2: Ver falhar.**
- [ ] **Step 3: Implementar.** `texts.go`: `gameSentence(d) string` devolve `" Jogo: X."` quando há jogo, senão `""`; `reminderText` insere na posição dos textos aprovados (antecedência: depois do servidor e antes de "A sala abre…"; começou com sala: logo depois de "agora."; sem sala: no fim). `ClaimDue`: coluna extra no `RETURNING` e no `Scan`.
- [ ] **Step 4: Passar** e commit `feat(eventos): a DM do bot diz o jogo do evento`.

### Task 4: Lógica pura do jogo no app

**Files:** `api/events.ts`; `lib/eventGame.ts` + `lib/eventGame.test.ts`; `lib/eventForm.ts` + `lib/eventForm.test.ts`.

**Interfaces:** Produz (`eventGame.ts`): `GAME_OPTIONS: {value: string; label: string}[]` (os nomes de `GAMES`), `OTHER_GAME = '__outro__'`, `NO_GAME = ''`, `gameChoiceOf(name: string | null): {choice: string; custom: string}`, `gameNameOf(choice: string, custom: string): string`, `normalizeGame(name: string): string` (minúsculas, sem acento, sem espaços nas pontas), `isPlayingGame(activityName: string | undefined, eventGame: string | null): boolean`. `ServerEvent.game_name: string | null`, `EventInput.game_name: string`; valores do formulário ganham `gameChoice` e `customGame`.

- [ ] **Step 1: Testes (falham).** `eventGame.test.ts`: `GAME_OPTIONS` tem os 15 do catálogo; `gameChoiceOf(null)` → sem jogo; `gameChoiceOf('Minecraft')` → escolha `Minecraft`; `gameChoiceOf('Meu jogo')` → `OTHER_GAME` com `custom: 'Meu jogo'`; `gameNameOf` o inverso (e `custom` com espaços é limpo); `normalizeGame('  Counter-Strike 2 ')`/acentos; `isPlayingGame('valorant', 'VALORANT')` verdadeiro, com jogos diferentes e com `undefined`/`null` falso. `eventForm.test.ts`: `emptyForm` sem jogo; `toInput` manda `game_name` (catálogo, outro, nenhum); "Outro jogo…" vazio vira sem jogo ou erro? (**erro**: `'Digite o nome do jogo.'`); nome com mais de 64: `'O nome do jogo pode ter até 64 caracteres.'`; `formFromEvent` abre o seletor certo.
- [ ] **Step 2: Ver falhar.**
- [ ] **Step 3: Implementar** (`eventGame.ts` puro; `eventForm.ts` com `gameError(v)` pequeno; `api/events.ts` com os campos). Ajuste os fixtures dos testes existentes (`game_name: null`).
- [ ] **Step 4: Passar** (`npx vitest run src/renderer/src/features/events`) e `yarn typecheck`.
- [ ] **Step 5: Commit** `feat(eventos): lógica do jogo do evento no app`.

### Task 5: Campo do jogo no formulário

**Files:** `components/GameField.tsx` + `GameField.test.tsx`; `EventForm.tsx` + `EventForm.test.tsx`.

**Interfaces:** `GameField({choice, custom, disabled, onChange: (patch: {gameChoice?: string; customGame?: string}) => void})`.

- [ ] **Step 1: Testes (falham).** `GameField`: seletor com "Nenhum jogo", os 15 do catálogo e "Outro jogo…"; com `choice = OTHER_GAME` aparece o campo "Nome do jogo" (`maxLength` 64); com um jogo do catálogo ou nenhum, o campo de texto não aparece; `disabled` trava o seletor e o campo. `EventForm`: contém "Jogo (opcional)"; editar evento com jogo abre o seletor nele; **evento em andamento** trava o jogo.
- [ ] **Step 2: Ver falhar.**
- [ ] **Step 3: Implementar.** `<select name="event-game" className="glass-input">` com `<option className="bg-floating">`; campo de texto com `glass-input`, `name="event-game-custom"`. `EventForm` insere `<GameField …/>` depois da duração e passa `disabled={running}`.
- [ ] **Step 4: Passar**, `check-design.mjs`, typecheck. Commit `feat(eventos): campo de jogo no formulario do evento`.

### Task 6: Cartão, detalhe e selo "Jogando"

**Files:** `components/EventGame.tsx` + `EventGame.test.tsx`; `EventListItem.tsx`; `EventDetail.tsx`; `GoingList.tsx` + `GoingList.test.tsx`; `EventsPanelBody.test.tsx`.

**Interfaces:** `EventGame({name, className})` (nada sem nome); `GoingList` ganha `game: string | null` e `running: boolean` e mostra o selo para quem `isPlayingGame(byUser[userId]?.name, game)` com `running`; busca a atividade com `useChatStore.getState().fetchPresenceFor(ids)` só quando há jogo e o evento está em andamento.

- [ ] **Step 1: Testes (falham).** `EventGame`: com nome mostra o logo (`GameIcon`) e o nome; sem nome não renderiza nada. `EventsPanelBody`: cartão e detalhe mostram o jogo quando há; sem jogo não aparece "Jogo". `GoingList`: com `running` e atividade igual, o selo "Jogando" aparece só nessa pessoa; sem `running`, ou sem jogo no evento, ou atividade diferente, ninguém tem selo.
- [ ] **Step 2: Ver falhar.**
- [ ] **Step 3: Implementar.** `EventGame` usa `GameIcon` de `features/activity` e `text-ds-sm`; `EventListItem`/`EventDetail` incluem `<EventGame name={event.game_name}/>` (`min-w-0`, `truncate` no cartão); `EventDetail` passa `game` e `running={isRunning(event)}` ao `GoingList`; selo com token `text-success`/`bg-success/10`, texto "Jogando".
- [ ] **Step 4: Passar** (eventos + servers), design, structure, typecheck.
- [ ] **Step 5: Commit** `feat(eventos): jogo no cartão e no detalhe, e selo Jogando`.

### Task 7: Docs, changelog e verificação

- [ ] `docs/EVENTOS.md`: regra "Jogo", rota/JSON (`game_name`), erro `invalid_game`, texto da DM; nota de changelog nova em `changelog/pending/2026-10-30-eventos-jogo.md` (um arquivo novo, sem editar os publicados); atualizar a seção "Ordem de entrega" da spec (o #462 já entrou na `develop`).
- [ ] Verificação visual 360/768/1280 px (harness temporário em `frontend/.harness`, removido depois): formulário com seletor e "Outro jogo…", cartão e detalhe com e sem jogo.
- [ ] `node scripts/affected-tests.mjs pr` e `node scripts/crap.mjs` (guardar a saída "depois").
- [ ] Commit `docs(eventos): guia, changelog e spec da fase 2`.

## Auto-revisão
Cobertura da spec: banco e validação (T1), service/repositório/HTTP e jogo travado em andamento (T2), DMs (T3), opções, casamento e formulário puro (T4), campo e "Outro jogo…" (T5), cartão, detalhe e selo (T6), docs, responsivo e verificação (T7). Fora de escopo respeitado (sem appid, sem filtro, sem XP). Tipos conferidos entre as tarefas (`GameName`/`game_name`, `isPlayingGame`, `OTHER_GAME`).
