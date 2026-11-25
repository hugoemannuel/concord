package liveobs

import (
	"context"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

const (
	sessionOld = "6f1c1b7e-8a5e-4a51-9f2a-000000000a01"
	sessionNew = "6f1c1b7e-8a5e-4a51-9f2a-000000000a02"
	callB      = "6f1c1b7e-8a5e-4a51-9f2a-cccccccccccd"
)

// oldCall: uma sessão de voz da ana na callA, parada há `stopped` (intervalo do Postgres).
func oldCall(t *testing.T, db *pgxpool.Pool, repo *TelemetryRepository, stopped string) {
	t.Helper()
	ctx := context.Background()
	old := Report{SessionID: sessionOld, Kind: KindCall, CallID: callA, Context: ClientContext{AppVersion: "0.6.97"}}
	if err := repo.Save(ctx, userAna, old); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(ctx, `UPDATE live_sessions SET started_at = now() - interval '1 hour',
		last_seen_at = now() - $2::interval WHERE id = $1`, sessionOld, stopped); err != nil {
		t.Fatal(err)
	}
}

func eventDetail(t *testing.T, db *pgxpool.Pool, session, typ string) (string, int) {
	t.Helper()
	var detail string
	n := 0
	rows, err := db.Query(context.Background(), `SELECT detail FROM live_events WHERE session_id = $1 AND type = $2`, session, typ)
	if err != nil {
		t.Fatal(err)
	}
	defer rows.Close()
	for rows.Next() {
		n++
		_ = rows.Scan(&detail)
	}
	return detail, n
}

// O app recomeçou no meio da call (atualização com retomada, crash, recarga):
// a sessão nova fecha a antiga no último sinal dela e diz quanto tempo a
// pessoa ficou fora e de que versão para qual.
func TestTelemetryRepositoryRetomadaFechaASessaoAntiga(t *testing.T) {
	db := newTelemetryDB(t)
	repo := NewTelemetryRepository(db)
	oldCall(t, db, repo, "73 seconds")
	fresh := Report{SessionID: sessionNew, Kind: KindCall, CallID: callA, Context: ClientContext{AppVersion: "0.6.98"}}
	if err := repo.Save(context.Background(), userAna, fresh); err != nil {
		t.Fatal(err)
	}
	if n := count(t, db, `SELECT count(*) FROM live_sessions WHERE id = $1 AND ended_at = last_seen_at`, sessionOld); n != 1 {
		t.Error("sessão antiga não foi fechada no último sinal")
	}
	if _, n := eventDetail(t, db, sessionOld, EventEnd); n != 1 {
		t.Errorf("fim da antiga: %d eventos, quer 1", n)
	}
	if n := count(t, db, `SELECT count(*) FROM live_events WHERE session_id = $1 AND type = 'fim'
		AND at = (SELECT last_seen_at FROM live_sessions WHERE id = $1)`, sessionOld); n != 1 {
		t.Error("o fim da antiga não ficou na hora do último sinal")
	}
	if detail, n := eventDetail(t, db, sessionNew, EventResumed); n != 1 || detail != "73 s · 0.6.97 → 0.6.98" {
		t.Errorf("retomou = %q (%d), quer \"73 s · 0.6.97 → 0.6.98\"", detail, n)
	}
}

func TestTelemetryRepositoryRetomadaMesmaVersao(t *testing.T) {
	db := newTelemetryDB(t)
	repo := NewTelemetryRepository(db)
	oldCall(t, db, repo, "2 minutes")
	fresh := Report{SessionID: sessionNew, Kind: KindCall, CallID: callA, Context: ClientContext{AppVersion: "0.6.97"}}
	if err := repo.Save(context.Background(), userAna, fresh); err != nil {
		t.Fatal(err)
	}
	if detail, _ := eventDetail(t, db, sessionNew, EventResumed); detail != "120 s" {
		t.Errorf("retomou = %q, quer \"120 s\"", detail)
	}
}

// Fora da janela de 30 s a 5 min, em outra call ou de outra pessoa: não é retomada.
func TestTelemetryRepositoryRetomadaSoNaJanela(t *testing.T) {
	cases := []struct {
		name    string
		stopped string
		fresh   Report
		user    string
	}{
		{"ainda mandando (outro aparelho)", "10 seconds", Report{SessionID: sessionNew, Kind: KindCall, CallID: callA}, userAna},
		{"parada há muito", "10 minutes", Report{SessionID: sessionNew, Kind: KindCall, CallID: callA}, userAna},
		{"outra call", "1 minute", Report{SessionID: sessionNew, Kind: KindCall, CallID: callB}, userAna},
		{"outra pessoa", "1 minute", Report{SessionID: sessionNew, Kind: KindCall, CallID: callA}, userBia},
		{"live, não voz", "1 minute", Report{SessionID: sessionNew, Kind: KindShare, CallID: callA}, userAna},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			db := newTelemetryDB(t)
			repo := NewTelemetryRepository(db)
			oldCall(t, db, repo, c.stopped)
			if err := repo.Save(context.Background(), c.user, c.fresh); err != nil {
				t.Fatal(err)
			}
			if n := count(t, db, `SELECT count(*) FROM live_sessions WHERE id = $1 AND ended_at IS NULL`, sessionOld); n != 1 {
				t.Error("fechou a sessão antiga")
			}
			if _, n := eventDetail(t, db, sessionNew, EventResumed); n != 0 {
				t.Error("gravou retomou")
			}
		})
	}
}

