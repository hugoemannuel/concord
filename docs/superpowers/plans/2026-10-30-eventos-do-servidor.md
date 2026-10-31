# Eventos do servidor (Fase 1) Implementation Plan

> **Para agentes:** SUB-SKILL OBRIGATÓRIA: use `superpowers:subagent-driven-development` (recomendado) ou `superpowers:executing-plans` para executar este plano tarefa a tarefa. Os passos usam checkbox (`- [ ]`).

**Goal:** Quem tem a permissão Gerenciar eventos cria eventos no servidor (banner, título, descrição, canal de voz, recorrência opcional); membros respondem Vou / Não vou; o Salinha Bot manda DM a quem disse Vou, nas antecedências escolhidas (no máximo 2) e na hora de começar.

**Architecture:** Pacote novo `backend/internal/event/` (model → repository → service → handler → routes) mais um ticker de ~30 s sobre a tabela `event_reminders` (`UPDATE … FOR UPDATE SKIP LOCKED … RETURNING`, no padrão do aniversário). A recorrência guarda só a regra e o índice da ocorrência atual; `next_start_at` é calculado por função pura. O app ganha `features/events/` (store Zustand próprio, painel responsivo) e o item "Eventos" no menu do servidor.

**Tech Stack:** Go 1.26 + Gin + pgx; React + Zustand + Tailwind v4; Vitest. Sem dependência nova.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-10-30-eventos-do-servidor-design.md` (fonte de verdade; este plano a refina em dois pontos: coluna `finished_at` e o banner guardado por id, ver Task 3 e Task 7).
- Código, comentários, testes, UI, commits e logs em **português**. Commits convencionais (`feat(eventos): …`, `refactor:`, `docs:`). **Nunca** atribuição a IA em commit ou PR (sem `Co-Authored-By`).
- **CRAP ≤ 15** em toda função tocada; arquivo ≤ 400 linhas. Funções pequenas, como em `birthday/`.
- Permissão `ManageEvents = 1 << 14` (único bit livre abaixo de 2^31; `TestAllBitsFitInt32` exige tudo < 1<<31). Fora do @everyone.
- Lembretes: lista fixa `1440, 60, 30, 15, 10, 5` (minutos), **no máximo 2** por evento, padrão `[10, 5]`; o aviso na hora (offset 0) sempre existe.
- Título até 100 caracteres, descrição até 1000, início no futuro, canal de voz do mesmo servidor.
- Banner: imagem estática PNG/JPEG/WEBP até 10 MB, pasta `uploads/event-media` (fora dos anexos do chat).
- Textos da DM (aprovados): `🔔 O evento "{título}" começa em {N} minutos em #{canal}, no servidor {servidor}.` e `📅 O evento "{título}" está começando agora em #{canal}, no servidor {servidor}.` ({N} minutos vira "1 hora" / "1 dia"). Os demais textos de UI passam por aprovação no PR.
- UI: 360/768/1280 px, toque e teclado; ícones só de `shared/ui/icons`; `Button`/`IconButton`/`CloseButton`; texto `text-ds-*`; raio da escala; `focus-ring`; cores por token (`docs/ai/exemplos/design.md`). Sem `prettier --write` / `gofmt -w` no repo todo (checkout CRLF): só nos arquivos tocados.
- Nada de campos novos em `serverStore`, `chatStore`, `callStore`; nada em `call/service.go`.
- Ambiente (Windows): `export GO="<scratchpad>/godl/go/bin/go.exe"` na mesma chamada de shell que roda `go`/`crap.mjs`/`affected-tests.mjs`. `frontend/postcss.config.mjs` (temporário, `export default { plugins: [] }`) existe só para os testes rodarem: **nunca commitar** (commitar sempre com caminhos explícitos, nunca `git add -A`). Testes de banco: `TEST_DATABASE_URL` (Postgres descartável e já migrado); sem ele os testes de repositório fazem `t.Skip`.
- Baseline de CRAP (antes de mexer): `scratchpad/crap-antes.txt` (nenhuma função acima de 15).

## Estrutura de arquivos

Backend, novo `backend/internal/event/`:

| Arquivo | Responsabilidade |
|---|---|
| `model.go` | tipos (`Event`, `Input`, `RSVP`), erros, lista de antecedências, `marshalEvent` |
| `validate.go` | validação pura do `Input` |
| `recurrence.go` | `OccurrenceAt`, `Finished` (funções puras) |
| `repository.go` | CRUD de eventos + criação dos lembretes (pgx) |
| `repository_rsvp.go` | respostas de presença |
| `repository_schedule.go` | `ClaimDue`, `Advance` (usado pelo ticker) |
| `service.go` | regras: permissão, canal, evento + lembretes numa transação, broadcast |
| `handler.go`, `handler_rsvp.go`, `routes.go` | HTTP |
| `banner.go` | upload e entrega do banner |
| `scheduler.go` | ticker, decisão de aviso velho, envio da DM |
| `texts.go` | textos da DM |

Fora do pacote: `backend/migrations/000177_create_server_events.{up,down}.sql`, `backend/cmd/wire_events.go` (+ uma linha em `wire.go`), permissão em `backend/internal/permission/perms.go`.

Frontend, novo `frontend/src/renderer/src/features/events/{api,lib,store,components}/`; alterados `features/servers/lib/{permissions,permissionCatalog,sidebarMenus}.ts`, `features/servers/components/ServerHeaderMenu.tsx`, `shared/api/ws.ts` (tipos de evento).

---

### Task 1: Permissão Gerenciar eventos (bit 14)

**Files:**
- Modify: `backend/internal/permission/perms.go`, `backend/internal/permission/snapshot_test.go`, `backend/internal/permission/testdata/vectors.json`
- Modify: `frontend/src/renderer/src/features/servers/lib/permissions.ts`, `permissionCatalog.ts`, `permissions.test.ts`
- Modify: `docs/CARGOS.md`

**Interfaces:**
- Produces: `permission.ManageEvents int64 = 1 << 14`; nome `"MANAGE_EVENTS"`; `Perm.MANAGE_EVENTS = 1 << 14` no app. Fora de `DefaultEveryone`.

- [ ] **Step 1: Ajustar os testes que usavam o bit 14 como "desconhecido" e escrever o teste novo (falha)**

Em `snapshot_test.go`, em `TestNormalizeDropsUnknownBits`, troque `1<<14` por `1<<35` nas duas ocorrências. Acrescente ao final do arquivo:

```go
func TestManageEventsIsAdminOnlyByDefault(t *testing.T) {
	if ManageEvents != 1<<14 {
		t.Fatalf("ManageEvents = %d, o contrato com o app é 1<<14", ManageEvents)
	}
	if DefaultEveryone&ManageEvents != 0 {
		t.Fatal("Gerenciar eventos não pode vir no @everyone")
	}
	if All&ManageEvents == 0 {
		t.Fatal("dono e Administrador precisam ter Gerenciar eventos")
	}
	if Names["MANAGE_EVENTS"] != ManageEvents {
		t.Fatal("MANAGE_EVENTS fora do mapa Names")
	}
}
```

Em `permissions.test.ts`, no teste `normalize descarta bits desconhecidos`, troque `(1 << 14) | (1 << 29)` por `(1 << 31)`.

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd backend && "$GO" test ./internal/permission -run 'TestManageEventsIsAdminOnlyByDefault' -v`
Expected: FAIL (`undefined: ManageEvents`).

- [ ] **Step 3: Implementar no backend**

Em `perms.go`, antes de `AddEmojis`:

```go
	// Gerenciar eventos: criar, editar e cancelar eventos do servidor
	// (docs/superpowers/specs/2026-10-30-eventos-do-servidor-design.md). Vale
	// no servidor todo. Fora do @everyone. É o único bit livre abaixo de 1<<31.
	ManageEvents int64 = 1 << 14
```

Em `Names`: `"MANAGE_EVENTS": ManageEvents,`. Em `All`: acrescente `| ManageEvents` ao fim da última linha da soma.

- [ ] **Step 4: Vetores compartilhados e app**

Em `testdata/vectors.json`, siga o formato dos nomes já usados: acrescente `MANAGE_EVENTS` onde `ADD_EMOJIS` aparece na lista de bits conhecidos e inclua um caso `compute` em que um cargo com `MANAGE_EVENTS` tem a permissão e o @everyone não (copie o formato de um caso existente). Em `permissions.ts`: `MANAGE_EVENTS: 1 << 14,` no objeto `Perm` (e em `ALL_PERMISSIONS` se ele soma explicitamente, como `ADD_EMOJIS`). Em `permissionCatalog.ts`: entrada "Gerenciar eventos" no grupo Geral, escopo servidor, com a descrição "Criar, editar e cancelar eventos do servidor." (texto sujeito a aprovação no PR).

- [ ] **Step 5: CARGOS.md**

Na tabela de permissões, grupo Geral, depois de "Adicionar emojis": `| | Gerenciar eventos | Criar, editar e cancelar eventos do servidor (os membros veem e respondem sem esta permissão). Vale no servidor todo e **fora do @everyone**. |`.

- [ ] **Step 6: Rodar tudo o que a mudança toca**

Run: `cd backend && "$GO" test ./internal/permission -v` e `cd frontend && npx vitest run src/renderer/src/features/servers/lib/permissions.test.ts src/renderer/src/features/servers/lib/permissionCatalog`
Expected: PASS (inclui `TestAllBitsFitInt32` e os vetores).

- [ ] **Step 7: Commit**

```bash
git add backend/internal/permission frontend/src/renderer/src/features/servers/lib/permissions.ts frontend/src/renderer/src/features/servers/lib/permissionCatalog.ts frontend/src/renderer/src/features/servers/lib/permissions.test.ts docs/CARGOS.md
git commit -m "feat(permissoes): Gerenciar eventos (bit 14, fora do @everyone)"
```

---

### Task 2: Recorrência (funções puras)

**Files:**
- Create: `backend/internal/event/recurrence.go`, `backend/internal/event/recurrence_test.go`

**Interfaces:**
- Produces:
  - `type Recurrence string` com `RecNone="none"`, `RecDaily="daily"`, `RecWeekly="weekly"`, `RecMonthly="monthly"` e `func (r Recurrence) Valid() bool`
  - `func OccurrenceAt(start time.Time, rule Recurrence, n int, loc *time.Location) time.Time` — a n-ésima ocorrência (n=0 é `start`)
  - `func Finished(rule Recurrence, until *time.Time, count *int, start time.Time, n int, loc *time.Location) bool` — a ocorrência de índice `n` já passa do fim da recorrência (ou, sem repetição, n ≥ 1)

- [ ] **Step 1: Teste (falha)**

```go
package event

import (
	"testing"
	"time"
)

