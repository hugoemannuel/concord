package apperrors

import (
	"context"
	"testing"
	"time"
)

type occRow struct {
	userID  *string
	version string
	screen  string
	count   int
	lastAt  time.Time
}

func occurrences(t *testing.T, r *Repository, fp string) []occRow {
	t.Helper()
	rows, err := r.db.Query(context.Background(), `SELECT user_id::text, app_version, screen, count, last_at
		FROM app_error_occurrences WHERE fingerprint = $1 ORDER BY id`, fp)
	if err != nil {
		t.Fatal(err)
	}
	defer rows.Close()
	var out []occRow
	for rows.Next() {
		var o occRow
		if err := rows.Scan(&o.userID, &o.version, &o.screen, &o.count, &o.lastAt); err != nil {
			t.Fatal(err)
		}
		out = append(out, o)
	}
	return out
}

func TestSaveAllSomaNaMesmaHoraESeparaPorVersao(t *testing.T) {
	r, _ := newTestRepo(t)
	ctx := context.Background()
	cc := ClientContext{OS: "Windows", AppVersion: "1.4.2", Target: TargetDesktop}
	e := captured(SourceRenderer, "TypeError", "x", 3)

	if err := r.SaveAll(ctx, userAna, cc, []Captured{e}, t0); err != nil {
		t.Fatal(err)
	}
	e2 := e
	e2.Count, e2.Screen, e2.Stack = 2, "/b", "outra pilha"
	if err := r.SaveAll(ctx, userAna, cc, []Captured{e2, e2}, t0.Add(20*time.Minute)); err != nil {
		t.Fatal(err)
	}
	cc.AppVersion = "1.4.3"
	if err := r.SaveAll(ctx, userAna, cc, []Captured{e}, t0.Add(30*time.Minute)); err != nil {
		t.Fatal(err)
	}

	got := occurrences(t, r, e.Fingerprint)
	if len(got) != 2 {
		t.Fatalf("ocorrências = %d, quer 2 (uma por versão)", len(got))
	}
	if got[0].count != 7 || got[0].screen != "/b" || !got[0].lastAt.Equal(t0.Add(20*time.Minute)) {
		t.Errorf("1.4.2 = %+v, quer count 7, tela da última e last_at da última", got[0])
	}
	var stack, firstVersion string
	var first, last time.Time
	if err := r.db.QueryRow(ctx, `SELECT stack, first_version, first_seen, last_seen FROM app_error_groups WHERE fingerprint = $1`,
		e.Fingerprint).Scan(&stack, &firstVersion, &first, &last); err != nil {
		t.Fatal(err)
	}
	if stack != e.Stack || firstVersion != "1.4.2" || !first.Equal(t0) || !last.Equal(t0.Add(30*time.Minute)) {
		t.Errorf("grupo: stack=%q primeira=%q first=%v last=%v", stack, firstVersion, first, last)
	}
}

func TestSaveAllSemContaJuntaNaMesmaLinha(t *testing.T) {
	r, _ := newTestRepo(t)
	ctx := context.Background()
	cc := ClientContext{OS: "linux", Target: TargetServer}
	e := captured(SourceBackend, "panic", "boom", 1)
	for range 2 {
		if err := r.SaveAll(ctx, "", cc, []Captured{e}, t0); err != nil {
			t.Fatal(err)
		}
	}
	got := occurrences(t, r, e.Fingerprint)
	if len(got) != 1 || got[0].userID != nil || got[0].count != 2 {
		t.Fatalf("ocorrências sem conta = %+v, quer uma linha com count 2 e user_id NULL", got)
	}
}

func TestSaveAllHoraNovaENovaLinha(t *testing.T) {
	r, _ := newTestRepo(t)
	ctx := context.Background()
	cc := ClientContext{AppVersion: "1", Target: TargetWeb}
	e := captured(SourceRenderer, "Error", "x", 1)
	for _, at := range []time.Time{t0, t0.Add(time.Hour)} {
		if err := r.SaveAll(ctx, userAna, cc, []Captured{e}, at); err != nil {
			t.Fatal(err)
		}
	}
	if got := occurrences(t, r, e.Fingerprint); len(got) != 2 {
		t.Fatalf("ocorrências = %d, quer 2 (uma por hora)", len(got))
	}
}

func TestPruneApagaPelaHoraEPelaUltimaVez(t *testing.T) {
	r, _ := newTestRepo(t)
	ctx := context.Background()
	cc := ClientContext{AppVersion: "1", Target: TargetWeb}
	old := captured(SourceRenderer, "Error", "velho", 1)
	mixed := captured(SourceRenderer, "Error", "misto", 1)
	if err := r.SaveAll(ctx, userAna, cc, []Captured{old, mixed}, t0.Add(-20*24*time.Hour)); err != nil {
		t.Fatal(err)
	}
	if err := r.SaveAll(ctx, userAna, cc, []Captured{mixed}, t0); err != nil {
		t.Fatal(err)
	}
	if err := r.Prune(ctx, t0.Add(-14*24*time.Hour)); err != nil {
		t.Fatal(err)
	}
	var groups, occ int
	if err := r.db.QueryRow(ctx, `SELECT (SELECT count(*) FROM app_error_groups), (SELECT count(*) FROM app_error_occurrences)`).
		Scan(&groups, &occ); err != nil {
		t.Fatal(err)
	}
	if groups != 1 || occ != 1 {
		t.Errorf("depois da retenção: %d grupos e %d ocorrências, quer 1 e 1", groups, occ)
	}
}
