package deviceobs

import (
	"context"
	"testing"
	"time"
)

func TestRepositoryGravaSessaoEAmostras(t *testing.T) {
	db := newTestDB(t)
	repo := NewRepository(db)
	ctx := context.Background()
	game := true
	b := Batch{
		Session: Session{ID: sessionA, OS: "Windows", AppVersion: "1.40.0", Target: "desktop",
			GPU: "ANGLE (NVIDIA)", Cores: 8, MemTotalMB: ip(16000), StartupMs: ip(4200), GPUStatus: GPUEnabled},
		Samples: []Sample{
			{Seconds: 60, AgoS: 120, State: StateCall, Game: &game, CPURenderer: fp(6.5), Hangs: 1, APICount: 12},
			{Seconds: 60, AgoS: 0, State: StateIdle, LongMs: fp(420)},
		},
	}
	if err := repo.Save(ctx, userAna, b); err != nil {
		t.Fatal(err)
	}
	if n := count(t, db, `SELECT count(*) FROM device_samples WHERE session_id = $1`, sessionA); n != 2 {
		t.Fatalf("amostras = %d, quer 2", n)
	}
	var ago float64
	var renderer float64
	var hangs, api int
	var gotGame *bool
	err := db.QueryRow(ctx, `SELECT EXTRACT(EPOCH FROM NOW() - at)::float8, cpu_renderer, hangs, api_count, game
		FROM device_samples WHERE state = 'call'`).Scan(&ago, &renderer, &hangs, &api, &gotGame)
	if err != nil {
		t.Fatal(err)
	}
	if ago < 119 || ago > 125 || renderer != 6.5 || hangs != 1 || api != 12 || gotGame == nil || !*gotGame {
		t.Errorf("linha = ago %v, renderer %v, hangs %d, api %d, game %v", ago, renderer, hangs, api, gotGame)
	}
	var os, status string
	var mem, startup int
	err = db.QueryRow(ctx, `SELECT os, gpu_status, mem_total_mb, startup_ms FROM device_sessions WHERE id = $1`, sessionA).
		Scan(&os, &status, &mem, &startup)
	if err != nil || os != "Windows" || status != GPUEnabled || mem != 16000 || startup != 4200 {
		t.Errorf("sessão = %q %q %d %d (%v)", os, status, mem, startup, err)
	}
}

func TestRepositoryRenovaSessao(t *testing.T) {
	db := newTestDB(t)
	repo := NewRepository(db)
	ctx := context.Background()
	b := goodBatch()
	b.Session.StartupMs = ip(4200)
	b.Session.GPUStatus = GPUEnabled
	if err := repo.Save(ctx, userAna, b); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(ctx, `UPDATE device_sessions SET last_seen_at = NOW() - interval '1 hour'`); err != nil {
		t.Fatal(err)
	}
	// Envio seguinte: sem startup e sem status não apaga o que já havia.
	b.Session.StartupMs = nil
	b.Session.GPUStatus = ""
	if err := repo.Save(ctx, userAna, b); err != nil {
		t.Fatal(err)
	}
	if n := count(t, db, `SELECT count(*) FROM device_sessions
		WHERE startup_ms = 4200 AND gpu_status = 'enabled' AND last_seen_at > NOW() - interval '1 minute'`); n != 1 {
		t.Errorf("sessão renovada = %d, quer 1 com startup e status mantidos", n)
	}
	// A GPU caiu e voltou por software: o status novo vale.
	b.Session.GPUStatus = GPUSoftware
	if err := repo.Save(ctx, userAna, b); err != nil {
		t.Fatal(err)
	}
	if n := count(t, db, `SELECT count(*) FROM device_sessions WHERE gpu_status = 'software'`); n != 1 {
		t.Errorf("status renovado = %d, quer 1", n)
	}
	if n := count(t, db, `SELECT count(*) FROM device_samples`); n != 3 {
		t.Errorf("amostras = %d, quer 3", n)
	}
}

func TestRepositoryPulaSessaoDeOutraPessoa(t *testing.T) {
	db := newTestDB(t)
	repo := NewRepository(db)
	ctx := context.Background()
	if err := repo.Save(ctx, userAna, goodBatch()); err != nil {
		t.Fatal(err)
	}
	b := goodBatch()
	b.Session.OS = "Linux"
	if err := repo.Save(ctx, userBia, b); err != nil {
		t.Fatalf("sessão de outra pessoa deveria ser pulada sem erro: %v", err)
	}
	if n := count(t, db, `SELECT count(*) FROM device_samples`); n != 1 {
		t.Errorf("amostras = %d, quer só a da Ana", n)
	}
	if n := count(t, db, `SELECT count(*) FROM device_sessions WHERE os = 'Windows' AND user_id = $1`, userAna); n != 1 {
		t.Errorf("sessão da Ana mudou")
	}
}

func TestRepositoryPruneApagaOQuePassou(t *testing.T) {
	db := newTestDB(t)
	repo := NewRepository(db)
	ctx := context.Background()
	old := goodBatch()
	old.Session.ID = sessionB
	for _, b := range []Batch{goodBatch(), old} {
		if err := repo.Save(ctx, userAna, b); err != nil {
			t.Fatal(err)
		}
	}
	// A sessão B ficou para trás; a A está viva, mas tem uma linha antiga.
	stmts := []string{
		`UPDATE device_sessions SET last_seen_at = NOW() - interval '20 days' WHERE id = '` + sessionB + `'`,
		`UPDATE device_samples SET at = NOW() - interval '20 days' WHERE session_id = '` + sessionB + `'`,
		`INSERT INTO device_samples (session_id, at, seconds, state) VALUES ('` + sessionA + `', NOW() - interval '15 days', 60, 'parado')`,
	}
	for _, s := range stmts {
		if _, err := db.Exec(ctx, s); err != nil {
			t.Fatal(err)
		}
	}
	if err := repo.Prune(ctx, time.Now().Add(-14*24*time.Hour)); err != nil {
		t.Fatal(err)
	}
	if n := count(t, db, `SELECT count(*) FROM device_sessions`); n != 1 {
		t.Errorf("sessões = %d, quer 1", n)
	}
	if n := count(t, db, `SELECT count(*) FROM device_samples`); n != 1 {
		t.Errorf("amostras = %d, quer só a recente", n)
	}
}