var brt = time.FixedZone("BRT", -3*60*60)

func at(y int, m time.Month, d, h, min int) time.Time {
	return time.Date(y, m, d, h, min, 0, 0, brt)
}

func TestOccurrenceAt(t *testing.T) {
	start := at(2026, time.January, 31, 20, 0)
	cases := []struct {
		name string
		rule Recurrence
		n    int
		want time.Time
	}{
		{"zero é o início", RecWeekly, 0, start},
		{"diária", RecDaily, 3, at(2026, time.February, 3, 20, 0)},
		{"semanal", RecWeekly, 2, at(2026, time.February, 14, 20, 0)},
		{"mensal cai no último dia de fevereiro", RecMonthly, 1, at(2026, time.February, 28, 20, 0)},
		{"mensal volta ao dia 31 depois", RecMonthly, 2, at(2026, time.March, 31, 20, 0)},
		{"mensal vira o ano", RecMonthly, 12, at(2027, time.January, 31, 20, 0)},
		{"sem repetição sempre o início", RecNone, 5, start},
	}
	for _, c := range cases {
		if got := OccurrenceAt(start, c.rule, c.n, brt); !got.Equal(c.want) {
			t.Errorf("%s: %v, esperava %v", c.name, got, c.want)
		}
	}
}

func TestFinished(t *testing.T) {
	start := at(2026, time.March, 1, 20, 0)
	until := at(2026, time.March, 15, 23, 0)
	three := 3
	cases := []struct {
		name  string
		rule  Recurrence
		until *time.Time
		count *int
		n     int
		want  bool
	}{
		{"sem repetição acaba na 2ª", RecNone, nil, nil, 1, true},
		{"sem repetição ainda na 1ª", RecNone, nil, nil, 0, false},
		{"semanal sem fim nunca acaba", RecWeekly, nil, nil, 100, false},
		{"por contagem: índice 2 ainda cabe", RecWeekly, nil, &three, 2, false},
		{"por contagem: índice 3 passou", RecWeekly, nil, &three, 3, true},
		{"por data: dia 15 ainda cabe", RecWeekly, &until, nil, 2, false},
		{"por data: dia 22 passou", RecWeekly, &until, nil, 3, true},
	}
	for _, c := range cases {
		if got := Finished(c.rule, c.until, c.count, start, c.n, brt); got != c.want {
			t.Errorf("%s: %v, esperava %v", c.name, got, c.want)
		}
	}
}

func TestRecurrenceValid(t *testing.T) {
	for _, r := range []Recurrence{RecNone, RecDaily, RecWeekly, RecMonthly} {
		if !r.Valid() {
			t.Errorf("%q deveria ser válida", r)
		}
	}
	if Recurrence("yearly").Valid() || Recurrence("").Valid() {
		t.Error("regra desconhecida não pode ser válida")
	}
}
```

- [ ] **Step 2: Ver falhar**

Run: `cd backend && "$GO" test ./internal/event -run 'TestOccurrenceAt|TestFinished|TestRecurrenceValid' -v`
Expected: FAIL (`undefined: OccurrenceAt`).

- [ ] **Step 3: Implementar**

```go
// Package event cuida dos eventos agendados de cada servidor: criação por
// quem tem Gerenciar eventos, recorrência, presença e os avisos do Salinha Bot.
package event

import "time"

// Recurrence é a regra de repetição de um evento (presets, sem RRULE).
type Recurrence string

const (
	RecNone    Recurrence = "none"
	RecDaily   Recurrence = "daily"
	RecWeekly  Recurrence = "weekly"
	RecMonthly Recurrence = "monthly"
)

// Valid diz se a regra é uma das conhecidas.
func (r Recurrence) Valid() bool {
	switch r {
	case RecNone, RecDaily, RecWeekly, RecMonthly:
		return true
	}
	return false
}

// OccurrenceAt devolve a n-ésima ocorrência (n=0 é o próprio início). O mensal
// mantém o dia do início e, no mês que não tem esse dia, usa o último dia.
func OccurrenceAt(start time.Time, rule Recurrence, n int, loc *time.Location) time.Time {
	s := start.In(loc)
	switch rule {
	case RecDaily:
		return s.AddDate(0, 0, n)
	case RecWeekly:
		return s.AddDate(0, 0, 7*n)
	case RecMonthly:
		return monthlyAt(s, n, loc)
	}
	return s
}

func monthlyAt(s time.Time, n int, loc *time.Location) time.Time {
	first := time.Date(s.Year(), s.Month()+time.Month(n), 1, s.Hour(), s.Minute(), s.Second(), 0, loc)
	last := time.Date(first.Year(), first.Month()+1, 0, 0, 0, 0, 0, loc).Day()
	return time.Date(first.Year(), first.Month(), min(s.Day(), last), s.Hour(), s.Minute(), s.Second(), 0, loc)
}

// Finished diz se a ocorrência de índice n já está além do fim da recorrência.
// Sem repetição só existe a ocorrência 0.
func Finished(rule Recurrence, until *time.Time, count *int, start time.Time, n int, loc *time.Location) bool {
	if rule == RecNone {
		return n >= 1
	}
	if count != nil && n >= *count {
		return true
	}
	return until != nil && OccurrenceAt(start, rule, n, loc).After(*until)
}
```

- [ ] **Step 4: Ver passar**

Run: `cd backend && "$GO" test ./internal/event -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/internal/event/recurrence.go backend/internal/event/recurrence_test.go
git commit -m "feat(eventos): cálculo puro das ocorrências recorrentes"
```

---

### Task 3: Modelo, validação e migration

**Files:**
- Create: `backend/internal/event/model.go`, `validate.go`, `validate_test.go`
- Create: `backend/migrations/000177_create_server_events.up.sql`, `.down.sql`

**Interfaces:**
- Consumes: `Recurrence` (Task 2).
- Produces:
  - `AllowedOffsets = []int{1440, 60, 30, 15, 10, 5}`, `DefaultOffsets = []int{10, 5}`, `MaxOffsets = 2`
  - `Input{ChannelID, Title, Description string; BannerID *string; StartsAt time.Time; Recurrence Recurrence; RecurrenceUntil *time.Time; RecurrenceCount *int; ReminderOffsets []int}`
  - `Event` (JSON abaixo), `Going{UserID, Username, DisplayName string}`
  - erros: `ErrMissingPermission, ErrNotMember, ErrEventNotFound, ErrInPast, ErrInvalidTitle, ErrInvalidDescription, ErrInvalidRecurrence, ErrInvalidReminder, ErrTooManyReminders, ErrInvalidChannel, ErrEventEnded`
  - `func (in Input) normalize(now time.Time) (Input, error)` — devolve o input com antecedências ordenadas/sem repetição (padrão `DefaultOffsets` se vazio **e** nulo) ou o erro de domínio
  - `func marshalEvent(typ string, payload any) []byte`

- [ ] **Step 1: Teste (falha)**

```go
package event

import (
	"errors"
	"strings"
	"testing"
	"time"
)

func validInput(now time.Time) Input {
	return Input{
		ChannelID: "canal", Title: "Noite de jogos", StartsAt: now.Add(time.Hour),
		Recurrence: RecNone, ReminderOffsets: []int{10, 5},
	}
}

func TestNormalizeRejects(t *testing.T) {
	now := time.Date(2026, 11, 1, 12, 0, 0, 0, time.UTC)
	cases := []struct {
		name string
		edit func(*Input)
		want error
	}{
		{"título vazio", func(i *Input) { i.Title = "  " }, ErrInvalidTitle},
		{"título grande", func(i *Input) { i.Title = strings.Repeat("a", 101) }, ErrInvalidTitle},
		{"descrição grande", func(i *Input) { i.Description = strings.Repeat("a", 1001) }, ErrInvalidDescription},
		{"no passado", func(i *Input) { i.StartsAt = now.Add(-time.Minute) }, ErrInPast},
		{"regra desconhecida", func(i *Input) { i.Recurrence = "yearly" }, ErrInvalidRecurrence},
		{"antecedência fora da lista", func(i *Input) { i.ReminderOffsets = []int{7} }, ErrInvalidReminder},
		{"mais de 2 antecedências", func(i *Input) { i.ReminderOffsets = []int{30, 10, 5} }, ErrTooManyReminders},
		{"fim por contagem inválida", func(i *Input) { n := 0; i.RecurrenceCount = &n; i.Recurrence = RecWeekly }, ErrInvalidRecurrence},
	}
	for _, c := range cases {
		in := validInput(now)
		c.edit(&in)
		if _, err := in.normalize(now); !errors.Is(err, c.want) {
			t.Errorf("%s: erro %v, esperava %v", c.name, err, c.want)
		}
	}
}

func TestNormalizeAccepts(t *testing.T) {
	now := time.Date(2026, 11, 1, 12, 0, 0, 0, time.UTC)
	in := validInput(now)
	in.Title = "  Noite  "
	in.ReminderOffsets = []int{5, 10, 5}
	got, err := in.normalize(now)
	if err != nil {
		t.Fatal(err)
	}
	if got.Title != "Noite" {
		t.Errorf("título = %q", got.Title)
	}
	if len(got.ReminderOffsets) != 2 || got.ReminderOffsets[0] != 10 || got.ReminderOffsets[1] != 5 {
		t.Errorf("antecedências = %v, esperava [10 5] (maior primeiro, sem repetir)", got.ReminderOffsets)
	}
}

func TestNormalizeDefaultsOffsets(t *testing.T) {
	now := time.Date(2026, 11, 1, 12, 0, 0, 0, time.UTC)
	in := validInput(now)
	in.ReminderOffsets = nil
	got, err := in.normalize(now)
	if err != nil || len(got.ReminderOffsets) != 2 {
		t.Fatalf("nulo deve virar o padrão [10 5]: %v %v", got.ReminderOffsets, err)
	}
	in.ReminderOffsets = []int{}
	got, _ = in.normalize(now)
	if len(got.ReminderOffsets) != 0 {
		t.Errorf("lista vazia explícita = só o aviso na hora, veio %v", got.ReminderOffsets)
	}
}
```

- [ ] **Step 2: Ver falhar**

Run: `cd backend && "$GO" test ./internal/event -run TestNormalize -v` → FAIL (`undefined: Input`).

- [ ] **Step 3: `model.go`**

```go
package event

import (
	"encoding/json"
	"errors"
	"time"
)

// Antecedências que o moderador pode escolher (minutos). O aviso na hora de
// começar (0) sempre existe e não entra aqui.
var AllowedOffsets = []int{1440, 60, 30, 15, 10, 5}

// DefaultOffsets: o que vale quando o pedido não diz nada.
var DefaultOffsets = []int{10, 5}

