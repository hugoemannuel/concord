package serverobs

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// HostRepository: host_metrics e db_table_sizes (migration 000211), e as
// leituras do próprio banco (tamanho, conexões, maiores tabelas). Leitura
// simples para os alertas: LatestHost e RecentHost.
type HostRepository struct {
	db *pgxpool.Pool
}

func NewHostRepository(db *pgxpool.Pool) *HostRepository {
	return &HostRepository{db: db}
}

const hostColumns = `minute, seconds, cpu_pct, iowait_pct, steal_pct, load1, load5, load15,
	mem_used_pct, mem_available_mb, swap_used_mb, disk_used_bytes, disk_free_bytes, disk_used_pct,
	inodes_used_pct, disk_read_bps, disk_write_bps, disk_busy_pct, net_rx_bps, net_tx_bps,
	net_rx_pps, net_tx_pps, net_errors, net_drops, udp_in_errors, udp_rcvbuf_errors,
	udp_sndbuf_errors, backend_cpu_pct, backend_mem_mb, postgres_cpu_pct, postgres_mem_mb,
	db_size_bytes, db_connections, backup_at, backup_bytes, boot_at`

func (m *HostMinute) fields() []any {
	return []any{&m.Minute, &m.Seconds, &m.CPUPct, &m.IOWaitPct, &m.StealPct, &m.Load1, &m.Load5, &m.Load15,
		&m.MemUsedPct, &m.MemAvailableMB, &m.SwapUsedMB, &m.DiskUsedBytes, &m.DiskFreeBytes, &m.DiskUsedPct,
		&m.InodesUsedPct, &m.DiskReadBps, &m.DiskWriteBps, &m.DiskBusyPct, &m.NetRxBps, &m.NetTxBps,
		&m.NetRxPps, &m.NetTxPps, &m.NetErrors, &m.NetDrops, &m.UDPInErrors, &m.UDPRcvbufErrors,
		&m.UDPSndbufErrors, &m.BackendCPUPct, &m.BackendMemMB, &m.PostgresCPUPct, &m.PostgresMemMB,
		&m.DBSizeBytes, &m.DBConnections, &m.BackupAt, &m.BackupBytes, &m.BootAt}
}

var insertHostSQL = upsertSQL("host_metrics", hostColumns, "minute", 36)

func (r *HostRepository) InsertHostMinute(ctx context.Context, m HostMinute) error {
	if _, err := r.db.Exec(ctx, insertHostSQL, m.fields()...); err != nil {
		return fmt.Errorf("inserir host_metrics: %w", err)
	}
	return nil
}

func scanHost(row pgx.CollectableRow) (HostMinute, error) {
	var m HostMinute
	return m, row.Scan(m.fields()...)
}

// LatestHost: a linha mais nova (nil com a tabela vazia).
func (r *HostRepository) LatestHost(ctx context.Context) (*HostMinute, error) {
	rows, _ := r.db.Query(ctx, `SELECT `+hostColumns+` FROM host_metrics ORDER BY minute DESC LIMIT 1`)
	m, err := pgx.CollectOneRow(rows, scanHost)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("ler host_metrics: %w", err)
	}
	return &m, nil
}

// RecentHost: as linhas dos últimos minutes minutos, da mais antiga à mais nova.
func (r *HostRepository) RecentHost(ctx context.Context, minutes int) ([]HostMinute, error) {
	rows, _ := r.db.Query(ctx, `SELECT `+hostColumns+` FROM host_metrics
		WHERE minute > now() - make_interval(mins => $1) ORDER BY minute`, minutes)
	out, err := pgx.CollectRows(rows, scanHost)
	if err != nil {
		return nil, fmt.Errorf("ler host_metrics: %w", err)
	}
	return out, nil
}

const hostSeriesSQL = `
SELECT date_bin(make_interval(secs => $3), minute, $1) AS at,
	avg(cpu_pct)::real, avg(iowait_pct)::real, avg(steal_pct)::real, max(load1),
	max(mem_used_pct), max(swap_used_mb), max(disk_used_pct),
	avg(disk_read_bps)::real, avg(disk_write_bps)::real, avg(net_rx_bps)::real, avg(net_tx_bps)::real,
	sum(net_errors)::bigint, sum(udp_rcvbuf_errors)::bigint,
	avg(backend_cpu_pct)::real, max(backend_mem_mb), avg(postgres_cpu_pct)::real, max(postgres_mem_mb)
FROM host_metrics WHERE minute >= $1 AND minute < $2
GROUP BY 1 ORDER BY 1`