// Sessão sem notícia há mais de 10 minutos (app fechado, travou) é fechada no
// último sinal; a que ainda manda e a que já fechou ficam como estão.
func TestTelemetryRepositoryFechaAsSessoesSemNoticia(t *testing.T) {
	db := newTelemetryDB(t)
	repo := NewTelemetryRepository(db)
	ctx := context.Background()
	for _, id := range []string{sessionOld, sessionNew, sessionA} {
		if err := repo.Save(ctx, userAna, Report{SessionID: id, Kind: KindCall, CallID: callA}); err != nil {
			t.Fatal(err)
		}
	}
	if _, err := db.Exec(ctx, `UPDATE live_sessions SET last_seen_at = now() - interval '11 minutes' WHERE id = $1`, sessionOld); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(ctx, `UPDATE live_sessions SET last_seen_at = now() - interval '20 minutes',
		ended_at = now() - interval '15 minutes' WHERE id = $1`, sessionA); err != nil {
		t.Fatal(err)
	}
	if err := repo.CloseStale(ctx, mustNow(t, db).Add(-staleAfter)); err != nil {
		t.Fatal(err)
	}
	if n := count(t, db, `SELECT count(*) FROM live_sessions WHERE id = $1 AND ended_at = last_seen_at`, sessionOld); n != 1 {
		t.Error("sem notícia há 11 min não foi fechada no último sinal")
	}
	if _, n := eventDetail(t, db, sessionOld, EventEnd); n != 1 {
		t.Errorf("fim: %d, quer 1", n)
	}
	if n := count(t, db, `SELECT count(*) FROM live_sessions WHERE id = $1 AND ended_at IS NULL`, sessionNew); n != 1 {
		t.Error("fechou a sessão que ainda manda")
	}
	if _, n := eventDetail(t, db, sessionA, EventEnd); n != 0 {
		t.Error("mexeu na sessão que já tinha fechado")
	}
}

// mustNow: a hora do banco (a mesma do now() das consultas).
func mustNow(t *testing.T, db *pgxpool.Pool) time.Time {
	t.Helper()
	var now time.Time
	if err := db.QueryRow(context.Background(), `SELECT now()`).Scan(&now); err != nil {
		t.Fatal(err)
	}
	return now
}

func TestResumeCandidatesSoVozRecemNascida(t *testing.T) {
	owned := []ownedReport{
		{rep: Report{Kind: KindCall, CallID: callA}, inserted: true},
		{rep: Report{Kind: KindCall, CallID: callA}, inserted: false},
		{rep: Report{Kind: KindCall}, inserted: true},
		{rep: Report{Kind: KindWatch, CallID: callA}, inserted: true},
		{rep: Report{Kind: KindCall, CallID: callB}, inserted: true},
	}
	got := resumeCandidates(owned)
	if len(got) != 2 || got[0] != 0 || got[1] != 4 {
		t.Errorf("candidatas = %v, quer [0 4]", got)
	}
}

func TestResumedDetail(t *testing.T) {
	cases := []struct {
		r    resumed
		want string
	}{
		{resumed{73, "0.6.97", "0.6.98"}, "73 s · 0.6.97 → 0.6.98"},
		{resumed{40, "0.6.97", "0.6.97"}, "40 s"},
		{resumed{40, "", "0.6.103"}, "40 s · — → 0.6.103"},
	}
	for _, c := range cases {
		if got := c.r.detail(); got != c.want {
			t.Errorf("detail = %q, quer %q", got, c.want)
		}
	}
}

// O fim vem uma vez só: a sessão que o servidor já fechou (sem notícia ou
// retomada) e o fim reenviado depois de uma resposta perdida não ganham outro.
func TestTelemetryRepositoryFimUmaVezSo(t *testing.T) {
	db := newTelemetryDB(t)
	repo := NewTelemetryRepository(db)
	ctx := context.Background()
	for _, id := range []string{sessionOld, sessionNew} {
		if err := repo.Save(ctx, userAna, Report{SessionID: id, Kind: KindCall, CallID: callA}); err != nil {
			t.Fatal(err)
		}
	}
	if _, err := db.Exec(ctx, `UPDATE live_sessions SET last_seen_at = now() - interval '11 minutes' WHERE id = $1`, sessionOld); err != nil {
		t.Fatal(err)
	}
	if err := repo.CloseStale(ctx, mustNow(t, db).Add(-staleAfter)); err != nil {
		t.Fatal(err)
	}
	for _, id := range []string{sessionOld, sessionNew, sessionNew} {
		if err := repo.Save(ctx, userAna, Report{SessionID: id, Kind: KindCall, CallID: callA, Ended: true}); err != nil {
			t.Fatal(err)
		}
	}
	for _, id := range []string{sessionOld, sessionNew} {
		if _, n := eventDetail(t, db, id, EventEnd); n != 1 {
			t.Errorf("%s: %d fins, quer 1", id, n)
		}
	}
}

// Evento que aconteceu antes do primeiro relatório da sessão (entrada lenta,
// reenvio) não fica antes do início dela.
func TestTelemetryRepositoryInicioAntesDosEventos(t *testing.T) {
	db := newTelemetryDB(t)
	repo := NewTelemetryRepository(db)
	r := Report{SessionID: sessionNew, Kind: KindCall, CallID: callA, AgoMs: 10_000,
		Events: []Event{{Type: EventSlowJoin, AgoMs: 90_000}}}
	if err := repo.Save(context.Background(), userAna, r); err != nil {
		t.Fatal(err)
	}
	if n := count(t, db, `SELECT count(*) FROM live_sessions s WHERE id = $1
		AND started_at <= (SELECT min(at) FROM live_events WHERE session_id = $1 AND type = 'entrada_lenta')
		AND started_at = (SELECT at FROM live_events WHERE session_id = $1 AND type = 'inicio')
		AND last_seen_at > started_at`, sessionNew); n != 1 {
		t.Error("início depois do evento, ou o último sinal foi junto")
	}
}
