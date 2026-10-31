package event

import (
	"testing"
	"time"
)

func TestClaimDueIsIdempotentAndSkipsCanceled(t *testing.T) {
	db, ctx := eventDB(t)
	repo := NewRepository(db)
	owner, server := seedUserAndServer(t, db, "Salinha")
	start := time.Now().Add(time.Minute).Truncate(time.Second)

	live := newTestEvent(server, owner, start)
	canceled := newTestEvent(server, owner, start)
	for _, e := range []*Event{live, canceled} {
		if err := repo.Create(ctx, e, nil); err != nil {
			t.Fatal(err)
		}
		mustExec(t, db, `INSERT INTO event_reminders (event_id, occurrence_start, offset_minutes, due_at)
			VALUES ($1, $2, 0, NOW() - INTERVAL '1 minute')`, e.ID, start)
	}
	mustExec(t, db, `UPDATE server_events SET canceled_at = NOW() WHERE id = $1`, canceled.ID)

	got, err := repo.ClaimDue(ctx, time.Now(), 50)
	if err != nil {
		t.Fatal(err)
	}
	if len(got) != 1 || got[0].EventID != live.ID || got[0].Title != "Noite" || got[0].ServerName != "Salinha" {
		t.Fatalf("reivindicados = %+v, esperava só o evento vivo, com título e servidor", got)
	}
	if got[0].ChannelName != "" {
		t.Errorf("sem sala aberta o nome do canal é vazio, veio %q", got[0].ChannelName)
	}
	again, err := repo.ClaimDue(ctx, time.Now(), 50)
	if err != nil || len(again) != 0 {
		t.Fatalf("segunda chamada devolveu %+v err=%v, esperava vazio", again, err)
	}
}

func TestClaimDueNamesTheOpenRoom(t *testing.T) {
	db, ctx := eventDB(t)
	repo := NewRepository(db)
	owner, server := seedUserAndServer(t, db, "Salinha")
	start := time.Now().Add(-time.Minute).Truncate(time.Second)
	e := newTestEvent(server, owner, start)
	if err := repo.Create(ctx, e, nil); err != nil {
		t.Fatal(err)
	}
	voice, text := seedChannel(t, db, server, owner, "voice"), seedChannel(t, db, server, owner, "text")
	if err := repo.SetRoom(ctx, e.ID, voice, text); err != nil {
		t.Fatal(err)
	}
	mustExec(t, db, `INSERT INTO event_reminders (event_id, occurrence_start, offset_minutes, due_at)
		VALUES ($1, $2, 0, NOW() - INTERVAL '1 minute')`, e.ID, start)

	got, err := repo.ClaimDue(ctx, time.Now(), 50)
	if err != nil || len(got) != 1 || got[0].ChannelName == "" {
		t.Fatalf("reivindicados = %+v err=%v, esperava o nome da sala", got, err)
	}
}

func TestGoingReturnsOnlyWhoSaidYes(t *testing.T) {
	db, ctx := eventDB(t)
	repo := NewRepository(db)
	owner, server := seedUserAndServer(t, db, "Salinha")
	other, _ := seedUserAndServer(t, db, "Outro")
	mustExec(t, db, `INSERT INTO server_members (server_id, user_id) VALUES ($1, $2)`, server, other)
	start := time.Now().Add(time.Hour).Truncate(time.Second)
	e := newTestEvent(server, owner, start)
	if err := repo.Create(ctx, e, nil); err != nil {
		t.Fatal(err)
	}
	_ = repo.SetRSVP(ctx, e.ID, owner, start, true)
	_ = repo.SetRSVP(ctx, e.ID, other, start, false)

	ids, err := repo.Going(ctx, e.ID, start)
	if err != nil || len(ids) != 1 || ids[0] != owner {
		t.Fatalf("ids = %v err=%v", ids, err)
	}
}

// insertEvent cria um evento de 120 min que começou há `startedAgo`.
func insertEvent(t *testing.T, repo *Repository, server, owner string, rule Recurrence, startedAgo time.Duration) *Event {
	t.Helper()
	start := time.Now().Add(-startedAgo).Truncate(time.Second)
	e := newTestEvent(server, owner, start)
	e.Recurrence = rule
	if err := repo.Create(t.Context(), e, nil); err != nil {
		t.Fatal(err)
	}
	return e
}

func giveRoom(t *testing.T, repo *Repository, e *Event, voice, text string) {
	t.Helper()
	if err := repo.SetRoom(t.Context(), e.ID, voice, text); err != nil {
		t.Fatal(err)
	}
}

