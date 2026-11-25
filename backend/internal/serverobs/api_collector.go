package serverobs

import (
	"context"
	"errors"
	"fmt"
	"runtime"
	"time"

	"gin-quickstart/backend/internal/platform/httpmetrics"

	"github.com/jackc/pgx/v5/pgxpool"
)

const (
	collectInterval = time.Minute
	routeWindow     = 5 * time.Minute
	// maxRoutes: teto de rotas por janela de 5 min (ADR 0067).
	maxRoutes = 20
)

type apiSource interface {
	TakeMinute() httpmetrics.Minute
	TakeRoutes(limit int) []httpmetrics.Route
}

type apiStore interface {
	InsertAPIMinute(ctx context.Context, m APIMinute) error
	InsertRoutes(ctx context.Context, rows []RouteWindow) error
}

// PoolStats: o pool do Postgres agora; Waits e WaitTime são acumulados.
type PoolStats struct {
	InUse, Idle, Total, Max int
	Waits                   int64
	WaitTime                time.Duration
}

// PoolStatsOf: o pgxpool.Stat do pool. Esperas = pedidos de conexão que
// encontraram o pool cheio.
func PoolStatsOf(db *pgxpool.Pool) func() PoolStats {
	return func() PoolStats {
		s := db.Stat()
		return PoolStats{InUse: int(s.AcquiredConns()), Idle: int(s.IdleConns()), Total: int(s.TotalConns()),
			Max: int(s.MaxConns()), Waits: s.EmptyAcquireCount(), WaitTime: s.EmptyAcquireWaitTime()}
	}
}

// APICollector grava a linha do minuto da API e, de 5 em 5 minutos, as rotas.
type APICollector struct {
	source   apiSource
	pool     func() PoolStats
	store    apiStore
	now      func() time.Time
	last     time.Time
	window   time.Time
	prevPool PoolStats
	prevGC   uint32
	prevGCNs uint64
}

func NewAPICollector(source apiSource, pool func() PoolStats, store apiStore) *APICollector {
	c := &APICollector{source: source, pool: pool, store: store, now: time.Now}
	c.start(time.Now())
	return c
}

// start: o começo da contagem (o recorder conta desde o boot).
func (c *APICollector) start(at time.Time) {
	c.last, c.window = at, at.Truncate(routeWindow)
}

// Run coleta a cada minuto até ctx acabar.
func (c *APICollector) Run(ctx context.Context) {
	every(ctx, collectInterval, "coleta da API", c.Tick)
}

func (c *APICollector) Tick(ctx context.Context) error {
	at := c.now()
	row := apiRow(c.source.TakeMinute())
	row.Minute, row.Seconds = at.Truncate(time.Minute), at.Sub(c.last).Seconds()
	c.last = at
	c.fillRuntime(&row)
	c.fillPool(&row)
	err := c.store.InsertAPIMinute(ctx, row)
	if err != nil {
		err = fmt.Errorf("gravar minuto da API: %w", err)
	}
	return errors.Join(err, c.flushRoutes(ctx, at))
}

func apiRow(m httpmetrics.Minute) APIMinute {
	return APIMinute{
		Requests: int(m.Requests), Status2xx: int(m.Status2xx), Status3xx: int(m.Status3xx),
		Status4xx: int(m.Status4xx), Status5xx: int(m.Status5xx),
		P50Ms: m.Latency.P50, P95Ms: m.Latency.P95, P99Ms: m.Latency.P99, MaxMs: m.Latency.Max,
		InFlight: int(m.InFlight), InFlightMax: int(m.InFlightMax), Panics: int(m.Panics),
		WSOpen: int(m.WSOpen), WSConnects: int(m.WSConnects), WSDisconnects: int(m.WSDisconnects),
	}
}

func (c *APICollector) fillRuntime(row *APIMinute) {
	var ms runtime.MemStats
	runtime.ReadMemStats(&ms)
	row.Goroutines = runtime.NumGoroutine()
	row.HeapMB, row.SysMB = float64(ms.HeapInuse)/(1<<20), float64(ms.Sys)/(1<<20)
	row.GCCycles, row.GCPauseMs, row.GCPauseMaxMs = gcSince(c.prevGC, c.prevGCNs, &ms)
	c.prevGC, c.prevGCNs = ms.NumGC, ms.PauseTotalNs
}

// gcSince: ciclos de GC desde o anterior, pausa somada e a maior (ms). O
// MemStats guarda as últimas 256 pausas; a do ciclo k fica em PauseNs[(k+255)%256].
func gcSince(prevNum uint32, prevNs uint64, ms *runtime.MemStats) (int, float64, float64) {
	cycles := ms.NumGC - prevNum
	var worst uint64
	for k := ms.NumGC; k > prevNum && ms.NumGC-k < 256; k-- {
		worst = max(worst, ms.PauseNs[(k+255)%256])
	}
	return int(cycles), float64(ms.PauseTotalNs-prevNs) / 1e6, float64(worst) / 1e6
}

func (c *APICollector) fillPool(row *APIMinute) {
	p := c.pool()
	row.DBInUse, row.DBIdle, row.DBTotal, row.DBMax = p.InUse, p.Idle, p.Total, p.Max
	row.DBWaits = int(p.Waits - c.prevPool.Waits)
	row.DBWaitMs = float64(p.WaitTime-c.prevPool.WaitTime) / float64(time.Millisecond)
	c.prevPool = p
}

// flushRoutes: quando a janela de 5 min vira, grava as rotas dela.
func (c *APICollector) flushRoutes(ctx context.Context, at time.Time) error {
	window := at.Truncate(routeWindow)
	if !window.After(c.window) {
		return nil
	}
	c.window = window
	routes := c.source.TakeRoutes(maxRoutes)
	rows := make([]RouteWindow, 0, len(routes))
	for _, r := range routes {
		rows = append(rows, RouteWindow{Minute: window, Route: r.Route, Requests: int(r.Count),
			Status4xx: int(r.Status4xx), Status5xx: int(r.Status5xx), P50Ms: r.P50, P95Ms: r.P95, MaxMs: r.Max, TotalMs: r.TotalMs})
	}
	if err := c.store.InsertRoutes(ctx, rows); err != nil {
		return fmt.Errorf("gravar rotas: %w", err)
	}
	return nil
}