// MaxOffsets: no máximo 2 antecedências por evento.
const MaxOffsets = 2

const (
	MaxTitleRunes       = 100
	MaxDescriptionRunes = 1000
)

var (
	ErrMissingPermission  = errors.New("você não tem permissão para gerenciar eventos neste servidor")
	ErrNotMember          = errors.New("você não é membro deste servidor")
	ErrEventNotFound      = errors.New("evento não encontrado")
	ErrInPast             = errors.New("o início do evento precisa estar no futuro")
	ErrInvalidTitle       = errors.New("o título precisa ter de 1 a 100 caracteres")
	ErrInvalidDescription = errors.New("a descrição pode ter até 1000 caracteres")
	ErrInvalidRecurrence  = errors.New("repetição inválida")
	ErrInvalidReminder    = errors.New("antecedência de aviso inválida")
	ErrTooManyReminders   = errors.New("escolha no máximo 2 antecedências de aviso")
	ErrInvalidChannel     = errors.New("escolha um canal de voz deste servidor")
	ErrEventEnded         = errors.New("este evento já terminou")
)

// Event é o evento como o app o recebe.
type Event struct {
	ID              string     `json:"id"`
	ServerID        string     `json:"server_id"`
	ChannelID       string     `json:"channel_id"`
	Scope           string     `json:"scope"`
	Title           string     `json:"title"`
	Description     string     `json:"description"`
	BannerID        *string    `json:"banner_id"`
	StartsAt        time.Time  `json:"starts_at"`
	NextStartAt     time.Time  `json:"next_start_at"`
	Recurrence      Recurrence `json:"recurrence"`
	RecurrenceUntil *time.Time `json:"recurrence_until"`
	RecurrenceCount *int       `json:"recurrence_count"`
	OccurrencesDone int        `json:"occurrences_done"`
	ReminderOffsets []int      `json:"reminder_offsets"`
	CreatedBy       string     `json:"created_by"`
	CanceledAt      *time.Time `json:"canceled_at,omitempty"`
	FinishedAt      *time.Time `json:"finished_at,omitempty"`
	CreatedAt       time.Time  `json:"created_at"`
	GoingCount      int        `json:"going_count"`
	MyRSVP          *bool      `json:"my_rsvp"`
}

// Going é quem disse "vou" na ocorrência atual.
type Going struct {
	UserID      string `json:"user_id"`
	Username    string `json:"username"`
	DisplayName string `json:"display_name"`
}

// Input é o que o moderador manda para criar ou editar.
type Input struct {
	ChannelID       string     `json:"channel_id"`
	Title           string     `json:"title"`
	Description     string     `json:"description"`
	BannerID        *string    `json:"banner_id"`
	StartsAt        time.Time  `json:"starts_at"`
	Recurrence      Recurrence `json:"recurrence"`
	RecurrenceUntil *time.Time `json:"recurrence_until"`
	RecurrenceCount *int       `json:"recurrence_count"`
	// nil = padrão [10, 5]; lista vazia = só o aviso na hora.
	ReminderOffsets []int `json:"reminder_offsets"`
}

func marshalEvent(typ string, payload any) []byte {
	data, err := json.Marshal(map[string]any{"type": typ, "payload": payload})
	if err != nil {
		return nil
	}
	return data
}
```

- [ ] **Step 4: `validate.go`**

```go
package event

import (
	"slices"
	"strings"
	"time"
	"unicode/utf8"
)

// normalize confere o pedido e devolve a versão limpa (título sem espaços nas
// pontas, antecedências do maior para o menor e sem repetição).
func (in Input) normalize(now time.Time) (Input, error) {
	in.Title = strings.TrimSpace(in.Title)
	in.Description = strings.TrimSpace(in.Description)
	if n := utf8.RuneCountInString(in.Title); n < 1 || n > MaxTitleRunes {
		return in, ErrInvalidTitle
	}
	if utf8.RuneCountInString(in.Description) > MaxDescriptionRunes {
		return in, ErrInvalidDescription
	}
	if !in.StartsAt.After(now) {
		return in, ErrInPast
	}
	if err := in.checkRecurrence(); err != nil {
		return in, err
	}
	offsets, err := cleanOffsets(in.ReminderOffsets)
	in.ReminderOffsets = offsets
	return in, err
}

func (in Input) checkRecurrence() error {
	if !in.Recurrence.Valid() {
		return ErrInvalidRecurrence
	}
	if in.Recurrence == RecNone && (in.RecurrenceUntil != nil || in.RecurrenceCount != nil) {
		return ErrInvalidRecurrence
	}
	if in.RecurrenceCount != nil && *in.RecurrenceCount < 1 {
		return ErrInvalidRecurrence
	}
	if in.RecurrenceUntil != nil && !in.RecurrenceUntil.After(in.StartsAt) {
		return ErrInvalidRecurrence
	}
	return nil
}

