package alert

import (
	"context"
	"testing"
	"time"
)

func newAlertDB(t *testing.T) *Repository {
	t.Helper()
	db := newTestDB(t, "000172_livekit_metrics.up.sql", "000173_live_telemetry.up.sql", "000216_alerts.up.sql")
	return NewRepository(db)
}

func TestRepositoryIncidentes(t *testing.T) {
	repo := newAlertDB(t)
	ctx := context.Background()
	t0 := time.Date(2026, 11, 25, 17, 0, 0, 0, time.UTC)
	inc := &Incident{RuleID: "host_cpu", Channel: "alert_infra", Severity: "aviso", StartedAt: t0, LastMessageAt: &t0, Text: "CPU em 88%"}
	if err := repo.InsertIncident(ctx, inc); err != nil {
		t.Fatal(err)
	}
	// Um segundo aberto da mesma regra é recusado (índice único parcial).
	if err := repo.InsertIncident(ctx, &Incident{RuleID: "host_cpu", Channel: "alert_infra", Severity: "aviso", StartedAt: t0}); err == nil {
		t.Fatal("aceitou dois incidentes abertos da mesma regra")
	}
	inc.Severity, inc.Text = "critico", "CPU em 97%"
	if err := repo.UpdateIncident(ctx, *inc); err != nil {
		t.Fatal(err)
	}
	open, err := repo.OpenIncidents(ctx)
	if err != nil || len(open) != 1 || open[0].Severity != "critico" || open[0].Text != "CPU em 97%" {
		t.Fatalf("abertos = %+v, %v", open, err)
	}
	if err := repo.CloseIncident(ctx, inc.ID, t0.Add(10*time.Minute)); err != nil {
		t.Fatal(err)
	}
	if open, _ := repo.OpenIncidents(ctx); len(open) != 0 {
		t.Fatalf("ficou aberto: %+v", open)
	}
	hist, err := repo.History(ctx, t0.Add(-time.Hour))
	if err != nil || len(hist) != 1 || hist[0].EndedAt == nil {
		t.Fatalf("histórico = %+v, %v", hist, err)
	}
	if err := repo.Prune(ctx, t0.Add(time.Hour)); err != nil {
		t.Fatal(err)
	}
	if hist, _ := repo.History(ctx, t0.Add(-time.Hour)); len(hist) != 0 {
		t.Fatalf("retenção não apagou: %+v", hist)
	}
}

func TestRepositoryBoots(t *testing.T) {
	repo := newAlertDB(t)
	ctx := context.Background()
	t0 := time.Date(2026, 11, 25, 17, 0, 0, 0, time.UTC)
	first, prev, err := repo.StartRun(ctx, "a1", t0)
	if err != nil || prev != nil {
		t.Fatalf("primeiro boot: prev %+v, %v", prev, err)
	}
	if err := repo.StopRun(ctx, first, t0.Add(time.Hour)); err != nil {
		t.Fatal(err)
	}
	_, prev, err = repo.StartRun(ctx, "b2", t0.Add(time.Hour+5*time.Second))
	if err != nil || prev == nil || prev.Version != "a1" || prev.StoppedAt == nil {
		t.Fatalf("boot anterior = %+v, %v", prev, err)
	}
	_, _, _ = repo.StartRun(ctx, "b2", t0.Add(time.Hour+time.Minute))
	n, err := repo.CrashedRunsSince(ctx, t0.Add(30*time.Minute))
	if err != nil || n != 2 {
		t.Fatalf("sem parada limpa = %d, %v", n, err)
	}
}

