package serverobs

import (
	"context"
	"errors"
	"fmt"
	"time"

	"gin-quickstart/backend/internal/platform/hoststats"
)

// maxTables: quantas tabelas guardar por hora em db_table_sizes.
const maxTables = 10

type machineSource interface {
	Read() hoststats.Machine
}

type hostStore interface {
	InsertHostMinute(ctx context.Context, m HostMinute) error
	InsertTableSizes(ctx context.Context, hour time.Time, tables []TableSize) error
	DatabaseStats(ctx context.Context) (DatabaseStats, error)
	LargestTables(ctx context.Context, limit int) ([]TableSize, error)
}

// HostCollector grava a linha do minuto da VPS e, de hora em hora, as
// maiores tabelas. Nada aqui derruba o backend: o que falha vira nulo.
type HostCollector struct {
	machine   machineSource
	store     hostStore
	backupDir string
	now       func() time.Time
	lastHour  time.Time
}

// NewHostCollector já faz a primeira leitura da máquina: as taxas (CPU,
// disco, rede) são a diferença entre duas, e o primeiro minuto depois de um
// boot é o que mais interessa.
func NewHostCollector(machine machineSource, store hostStore, backupDir string) *HostCollector {
	machine.Read()
	return &HostCollector{machine: machine, store: store, backupDir: backupDir, now: time.Now}
}

// Run coleta a cada minuto até ctx acabar.
func (c *HostCollector) Run(ctx context.Context) {
	every(ctx, collectInterval, "coleta da VPS", c.Tick)
}

func (c *HostCollector) Tick(ctx context.Context) error {
	at := c.now()
	row := hostRow(c.machine.Read())
	row.Minute = at.Round(time.Minute)
	row.BackupAt, row.BackupBytes = newestFile(c.backupDir)
	dbErr := c.fillDatabase(ctx, &row)
	err := c.store.InsertHostMinute(ctx, row)
	if err != nil {
		err = fmt.Errorf("gravar minuto da VPS: %w", err)
	}
	return errors.Join(dbErr, err, c.tables(ctx, at))
}

func (c *HostCollector) fillDatabase(ctx context.Context, row *HostMinute) error {
	s, err := c.store.DatabaseStats(ctx)
	if err != nil {
		return err
	}
	row.DBSizeBytes, row.DBConnections = &s.SizeBytes, &s.Connections
	return nil
}

// tables: as maiores tabelas, na primeira coleta e quando a hora vira.
func (c *HostCollector) tables(ctx context.Context, at time.Time) error {
	hour := at.Truncate(time.Hour)
	if hour.Equal(c.lastHour) {
		return nil
	}
	tables, err := c.store.LargestTables(ctx, maxTables)
	if err == nil {
		err = c.store.InsertTableSizes(ctx, hour, tables)
	}
	if err != nil {
		return fmt.Errorf("tamanho das tabelas: %w", err)
	}
	c.lastHour = hour
	return nil
}