func cleanOffsets(raw []int) ([]int, error) {
	if raw == nil {
		return slices.Clone(DefaultOffsets), nil
	}
	seen := make(map[int]bool, len(raw))
	for _, m := range raw {
		if !slices.Contains(AllowedOffsets, m) {
			return nil, ErrInvalidReminder
		}
		seen[m] = true
	}
	if len(seen) > MaxOffsets {
		return nil, ErrTooManyReminders
	}
	out := make([]int, 0, len(seen))
	for m := range seen {
		out = append(out, m)
	}
	slices.SortFunc(out, func(a, b int) int { return b - a })
	return out, nil
}
```

- [ ] **Step 5: Migration**

`000177_create_server_events.up.sql`:

```sql
-- Eventos do servidor (docs/superpowers/specs/2026-10-30-eventos-do-servidor-design.md).
-- A recorrência guarda só a regra: next_start_at é a ocorrência atual e
-- occurrences_done o índice dela (OccurrenceAt em internal/event/recurrence.go).
CREATE TABLE server_events (
    id UUID PRIMARY KEY,
    server_id UUID NOT NULL REFERENCES servers (id) ON DELETE CASCADE,
    channel_id UUID NOT NULL REFERENCES channels (id) ON DELETE CASCADE,
    scope VARCHAR(16) NOT NULL DEFAULT 'server' CHECK (scope IN ('server')),
    title VARCHAR(100) NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    banner_id UUID,
    starts_at TIMESTAMPTZ NOT NULL,
    next_start_at TIMESTAMPTZ NOT NULL,
    recurrence VARCHAR(8) NOT NULL DEFAULT 'none' CHECK (recurrence IN ('none', 'daily', 'weekly', 'monthly')),
    recurrence_until TIMESTAMPTZ,
    recurrence_count INT CHECK (recurrence_count IS NULL OR recurrence_count >= 1),
    occurrences_done INT NOT NULL DEFAULT 0,
    reminder_offsets INT[] NOT NULL DEFAULT '{10,5}',
    created_by UUID REFERENCES users (id) ON DELETE SET NULL,
    canceled_at TIMESTAMPTZ,
    finished_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Lista do servidor (só os vivos) e varredura do ticker.
CREATE INDEX idx_server_events_server ON server_events (server_id, next_start_at)
    WHERE canceled_at IS NULL AND finished_at IS NULL;
CREATE INDEX idx_server_events_active ON server_events (next_start_at)
    WHERE canceled_at IS NULL AND finished_at IS NULL;

-- Presença da ocorrência atual; as antigas ficam para trás (a chave inclui a ocorrência).
CREATE TABLE event_rsvps (
    event_id UUID NOT NULL REFERENCES server_events (id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    occurrence_start TIMESTAMPTZ NOT NULL,
    going BOOLEAN NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (event_id, user_id, occurrence_start)
);

-- Fila do ticker: um aviso por (evento, ocorrência, antecedência). offset_minutes = 0 é o "começou".
CREATE TABLE event_reminders (
    id BIGSERIAL PRIMARY KEY,
    event_id UUID NOT NULL REFERENCES server_events (id) ON DELETE CASCADE,
    occurrence_start TIMESTAMPTZ NOT NULL,
    offset_minutes INT NOT NULL CHECK (offset_minutes >= 0),
    due_at TIMESTAMPTZ NOT NULL,
    sent_at TIMESTAMPTZ,
    UNIQUE (event_id, occurrence_start, offset_minutes)
);

CREATE INDEX idx_event_reminders_due ON event_reminders (due_at) WHERE sent_at IS NULL;
```

`000177_create_server_events.down.sql`:

```sql
DROP TABLE IF EXISTS event_reminders;
DROP TABLE IF EXISTS event_rsvps;
DROP TABLE IF EXISTS server_events;
```

- [ ] **Step 6: Ver passar e checar migrations**

Run: `cd backend && "$GO" test ./internal/event -v` e, na raiz, `node scripts/check-migrations.mjs`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add backend/internal/event backend/migrations/000177_create_server_events.up.sql backend/migrations/000177_create_server_events.down.sql
git commit -m "feat(eventos): modelo, validação e tabelas dos eventos"
```

---

### Task 4: Repositório (eventos e presença)

**Files:**
- Create: `backend/internal/event/repository.go`, `repository_rsvp.go`, `repository_db_test.go`

**Interfaces:**
- Consumes: `Event`, `Input`, `Going`, `Recurrence`, `OccurrenceAt` (Tasks 2–3).
- Produces (`*Repository`, `NewRepository(db *pgxpool.Pool) *Repository`):
  - `Create(ctx, e *Event, reminders []ReminderRow) error` — grava evento + lembretes numa transação
  - `ListUpcoming(ctx, serverID, userID string) ([]Event, error)` — vivos, com `going_count` e `my_rsvp` da ocorrência atual
  - `Find(ctx, serverID, eventID string) (*Event, error)` (`ErrEventNotFound` se não existe ou é de outro servidor)
  - `Update(ctx, e *Event, reminders []ReminderRow) error` — troca campos e **apaga/recria** os lembretes pendentes na mesma transação
  - `Cancel(ctx, serverID, eventID string) error` — marca `canceled_at` e apaga os lembretes pendentes
  - `IsVoiceChannel(ctx, serverID, channelID string) (bool, error)`
  - `SetRSVP(ctx, eventID, userID string, occurrence time.Time, going bool) error`, `ClearRSVP(...)`, `ListGoing(ctx, eventID string, occurrence time.Time) ([]Going, error)`
  - `type ReminderRow struct{ Occurrence time.Time; OffsetMinutes int; DueAt time.Time }` e `func reminderRows(occurrence time.Time, offsets []int, now time.Time) []ReminderRow` (sempre inclui offset 0; descarta linhas com `DueAt` antes de `now`)

- [ ] **Step 1: Teste puro de `reminderRows` + teste de banco (falha)**

Em `repository_db_test.go` (copie `eventDB`, `mustExec` e `seedUserAndServer` de `internal/emoji/repository_db_test.go`, ajustando o nome do pacote; acrescente `seedVoiceChannel(t, db, serverID, userID) string` que insere em `channels (id, server_id, name, created_by, type)` com `type='voice'`):

```go
func TestReminderRows(t *testing.T) {
	occ := time.Date(2026, 11, 1, 20, 0, 0, 0, time.UTC)
	now := occ.Add(-7 * time.Minute)
	rows := reminderRows(occ, []int{10, 5}, now)
	// 10 min antes já passou (o evento é daqui a 7): só 5 e o "na hora".
	if len(rows) != 2 || rows[0].OffsetMinutes != 5 || rows[1].OffsetMinutes != 0 {
		t.Fatalf("linhas = %+v", rows)
	}
	if !rows[0].DueAt.Equal(occ.Add(-5 * time.Minute)) {
		t.Errorf("due_at = %v", rows[0].DueAt)
	}
}

func TestRepositoryEventsAndRSVP(t *testing.T) {
	db, ctx := eventDB(t)
	repo := NewRepository(db)
	owner, server := seedUserAndServer(t, db, "Servidor de eventos")
	channel := seedVoiceChannel(t, db, server, owner)
	start := time.Now().Add(2 * time.Hour).Truncate(time.Second)

	e := &Event{ID: uuid.NewString(), ServerID: server, ChannelID: channel, Scope: "server",
		Title: "Noite", StartsAt: start, NextStartAt: start, Recurrence: RecWeekly,
		ReminderOffsets: []int{10, 5}, CreatedBy: owner}
	if err := repo.Create(ctx, e, reminderRows(start, e.ReminderOffsets, time.Now())); err != nil {
		t.Fatal(err)
	}
	if ok, _ := repo.IsVoiceChannel(ctx, server, channel); !ok {
		t.Error("o canal criado é de voz")
	}
	if err := repo.SetRSVP(ctx, e.ID, owner, start, true); err != nil {
		t.Fatal(err)
	}
	list, err := repo.ListUpcoming(ctx, server, owner)
	if err != nil || len(list) != 1 || list[0].GoingCount != 1 || list[0].MyRSVP == nil || !*list[0].MyRSVP {
		t.Fatalf("lista = %+v err=%v", list, err)
	}
	if going, _ := repo.ListGoing(ctx, e.ID, start); len(going) != 1 || going[0].UserID != owner {
		t.Errorf("quem vai = %+v", going)
	}
	if err := repo.ClearRSVP(ctx, e.ID, owner, start); err != nil {
		t.Fatal(err)
	}
	if err := repo.Cancel(ctx, server, e.ID); err != nil {
		t.Fatal(err)
	}
	if list, _ := repo.ListUpcoming(ctx, server, owner); len(list) != 0 {
		t.Errorf("evento cancelado não aparece: %+v", list)
	}
	var pending int
	_ = db.QueryRow(ctx, `SELECT COUNT(*) FROM event_reminders WHERE event_id = $1 AND sent_at IS NULL`, e.ID).Scan(&pending)
	if pending != 0 {
		t.Errorf("cancelar apaga os avisos pendentes, sobraram %d", pending)
	}
	if _, err := repo.Find(ctx, "00000000-0000-0000-0000-000000000000", e.ID); !errors.Is(err, ErrEventNotFound) {
		t.Errorf("evento de outro servidor = %v", err)
	}
}
```

- [ ] **Step 2: Ver falhar** — `"$GO" test ./internal/event -run 'TestReminderRows|TestRepositoryEventsAndRSVP' -v` → FAIL (`undefined: NewRepository`).

- [ ] **Step 3: Implementar `repository.go`**

Use o mesmo estilo do `emoji/repository.go` (pgx, `pgx.BeginFunc`). Pontos exatos:

```go
// eventColumns: a ordem que scanEvent lê.
const eventColumns = `e.id, e.server_id, e.channel_id, e.scope, e.title, e.description, e.banner_id,
	e.starts_at, e.next_start_at, e.recurrence, e.recurrence_until, e.recurrence_count,
	e.occurrences_done, e.reminder_offsets, e.created_by, e.canceled_at, e.finished_at, e.created_at`

type ReminderRow struct {
	Occurrence    time.Time
	OffsetMinutes int
	DueAt         time.Time
}

// reminderRows: os avisos de uma ocorrência. O "na hora" (0) sempre entra; os
// de antecedência que já passaram (evento criado em cima da hora) ficam de fora.
func reminderRows(occurrence time.Time, offsets []int, now time.Time) []ReminderRow {
	rows := make([]ReminderRow, 0, len(offsets)+1)
	for _, m := range append(slices.Clone(offsets), 0) {
		due := occurrence.Add(-time.Duration(m) * time.Minute)
		if m > 0 && due.Before(now) {
			continue
		}
		rows = append(rows, ReminderRow{Occurrence: occurrence, OffsetMinutes: m, DueAt: due})
	}
	return rows
}
```

`Create`: `pgx.BeginFunc` → `INSERT INTO server_events (...)` com todos os campos → `insertReminders(ctx, tx, e.ID, rows)` (um `INSERT … ON CONFLICT DO NOTHING` por linha). `ListUpcoming`:

```sql
SELECT <eventColumns>,
       COALESCE((SELECT COUNT(*) FROM event_rsvps r WHERE r.event_id = e.id
                 AND r.occurrence_start = e.next_start_at AND r.going), 0),
       (SELECT r.going FROM event_rsvps r WHERE r.event_id = e.id
                 AND r.occurrence_start = e.next_start_at AND r.user_id = $2)
FROM server_events e
WHERE e.server_id = $1 AND e.canceled_at IS NULL AND e.finished_at IS NULL
ORDER BY e.next_start_at, e.id
```

`Update`: na transação, `UPDATE server_events SET channel_id…, updated_at = NOW() WHERE id = $1 AND server_id = $2 AND canceled_at IS NULL` (0 linhas → `ErrEventNotFound`), `DELETE FROM event_reminders WHERE event_id = $1 AND sent_at IS NULL`, `insertReminders`. `Cancel`: `UPDATE … SET canceled_at = NOW()` + `DELETE FROM event_reminders WHERE event_id=$1 AND sent_at IS NULL`. `IsVoiceChannel`: `SELECT EXISTS(SELECT 1 FROM channels WHERE id=$1 AND server_id=$2 AND type='voice')` (valide UUID antes com `uuid.Validate`, devolvendo `false`). `Find` = a mesma consulta do `ListUpcoming` filtrando `e.id = $2 AND e.server_id = $1` e sem o filtro de cancelado (o service decide).

- [ ] **Step 4: `repository_rsvp.go`**

```go
func (r *Repository) SetRSVP(ctx context.Context, eventID, userID string, occurrence time.Time, going bool) error {
	_, err := r.db.Exec(ctx, `
		INSERT INTO event_rsvps (event_id, user_id, occurrence_start, going)
		VALUES ($1, $2, $3, $4)
		ON CONFLICT (event_id, user_id, occurrence_start)
		DO UPDATE SET going = EXCLUDED.going, updated_at = NOW()`,
		eventID, userID, occurrence, going)
	return err
}

func (r *Repository) ClearRSVP(ctx context.Context, eventID, userID string, occurrence time.Time) error {
	_, err := r.db.Exec(ctx, `DELETE FROM event_rsvps WHERE event_id = $1 AND user_id = $2 AND occurrence_start = $3`,
		eventID, userID, occurrence)
	return err
}

func (r *Repository) ListGoing(ctx context.Context, eventID string, occurrence time.Time) ([]Going, error) {
	rows, err := r.db.Query(ctx, `
		SELECT u.id, u.username, u.display_name
		FROM event_rsvps r JOIN users u ON u.id = r.user_id
		WHERE r.event_id = $1 AND r.occurrence_start = $2 AND r.going
		ORDER BY lower(u.display_name), u.id`, eventID, occurrence)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := make([]Going, 0)
	for rows.Next() {
		var g Going
		if err := rows.Scan(&g.UserID, &g.Username, &g.DisplayName); err != nil {
			return nil, err
		}
		out = append(out, g)
	}
	return out, rows.Err()
}
```

- [ ] **Step 5: Ver passar** — `TEST_DATABASE_URL=… "$GO" test ./internal/event -v` (sem a variável, o teste de banco é pulado; rode com Postgres descartável: `docker run -d --rm --name pg-eventos -e POSTGRES_PASSWORD=test -e POSTGRES_DB=concord_test -p 55432:5432 postgres:17-alpine` e aplique as migrations pelo `database.Connect`). Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/internal/event
git commit -m "feat(eventos): repositório de eventos e presença"
```

---

### Task 5: Service (regras, permissão e tempo real)

**Files:**
- Create: `backend/internal/event/service.go`, `service_rsvp.go`, `service_test.go`

**Interfaces:**
- Consumes: `*Repository` (Task 4) por uma interface local `store`, `Input.normalize`, `OccurrenceAt`.
- Produces: `NewService(store store, perms permChecker, members memberChecker, pub publisher) *Service` com
  `Create(ctx, serverID, actorID string, in Input) (*Event, error)`, `Update(ctx, serverID, eventID, actorID string, in Input) (*Event, error)`, `Cancel(ctx, serverID, eventID, actorID string) error`, `List(ctx, serverID, userID string) ([]Event, error)`, `SetRSVP(ctx, serverID, eventID, userID string, going bool) error`, `ClearRSVP(ctx, serverID, eventID, userID string) error`, `ListGoing(ctx, serverID, eventID, userID string) ([]Going, error)`. Eventos de tempo real: `event:create`, `event:update`, `event:delete` na sala `server:<id>` (payload: `Event`; `delete` leva `{server_id, event_id}`).
- Relógio injetável: campo `now func() time.Time` (padrão `time.Now`); `loc` = `America/Sao_Paulo` (como `birthday`).

- [ ] **Step 1: Testes com fakes (falham)** — `service_test.go` com um `fakeStore` em memória que implementa `store`, `fakePerms` (mapa `userID → int64`), `fakeMembers` e `fakePublisher` (guarda `room`/`event`). Casos:
  - `Create` sem `permission.ManageEvents` → `ErrMissingPermission` e nada gravado;
  - `Create` com a permissão (e com `permission.Administrator`) grava, define `NextStartAt = StartsAt`, `Scope="server"`, `OccurrencesDone=0`, gera lembretes `[10,5,0]` e publica `event:create` em `server:<id>`;
  - canal que `IsVoiceChannel` nega → `ErrInvalidChannel`;
  - `Update` de evento cancelado ou de outro servidor → `ErrEventNotFound`; mudar `StartsAt` recria os lembretes e zera `OccurrencesDone` e `NextStartAt = StartsAt`;
  - `Cancel` publica `event:delete`;
  - `SetRSVP` de não membro → `ErrNotMember`; de membro grava com `occurrence = e.NextStartAt`; em evento terminado (`FinishedAt != nil`) → `ErrEventEnded`;
  - `List` de não membro → `ErrNotMember`.

- [ ] **Step 2: Ver falhar** → FAIL (`undefined: NewService`).

- [ ] **Step 3: Implementar `service.go`**

```go
type store interface {
	Create(ctx context.Context, e *Event, reminders []ReminderRow) error
	Update(ctx context.Context, e *Event, reminders []ReminderRow) error
	Cancel(ctx context.Context, serverID, eventID string) error
	Find(ctx context.Context, serverID, eventID string) (*Event, error)
	ListUpcoming(ctx context.Context, serverID, userID string) ([]Event, error)
	IsVoiceChannel(ctx context.Context, serverID, channelID string) (bool, error)
	SetRSVP(ctx context.Context, eventID, userID string, occurrence time.Time, going bool) error
	ClearRSVP(ctx context.Context, eventID, userID string, occurrence time.Time) error
	ListGoing(ctx context.Context, eventID string, occurrence time.Time) ([]Going, error)
}

type permChecker interface {
	ServerPerms(ctx context.Context, serverID, userID string) (int64, error)
}

type memberChecker interface {
	IsMember(ctx context.Context, serverID, userID string) (bool, error)
}

type publisher interface {
	BroadcastToRoom(room string, event []byte)
}

type Service struct {
	store   store
	perms   permChecker
	members memberChecker
	pub     publisher
	now     func() time.Time
}

func NewService(s store, p permChecker, m memberChecker, pub publisher) *Service {
	return &Service{store: s, perms: p, members: m, pub: pub, now: time.Now}
}

// requireManage: quem pode criar, editar e cancelar (o Administrador e o dono
// já vêm com todos os bits em ServerPerms).
func (s *Service) requireManage(ctx context.Context, serverID, userID string) error {
	perms, err := s.perms.ServerPerms(ctx, serverID, userID)
	if err != nil {
		return fmt.Errorf("conferir permissões: %w", err)
	}
	if !permission.Has(perms, permission.ManageEvents) {
		return ErrMissingPermission
	}
	return nil
}

func (s *Service) Create(ctx context.Context, serverID, actorID string, in Input) (*Event, error) {
	if err := s.requireManage(ctx, serverID, actorID); err != nil {
		return nil, err
	}
	in, err := in.normalize(s.now())
	if err != nil {
		return nil, err
	}
	if err := s.checkChannel(ctx, serverID, in.ChannelID); err != nil {
		return nil, err
	}
	e := newEvent(serverID, actorID, in)
	if err := s.store.Create(ctx, e, reminderRows(e.NextStartAt, e.ReminderOffsets, s.now())); err != nil {
		return nil, fmt.Errorf("gravar evento: %w", err)
	}
	s.broadcast(serverID, "event:create", e)
	return e, nil
}
```

`newEvent` monta o `Event` (UUID novo, `Scope: "server"`, `NextStartAt: in.StartsAt`, `CreatedBy: actorID`). `checkChannel`: `IsVoiceChannel` falso → `ErrInvalidChannel`. `Update`: `requireManage` → `Find` (`ErrEventNotFound` se `CanceledAt != nil` ou `FinishedAt != nil`) → `normalize` → `checkChannel` → copia os campos de `in` para o evento, `OccurrencesDone = 0`, `NextStartAt = in.StartsAt` → `store.Update(… reminderRows …)` → `event:update`. `Cancel`: `requireManage` → `Find` → `store.Cancel` → `event:delete` com `map[string]string{"server_id":…, "event_id":…}`. `broadcast`: `s.pub.BroadcastToRoom("server:"+serverID, marshalEvent(typ, payload))` quando `s.pub != nil`.

`service_rsvp.go`:

```go
// liveEvent: o evento, se quem pede é membro e ele ainda não terminou.
func (s *Service) liveEvent(ctx context.Context, serverID, eventID, userID string) (*Event, error) {
	ok, err := s.members.IsMember(ctx, serverID, userID)
	if err != nil {
		return nil, fmt.Errorf("conferir membro: %w", err)
	}
	if !ok {
		return nil, ErrNotMember
	}
	e, err := s.store.Find(ctx, serverID, eventID)
	if err != nil {
		return nil, err
	}
	if e.CanceledAt != nil {
		return nil, ErrEventNotFound
	}
	if e.FinishedAt != nil {
		return nil, ErrEventEnded
	}
	return e, nil
}
```

`SetRSVP`/`ClearRSVP`/`ListGoing` chamam `liveEvent` e usam `e.NextStartAt` como ocorrência. `List`: confere membro e chama `store.ListUpcoming`.

- [ ] **Step 4: Ver passar** — `"$GO" test ./internal/event -v` → PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/internal/event
git commit -m "feat(eventos): regras de criação, edição, cancelamento e presença"
```

---

### Task 6: Handler HTTP e rotas

**Files:**
- Create: `backend/internal/event/handler.go`, `handler_rsvp.go`, `routes.go`, `handler_test.go`

**Interfaces:**
- Consumes: `*Service` (Task 5) por interface local `eventService`.
- Produces: `NewHandler(svc eventService) *Handler`; `Routes(api *gin.RouterGroup, h *Handler, authMiddleware gin.HandlerFunc)` com as rotas da spec:
  `GET|POST /servers/:id/events`, `PATCH|DELETE /servers/:id/events/:eventId`, `PUT|DELETE /servers/:id/events/:eventId/rsvp` (corpo `{"going": bool}` no PUT), `GET /servers/:id/events/:eventId/rsvps`.
- Respostas de erro: `{"error": <mensagem>, "code": <code>}` com os códigos `missing_permission` (403), `not_member` (403), `event_not_found` (404), `event_in_past`, `invalid_title`, `invalid_description`, `invalid_recurrence`, `invalid_reminder`, `too_many_reminders`, `invalid_channel` (400), `event_ended` (409). Erro desconhecido → 500 `{"error":"failed to process event"}` + `log.Printf` em português.

- [ ] **Step 1: Teste (falha)** — `handler_test.go` usa `httptest` + um `fakeService` e registra as rotas num `gin.New()` com um middleware que faz `c.Set("userID", "u1")`. Casos: `POST` com corpo inválido → 400; erro `ErrMissingPermission` do service → 403 com `code=missing_permission`; sucesso → 201 com o evento; `PUT …/rsvp` com `{"going":true}` → 204 e o fake recebe `going=true`; `PUT` com corpo sem `going` → 400; `DELETE …/rsvp` → 204; `ErrEventNotFound` → 404. Tabela de mapeamento erro→status/código testada direto em `errorResponse(err) (status int, code string)`.

- [ ] **Step 2: Ver falhar** → FAIL.

- [ ] **Step 3: Implementar**

`errorResponse` como tabela:

```go
var errorTable = []struct {
	err    error
	status int
	code   string
}{
	{ErrMissingPermission, http.StatusForbidden, "missing_permission"},
	{ErrNotMember, http.StatusForbidden, "not_member"},
	{ErrEventNotFound, http.StatusNotFound, "event_not_found"},
	{ErrEventEnded, http.StatusConflict, "event_ended"},
	{ErrInPast, http.StatusBadRequest, "event_in_past"},
	{ErrInvalidTitle, http.StatusBadRequest, "invalid_title"},
	{ErrInvalidDescription, http.StatusBadRequest, "invalid_description"},
	{ErrInvalidRecurrence, http.StatusBadRequest, "invalid_recurrence"},
	{ErrInvalidReminder, http.StatusBadRequest, "invalid_reminder"},
	{ErrTooManyReminders, http.StatusBadRequest, "too_many_reminders"},
	{ErrInvalidChannel, http.StatusBadRequest, "invalid_channel"},
}

func errorResponse(err error) (int, string) {
	for _, row := range errorTable {
		if errors.Is(err, row.err) {
			return row.status, row.code
		}
	}
	return http.StatusInternalServerError, ""
}
```

Cada handler: `userID := c.GetString("userID")` (401 se vazio), `ShouldBindJSON(&in)` (400 `{"error":"invalid body"}`), chama o service e responde. `fail(c, err)` usa `errorResponse`; no 500 faz `log.Printf("eventos: %v", err)`.

- [ ] **Step 4: Ver passar** — `"$GO" test ./internal/event -v` → PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/internal/event
git commit -m "feat(eventos): rotas HTTP de eventos e presença"
```

---

### Task 7: Banner do evento

**Files:**
- Create: `backend/internal/event/banner.go`, `banner_test.go`
- Modify: `backend/internal/event/routes.go`

**Interfaces:**
- Consumes: `permChecker`, `memberChecker` (Task 5), `media.Store`/`media.Form`/`media.Sniff` (`internal/platform/media`).
- Produces: `NewBannerHandler(store *media.Store, space spaceChecker, perms permChecker, members memberChecker, tokens mediaTokens, finder bannerFinder) *BannerHandler` com `Upload` (`POST /servers/:id/events/banner`, multipart campo de arquivo, exige `ManageEvents`, responde `201 {"banner_id": "<uuid>"}`) e `Serve` (`GET /event-banners/:bannerId?token=…`, sem Bearer, só membros do servidor do evento que usa esse banner). `MaxBannerBytes int64 = 10 << 20`, `BannerDir = "event-media"`. Refinamento da spec: o evento guarda `banner_id` (UUID do arquivo), não URL; o app monta a URL com o media token.

- [ ] **Step 1: Teste (falha)** — `banner_test.go`: (a) `bannerType(form)` aceita PNG, JPEG e WEBP (via `media.Sniff` com cabeçalhos mínimos de cada formato) e recusa GIF, AVIF e arquivo que não é imagem; (b) `Upload` sem `ManageEvents` → 403; (c) `Serve` com token inválido → 401; membro de outro servidor → 404. Use fakes e `media.NewStore(t.TempDir())`.

- [ ] **Step 2: Implementar** seguindo `emoji/upload.go` ponto a ponto: `checkBody` (`ContentLength > MaxBannerBytes+multipartOverhead` → 413; `space.HasRoom` → 507), `readForm` com `media.FormSpec{ID: id, MaxFile: MaxBannerBytes, MaxField: 256}` (sem campos de texto), `bannerType` (`media.Sniff(form.Head, form.Declared)` com `kind == media.KindImage` e `contentType` em `image/png|jpeg|webp`; senão `415`), `store.Remove(id)` quando algo depois do salvamento falha, mesmos `formError` e `fail`/`uploadErr`. `Serve` copia `emoji.Handler.ServeFile` (cabeçalhos `nosniff`, `Cache-Control: private, max-age=31536000, immutable`), com `bannerFinder.ServerOfBanner(ctx, bannerID) (serverID string, contentType string, err error)` — implemente em `repository.go` como `SELECT server_id FROM server_events WHERE banner_id = $1 LIMIT 1` (o tipo é descoberto pelo `Sniff` dos primeiros bytes do arquivo ao servir, evitando coluna nova). Rotas em `routes.go`: `servers.POST("/events/banner", b.Upload)` **antes** de `/events/:eventId`, e `router.GET("/event-banners/:bannerId", b.Serve)` fora do grupo autenticado (como `/emojis/:emojiId/file`).

- [ ] **Step 3: Rodar** — `"$GO" test ./internal/event -v` → PASS.

- [ ] **Step 4: Commit**

```bash
git add backend/internal/event
git commit -m "feat(eventos): upload e entrega do banner do evento"
```

---

### Task 8: Agendador dos lembretes e avanço das ocorrências

**Files:**
- Create: `backend/internal/event/texts.go`, `texts_test.go`, `repository_schedule.go`, `scheduler.go`, `scheduler_test.go`, `repository_schedule_db_test.go`

**Interfaces:**
- Consumes: `OccurrenceAt`, `Finished`, `reminderRows`, `insertReminders` (Tasks 2 e 4).
- Produces:
  - `type DueReminder struct{ ID int64; EventID, ServerID, ServerName, ChannelName, Title string; Occurrence, DueAt time.Time; OffsetMinutes int }`
  - `(*Repository).ClaimDue(ctx, now time.Time, limit int) ([]DueReminder, error)` — marca `sent_at = now` nas linhas devidas e as devolve (`UPDATE … WHERE id IN (SELECT … FOR UPDATE SKIP LOCKED) RETURNING`)
  - `(*Repository).Going(ctx, eventID string, occurrence time.Time) ([]string, error)` — ids de quem disse Vou
  - `(*Repository).AdvanceDue(ctx, now time.Time, grace time.Duration, loc *time.Location, limit int) (int, error)` — avança as ocorrências cujo `next_start_at + grace <= now`
  - `type Notifier interface{ Notify(ctx context.Context, userID, text string) error }` (o `salinhaBotNotifier` de `cmd/wire_engagement.go` já a satisfaz)
  - `func NewScheduler(repo schedulerStore, notifier Notifier) *Scheduler` e `(*Scheduler).Run(ctx context.Context)`
  - `func reminderText(d DueReminder) string`, `func stale(d DueReminder, now time.Time) bool`

- [ ] **Step 1: Testes puros (falham)**

```go
func TestReminderText(t *testing.T) {
	d := DueReminder{Title: "Noite de jogos", ChannelName: "geral", ServerName: "Salinha", OffsetMinutes: 10}
	cases := []struct {
		offset int
		want   string
	}{
		{10, `🔔 O evento "Noite de jogos" começa em 10 minutos em #geral, no servidor Salinha.`},
		{60, `🔔 O evento "Noite de jogos" começa em 1 hora em #geral, no servidor Salinha.`},
		{1440, `🔔 O evento "Noite de jogos" começa em 1 dia em #geral, no servidor Salinha.`},
		{0, `📅 O evento "Noite de jogos" está começando agora em #geral, no servidor Salinha.`},
	}
	for _, c := range cases {
		d.OffsetMinutes = c.offset
		if got := reminderText(d); got != c.want {
			t.Errorf("offset %d: %q, esperava %q", c.offset, got, c.want)
		}
	}
}

func TestStale(t *testing.T) {
	occ := time.Date(2026, 11, 1, 20, 0, 0, 0, time.UTC)
	ante := DueReminder{OffsetMinutes: 10, Occurrence: occ, DueAt: occ.Add(-10 * time.Minute)}
	if stale(ante, ante.DueAt.Add(9*time.Minute)) {
		t.Error("aviso 9 min atrasado ainda vale")
	}
	if !stale(ante, ante.DueAt.Add(11*time.Minute)) {
		t.Error("aviso de antecedência 11 min atrasado é descartado")
	}
	start := DueReminder{OffsetMinutes: 0, Occurrence: occ, DueAt: occ}
	if stale(start, occ.Add(50*time.Minute)) {
		t.Error("o 'começou' ainda sai até 1 h depois")
	}
	if !stale(start, occ.Add(61*time.Minute)) {
		t.Error("o 'começou' some depois de 1 h")
	}
}
```

Teste do `Scheduler` com fakes: `tick` envia a DM só para quem está em `Going`, uma falha em um usuário não impede os outros, aviso `stale` não envia ninguém, e uma segunda chamada de `tick` sem novas linhas não reenvia.

- [ ] **Step 2: Ver falhar** → FAIL.

- [ ] **Step 3: `texts.go` e `stale`**

```go
// reminderText é a DM do Salinha Bot (textos aprovados em 2026-10-30).
func reminderText(d DueReminder) string {
	if d.OffsetMinutes == 0 {
		return fmt.Sprintf(`📅 O evento "%s" está começando agora em #%s, no servidor %s.`, d.Title, d.ChannelName, d.ServerName)
	}
	return fmt.Sprintf(`🔔 O evento "%s" começa em %s em #%s, no servidor %s.`, d.Title, spanText(d.OffsetMinutes), d.ChannelName, d.ServerName)
}

// spanText: "10 minutos", "1 hora", "1 dia".
func spanText(minutes int) string {
	switch minutes {
	case 1440:
		return "1 dia"
	case 60:
		return "1 hora"
	}
	return fmt.Sprintf("%d minutos", minutes)
}

const (
	maxEarlyLate = 10 * time.Minute // antecedência atrasada mais que isso é descartada
	maxStartLate = time.Hour        // o "começou" ainda vale até 1 h depois do início
)

// stale: o aviso venceu faz tempo (o servidor ficou fora do ar) e não faz mais sentido.
func stale(d DueReminder, now time.Time) bool {
	if d.OffsetMinutes == 0 {
		return now.After(d.Occurrence.Add(maxStartLate))
	}
	return now.After(d.DueAt.Add(maxEarlyLate))
}
```

- [ ] **Step 4: `repository_schedule.go`**

`ClaimDue`:

```sql
UPDATE event_reminders r SET sent_at = $1
FROM server_events e, servers s, channels c
WHERE r.id IN (
        SELECT id FROM event_reminders
        WHERE sent_at IS NULL AND due_at <= $1
        ORDER BY due_at LIMIT $2 FOR UPDATE SKIP LOCKED)
  AND e.id = r.event_id AND e.canceled_at IS NULL
  AND s.id = e.server_id AND c.id = e.channel_id
RETURNING r.id, e.id, s.id, s.name, c.name, e.title, r.occurrence_start, r.due_at, r.offset_minutes
```

Lembretes de evento cancelado não são devolvidos (e ficam sem `sent_at`; o `Cancel` já os apagou). `Going` = `SELECT user_id FROM event_rsvps WHERE event_id=$1 AND occurrence_start=$2 AND going`.

`AdvanceDue`: numa transação por evento (`pgx.BeginFunc`), selecione `FOR UPDATE SKIP LOCKED` os eventos vivos com `next_start_at + $grace <= $now` (`LIMIT`), e para cada um calcule em Go: `n := done + 1; if Finished(rec, until, count, starts, n, loc) { UPDATE … SET finished_at=$now, occurrences_done=$n } else { next := OccurrenceAt(starts, rec, n, loc); UPDATE … SET occurrences_done=$n, next_start_at=$next; insertReminders(…, reminderRows(next, offsets, now)) }`. Devolve quantos avançou. Extraia `advanceOne(tx, row, now, loc)` para manter a função principal pequena.

- [ ] **Step 5: `scheduler.go`**

```go
const (
	tickEvery  = 30 * time.Second
	batchLimit = 50
	endGrace   = 3 * time.Hour // a ocorrência acaba 3 h depois do início
)

type schedulerStore interface {
	ClaimDue(ctx context.Context, now time.Time, limit int) ([]DueReminder, error)
	Going(ctx context.Context, eventID string, occurrence time.Time) ([]string, error)
	AdvanceDue(ctx context.Context, now time.Time, grace time.Duration, loc *time.Location, limit int) (int, error)
}

type Scheduler struct {
	store    schedulerStore
	notifier Notifier
	loc      *time.Location
	now      func() time.Time
}

// Run confere os avisos a cada 30 s até o contexto acabar.
func (s *Scheduler) Run(ctx context.Context) {
	ticker := time.NewTicker(tickEvery)
	defer ticker.Stop()
	s.tick(ctx)
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			s.tick(ctx)
		}
	}
}

