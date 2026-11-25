package serverobs

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"testing"
	"time"

	"gin-quickstart/backend/internal/platform/hoststats"
)

type fakeMachine struct{ m hoststats.Machine }

func (f fakeMachine) Read() hoststats.Machine { return f.m }

type fakeHostStore struct {
	minutes []HostMinute
	tables  map[time.Time][]TableSize
	dbErr   error
}

func (f *fakeHostStore) InsertHostMinute(_ context.Context, m HostMinute) error {
	f.minutes = append(f.minutes, m)
	return nil
}

func (f *fakeHostStore) InsertTableSizes(_ context.Context, hour time.Time, t []TableSize) error {
	if f.tables == nil {
		f.tables = map[time.Time][]TableSize{}
	}
	f.tables[hour] = t
	return nil
}

func (f *fakeHostStore) DatabaseStats(context.Context) (DatabaseStats, error) {
	return DatabaseStats{SizeBytes: 5 << 20, Connections: 9}, f.dbErr
}

func (f *fakeHostStore) LargestTables(context.Context, int) ([]TableSize, error) {
	return []TableSize{{Name: "messages", Bytes: 1 << 20}}, f.dbErr
}

func TestHostCollectorGravaAMaquinaOBancoEOBackup(t *testing.T) {
	dir := t.TempDir()
	old, recent := filepath.Join(dir, "concord-1.sql.gz"), filepath.Join(dir, "concord-2.sql.gz")
	for i, p := range []string{old, recent} {
		if err := os.WriteFile(p, make([]byte, 100*(i+1)), 0o600); err != nil {
			t.Fatal(err)
		}
	}
	backupAt := time.Date(2026, 11, 25, 3, 0, 0, 0, time.UTC)
	_ = os.Chtimes(old, backupAt.Add(-24*time.Hour), backupAt.Add(-24*time.Hour))
	_ = os.Chtimes(recent, backupAt, backupAt)
	// Dump que falhou (ou em andamento): mais novo, mas não é backup.
	failed := filepath.Join(dir, "concord-3.sql.gz.tmp")
	if err := os.WriteFile(failed, make([]byte, 7), 0o600); err != nil {
		t.Fatal(err)
	}
	boot := time.Date(2026, 11, 24, 10, 0, 0, 0, time.UTC)
	cpuPct := 33.0
	m := hoststats.Machine{
		Seconds: 60,
		CPU:     &hoststats.CPU{Percent: 40, IOWaitPercent: 2, StealPercent: 7},
		Load:    &hoststats.Load{One: 1, Five: 2, Fifteen: 3},
		Memory:  &hoststats.Memory{UsedPercent: 70, AvailableMB: 1200, SwapUsedMB: 50},
		Disk:    &hoststats.DiskSpace{UsedBytes: 10, FreeBytes: 30, UsedPercent: 25},
		DiskIO:  &hoststats.DiskIO{ReadBytesPerSec: 1, WriteBytesPerSec: 2, BusyPercent: 3},
		Net:     &hoststats.Net{RxBytesPerSec: 100, TxBytesPerSec: 200, RxPacketsPerSec: 1, TxPacketsPerSec: 2, Errors: 4, Drops: 5},
		UDP:     &hoststats.UDP{InErrors: 6, RcvbufErrors: 7, SndbufErrors: 8},
		Backend: &hoststats.Process{CPUPercent: &cpuPct, MemMB: 90},
		BootAt:  &boot,
	}
	store := &fakeHostStore{}
	at := time.Date(2026, 11, 25, 12, 0, 5, 0, time.UTC)
	c := NewHostCollector(fakeMachine{m}, store, dir)
	c.now = func() time.Time { return at }
	if err := c.Tick(context.Background()); err != nil {
		t.Fatal(err)
	}
	row := store.minutes[0]
	if *row.CPUPct != 40 || *row.StealPct != 7 || *row.Load15 != 3 || *row.SwapUsedMB != 50 || *row.DiskFreeBytes != 30 ||
		*row.NetTxBps != 200 || *row.NetDrops != 5 || *row.UDPRcvbufErrors != 7 || *row.BackendCPUPct != 33 ||
		row.PostgresMemMB != nil || row.InodesUsedPct != nil || !row.BootAt.Equal(boot) {
		t.Errorf("linha = %+v", row)
	}
	if *row.DBSizeBytes != 5<<20 || *row.DBConnections != 9 {
		t.Errorf("banco = %v %v", *row.DBSizeBytes, *row.DBConnections)
	}
	if row.BackupAt == nil || !row.BackupAt.Equal(backupAt) || *row.BackupBytes != 200 {
		t.Errorf("backup = %v %v, quer o mais novo", row.BackupAt, row.BackupBytes)
	}
	if !row.Minute.Equal(at.Truncate(time.Minute)) {
		t.Errorf("minute = %v", row.Minute)
	}
	// Tabelas: uma vez por hora.
	at = at.Add(time.Minute)
	_ = c.Tick(context.Background())
	at = at.Add(time.Hour)
	_ = c.Tick(context.Background())
	if len(store.tables) != 2 {
		t.Errorf("horas com tabelas = %d, quer 2", len(store.tables))
	}
}

func TestHostCollectorSemNadaGravaNulos(t *testing.T) {
	store := &fakeHostStore{dbErr: errors.New("banco fora")}
	c := NewHostCollector(fakeMachine{}, store, filepath.Join(t.TempDir(), "nao-existe"))
	err := c.Tick(context.Background())
	if err == nil {
		t.Error("quer o erro do banco no log")
	}
	if len(store.minutes) != 1 {
		t.Fatalf("linhas = %d, quer 1 mesmo sem nada", len(store.minutes))
	}
	row := store.minutes[0]
	if row.CPUPct != nil || row.DBSizeBytes != nil || row.BackupAt != nil || row.BootAt != nil {
		t.Errorf("linha = %+v, quer nulos", row)
	}
}

type countingMachine struct{ reads int }

func (c *countingMachine) Read() hoststats.Machine {
	c.reads++
	return hoststats.Machine{}
}

func TestHostCollectorLeAMaquinaJaNoBoot(t *testing.T) {
	m := &countingMachine{}
	NewHostCollector(m, &fakeHostStore{}, "")
	if m.reads != 1 {
		t.Errorf("leituras = %d, quer 1 (a base das taxas do primeiro minuto)", m.reads)
	}
}
