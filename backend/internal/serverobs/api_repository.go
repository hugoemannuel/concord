package serverobs

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// APIRepository: api_metrics e api_route_metrics (migration 000210). Leitura
// simples para os alertas: LatestAPI e RecentAPI.
type APIRepository struct {
	db *pgxpool.Pool
}

func NewAPIRepository(db *pgxpool.Pool) *APIRepository {
	return &APIRepository{db: db}
}

const apiColumns = `minute, seconds, requests, status_2xx, status_3xx, status_4xx, status_5xx,
	p50_ms, p95_ms, p99_ms, max_ms, inflight, inflight_max, panics, ws_open, ws_connects,
	ws_disconnects, goroutines, heap_mb, sys_mb, gc_cycles, gc_pause_ms, gc_pause_max_ms,
	db_in_use, db_idle, db_total, db_max, db_waits, db_wait_ms`

func (m *APIMinute) fields() []any {
	return []any{&m.Minute, &m.Seconds, &m.Requests, &m.Status2xx, &m.Status3xx, &m.Status4xx, &m.Status5xx,
		&m.P50Ms, &m.P95Ms, &m.P99Ms, &m.MaxMs, &m.InFlight, &m.InFlightMax, &m.Panics, &m.WSOpen, &m.WSConnects,
		&m.WSDisconnects, &m.Goroutines, &m.HeapMB, &m.SysMB, &m.GCCycles, &m.GCPauseMs, &m.GCPauseMaxMs,
		&m.DBInUse, &m.DBIdle, &m.DBTotal, &m.DBMax, &m.DBWaits, &m.DBWaitMs}
}

var insertAPISQL = upsertSQL("api_metrics", apiColumns, "minute")

func (r *APIRepository) InsertAPIMinute(ctx context.Context, m APIMinute) error {
	if _, err := r.db.Exec(ctx, insertAPISQL, m.fields()...); err != nil {
		return fmt.Errorf("inserir api_metrics: %w", err)
	}
	return nil
}

const routeColumns = `minute, route, requests, status_4xx, status_5xx, p50_ms, p95_ms, max_ms, total_ms`

var insertRouteSQL = upsertSQL("api_route_metrics", routeColumns, "minute, route")

// InsertRoutes grava as rotas de uma janela num pedido só.
func (r *APIRepository) InsertRoutes(ctx context.Context, rows []RouteWindow) error {
	if len(rows) == 0 {
		return nil
	}
	if err := r.db.SendBatch(ctx, routeBatch(rows)).Close(); err != nil {
		return fmt.Errorf("inserir api_route_metrics: %w", err)
	}
	return nil
}

func routeBatch(rows []RouteWindow) *pgx.Batch {
	batch := &pgx.Batch{}
	for _, w := range rows {
		batch.Queue(insertRouteSQL, w.Minute, w.Route, w.Requests, w.Status4xx, w.Status5xx, w.P50Ms, w.P95Ms, w.MaxMs, w.TotalMs)
	}
	return batch
}

func scanAPI(row pgx.CollectableRow) (APIMinute, error) {
	var m APIMinute
	return m, row.Scan(m.fields()...)
}

// LatestAPI: a linha mais nova (nil com a tabela vazia).
func (r *APIRepository) LatestAPI(ctx context.Context) (*APIMinute, error) {
	rows, _ := r.db.Query(ctx, `SELECT `+apiColumns+` FROM api_metrics ORDER BY minute DESC LIMIT 1`)
	m, err := pgx.CollectOneRow(rows, scanAPI)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("ler api_metrics: %w", err)
	}
	return &m, nil
}

// RecentAPI: as linhas dos últimos minutes minutos, da mais antiga à mais nova.
func (r *APIRepository) RecentAPI(ctx context.Context, minutes int) ([]APIMinute, error) {
	rows, _ := r.db.Query(ctx, `SELECT `+apiColumns+` FROM api_metrics
		WHERE minute > now() - make_interval(mins => $1) ORDER BY minute`, minutes)
	out, err := pgx.CollectRows(rows, scanAPI)
	if err != nil {
		return nil, fmt.Errorf("ler api_metrics: %w", err)
	}
	return out, nil
}

const apiSeriesSQL = `
SELECT date_bin(make_interval(secs => $3), minute, $1) AS at, count(*)::int,
	sum(requests)::int, sum(status_4xx)::int, sum(status_5xx)::int,
	avg(p50_ms)::real, max(p95_ms), max(max_ms), sum(panics)::int,
	max(ws_open), sum(ws_disconnects)::int, max(goroutines), max(heap_mb),
	max(db_in_use), sum(db_waits)::int
FROM api_metrics WHERE minute >= $1 AND minute < $2
GROUP BY 1 ORDER BY 1`

// APISeries: os minutos em [from, to) em baldes de bucket.
func (r *APIRepository) APISeries(ctx context.Context, from, to time.Time, bucket time.Duration) ([]APIPoint, error) {
	rows, _ := r.db.Query(ctx, apiSeriesSQL, from, to, bucket.Seconds())
	out, err := pgx.CollectRows(rows, func(row pgx.CollectableRow) (APIPoint, error) {
		var p APIPoint
		return p, row.Scan(&p.At, &p.Minutes, &p.Requests, &p.Status4xx, &p.Status5xx, &p.P50Ms, &p.P95Ms,
			&p.MaxMs, &p.Panics, &p.WSOpen, &p.WSDisconnects, &p.Goroutines, &p.HeapMB, &p.DBInUse, &p.DBWaits)
	})
	if err != nil {
		return nil, fmt.Errorf("série de api_metrics: %w", err)
	}
	return out, nil
}

const routesSQL = `
SELECT route, sum(requests)::int, sum(status_4xx)::int, sum(status_5xx)::int,
	(sum(total_ms) / nullif(sum(requests), 0))::real, max(p95_ms), max(max_ms), sum(total_ms)::real
FROM api_route_metrics WHERE minute > $1 AND minute <= $2
GROUP BY route ORDER BY 4 DESC, 8 DESC, route LIMIT $3`

// Routes: as rotas do período, com 5xx primeiro e depois as que mais gastaram
// tempo. A janela cobre os 5 min antes de minute: por isso o > e o <=.
func (r *APIRepository) Routes(ctx context.Context, from, to time.Time, limit int) ([]RouteRow, error) {
	rows, _ := r.db.Query(ctx, routesSQL, from, to, limit)
	out, err := pgx.CollectRows(rows, func(row pgx.CollectableRow) (RouteRow, error) {
		var x RouteRow
		return x, row.Scan(&x.Route, &x.Requests, &x.Status4xx, &x.Status5xx, &x.AvgMs, &x.P95Ms, &x.MaxMs, &x.TotalMs)
	})
	if err != nil {
		return nil, fmt.Errorf("rotas de api_route_metrics: %w", err)
	}
	return out, nil
}

// Prune apaga o que é anterior a before (retenção).
func (r *APIRepository) Prune(ctx context.Context, before time.Time) error {
	for _, table := range []string{"api_metrics", "api_route_metrics"} {
		if _, err := r.db.Exec(ctx, `DELETE FROM `+table+` WHERE minute < $1`, before); err != nil {
			return fmt.Errorf("apagar %s antigos: %w", table, err)
		}
	}
	return nil
}