// tick: manda os avisos devidos e depois avança as ocorrências que acabaram
// (nessa ordem, para o "começou" sair antes de o evento virar a próxima semana).
func (s *Scheduler) tick(ctx context.Context) {
	now := s.now()
	due, err := s.store.ClaimDue(ctx, now, batchLimit)
	if err != nil {
		log.Printf("[eventos] buscar avisos devidos: %v", err)
	}
	for _, d := range due {
		s.deliver(ctx, d, now)
	}
	if _, err := s.store.AdvanceDue(ctx, now, endGrace, s.loc, batchLimit); err != nil {
		log.Printf("[eventos] avançar ocorrências: %v", err)
	}
}

// deliver manda a DM a quem confirmou; falha com uma pessoa não barra as outras.
func (s *Scheduler) deliver(ctx context.Context, d DueReminder, now time.Time) {
	if stale(d, now) {
		return
	}
	ids, err := s.store.Going(ctx, d.EventID, d.Occurrence)
	if err != nil {
		log.Printf("[eventos] quem vai no evento %s: %v", d.EventID, err)
		return
	}
	text := reminderText(d)
	for _, id := range ids {
		if err := s.notifier.Notify(ctx, id, text); err != nil {
			log.Printf("[eventos] DM do evento %s para %s: %v", d.EventID, id, err)
		}
	}
}
```

- [ ] **Step 6: Teste de banco do agendador** — `repository_schedule_db_test.go`: cria evento semanal com início daqui a 1 min e `due_at` do "na hora" já vencido (insira a linha com `due_at` no passado), chama `ClaimDue` duas vezes (a segunda devolve vazio: idempotente); evento com `next_start_at` 4 h atrás e `AdvanceDue` → `occurrences_done = 1`, `next_start_at` = +7 dias, linhas novas de lembrete na ocorrência seguinte; evento sem repetição → `finished_at` preenchido e some de `ListUpcoming`; evento cancelado não devolve linhas em `ClaimDue`.

- [ ] **Step 7: Ver passar** — `"$GO" test ./internal/event -v` (com `TEST_DATABASE_URL`) → PASS.

- [ ] **Step 8: Commit**

```bash
git add backend/internal/event
git commit -m "feat(eventos): ticker dos lembretes e avanço das ocorrências"
```

---

### Task 9: Ligação no boot e docs

**Files:**
- Create: `backend/cmd/wire_events.go`
- Modify: `backend/cmd/wire.go` (uma linha: `a.wireEvents()` depois de `a.wireEngagement()`)
- Create: `docs/EVENTOS.md`; Modify: `docs/ai/arquitetura.md` só se ele lista os domínios (acrescente `event/` na lista, no mesmo estilo)

**Interfaces:**
- Consumes: `event.NewRepository`, `event.NewService`, `event.NewHandler`, `event.NewBannerHandler`, `event.Routes`, `event.NewScheduler`; do `app`: `a.db`, `a.permissionService`, `a.hub`, `a.authService`, `a.uploadsDir`, `a.uploadSpace`, `a.authMiddleware`, `a.ctx`, `salinhaBotNotifier{conversations: a.conversationService, messages: a.messageService}`, `mustStore`.
- `a.permissionService` serve de `permChecker`; para `memberChecker` use o mesmo objeto que `wire_emojis.go` passa como `serverChecker` (`a.permissionService` já tem `IsMember`; confirme a assinatura em `permission/service.go` e, se não tiver, use o serviço de servidor que `wire_emojis.go` usa).

- [ ] **Step 1: Escrever `wire_events.go`**

```go
package main

