package deviceobs

import (
	"context"
	"math"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

const sessionC = "6f1c1b7e-8a5e-4a51-9f2a-cccccccccccc"

// seedReport: a Ana com duas aberturas (1.40.0 por software e 1.41.0), a Bia
// numa só, e uma linha antiga da Ana fora do período.
func seedReport(t *testing.T) (*pgxpool.Pool, time.Time) {
	t.Helper()
	db := newTestDB(t)
	repo := NewRepository(db)
	ctx := context.Background()
	anaOld := Batch{
		Session: Session{ID: sessionA, OS: "Windows", AppVersion: "1.40.0", Target: "desktop",
			MemTotalMB: ip(8000), StartupMs: ip(16000), GPUStatus: GPUSoftware},
		Samples: []Sample{
			{Seconds: 60, State: StateCall, VisiblePct: fp(100), CPUBrowser: fp(2), CPURenderer: fp(20),
				CPUGPU: fp(3), CPUOther: fp(1), MemAppMB: fp(1400), SysMemFreeMB: fp(600), LagP95Ms: fp(100),
				LongMs: fp(3000), Hangs: 1, SlowInputs: 2, WSRTTMs: fp(40)},
			{Seconds: 240, State: StateIdle, VisiblePct: fp(50), CPUBrowser: fp(1), CPURenderer: fp(2),
				MemAppMB: fp(1000), SysMemFreeMB: fp(900), LagP95Ms: fp(20), LongMs: fp(0), SlowInputs: 4, WSRTTMs: fp(60)},
		},
	}
	anaNew := Batch{
		Session: Session{ID: sessionB, OS: "Windows 11", AppVersion: "1.41.0", Target: "desktop", GPUStatus: GPUEnabled},
		Samples: []Sample{{Seconds: 60, State: StateStream, VisiblePct: fp(100), CPURenderer: fp(30), WSRTTMs: fp(50)}},
	}
	bia := Batch{
		Session: Session{ID: sessionC, OS: "Linux", AppVersion: "1.41.0", Target: "web"},
		Samples: []Sample{{Seconds: 60, State: StateIdle}},
	}
	for _, s := range []struct {
		user string
		b    Batch
	}{{userAna, anaOld}, {userAna, anaNew}, {userBia, bia}} {
		if err := repo.Save(ctx, s.user, s.b); err != nil {
			t.Fatal(err)
		}
	}
	stmts := []string{
		`UPDATE device_sessions SET last_seen_at = NOW() - interval '1 hour' WHERE id = '` + sessionA + `'`,
		`INSERT INTO device_samples (session_id, at, seconds, state, hangs) VALUES ('` + sessionA + `', NOW() - interval '10 days', 60, 'call', 50)`,
	}
	for _, s := range stmts {
		if _, err := db.Exec(ctx, s); err != nil {
			t.Fatal(err)
		}
	}
	return db, time.Now().Add(-7 * 24 * time.Hour)
}

func near(p *float64, want float64) bool { return p != nil && math.Abs(*p-want) < 0.01 }

func TestReportRepositoryPeople(t *testing.T) {
	db, from := seedReport(t)
	people, err := NewReportRepository(db).People(context.Background(), from)
	if err != nil {
		t.Fatal(err)
	}
	if len(people) != 2 || people[0].Username != "ana" || people[1].Username != "bia" {
		t.Fatalf("pessoas = %+v", people)
	}
	a := people[0]
	if a.OS != "Windows 11" || a.AppVersion != "1.41.0" || a.Samples != 3 || a.Minutes != 6 {
		t.Errorf("contexto da última abertura = %+v", a)
	}
	checks := []struct {
		name string
		got  *float64
		want float64
	}{
		{"cpu do app (pelo tempo)", a.CPUApp, (26.0*60 + 3*240 + 30*60) / 360},
		{"renderer em call", a.CPURendererCall, 25},
		{"memória (pelo tempo)", a.MemAppMB, (1400.0*60 + 1000*240) / 300},
		{"memória livre mínima", a.MemFreeMinMB, 600},
		{"memória total", a.MemTotalMB, 8000},
		{"lag (mediana)", a.LagP95Ms, 60},
		{"quadros longos por minuto visível", a.LongMsPerMin, 3000.0 / 4},
		{"rtt (mediana)", a.WSRTTMs, 50},
		{"pior abertura", a.StartupMs, 16000},
	}
	for _, c := range checks {
		if !near(c.got, c.want) {
			t.Errorf("%s = %v, quer %v", c.name, show(c.got), c.want)
		}
	}
	if a.VisibleMinutes != 4 || a.Hangs != 1 || a.SlowInputs != 6 || !a.SoftwareGPU {
		t.Errorf("ana = %+v", a)
	}
	b := people[1]
	if b.CPUApp != nil || b.LongMsPerMin != nil || b.StartupMs != nil || b.SoftwareGPU || b.Target != "web" {
		t.Errorf("bia sem medidas = %+v", b)
	}
}

func TestReportRepositoryBaseline(t *testing.T) {
	db, from := seedReport(t)
	rows, err := NewReportRepository(db).Baseline(context.Background(), from)
	if err != nil {
		t.Fatal(err)
	}
	if len(rows) != 3 || rows[0].State != StateIdle || rows[1].State != StateCall || rows[2].State != StateStream {
		t.Fatalf("estados = %+v", rows)
	}
	idle := rows[0]
	if idle.Samples != 2 || idle.People != 2 || !near(idle.CPUAppP50, 3) || !near(idle.MemAppP50, 1000) ||
		!near(idle.LongMsPerMinP50, 0) {
		t.Errorf("parado = %+v", idle)
	}
	call := rows[1]
	if !near(call.CPUAppP90, 26) || !near(call.CPURendererP50, 20) || !near(call.LagP95P50, 100) ||
		!near(call.LongMsPerMinP50, 3000) {
		t.Errorf("call = %+v", call)
	}
}

func TestReportRepositoryVersions(t *testing.T) {
	db, from := seedReport(t)
	rows, err := NewReportRepository(db).Versions(context.Background(), from)
	if err != nil {
		t.Fatal(err)
	}
	if len(rows) != 3 {
		t.Fatalf("versões = %+v", rows)
	}
	keys := []string{rows[0].AppVersion + " " + rows[0].Target, rows[1].AppVersion + " " + rows[1].Target,
		rows[2].AppVersion + " " + rows[2].Target}
	if keys[0] != "1.41.0 desktop" || keys[1] != "1.41.0 web" || keys[2] != "1.40.0 desktop" {
		t.Errorf("ordem = %q", keys)
	}
	old := rows[2]
	if old.People != 1 || old.Samples != 2 || !near(old.CPUAppCall, 26) || !near(old.MemAppMB, 1080) ||
		!near(old.LongMsPerMin, 1000) || old.Hangs != 1 || old.SoftwareGPUPeople != 1 {
		t.Errorf("1.40.0 = %+v", old)
	}
	if rows[0].SoftwareGPUPeople != 0 || !near(rows[0].CPUAppCall, 30) {
		t.Errorf("1.41.0 = %+v", rows[0])
	}
}

func TestReportRepositoryIsDev(t *testing.T) {
	db := newTestDB(t)
	if _, err := db.Exec(context.Background(), `INSERT INTO dev_badge_users (user_id) VALUES ($1)`, userAna); err != nil {
		t.Fatal(err)
	}
	repo := NewReportRepository(db)
	for user, want := range map[string]bool{userAna: true, userBia: false} {
		got, err := repo.IsDev(context.Background(), user)
		if err != nil || got != want {
			t.Errorf("IsDev(%s) = %v %v, quer %v", user, got, err, want)
		}
	}
}

// Média pelo tempo, não pela linha: 5 min a 10% e 1 min a 40% dão 15%, não 25%.
// Linha sem a medida não puxa a média para baixo.
func TestReportRepositoryMediaPonderadaPeloTempo(t *testing.T) {
	db := newTestDB(t)
	b := Batch{
		Session: Session{ID: sessionA, AppVersion: "1.42.0", Target: "desktop"},
		Samples: []Sample{
			{Seconds: 300, State: StateCall, CPURenderer: fp(10), MemAppMB: fp(1000), SysCPUPct: fp(20)},
			{Seconds: 60, State: StateCall, CPURenderer: fp(40), MemAppMB: fp(1600), SysCPUPct: fp(80)},
			{Seconds: 60, State: StateCall},
		},
	}
	if err := NewRepository(db).Save(context.Background(), userAna, b); err != nil {
		t.Fatal(err)
	}
	repo := NewReportRepository(db)
	from := time.Now().Add(-time.Hour)
	people, err := repo.People(context.Background(), from)
	if err != nil || len(people) != 1 {
		t.Fatalf("pessoas = %+v %v", people, err)
	}
	p := people[0]
	if !near(p.CPUApp, 15) || !near(p.CPURendererCall, 15) || !near(p.MemAppMB, 1100) || !near(p.SysCPU, 30) {
		t.Errorf("médias = cpu %v, renderer %v, mem %v, sys %v; quer 15, 15, 1100, 30",
			show(p.CPUApp), show(p.CPURendererCall), show(p.MemAppMB), show(p.SysCPU))
	}
	versions, err := repo.Versions(context.Background(), from)
	if err != nil || len(versions) != 1 {
		t.Fatalf("versões = %+v %v", versions, err)
	}
	if v := versions[0]; !near(v.CPUAppCall, 15) || !near(v.MemAppMB, 1100) {
		t.Errorf("versão = cpu %v, mem %v; quer 15, 1100", show(v.CPUAppCall), show(v.MemAppMB))
	}
}