// HostSeries: os minutos em [from, to) em baldes de bucket.
func (r *HostRepository) HostSeries(ctx context.Context, from, to time.Time, bucket time.Duration) ([]HostPoint, error) {
	rows, _ := r.db.Query(ctx, hostSeriesSQL, from, to, bucket.Seconds())
	out, err := pgx.CollectRows(rows, func(row pgx.CollectableRow) (HostPoint, error) {
		var p HostPoint
		return p, row.Scan(&p.At, &p.CPUPct, &p.IOWaitPct, &p.StealPct, &p.Load1, &p.MemUsedPct, &p.SwapUsedMB,
			&p.DiskUsedPct, &p.DiskReadBps, &p.DiskWriteBps, &p.NetRxBps, &p.NetTxBps, &p.NetErrors,
			&p.UDPRcvbufErrors, &p.BackendCPUPct, &p.BackendMemMB, &p.PostgresCPUPct, &p.PostgresMemMB)
	})
	if err != nil {
		return nil, fmt.Errorf("série de host_metrics: %w", err)
	}
	return out, nil
}

// DatabaseStats: tamanho do banco e conexões abertas nele agora.
type DatabaseStats struct {
	SizeBytes   int64
	Connections int
}

func (r *HostRepository) DatabaseStats(ctx context.Context) (DatabaseStats, error) {
	var s DatabaseStats
	err := r.db.QueryRow(ctx, `SELECT pg_database_size(current_database()),
		(SELECT count(*) FROM pg_stat_activity WHERE datname = current_database())::int`).Scan(&s.SizeBytes, &s.Connections)
	if err != nil {
		return DatabaseStats{}, fmt.Errorf("tamanho do banco: %w", err)
	}
	return s, nil
}

// LargestTables: as maiores tabelas do schema atual, com índices e TOAST.
func (r *HostRepository) LargestTables(ctx context.Context, limit int) ([]TableSize, error) {
	rows, _ := r.db.Query(ctx, `SELECT c.relname, pg_total_relation_size(c.oid)
		FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
		WHERE c.relkind IN ('r', 'p') AND n.nspname = current_schema()
		ORDER BY 2 DESC, 1 LIMIT $1`, limit)
	return collectTables(rows, "maiores tabelas")
}

func collectTables(rows pgx.Rows, what string) ([]TableSize, error) {
	out, err := pgx.CollectRows(rows, func(row pgx.CollectableRow) (TableSize, error) {
		var s TableSize
		return s, row.Scan(&s.Name, &s.Bytes)
	})
	if err != nil {
		return nil, fmt.Errorf("%s: %w", what, err)
	}
	return out, nil
}

// InsertTableSizes grava as tabelas de uma hora.
func (r *HostRepository) InsertTableSizes(ctx context.Context, hour time.Time, tables []TableSize) error {
	batch := &pgx.Batch{}
	for _, s := range tables {
		batch.Queue(`INSERT INTO db_table_sizes (hour, table_name, total_bytes) VALUES ($1, $2, $3)
			ON CONFLICT (hour, table_name) DO UPDATE SET total_bytes = EXCLUDED.total_bytes`, hour, s.Name, s.Bytes)
	}
	if err := r.db.SendBatch(ctx, batch).Close(); err != nil {
		return fmt.Errorf("inserir db_table_sizes: %w", err)
	}
	return nil
}

// LatestTables: as tabelas da hora mais nova, da maior à menor.
func (r *HostRepository) LatestTables(ctx context.Context) ([]TableSize, error) {
	rows, _ := r.db.Query(ctx, `SELECT table_name, total_bytes FROM db_table_sizes
		WHERE hour = (SELECT max(hour) FROM db_table_sizes) ORDER BY 2 DESC, 1`)
	return collectTables(rows, "ler db_table_sizes")
}

// Prune apaga o que é anterior a before (retenção).
func (r *HostRepository) Prune(ctx context.Context, before time.Time) error {
	if _, err := r.db.Exec(ctx, `DELETE FROM host_metrics WHERE minute < $1`, before); err != nil {
		return fmt.Errorf("apagar host_metrics antigos: %w", err)
	}
	if _, err := r.db.Exec(ctx, `DELETE FROM db_table_sizes WHERE hour < $1`, before); err != nil {
		return fmt.Errorf("apagar db_table_sizes antigos: %w", err)
	}
	return nil
}