import (
	"path/filepath"

	"gin-quickstart/backend/internal/event"

	"github.com/gin-gonic/gin"
)

// wireEvents: eventos do servidor, presença e o ticker dos avisos do Salinha Bot
// (docs/superpowers/specs/2026-10-30-eventos-do-servidor-design.md).
func (a *app) wireEvents() {
	repo := event.NewRepository(a.db)
	service := event.NewService(repo, a.permissionService, a.permissionService, a.hub)
	handler := event.NewHandler(service)
	banners := mustStore(filepath.Join(a.uploadsDir, event.BannerDir), "event banners dir")
	bannerHandler := event.NewBannerHandler(banners, a.uploadSpace, a.permissionService, a.permissionService, a.authService, repo)

	notifier := salinhaBotNotifier{conversations: a.conversationService, messages: a.messageService}
	go event.NewScheduler(repo, notifier).Run(a.ctx)

	a.route(func(_ *gin.Engine, api *gin.RouterGroup) {
		event.Routes(api, handler, bannerHandler, a.authMiddleware)
	})
}
```

(Ajuste `Routes` da Task 6/7 para receber `bannerHandler`; a assinatura final é `Routes(api, h, b, authMiddleware)`.)

- [ ] **Step 2: Teste de que sobe** — rode o teste de boot existente: `cd backend && "$GO" test ./cmd -v` (cobre `wire`); se `main_test.go` lista rotas ou domínios, acrescente `event`.

- [ ] **Step 3: `docs/EVENTOS.md`** (curto): fluxo (criar → presença → ticker → DM), regras (2 antecedências, recorrência por preset, presença só da ocorrência atual), rotas e eventos de tempo real da spec, e a pegadinha do bit 14 (o único livre abaixo de 2^31).

- [ ] **Step 4: Verificar** — `cd backend && "$GO" build ./... && "$GO" vet ./... && "$GO" test ./internal/event ./internal/permission ./cmd` → PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/cmd/wire_events.go backend/cmd/wire.go docs/EVENTOS.md docs/ai/arquitetura.md
git commit -m "feat(eventos): liga o pacote de eventos e o ticker no boot"
```

