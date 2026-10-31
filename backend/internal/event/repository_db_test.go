package event

import (
	"context"
	"errors"
	"os"
	"testing"
	"time"

	"gin-quickstart/backend/internal/platform/database"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Estes testes rodam num Postgres de verdade (TEST_DATABASE_URL, banco
// descartável e já migrado) e cobrem o SQL: listagem, presença, cancelamento
// e o isolamento por servidor.

func eventDB(t *testing.T) (*pgxpool.Pool, context.Context) {
	t.Helper()
	url := os.Getenv("TEST_DATABASE_URL")
	if url == "" {
		t.Skip("TEST_DATABASE_URL não definido")
	}
	db, err := database.Connect(url)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(db.Close)
	return db, context.Background()
}

func mustExec(t *testing.T, db *pgxpool.Pool, sql string, args ...any) {
	t.Helper()
	if _, err := db.Exec(context.Background(), sql, args...); err != nil {
		t.Fatalf("%s: %v", sql, err)
	}
}

// seedUserAndServer cria uma pessoa e um servidor dela (membro).
func seedUserAndServer(t *testing.T, db *pgxpool.Pool, serverName string) (userID, serverID string) {
	t.Helper()
	userID, serverID = uuid.NewString(), uuid.NewString()
	mustExec(t, db, `INSERT INTO users (id, username, display_name, email, password_hash) VALUES ($1, $2, $2, $3, 'x')`,
		userID, "u"+userID[:8], userID[:8]+"@teste.dev")
	mustExec(t, db, `INSERT INTO servers (id, name, owner_id) VALUES ($1, $2, $3)`, serverID, serverName, userID)
	mustExec(t, db, `INSERT INTO server_members (server_id, user_id) VALUES ($1, $2)`, serverID, userID)
	t.Cleanup(func() {
		mustExec(t, db, `DELETE FROM servers WHERE id = $1`, serverID)
		mustExec(t, db, `DELETE FROM users WHERE id = $1`, userID)
	})
	return userID, serverID
}

func seedChannel(t *testing.T, db *pgxpool.Pool, serverID, userID, kind string) string {
	t.Helper()
	id := uuid.NewString()
	mustExec(t, db, `INSERT INTO channels (id, server_id, name, created_by, type) VALUES ($1, $2, $3, $4, $5)`,
		id, serverID, "canal-"+id[:8], userID, kind)
	return id
}

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

func newTestEvent(serverID, owner string, start time.Time) *Event {
	return &Event{
		ID: uuid.NewString(), ServerID: serverID, Scope: "server", DurationMinutes: 120,
		Title: "Noite", StartsAt: start, NextStartAt: start, Recurrence: RecWeekly,
		ReminderOffsets: []int{10, 5}, CreatedBy: &owner,
	}
}

func TestRepositoryEventsAndRSVP(t *testing.T) {
	db, ctx := eventDB(t)
	repo := NewRepository(db)
	owner, server := seedUserAndServer(t, db, "Servidor de eventos")
	start := time.Now().Add(2 * time.Hour).Truncate(time.Second)

	e := newTestEvent(server, owner, start)
	if err := repo.Create(ctx, e, reminderRows(start, e.ReminderOffsets, time.Now())); err != nil {
		t.Fatal(err)
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
	if err := repo.SetRSVP(ctx, e.ID, owner, start, false); err != nil {
		t.Fatal(err)
	}
	if going, _ := repo.ListGoing(ctx, e.ID, start); len(going) != 0 {
		t.Errorf("trocar para Não vou tira da lista: %+v", going)
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
}

func TestRepositoryFindIsScopedToServer(t *testing.T) {
	db, ctx := eventDB(t)
	repo := NewRepository(db)
	owner, server := seedUserAndServer(t, db, "A")
	_, other := seedUserAndServer(t, db, "B")
	start := time.Now().Add(time.Hour).Truncate(time.Second)
	e := newTestEvent(server, owner, start)
	if err := repo.Create(ctx, e, nil); err != nil {
		t.Fatal(err)
	}
	if got, err := repo.Find(ctx, server, e.ID); err != nil || got.Title != "Noite" || got.Scope != "server" {
		t.Fatalf("Find = %+v err=%v", got, err)
	}
	if _, err := repo.Find(ctx, other, e.ID); !errors.Is(err, ErrEventNotFound) {
		t.Errorf("evento de outro servidor = %v", err)
	}
	if _, err := repo.Find(ctx, server, "nao-e-uuid"); !errors.Is(err, ErrEventNotFound) {
		t.Errorf("id inválido = %v", err)
	}
}

func TestRepositoryUpdateReplacesPendingReminders(t *testing.T) {
	db, ctx := eventDB(t)
	repo := NewRepository(db)
	owner, server := seedUserAndServer(t, db, "Servidor")
	start := time.Now().Add(3 * time.Hour).Truncate(time.Second)
	e := newTestEvent(server, owner, start)
	if err := repo.Create(ctx, e, reminderRows(start, e.ReminderOffsets, time.Now())); err != nil {
		t.Fatal(err)
	}
	moved := start.Add(24 * time.Hour)
	e.Title, e.StartsAt, e.NextStartAt, e.ReminderOffsets = "Outro nome", moved, moved, []int{30}
	if err := repo.Update(ctx, e, reminderRows(moved, e.ReminderOffsets, time.Now())); err != nil {
		t.Fatal(err)
	}
	var n int
	var firstDue time.Time
	_ = db.QueryRow(ctx, `SELECT COUNT(*), MIN(due_at) FROM event_reminders WHERE event_id = $1 AND sent_at IS NULL`, e.ID).Scan(&n, &firstDue)
	if n != 2 || !firstDue.Equal(moved.Add(-30*time.Minute)) {
		t.Errorf("avisos pendentes = %d, primeiro em %v (esperava 2, em %v)", n, firstDue, moved.Add(-30*time.Minute))
	}
	got, err := repo.Find(ctx, server, e.ID)
	if err != nil || got.Title != "Outro nome" || len(got.ReminderOffsets) != 1 {
		t.Fatalf("Find depois do Update = %+v err=%v", got, err)
	}
}

func TestRepositoryUpdateBasicsKeepsTheScheduleAndTheReminders(t *testing.T) {
	db, ctx := eventDB(t)
	repo := NewRepository(db)
	owner, server := seedUserAndServer(t, db, "Servidor")
	start := time.Now().Add(3 * time.Hour).Truncate(time.Second)
	e := newTestEvent(server, owner, start)
	if err := repo.Create(ctx, e, reminderRows(start, e.ReminderOffsets, time.Now())); err != nil {
		t.Fatal(err)
	}
	banner := "11111111-1111-4111-8111-111111111111"
	e.Title, e.Description, e.BannerID = "Outro nome", "Nova descrição", &banner
	e.NextStartAt = start.Add(24 * time.Hour) // não pode ser gravado por esta consulta
	if err := repo.UpdateBasics(ctx, e); err != nil {
		t.Fatal(err)
	}
	got, err := repo.Find(ctx, server, e.ID)
	if err != nil || got.Title != "Outro nome" || got.Description != "Nova descrição" || got.BannerID == nil || *got.BannerID != banner {
		t.Fatalf("depois de editar: %+v err=%v", got, err)
	}
	if !got.NextStartAt.Equal(start) {
		t.Errorf("o horário não muda na edição simples: %v", got.NextStartAt)
	}
	var pending int
	_ = db.QueryRow(ctx, `SELECT COUNT(*) FROM event_reminders WHERE event_id = $1 AND sent_at IS NULL`, e.ID).Scan(&pending)
	if pending != 3 {
		t.Errorf("os avisos pendentes continuam (3), vieram %d", pending)
	}
	mustExec(t, db, `UPDATE server_events SET canceled_at = NOW() WHERE id = $1`, e.ID)
	if err := repo.UpdateBasics(ctx, e); !errors.Is(err, ErrEventNotFound) {
		t.Errorf("evento cancelado não se edita: %v", err)
	}
}

func TestRepositoryLiveBannerIDsIgnoresCanceledAndFinished(t *testing.T) {
	db, ctx := eventDB(t)
	repo := NewRepository(db)
	owner, server := seedUserAndServer(t, db, "Servidor")
	start := time.Now().Add(time.Hour).Truncate(time.Second)
	ids := map[string]string{
		"vivo":      "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
		"cancelado": "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
		"encerrado": "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
	}
	events := map[string]*Event{}
	for name, banner := range ids {
		b := banner
		e := newTestEvent(server, owner, start)
		e.BannerID = &b
		if err := repo.Create(ctx, e, nil); err != nil {
			t.Fatal(err)
		}
		events[name] = e
	}
	mustExec(t, db, `UPDATE server_events SET canceled_at = NOW() WHERE id = $1`, events["cancelado"].ID)
	mustExec(t, db, `UPDATE server_events SET finished_at = NOW() WHERE id = $1`, events["encerrado"].ID)

	live, err := repo.LiveBannerIDs(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if !live[ids["vivo"]] || live[ids["cancelado"]] || live[ids["encerrado"]] {
		t.Fatalf("banners em uso = %v: só o do evento vivo conta", live)
	}
}

func TestRepositoryStoresTheGame(t *testing.T) {
	db, ctx := eventDB(t)
	repo := NewRepository(db)
	owner, server := seedUserAndServer(t, db, "Servidor")
	start := time.Now().Add(3 * time.Hour).Truncate(time.Second)

	game := "Minecraft"
	withGame := newTestEvent(server, owner, start)
	withGame.GameName = &game
	withoutGame := newTestEvent(server, owner, start.Add(time.Hour))
	for _, e := range []*Event{withGame, withoutGame} {
		if err := repo.Create(ctx, e, nil); err != nil {
			t.Fatal(err)
		}
	}
	got, err := repo.Find(ctx, server, withGame.ID)
	if err != nil || got.GameName == nil || *got.GameName != "Minecraft" {
		t.Fatalf("com jogo: %+v err=%v", got, err)
	}
	if none, _ := repo.Find(ctx, server, withoutGame.ID); none.GameName != nil {
		t.Fatalf("sem jogo tem que voltar nil: %v", *none.GameName)
	}
	list, err := repo.ListUpcoming(ctx, server, owner)
	if err != nil || len(list) != 2 || list[0].GameName == nil || list[1].GameName != nil {
		t.Fatalf("a lista tem que trazer o jogo de cada evento: %+v err=%v", list, err)
	}

	other := "VALORANT"
	withGame.GameName = &other
	if err := repo.Update(ctx, withGame, nil); err != nil {
		t.Fatal(err)
	}
	if got, _ := repo.Find(ctx, server, withGame.ID); *got.GameName != "VALORANT" {
		t.Fatalf("Update tem que gravar o jogo: %v", *got.GameName)
	}

	// A edição simples não mexe no jogo.
	third := "Roblox"
	withGame.GameName = &third
	if err := repo.UpdateBasics(ctx, withGame); err != nil {
		t.Fatal(err)
	}
	if got, _ := repo.Find(ctx, server, withGame.ID); *got.GameName != "VALORANT" {
		t.Fatalf("UpdateBasics não pode trocar o jogo: %v", *got.GameName)
	}
}
