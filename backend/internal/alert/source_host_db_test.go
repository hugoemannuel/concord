package alert

import (
	"context"
	"testing"
	"time"
)

func TestRepositoryBackupAnteriorEPicoDeSaida(t *testing.T) {
	db := newTestDB(t, "000172_livekit_metrics.up.sql", "000211_host_metrics.up.sql")
	repo := NewRepository(db)
	ctx := context.Background()
	t0 := time.Date(2026, 11, 25, 12, 0, 0, 0, time.UTC)
	old, fresh := t0.Add(-24*time.Hour), t0.Add(-time.Hour)
	for _, row := range []struct {
		minute, backup time.Time
		bytes          int64
	}{
		{t0.Add(-2 * time.Hour), old, 300},
		{t0.Add(-30 * time.Minute), fresh, 100},
	} {
		if _, err := db.Exec(ctx, `INSERT INTO host_metrics (minute, backup_at, backup_bytes) VALUES ($1, $2, $3)`, row.minute, row.backup, row.bytes); err != nil {
			t.Fatal(err)
		}
	}
	prev, err := repo.PreviousBackup(ctx, fresh)
	if err != nil || prev == nil || !prev.At.Equal(old) || prev.Bytes != 300 {
		t.Fatalf("anterior = %+v, %v", prev, err)
	}
	if prev, err := repo.PreviousBackup(ctx, old); err != nil || prev != nil {
		t.Fatalf("antes do primeiro = %+v, %v", prev, err)
	}

	for i, mb := range []float64{10, 52, 30} {
		minute := t0.Add(time.Duration(-i) * time.Hour)
		if _, err := db.Exec(ctx, `INSERT INTO livekit_metrics (minute, seconds, up, bytes_out) VALUES ($1, 60, true, $2)`,
			minute, int64(mb*1e6/8*60)); err != nil {
			t.Fatal(err)
		}
	}
	if _, err := db.Exec(ctx, `INSERT INTO livekit_metrics (minute, seconds, up, bytes_out) VALUES ($1, 0, false, 999999999)`, t0.Add(time.Minute)); err != nil {
		t.Fatal(err)
	}
	peak, err := repo.PeakEgress(ctx, t0.Add(-24*time.Hour))
	if err != nil || peak == nil || !peak.Minute.Equal(t0.Add(-time.Hour)) || peak.Mbps < 51.9 || peak.Mbps > 52.1 {
		t.Fatalf("pico = %+v, %v", peak, err)
	}
	if peak, err := repo.PeakEgress(ctx, t0.Add(time.Hour)); err != nil || peak != nil {
		t.Fatalf("sem linhas = %+v, %v", peak, err)
	}
}