func TestRepositoryFontes(t *testing.T) {
	repo := newAlertDB(t)
	ctx := context.Background()
	t0 := time.Date(2026, 11, 25, 17, 0, 0, 0, time.UTC)
	if last, err := repo.LastMinute(ctx); err != nil || last != nil {
		t.Fatalf("tabela vazia: %v, %v", last, err)
	}
	for i, cpu := range []float64{50, 90, 97} {
		if _, err := repo.db.Exec(ctx, `INSERT INTO livekit_metrics (minute, up, host_cpu_pct, host_mem_pct) VALUES ($1, $2, $3, 40)`,
			t0.Add(time.Duration(i)*time.Minute), i != 2, cpu); err != nil {
			t.Fatal(err)
		}
	}
	mins, err := repo.RecentMinutes(ctx, t0.Add(time.Minute))
	if err != nil || len(mins) != 2 || *mins[0].HostCPU != 97 || mins[0].Up || !mins[1].Up || mins[0].LiveKitCPU != nil {
		t.Fatalf("minutos = %+v, %v", mins, err)
	}
	if last, _ := repo.LastMinute(ctx); last == nil || !last.Equal(t0.Add(2*time.Minute)) {
		t.Fatalf("último minuto = %v", last)
	}

	users := []string{"8afacbca-308c-4f59-9bc2-6f082cafdad1", "8afacbca-308c-4f59-9bc2-6f082cafdad2"}
	for i, u := range users {
		session := "11111111-1111-4111-8111-11111111111" + string(rune('1'+i))
		mustExec(t, repo, `INSERT INTO users (id) VALUES ($1)`, u)
		mustExec(t, repo, `INSERT INTO live_sessions (id, user_id, kind) VALUES ($1, $2, 'call')`, session, u)
		mustExec(t, repo, `INSERT INTO live_events (session_id, at, type, detail) VALUES ($1, $2, 'conexao_falhou', 'entrando (mídia): sem rota')`, session, t0)
		mustExec(t, repo, `INSERT INTO live_events (session_id, at, type, detail) VALUES ($1, $2, 'conexao_falhou', 'entrando (mídia): de novo')`, session, t0)
	}
	mustExec(t, repo, `INSERT INTO live_events (session_id, at, type, detail) VALUES ($1, $2, 'conexao_falhou', 'reconectando: x')`, "11111111-1111-4111-8111-111111111111", t0)
	n, err := repo.PeopleWithEvent(ctx, "conexao_falhou", "entrando (mídia)", t0.Add(-time.Minute))
	if err != nil || n != 2 {
		t.Fatalf("pessoas = %d, %v", n, err)
	}
	if n, _ := repo.PeopleWithEvent(ctx, "conexao_falhou", "entrando (mídia)", t0.Add(time.Minute)); n != 0 {
		t.Fatalf("contou evento fora da janela: %d", n)
	}
}

func mustExec(t *testing.T, repo *Repository, sql string, args ...any) {
	t.Helper()
	if _, err := repo.db.Exec(context.Background(), sql, args...); err != nil {
		t.Fatalf("%s: %v", sql, err)
	}
}

func TestRepositoryUltimoIncidenteDaRegra(t *testing.T) {
	repo := newAlertDB(t)
	ctx := context.Background()
	if last, err := repo.LastIncident(ctx, "host_frozen"); err != nil || last != nil {
		t.Fatalf("vazio = %+v, %v", last, err)
	}
	t0 := time.Date(2026, 11, 25, 9, 32, 0, 0, time.UTC)
	for i, rule := range []string{"host_frozen", "host_frozen", "host_cpu"} {
		end := t0.Add(time.Duration(i+1) * time.Hour)
		inc := &Incident{RuleID: rule, Channel: "alert_infra", Severity: "critico", StartedAt: t0.Add(time.Duration(i) * time.Hour), EndedAt: &end}
		if err := repo.InsertIncident(ctx, inc); err != nil {
			t.Fatal(err)
		}
	}
	last, err := repo.LastIncident(ctx, "host_frozen")
	if err != nil || last == nil || !last.StartedAt.Equal(t0.Add(time.Hour)) {
		t.Fatalf("último = %+v, %v", last, err)
	}
}
