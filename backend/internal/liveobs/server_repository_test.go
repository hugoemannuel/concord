package liveobs

import (
	"context"
	"testing"
	"time"
)

const (
	serverMigration = "000172_livekit_metrics.up.sql"
	// startedMigration: livekit_metrics.livekit_started_at (o início do LiveKit).
	startedMigration = "000217_livekit_metrics_started_at.up.sql"
)

func ptr(v float64) *float64 { return &v }

func TestServerRepositoryGravaLeEApaga(t *testing.T) {
	db := newTestDB(t, serverMigration, startedMigration)
	repo := NewServerRepository(db)
	ctx := context.Background()
	base := time.Date(2026, 10, 29, 12, 0, 0, 0, time.UTC)
	started := base.Add(-3 * time.Hour)
	rows := []ServerMinute{
		{Minute: base.Add(-15 * 24 * time.Hour), Up: true, BytesIn: 1},
		{Minute: base, Seconds: 60, Up: true, BytesIn: 7_500_000, BytesOut: 15_000_000, PacketsLostOut: 3,
			RTTMs: ptr(50), Participants: 5, LiveKitStartedAt: &started, LiveKitCPUPercent: ptr(12.5), HostCPUPercent: ptr(30), HostMemPercent: ptr(60)},
		{Minute: base.Add(time.Minute), Up: false, HostCPUPercent: ptr(5)},
	}
	for _, r := range rows {
		if err := repo.InsertServerMinute(ctx, r); err != nil {
			t.Fatal(err)
		}
	}
	// Mesmo minuto de novo (coleta dupla): fica a última, sem erro.
	again := rows[1]
	again.Participants = 6
	if err := repo.InsertServerMinute(ctx, again); err != nil {
		t.Fatal(err)
	}

	got, err := repo.ServerSeries(ctx, base.Add(-time.Hour), base.Add(time.Hour))
	if err != nil {
		t.Fatal(err)
	}
	if len(got) != 2 {
		t.Fatalf("série = %d linhas, quer 2", len(got))
	}
	m := got[0]
	if m.Participants != 6 || m.BytesOut != 15_000_000 || *m.RTTMs != 50 || *m.HostMemPercent != 60 || *m.LiveKitCPUPercent != 12.5 {
		t.Errorf("linha lida = %+v", m)
	}
	if m.LiveKitStartedAt == nil || !m.LiveKitStartedAt.Equal(started) {
		t.Errorf("início do LiveKit = %v, quer %v", m.LiveKitStartedAt, started)
	}
	if got[1].Up || got[1].RTTMs != nil || got[1].LiveKitStartedAt != nil {
		t.Errorf("minuto sem LiveKit = %+v", got[1])
	}

	if err := repo.Prune(ctx, base.Add(-14*24*time.Hour)); err != nil {
		t.Fatal(err)
	}
	all, err := repo.ServerSeries(ctx, base.Add(-30*24*time.Hour), base.Add(time.Hour))
	if err != nil {
		t.Fatal(err)
	}
	if len(all) != 2 {
		t.Errorf("depois de apagar os antigos: %d linhas, quer 2", len(all))
	}
}
