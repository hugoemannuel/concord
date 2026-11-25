package serverobs

import (
	"context"
	"testing"
	"time"
)

func TestHostRepositoryGravaLeEApaga(t *testing.T) {
	db := newTestDB(t, hostMigration)
	repo := NewHostRepository(db)
	ctx := context.Background()
	now := time.Now().UTC().Truncate(time.Minute)
	boot := now.Add(-time.Hour)
	rows := []HostMinute{
		{Minute: now.Add(-15 * 24 * time.Hour), CPUPct: ptr(1.0)},
		{Minute: now.Add(-2 * time.Minute), Seconds: 60, CPUPct: ptr(40.0), StealPct: ptr(5.0), MemUsedPct: ptr(70.0),
			SwapUsedMB: ptr(100.0), DiskUsedPct: ptr(50.0), NetRxBps: ptr(1000.0), UDPRcvbufErrors: ptr(int64(2)), BootAt: &boot},
		{Minute: now.Add(-time.Minute), Seconds: 60, CPUPct: ptr(60.0), StealPct: ptr(15.0), MemUsedPct: ptr(80.0),
			NetRxBps: ptr(3000.0), UDPRcvbufErrors: ptr(int64(3)), DBConnections: ptr(12), BootAt: &boot},
	}
	for _, r := range rows {
		if err := repo.InsertHostMinute(ctx, r); err != nil {
			t.Fatal(err)
		}
	}
	latest, err := repo.LatestHost(ctx)
	if err != nil || latest == nil || *latest.CPUPct != 60 || *latest.DBConnections != 12 || !latest.BootAt.Equal(boot) || latest.DiskUsedPct != nil {
		t.Fatalf("última = %+v, %v", latest, err)
	}
	recent, err := repo.RecentHost(ctx, 5)
	if err != nil || len(recent) != 2 {
		t.Fatalf("últimos 5 min = %d linhas, %v", len(recent), err)
	}
	series, err := repo.HostSeries(ctx, now.Add(-time.Hour), now.Add(time.Minute), time.Hour)
	if err != nil || len(series) == 0 {
		t.Fatalf("série = %+v, %v", series, err)
	}
	p := series[len(series)-1]
	if len(series) == 1 && (*p.CPUPct != 50 || *p.CPUMaxPct != 60 || *p.StealPct != 15 || *p.MemUsedPct != 80 || *p.NetRxBps != 2000 || *p.UDPRcvbufErrors != 5) {
		t.Errorf("balde = %+v, quer média de CPU/rede, pior minuto de CPU/steal/memória, soma dos erros", p)
	}
	if err := repo.Prune(ctx, now.Add(-14*24*time.Hour)); err != nil {
		t.Fatal(err)
	}
	if all, _ := repo.RecentHost(ctx, 30*24*60); len(all) != 2 {
		t.Errorf("depois da retenção = %d linhas, quer 2", len(all))
	}
}

func TestHostRepositoryTabelasEBanco(t *testing.T) {
	db := newTestDB(t, hostMigration)
	repo := NewHostRepository(db)
	ctx := context.Background()
	stats, err := repo.DatabaseStats(ctx)
	if err != nil || stats.SizeBytes <= 0 || stats.Connections < 1 {
		t.Fatalf("banco = %+v, %v", stats, err)
	}
	tables, err := repo.LargestTables(ctx, 10)
	if err != nil || len(tables) != 2 {
		t.Fatalf("tabelas = %+v, %v; quer as 2 do schema", tables, err)
	}
	hour := time.Date(2026, 11, 25, 12, 0, 0, 0, time.UTC)
	if err := repo.InsertTableSizes(ctx, hour.Add(-time.Hour), []TableSize{{Name: "velha", Bytes: 1}}); err != nil {
		t.Fatal(err)
	}
	if err := repo.InsertTableSizes(ctx, hour, []TableSize{{Name: "de antes do reinício", Bytes: 1}}); err != nil {
		t.Fatal(err)
	}
	if err := repo.InsertTableSizes(ctx, hour, tables); err != nil {
		t.Fatal(err)
	}
	got, err := repo.LatestTables(ctx)
	if err != nil || len(got) != 2 || got[0].Bytes < got[1].Bytes {
		t.Errorf("últimas tabelas = %+v, %v; quer as 2 da hora mais nova, da maior à menor", got, err)
	}
}
