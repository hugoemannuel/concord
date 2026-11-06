package liveobs

import (
	"context"
	"errors"
	"strings"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

const (
	telemetryMigration = "000173_live_telemetry.up.sql"
	qualityMigration   = "000176_live_samples_quality.up.sql"
)

const (
	sessionB = "6f1c1b7e-8a5e-4a51-9f2a-eeeeeeeeeeee"
	userAna  = "6f1c1b7e-8a5e-4a51-9f2a-000000000001"
	userBia  = "6f1c1b7e-8a5e-4a51-9f2a-000000000002"
)

func newTelemetryDB(t *testing.T) *pgxpool.Pool {
	db := newTestDB(t, serverMigration, telemetryMigration, qualityMigration)
	if _, err := db.Exec(context.Background(), `INSERT INTO users (id) VALUES ($1), ($2)`, userAna, userBia); err != nil {
		t.Fatal(err)
	}
	return db
}

func count(t *testing.T, db *pgxpool.Pool, sql string, args ...any) int {
	t.Helper()
	var n int
	if err := db.QueryRow(context.Background(), sql, args...).Scan(&n); err != nil {
		t.Fatal(err)
	}
	return n
}

func TestTelemetryRepositoryGravaSessaoAmostrasEEventos(t *testing.T) {
	db := newTelemetryDB(t)
	repo := NewTelemetryRepository(db)
	ctx := context.Background()
	fps := 28.5
	r := Report{
		SessionID: sessionA, Kind: KindShare, CallID: callA,
		Context: ClientContext{OS: "Windows 11", AppVersion: "1.2.3", Target: "desktop", GPU: "ANGLE (NVIDIA)", Cores: 8},
		Sample:  &Sample{Seconds: 20, Codec: "H265", FPS: &fps, TargetFPS: intp(30), Freezes: 2, Transport: "udp"},
		Events:  []Event{{Type: EventStepDown, Detail: "1080p 60 → 720p 60 (cpu)"}},
	}
	if err := repo.Save(ctx, userAna, r); err != nil {
		t.Fatal(err)
	}
	r.Events = nil
	r.Ended = true
	if err := repo.Save(ctx, userAna, r); err != nil {
		t.Fatal(err)
	}

	if n := count(t, db, `SELECT count(*) FROM live_samples WHERE session_id = $1`, sessionA); n != 2 {
		t.Errorf("amostras = %d, quer 2", n)
	}
	var types []string
	rows, _ := db.Query(ctx, `SELECT type FROM live_events WHERE session_id = $1 ORDER BY id`, sessionA)
	for rows.Next() {
		var s string
		_ = rows.Scan(&s)
		types = append(types, s)
	}
	want := []string{EventStart, EventStepDown, EventEnd}
	if len(types) != 3 || types[0] != want[0] || types[1] != want[1] || types[2] != want[2] {
		t.Errorf("eventos = %v, quer %v", types, want)
	}
	if n := count(t, db, `SELECT count(*) FROM live_sessions WHERE id = $1 AND ended_at IS NOT NULL AND gpu = 'ANGLE (NVIDIA)' AND cores = 8`, sessionA); n != 1 {
		t.Error("sessão sem fim ou sem contexto")
	}
}

func TestTelemetryRepositorySessaoDeOutraPessoa(t *testing.T) {
	db := newTelemetryDB(t)
	repo := NewTelemetryRepository(db)
	ctx := context.Background()
	r := Report{SessionID: sessionA, Kind: KindWatch, StreamerID: userAna}
	if err := repo.Save(ctx, userAna, r); err != nil {
		t.Fatal(err)
	}
	r.Sample = &Sample{Seconds: 20}
	if err := repo.Save(ctx, userBia, r); !errors.Is(err, ErrNotOwner) {
		t.Fatalf("err = %v, quer ErrNotOwner", err)
	}
	if n := count(t, db, `SELECT count(*) FROM live_samples`); n != 0 {
		t.Errorf("amostra de outra pessoa gravada: %d", n)
	}
}

// O pedido inteiro numa transação: a sessão de outra pessoa é pulada e as
// outras gravam amostra e eventos, na ordem.
func TestTelemetryRepositorySaveAllGravaOPedidoInteiro(t *testing.T) {
	db := newTelemetryDB(t)
	repo := NewTelemetryRepository(db)
	ctx := context.Background()
	if err := repo.Save(ctx, userBia, Report{SessionID: sessionB, Kind: KindCall}); err != nil {
		t.Fatal(err)
	}
	reports := []Report{
		{SessionID: sessionB, Kind: KindCall, Sample: &Sample{Seconds: 20}},
		{SessionID: sessionA, Kind: KindShare, Sample: &Sample{Seconds: 20, Codec: "H264"},
			Events: []Event{{Type: EventStepDown, Detail: "a"}, {Type: EventStepDown, Detail: "b"}}, Ended: true},
	}
	if err := repo.SaveAll(ctx, userAna, reports); err != nil {
		t.Fatal(err)
	}
	if n := count(t, db, `SELECT count(*) FROM live_samples WHERE session_id = $1`, sessionB); n != 0 {
		t.Errorf("amostra na sessão de outra pessoa: %d", n)
	}
	if n := count(t, db, `SELECT count(*) FROM live_samples WHERE session_id = $1`, sessionA); n != 1 {
		t.Errorf("amostras = %d, quer 1", n)
	}
	var details []string
	rows, _ := db.Query(ctx, `SELECT type || ':' || detail FROM live_events WHERE session_id = $1 ORDER BY id`, sessionA)
	for rows.Next() {
		var s string
		_ = rows.Scan(&s)
		details = append(details, s)
	}
	want := []string{EventStart + ":", EventStepDown + ":a", EventStepDown + ":b", EventEnd + ":"}
	if strings.Join(details, ",") != strings.Join(want, ",") {
		t.Errorf("eventos = %v, quer %v", details, want)
	}
}

func TestTelemetryRepositoryApagaSessoesAntigas(t *testing.T) {
	db := newTelemetryDB(t)
	repo := NewTelemetryRepository(db)
	ctx := context.Background()
	r := Report{SessionID: sessionA, Kind: KindCall, Sample: &Sample{Seconds: 60}}
	if err := repo.Save(ctx, userAna, r); err != nil {
		t.Fatal(err)
	}
	if err := repo.Prune(ctx, time.Now().Add(-time.Hour)); err != nil {
		t.Fatal(err)
	}
	if n := count(t, db, `SELECT count(*) FROM live_sessions`); n != 1 {
		t.Fatalf("sessão recente apagada")
	}
	if err := repo.Prune(ctx, time.Now().Add(time.Hour)); err != nil {
		t.Fatal(err)
	}
	if n := count(t, db, `SELECT count(*) FROM live_samples`) + count(t, db, `SELECT count(*) FROM live_events`); n != 0 {
		t.Errorf("amostras/eventos sobraram: %d", n)
	}
}

func TestTelemetryRepositoryGravaOsSinaisDeQualidade(t *testing.T) {
	db := newTelemetryDB(t)
	ctx := context.Background()
	capture, codecMs, concealed, recvLoss := 41.5, 6.2, 3.5, 0.4
	r := Report{SessionID: sessionA, Kind: KindCall, CallID: callA, Sample: &Sample{
		Seconds: 60, CaptureFPS: &capture, CodecMs: &codecMs, ConcealedPct: &concealed,
		RecvLossPct: &recvLoss, ConnectMs: intp(1850),
	}}
	if err := NewTelemetryRepository(db).Save(ctx, userAna, r); err != nil {
		t.Fatal(err)
	}
	var gotCapture, gotCodec, gotConcealed, gotLoss float64
	var gotConnect int
	var recv *float64
	err := db.QueryRow(ctx, `SELECT capture_fps, recv_fps, codec_ms, concealed_pct, recv_loss_pct, connect_ms
		FROM live_samples WHERE session_id = $1`, sessionA).
		Scan(&gotCapture, &recv, &gotCodec, &gotConcealed, &gotLoss, &gotConnect)
	if err != nil {
		t.Fatal(err)
	}
	if gotCapture != 41.5 || recv != nil || gotConcealed != 3.5 || gotConnect != 1850 {
		t.Errorf("captura %v, recebidos %v, sintetizado %v, conectar %v", gotCapture, recv, gotConcealed, gotConnect)
	}
	if gotCodec < 6.19 || gotCodec > 6.21 || gotLoss < 0.39 || gotLoss > 0.41 {
		t.Errorf("codec %v ms, perda recebida %v", gotCodec, gotLoss)
	}
}