func TestAdvanceDueMovesWeeklyEventToNextWeek(t *testing.T) {
	db, ctx := eventDB(t)
	repo := NewRepository(db)
	owner, server := seedUserAndServer(t, db, "Salinha")
	e := insertEvent(t, repo, server, owner, RecWeekly, 3*time.Hour) // os 120 min já passaram

	n, err := repo.AdvanceDue(ctx, time.Now(), brt, 50)
	if err != nil || n != 1 {
		t.Fatalf("avançou %d err=%v, esperava 1", n, err)
	}
	got, err := repo.Find(ctx, server, e.ID)
	if err != nil {
		t.Fatal(err)
	}
	if got.OccurrencesDone != 1 || got.FinishedAt != nil || !got.NextStartAt.Equal(e.StartsAt.AddDate(0, 0, 7)) {
		t.Fatalf("depois de avançar: done=%d finished=%v next=%v (início %v)", got.OccurrencesDone, got.FinishedAt, got.NextStartAt, e.StartsAt)
	}
	var pending int
	_ = db.QueryRow(ctx, `SELECT COUNT(*) FROM event_reminders WHERE event_id = $1 AND occurrence_start = $2 AND sent_at IS NULL`,
		e.ID, got.NextStartAt).Scan(&pending)
	if pending != 3 {
		t.Errorf("avisos da ocorrência nova = %d, esperava 3 (10, 5 e na hora)", pending)
	}
}

func TestAdvanceDueFinishesNonRepeatingEvent(t *testing.T) {
	db, ctx := eventDB(t)
	repo := NewRepository(db)
	owner, server := seedUserAndServer(t, db, "Salinha")
	e := insertEvent(t, repo, server, owner, RecNone, 3*time.Hour)

	if n, err := repo.AdvanceDue(ctx, time.Now(), brt, 50); err != nil || n != 1 {
		t.Fatalf("avançou %d err=%v", n, err)
	}
	if list, _ := repo.ListUpcoming(ctx, server, owner); len(list) != 0 {
		t.Errorf("evento encerrado ainda aparece: %+v", list)
	}
	if got, _ := repo.Find(ctx, server, e.ID); got.FinishedAt == nil {
		t.Error("finished_at deveria estar preenchido")
	}
}

func TestAdvanceDueLeavesRunningEventAlone(t *testing.T) {
	db, ctx := eventDB(t)
	repo := NewRepository(db)
	owner, server := seedUserAndServer(t, db, "Salinha")
	e := insertEvent(t, repo, server, owner, RecWeekly, time.Hour) // começou há 1 h, dura 2 h

	if n, err := repo.AdvanceDue(ctx, time.Now(), brt, 50); err != nil || n != 0 {
		t.Fatalf("avançou %d err=%v, esperava 0", n, err)
	}
	if got, _ := repo.Find(ctx, server, e.ID); got.OccurrencesDone != 0 {
		t.Errorf("occurrences_done = %d", got.OccurrencesDone)
	}
}

func TestAdvanceDueWaitsForTheRoomToClose(t *testing.T) {
	db, ctx := eventDB(t)
	repo := NewRepository(db)
	owner, server := seedUserAndServer(t, db, "Salinha")
	e := insertEvent(t, repo, server, owner, RecWeekly, 3*time.Hour)
	giveRoom(t, repo, e, seedChannel(t, db, server, owner, "voice"), seedChannel(t, db, server, owner, "text"))

	if n, err := repo.AdvanceDue(ctx, time.Now(), brt, 50); err != nil || n != 0 {
		t.Fatalf("evento com sala aberta não avança até a sala fechar: avançou %d err=%v", n, err)
	}
}

func TestRoomsToOpen(t *testing.T) {
	db, ctx := eventDB(t)
	repo := NewRepository(db)
	owner, server := seedUserAndServer(t, db, "Salinha")
	running := insertEvent(t, repo, server, owner, RecWeekly, 10*time.Minute)
	_ = insertEvent(t, repo, server, owner, RecWeekly, -time.Hour)  // ainda não começou
	_ = insertEvent(t, repo, server, owner, RecWeekly, 3*time.Hour) // já acabou
	withRoom := insertEvent(t, repo, server, owner, RecWeekly, 5*time.Minute)
	canceled := insertEvent(t, repo, server, owner, RecWeekly, 5*time.Minute)
	giveRoom(t, repo, withRoom, seedChannel(t, db, server, owner, "voice"), seedChannel(t, db, server, owner, "text"))
	mustExec(t, db, `UPDATE server_events SET canceled_at = NOW() WHERE id = $1`, canceled.ID)

	got, err := repo.RoomsToOpen(ctx, time.Now(), 50)
	if err != nil {
		t.Fatal(err)
	}
	if len(got) != 1 || got[0].EventID != running.ID || got[0].ServerID != server || got[0].Title != "Noite" ||
		!got[0].Occurrence.Equal(running.NextStartAt) || got[0].CreatedBy == nil || *got[0].CreatedBy != owner {
		t.Fatalf("salas a abrir = %+v, esperava só o evento em andamento sem sala", got)
	}
}