---

### Task 10: App — API e lógica pura

**Files:**
- Create: `frontend/src/renderer/src/features/events/api/events.ts`, `events.test.ts`
- Create: `frontend/src/renderer/src/features/events/lib/recurrence.ts`, `recurrence.test.ts`, `reminders.ts`, `reminders.test.ts`

**Interfaces:**
- Produces:
  - `type Recurrence = 'none' | 'daily' | 'weekly' | 'monthly'`
  - `interface ServerEvent { id; server_id; channel_id; title; description; banner_id: string | null; starts_at; next_start_at; recurrence; recurrence_until: string | null; recurrence_count: number | null; reminder_offsets: number[]; going_count: number; my_rsvp: boolean | null; created_by: string | null }`
  - `interface EventInput { channel_id; title; description; banner_id: string | null; starts_at: string; recurrence; recurrence_until: string | null; recurrence_count: number | null; reminder_offsets: number[] }`
  - `fetchEvents(serverId)`, `createEvent(serverId, input)`, `updateEvent(serverId, id, input)`, `cancelEvent(serverId, id)`, `setRsvp(serverId, id, going)`, `clearRsvp(serverId, id)`, `fetchGoing(serverId, id)`, `uploadEventBanner(serverId, file): Promise<string>`, `eventBannerUrl(bannerId, mediaToken)` — espelham `emojis.ts` (`request`, `API_BASE_URL`).
  - `REMINDER_OPTIONS: { minutes: number; label: string }[]` (`1440 "1 dia antes"`, `60 "1 hora antes"`, `30 "30 minutos antes"`, `15 …`, `10 …`, `5 …`), `MAX_REMINDERS = 2`, `DEFAULT_REMINDERS = [10, 5]`, `toggleReminder(selected: number[], minutes: number): number[]` (marca/desmarca; ao marcar uma 3ª, devolve a lista inalterada), `canPickReminder(selected, minutes): boolean`
  - `recurrenceLabel(rule: Recurrence, startsAt: Date): string` ("Não repete", "Todo dia", "Toda quarta-feira", "Todo dia 15 do mês"), `RECURRENCE_OPTIONS`

- [ ] **Step 1: Testes (falham)** — `reminders.test.ts`: `toggleReminder([10,5], 30)` devolve `[10,5]`; `toggleReminder([10], 5)` → `[10,5]`; `toggleReminder([10,5], 10)` → `[5]`; `canPickReminder([10,5], 30) === false` e `canPickReminder([10,5], 10) === true` (desmarcar sempre pode). `recurrence.test.ts`: `recurrenceLabel('weekly', new Date(2026, 10, 4, 20, 0))` contém "quarta"; `'monthly'` com dia 31 contém "31" e "último dia" quando o dia é > 28 (texto exato sujeito à aprovação no PR); `'none'` → "Não repete". `events.test.ts`: com `vi.mock` do `request`, `setRsvp` faz `PUT /servers/s1/events/e1/rsvp` com corpo `{"going":true}` e `cancelEvent` faz `DELETE`.

- [ ] **Step 2: Ver falhar** — `cd frontend && npx vitest run src/renderer/src/features/events` → FAIL (módulos não existem).

- [ ] **Step 3: Implementar** as funções acima (puras, sem React). `toggleReminder`:

```ts
export function toggleReminder(selected: number[], minutes: number): number[] {
  if (selected.includes(minutes)) return selected.filter((m) => m !== minutes)
  if (selected.length >= MAX_REMINDERS) return selected
  return [...selected, minutes].sort((a, b) => b - a)
}
```

