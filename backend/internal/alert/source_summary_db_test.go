package alert

import (
	"context"
	"testing"
	"time"
)

func TestRepositoryDayStats(t *testing.T) {
	db := newTestDB(t, "000172_livekit_metrics.up.sql", "000173_live_telemetry.up.sql", "000176_live_samples_quality.up.sql",
		"000210_api_metrics.up.sql", "000211_host_metrics.up.sql", "000216_alerts.up.sql", "000220_alert_daily_summaries.up.sql")
	repo := NewRepository(db)
	ctx := context.Background()
	day := time.Date(2026, 11, 24, 3, 0, 0, 0, time.UTC) // 00:00 de Brasília
	end := day.Add(24 * time.Hour)
	exec := func(sql string, args ...any) {
		t.Helper()
		if _, err := db.Exec(ctx, sql, args...); err != nil {
			t.Fatalf("%s: %v", sql, err)
		}
	}
	u1, u2 := "00000000-0000-0000-0000-000000000001", "00000000-0000-0000-0000-000000000002"
	exec(`INSERT INTO users (id) VALUES ($1), ($2)`, u1, u2)
	// Call que começou na véspera: só conta a parte do dia (1 h); a outra, 30 min.
	exec(`INSERT INTO live_sessions (id, user_id, kind, started_at, last_seen_at, ended_at) VALUES
		('10000000-0000-0000-0000-000000000001', $1, 'call', $2, $3, $3),
		('10000000-0000-0000-0000-000000000002', $4, 'call', $5, $6, NULL),
		('10000000-0000-0000-0000-000000000003', $1, 'transmite', $5, $6, $6),
		('10000000-0000-0000-0000-000000000004', $4, 'transmite', $5, $6, $6)`,
		u1, day.Add(-time.Hour), day.Add(time.Hour), u2, day.Add(2*time.Hour), day.Add(150*time.Minute))
	// Live 3: 2 de 2 amostras abaixo do alvo; live 4: no alvo.
	exec(`INSERT INTO live_samples (session_id, at, seconds, fps, target_fps, step) VALUES
		('10000000-0000-0000-0000-000000000003', $1, 20, 30, 60, 0),
		('10000000-0000-0000-0000-000000000003', $1, 20, 60, 60, 1),
		('10000000-0000-0000-0000-000000000004', $1, 20, 59, 60, 0)`, day.Add(2*time.Hour))
	exec(`INSERT INTO live_events (session_id, at, type) VALUES
		('10000000-0000-0000-0000-000000000001', $1, 'conexao_falhou'),
		('10000000-0000-0000-0000-000000000001', $1, 'reconectou'),
		('10000000-0000-0000-0000-000000000002', $1, 'reconectou'),
		('10000000-0000-0000-0000-000000000002', $2, 'reconectou')`, day.Add(time.Hour), end.Add(time.Hour))
	for i, p95 := range []float64{100, 200, 3000} {
		exec(`INSERT INTO api_metrics (minute, requests, status_5xx, p95_ms, panics) VALUES ($1, 100, $2, $3, $4)`,
			day.Add(time.Duration(i)*time.Minute), i, p95, i/2)
	}
	exec(`INSERT INTO api_metrics (minute, requests, p95_ms) VALUES ($1, 2, 9000)`, day.Add(10*time.Minute))
	backup := day.Add(18 * time.Hour)
	exec(`INSERT INTO host_metrics (minute, cpu_pct, mem_used_pct, disk_used_pct, backup_at, backup_bytes) VALUES
		($1, 30, 60, 40, NULL, NULL), ($2, 90, 70, 41, $3, 1000)`, day.Add(time.Hour), day.Add(20*time.Hour), backup)
	exec(`INSERT INTO livekit_metrics (minute, seconds, up, bytes_out) VALUES ($1, 60, true, $2)`, day.Add(time.Hour), int64(30e6/8*60))
	exec(`INSERT INTO alert_incidents (rule_id, channel, severity, started_at, ended_at) VALUES
		('host_cpu', 'alert_infra', 'aviso', $1, $1), ('host_cpu', 'alert_infra', 'aviso', $1, $1), ('api_slow', 'alert_infra', 'aviso', $1, NULL)`,
		day.Add(time.Hour))

	s, err := repo.DayStats(ctx, day, end)
	if err != nil {
		t.Fatal(err)
	}
	checks := []struct {
		name string
		ok   bool
	}{
		{"pessoas em call", s.CallPeople == 2},
		{"horas de voz", s.CallHours > 1.49 && s.CallHours < 1.51},
		{"lives", s.Lives == 2 && s.LivesBelow == 1},
		{"pico de saída", s.PeakMbps != nil && *s.PeakMbps > 29.9 && *s.PeakMbps < 30.1},
		{"eventos", s.ConnectFailed == 1 && s.FailedPeople == 1 && s.Reconnects == 2 && s.ReconnectPeople == 2},
		{"api", s.Requests == 302 && s.Errors5xx == 3 && s.Panics == 1},
		{"p95 só com volume", s.P95Typical != nil && *s.P95Typical == 200 && s.P95Worst != nil && *s.P95Worst == 3000},
		{"máquina", s.CPUMax != nil && *s.CPUMax == 90 && s.MemMax != nil && *s.MemMax == 70 && s.DiskPct != nil && *s.DiskPct == 41},
		{"backup", s.BackupAt != nil && s.BackupAt.Equal(backup) && s.BackupBytes != nil && *s.BackupBytes == 1000},
		{"alertas", len(s.Alerts) == 2 && s.Alerts[0] == RuleCount{"host_cpu", 2} && s.OpenAlerts == 1},
	}
	for _, c := range checks {
		if !c.ok {
			t.Errorf("%s: %+v", c.name, s)
		}
	}

	if ok, err := repo.ClaimDailySummary(ctx, day, end); err != nil || !ok {
		t.Fatalf("primeira marca = %v, %v", ok, err)
	}
	if ok, err := repo.ClaimDailySummary(ctx, day, end); err != nil || ok {
		t.Fatalf("segunda marca = %v, %v", ok, err)
	}
	if last, err := repo.LastDailySummary(ctx); err != nil || last == nil || !last.Equal(end) {
		t.Fatalf("último = %v, %v", last, err)
	}
	if err := repo.ReleaseDailySummary(ctx, day); err != nil {
		t.Fatal(err)
	}
	if ok, _ := repo.ClaimDailySummary(ctx, day, end); !ok {
		t.Fatal("desmarcar não liberou o dia")
	}
}