func TestRoomsToClose(t *testing.T) {
	db, ctx := eventDB(t)
	repo := NewRepository(db)
	owner, server := seedUserAndServer(t, db, "Salinha")
	ended := insertEvent(t, repo, server, owner, RecWeekly, 3*time.Hour)
	running := insertEvent(t, repo, server, owner, RecWeekly, 30*time.Minute)
	canceled := insertEvent(t, repo, server, owner, RecWeekly, 30*time.Minute)
	_ = insertEvent(t, repo, server, owner, RecWeekly, 3*time.Hour) // acabou, mas sem sala
	voices := map[string]string{}
	for _, e := range []*Event{ended, running, canceled} {
		voices[e.ID] = seedChannel(t, db, server, owner, "voice")
		giveRoom(t, repo, e, voices[e.ID], seedChannel(t, db, server, owner, "text"))
	}
	mustExec(t, db, `UPDATE server_events SET canceled_at = NOW() WHERE id = $1`, canceled.ID)

	got, err := repo.RoomsToClose(ctx, time.Now(), 50)
	if err != nil {
		t.Fatal(err)
	}
	found := map[string]RoomRef{}
	for _, r := range got {
		found[r.EventID] = r
	}
	if len(found) != 2 || found[ended.ID].VoiceID == nil || *found[ended.ID].VoiceID != voices[ended.ID] ||
		found[ended.ID].TextID == nil || found[ended.ID].ServerID != server || found[canceled.ID].VoiceID == nil {
		t.Fatalf("salas a fechar = %+v, esperava a que acabou e a do evento cancelado", got)
	}
}

func TestDeletingTheChannelsClearsTheRoom(t *testing.T) {
	db, ctx := eventDB(t)
	repo := NewRepository(db)
	owner, server := seedUserAndServer(t, db, "Salinha")
	e := insertEvent(t, repo, server, owner, RecWeekly, 10*time.Minute)
	voice, text := seedChannel(t, db, server, owner, "voice"), seedChannel(t, db, server, owner, "text")
	giveRoom(t, repo, e, voice, text)
	if got, _ := repo.Find(ctx, server, e.ID); got.VoiceChannelID == nil || *got.VoiceChannelID != voice || got.TextChannelID == nil {
		t.Fatalf("a sala devia estar gravada: %+v", got)
	}
	mustExec(t, db, `DELETE FROM channels WHERE id IN ($1, $2)`, voice, text)
	got, err := repo.Find(ctx, server, e.ID)
	if err != nil || got.VoiceChannelID != nil || got.TextChannelID != nil {
		t.Fatalf("apagar os canais zera a sala: %+v err=%v", got, err)
	}
}

func TestClaimDueCarriesTheGame(t *testing.T) {
	db, ctx := eventDB(t)
	repo := NewRepository(db)
	owner, server := seedUserAndServer(t, db, "Salinha")
	start := time.Now().Add(time.Minute).Truncate(time.Second)
	game := "Minecraft"
	withGame, withoutGame := newTestEvent(server, owner, start), newTestEvent(server, owner, start)
	withGame.GameName = &game
	for _, e := range []*Event{withGame, withoutGame} {
		if err := repo.Create(ctx, e, nil); err != nil {
			t.Fatal(err)
		}
		mustExec(t, db, `INSERT INTO event_reminders (event_id, occurrence_start, offset_minutes, due_at)
			VALUES ($1, $2, 0, NOW() - INTERVAL '1 minute')`, e.ID, start)
	}
	got, err := repo.ClaimDue(ctx, time.Now(), 50)
	if err != nil || len(got) != 2 {
		t.Fatalf("reivindicados = %+v err=%v", got, err)
	}
	games := map[string]string{}
	for _, d := range got {
		games[d.EventID] = d.Game
	}
	if games[withGame.ID] != "Minecraft" || games[withoutGame.ID] != "" {
		t.Fatalf("jogos = %v", games)
	}
}