- [ ] **Step 4: Ver passar** → PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/renderer/src/features/events
git commit -m "feat(eventos): cliente da API e lógica pura dos eventos no app"
```

---

### Task 11: App — store e tempo real

**Files:**
- Create: `frontend/src/renderer/src/features/events/store/eventsStore.ts`, `eventsStore.test.ts`
- Modify: `frontend/src/renderer/src/shared/api/ws.ts` (somar `'event:create' | 'event:update' | 'event:delete'` ao tipo `WsEventType`)
- Modify: o ponto onde `emojiWatch`/stores de feature se registram no `onWsEvent` (procure por `onWsEvent(` fora dos testes e siga o mesmo padrão para registrar `startEventsWatch()`)

**Interfaces:**
- Consumes: Task 10.
- Produces: `useEventsStore` (Zustand) com `byServer: Record<string, ServerEvent[]>`, `loading: Record<string, boolean>`, `load(serverId)`, `create(serverId, input)`, `update(serverId, id, input)`, `cancel(serverId, id)`, `respond(serverId, id, going: boolean | null)` (atualização otimista de `my_rsvp` e `going_count`, com volta ao valor anterior se a API falhar), `applyWs(event: WsEvent): void`; funções puras exportadas `upsertEvent(list, e)`, `removeEvent(list, id)`, `applyRsvp(list, id, going | null)` (ordenam por `next_start_at`).

- [ ] **Step 1: Testes puros e do store (falham)** — `upsertEvent` insere e substitui por id mantendo a ordem por `next_start_at`; `removeEvent`; `applyRsvp(list, 'e1', true)` com `my_rsvp=null` soma 1 em `going_count`, trocar de `true` para `false` subtrai 1, limpar (`null`) subtrai se estava `true`. No store, com a API mockada: `respond` otimista e rollback em erro; `applyWs` com `event:create` de um servidor ainda não carregado é ignorado (como `emojiStore`: `if (!loaded) return`).

- [ ] **Step 2: Implementar** o store pequeno (um arquivo, < 200 linhas) e `startEventsWatch()` que assina o `onWsEvent` uma única vez (flag `started`, igual a `emojiWatch.ts`) e chama `applyWs`. Troca de conta zera `byServer`.

- [ ] **Step 3: Rodar** — `npx vitest run src/renderer/src/features/events` e `yarn typecheck` (em `frontend/`) → PASS.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/renderer/src/features/events frontend/src/renderer/src/shared/api/ws.ts
git commit -m "feat(eventos): store dos eventos com atualização em tempo real"
```

---

### Task 12: App — painel, cartão, formulário e lembretes (UI)

**Files:**
- Create em `frontend/src/renderer/src/features/events/components/`: `EventsPanel.tsx`, `EventCard.tsx`, `RsvpButtons.tsx`, `EventForm.tsx`, `ReminderPicker.tsx`, `RecurrenceFields.tsx`, e um teste de render (`renderToStaticMarkup`, sem jsdom — ver as notas do ambiente) por componente que tem regra: `ReminderPicker.test.tsx`, `EventsPanel.test.tsx`
- Modify: `frontend/src/renderer/src/shared/ui/icons/*` — só se faltar ícone (calendário/relógio/pessoas: procure primeiro em `nav`, `people`, `tools`); ícone novo entra no arquivo do grupo, preenchido, `fill="currentColor"`, `aria-hidden`

**Interfaces:**
- Consumes: `useEventsStore` (Task 11), `REMINDER_OPTIONS`/`toggleReminder` (Task 10), `Perm.MANAGE_EVENTS` e o `ServerAccess` (`access.can(Perm.MANAGE_EVENTS)`), `Modal`, `Button`, `IconButton`, `CloseButton`, `Input`, `Switch`/`ChipGroup`, lista de canais de voz do servidor (do store que o `ChannelSection` já usa; **não** adicione campo a `serverStore`).
- Produces: `EventsPanel({ serverId, access, onClose })` — modal em tela cheia no celular (`Modal` com `wide`/`xl` conforme o breakpoint) com a lista e, para quem tem a permissão, o botão "Criar evento"; `EventForm({ serverId, event?, voiceChannels, onDone })`.

- [ ] **Step 1: Testes de render (falham)** — `ReminderPicker`: com `selected=[10,5]`, as outras opções saem `disabled` (e as marcadas não); com `selected=[]` todas habilitadas; cada opção é um `checkbox` com rótulo. `EventsPanel`: sem `MANAGE_EVENTS` não renderiza "Criar evento"; com a permissão renderiza; lista vazia mostra o estado vazio; evento com `my_rsvp=true` marca "Vou" com `aria-pressed="true"`.

- [ ] **Step 2: Implementar** seguindo o design aprovado:
  - 360 px: `EventsPanel` ocupa a tela, cartões em coluna única, banner `aspect-video` no topo do `EventCard`, botões Vou / Não vou com `size="lg"` (44 px), `EventForm` em `Modal` com rolagem interna e rodapé fixo com "Salvar" e "Cancelar".
  - ≥ 768 px (`md:`): coluna com `max-w-2xl`. ≥ 1280 px (`xl:`): lista à esquerda e detalhe (descrição completa, quem vai via `fetchGoing`) à direita.
  - Teclado: foco preso no `Modal`, Esc fecha, foco volta ao botão que abriu; tudo por Tab. Sem ação só no hover.
  - Banner: `<img>` com `loading="lazy"`, `alt=""` (decorativo; o título está no texto) e fallback para `bg-gradient-hero` quando não há banner.
  - Textos de UI (para aprovação no PR): título do painel "Eventos", "Criar evento", "Vou", "Não vou", "Nenhum evento marcado", "Repetir", "Avisar antes (até 2)", "Canal de voz", "Salvar", "Cancelar evento".
  - Cores/raios/texto só por token; `Button`/`IconButton`; ícones de `shared/ui/icons`.

- [ ] **Step 3: Ver passar** — `npx vitest run src/renderer/src/features/events` → PASS.

- [ ] **Step 4: Checar o design** — na raiz: `node scripts/check-design.mjs` → sem piora. Rode a skill `web-design-guidelines` nos arquivos de UI novos e corrija o que for erro.

- [ ] **Step 5: Verificação visual** nos três tamanhos (360 / 768 / 1280 px) com o harness temporário descrito nas notas do ambiente (`frontend/.harness`, `channel: 'chrome'`); apague o harness depois. Guarde as capturas para o PR.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/renderer/src/features/events frontend/src/renderer/src/shared/ui/icons
git commit -m "feat(eventos): painel de eventos, cartão, presença e formulário"
```

---

### Task 13: App — entrada no menu do servidor

**Files:**
- Modify: `frontend/src/renderer/src/features/servers/lib/sidebarMenus.ts` (+ `sidebarMenus.test.ts`), `frontend/src/renderer/src/features/servers/components/ServerHeaderMenu.tsx`
- Create: `frontend/src/renderer/src/features/events/store/eventsPanelStore.ts` (+ teste): `{ openFor: string | null; open(serverId); close() }`

**Interfaces:**
- Consumes: `EventsPanel` (Task 12), `useEventsStore.load`.
- Produces: item de menu `'events'` visível para todo membro (`hasServer`), antes de `'notifications'`; o painel monta no `ServerHeaderMenu` ao lado de `<ServerLevelModal />`.

- [ ] **Step 1: Teste (falha)** — em `sidebarMenus.test.ts`: `serverMenuItems({ hasServer: true, … })` inclui `'events'` antes de `'notifications'`; `hasServer: false` não inclui. Tipo `ServerMenuItem` ganha `'events'`.

- [ ] **Step 2: Implementar** — em `sidebarMenus.ts` acrescente `'events'` ao tipo e a regra `['events', (c) => c.hasServer]` entre `nickname` e `notifications`. Em `ServerHeaderMenu.tsx`: `LOOK.events = { label: 'Eventos', icon: <CalendarIcon className="h-3.5 w-3.5" /> }` (ícone de `shared/ui/icons`, criado na Task 12 se faltava), `actions.events = () => server && useEventsPanelStore.getState().open(server.id)`, e `{<EventsPanelHost server={server} access={access} />}` junto ao `ServerLevelModal`. Mantenha o `ServerMenuItems` com CRAP ≤ 15 (hoje 3): se a complexidade subir, extraia o mapa de ações para `lib/serverMenuActions.ts`. O arquivo tem 166 linhas: não deve crescer além de ~175.

- [ ] **Step 3: Rodar** — `npx vitest run src/renderer/src/features/servers src/renderer/src/features/events` e `yarn typecheck` → PASS.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/renderer/src/features/servers frontend/src/renderer/src/features/events
git commit -m "feat(eventos): item Eventos no menu do servidor"
```

---

### Task 14: Nota de changelog e verificação final

**Files:**
- Create: `changelog/pending/2026-10-30-eventos-do-servidor.md`
- Modify: `docs/superpowers/specs/2026-10-30-eventos-do-servidor-design.md` (registrar `finished_at` e `banner_id` — os dois refinamentos deste plano)

- [ ] **Step 1: Nota** (texto de usuário, sujeito a aprovação no PR; um arquivo novo, sem editar os existentes):

```md
## Novidades

- Eventos: quem tem a permissão Gerenciar eventos cria eventos no servidor (com banner, descrição, canal de voz e repetição). Os membros respondem Vou ou Não vou e, quem vai, recebe um aviso do Salinha Bot na DM antes e na hora de começar.
```

- [ ] **Step 2: Spec** — acrescente `finished_at` à lista de colunas de `server_events` e troque `banner_url` por `banner_id` (arquivo em `uploads/event-media/<id>`, servido por `GET /event-banners/:bannerId?token=`).

- [ ] **Step 3: Pipeline completo** (na raiz, com `GO` exportado e o `postcss.config.mjs` temporário):

Run: `node scripts/affected-tests.mjs pr`
Expected: verde. Falhas de ambiente conhecidas (`scripts/apply-caddyfile.test.mjs`, `scripts/deploy-vps.test.mjs`: caminhos `/C:/…` no Windows) devem ser reportadas como tal, com a causa, e não escondidas.

- [ ] **Step 4: CRAP depois** — `node scripts/crap.mjs` e compare com `scratchpad/crap-antes.txt`: nenhuma função tocada acima de 15; guarde a saída para o PR.

- [ ] **Step 5: Remover o `frontend/postcss.config.mjs` temporário** e conferir `git status` (nada fora do escopo).

- [ ] **Step 6: Commit**

```bash
git add changelog/pending/2026-10-30-eventos-do-servidor.md docs/superpowers/specs/2026-10-30-eventos-do-servidor-design.md
git commit -m "docs(eventos): nota de changelog e spec alinhada ao plano"
```

---

## Auto-revisão

- **Cobertura da spec:** permissão (T1), recorrência (T2), validação/antecedências/tamanhos (T3), tabelas (T3), CRUD/presença/cancelamento/canal apagado em cascata (T4–T6), banner (T7), ticker, aviso velho, DM só para quem foi, idempotência, avanço e encerramento (T8), boot (T9), app e responsivo (T10–T13), changelog e verificação (T14). "Erros com `code`" em T6. "Canal de voz apagado cancela o evento": `ON DELETE CASCADE` em `channel_id` **apaga** o evento (e seus avisos), o que cumpre a regra; sem estado "cancelado" para esse caso.
- **Placeholders:** nenhum `TBD`. As partes de UI da T12 descrevem estrutura, tokens e comportamento em vez de JSX completo porque o JSX depende dos componentes `shared/ui` (que o implementador lê no repo); cada comportamento tem teste.
- **Consistência de tipos:** `Input`/`Event`/`ReminderRow`/`DueReminder`, `NewService(store, perms, members, pub)`, `Routes(api, h, b, authMiddleware)` e os nomes das rotas batem entre T3–T9 e o cliente da T10.
- **Ordem:** a T1 (permissão) e a T2 (puras) não dependem do resto; a T3 antes do repositório; a T9 só depois das T4–T8; o app (T10–T13) depende só dos contratos da T6/T7 e pode ser feito em paralelo ao backend depois da T3.

---

## Mudança de rumo (2026-10-30, durante a execução)

O usuário pediu que **o evento crie a própria sala de voz e de texto, apagada no fim**, no lugar de
apontar para um canal de voz existente (e que só quem participa entre). Decidido no mesmo PR, com
campo de duração e sala criada na hora do início. Isto **substitui** a escolha do canal (Tasks 3, 5,
8, 9, 12) e acrescentou, depois das Tasks 1 a 14:

- **Task 15, `call.CloseChannelCall`** (`call/channel_close.go`): derruba a chamada do canal antes de apagá-lo.
- **Task 16, modelo e esquema**: migration 000177 editada (sem `channel_id`; com `duration_minutes`,
  `voice_channel_id`, `text_channel_id`); validação de duração (30/60/120/180/240, padrão 120).
- **Task 17, salas** (`event/rooms.go`): `Open` cria voz e texto privados (@everyone sem ver; confirmados e
  organizador com acesso), `Close` derruba a chamada e apaga os canais, `Allow` libera ou tira o acesso de
  quem confirma ou desiste. Testado com canal e permissão reais contra o Postgres (`rooms_db_test.go`).
- **Task 18, agendador**: a rodada passa a fechar salas, abrir salas, avisar e avançar, nessa ordem; evento
  em andamento não se edita; cancelar fecha a sala; `event:update` avisa o app.
- **Task 19, app**: sai o seletor de canal; entram o campo "Duração" e o texto da sala no detalhe.

Os textos da DM mudaram (antes da hora a sala não existe) e **aguardam aprovação**.

### Mais mudanças pedidas durante a execução (2026-10-30)

- **Permissão por cargo**: a permissão única "Gerenciar eventos" (bit 14) saiu. Agora é configuração do
  servidor (`event_role_actions`): o dono escolhe, por cargo, criar, editar e excluir, e pode delegar a
  configuração (quarta chave "configurar", só o dono liga). Seção *Eventos* nas configurações do servidor.
- **Evento em andamento**: edição simples (título, descrição, banner).
- **Banner trocado não fica salvo**: apagado na hora, mais faxina horária dos órfãos.
- **Canais da sala travados** (`channels.managed`): só o evento os apaga.
