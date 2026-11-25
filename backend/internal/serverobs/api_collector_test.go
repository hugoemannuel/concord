package serverobs

import (
	"context"
	"runtime"
	"testing"
	"time"

	"gin-quickstart/backend/internal/platform/httpmetrics"
)

type fakeRecorder struct {
	minute    httpmetrics.Minute
	routes    []httpmetrics.Route
	routeTake int
}

func (f *fakeRecorder) TakeMinute() httpmetrics.Minute { return f.minute }
func (f *fakeRecorder) TakeRoutes(limit int) []httpmetrics.Route {
	f.routeTake++
	return f.routes[:min(limit, len(f.routes))]
}

type fakeAPIStore struct {
	minutes []APIMinute
	routes  []RouteWindow
}

func (f *fakeAPIStore) InsertAPIMinute(_ context.Context, m APIMinute) error {
	f.minutes = append(f.minutes, m)
	return nil
}

func (f *fakeAPIStore) InsertRoutes(_ context.Context, rows []RouteWindow) error {
	f.routes = append(f.routes, rows...)
	return nil
}

func TestAPICollectorGravaOMinuto(t *testing.T) {
	p95 := 80.0
	rec := &fakeRecorder{minute: httpmetrics.Minute{Requests: 10, Status2xx: 8, Status5xx: 2, Panics: 1,
		InFlight: 1, InFlightMax: 3, WSOpen: 5, WSConnects: 2, WSDisconnects: 1,
		Latency: httpmetrics.Summary{Count: 10, P95: &p95}}}
	store := &fakeAPIStore{}
	pool := []PoolStats{{InUse: 1, Idle: 3, Total: 4, Max: 10, Waits: 5, WaitTime: time.Second},
		{InUse: 2, Idle: 2, Total: 4, Max: 10, Waits: 7, WaitTime: 1500 * time.Millisecond}}
	calls := 0
	start := time.Date(2026, 11, 25, 12, 0, 0, 0, time.UTC)
	c := NewAPICollector(rec, func() PoolStats { calls++; return pool[min(calls-1, 1)] }, store)
	c.now = func() time.Time { return start.Add(time.Duration(calls) * time.Minute) }
	c.start(start)
	if err := c.Tick(context.Background()); err != nil {
		t.Fatal(err)
	}
	if err := c.Tick(context.Background()); err != nil {
		t.Fatal(err)
	}
	m := store.minutes[1]
	if m.Requests != 10 || m.Status5xx != 2 || m.Panics != 1 || *m.P95Ms != 80 || m.InFlightMax != 3 || m.WSOpen != 5 {
		t.Errorf("minuto = %+v", m)
	}
	if m.DBInUse != 2 || m.DBMax != 10 || m.DBWaits != 2 || m.DBWaitMs != 500 {
		t.Errorf("pool = %+v, quer as esperas do minuto (2, 500 ms)", m)
	}
	if store.minutes[0].DBWaits != 5 {
		t.Errorf("primeiro minuto = %d esperas, quer 5 (desde o início)", store.minutes[0].DBWaits)
	}
	if m.Goroutines < 1 || m.HeapMB <= 0 || m.SysMB <= 0 {
		t.Errorf("runtime = %+v", m)
	}
	if m.Seconds != 60 || !m.Minute.Equal(start.Add(time.Minute)) {
		t.Errorf("minute = %v seconds = %v", m.Minute, m.Seconds)
	}
}

func TestAPICollectorRotasDe5Em5Minutos(t *testing.T) {
	rec := &fakeRecorder{routes: []httpmetrics.Route{
		{Route: "GET /api/a", Status5xx: 1, Summary: httpmetrics.Summary{Count: 3, TotalMs: 30}},
	}}
	store := &fakeAPIStore{}
	start := time.Date(2026, 11, 25, 12, 0, 30, 0, time.UTC)
	now := start
	c := NewAPICollector(rec, func() PoolStats { return PoolStats{} }, store)
	c.now = func() time.Time { return now }
	c.start(start)
	for i := 1; i <= 10; i++ {
		now = start.Add(time.Duration(i) * time.Minute)
		if err := c.Tick(context.Background()); err != nil {
			t.Fatal(err)
		}
	}
	// 12:01:30 … 12:10:30: as janelas fecham em 12:05 e 12:10.
	if rec.routeTake != 2 || len(store.routes) != 2 {
		t.Fatalf("janelas = %d, rotas = %+v; quer 2", rec.routeTake, store.routes)
	}
	w := store.routes[1]
	if w.Route != "GET /api/a" || w.Requests != 3 || w.Status5xx != 1 || !w.Minute.Equal(time.Date(2026, 11, 25, 12, 10, 0, 0, time.UTC)) {
		t.Errorf("janela = %+v", w)
	}
}

func TestGCPausesDoIntervalo(t *testing.T) {
	var ms runtime.MemStats
	ms.NumGC = 3
	ms.PauseTotalNs = 9_000_000
	ms.PauseNs[0], ms.PauseNs[1], ms.PauseNs[2] = 1_000_000, 5_000_000, 3_000_000
	cycles, total, worst := gcSince(1, 1_000_000, &ms)
	if cycles != 2 || total != 8 || worst != 5 {
		t.Errorf("gc = %d ciclos, %v ms, maior %v; quer 2, 8, 5", cycles, total, worst)
	}
}

func TestRouteBatchUmaLinhaPorRota(t *testing.T) {
	b := routeBatch([]RouteWindow{{Route: "GET /a"}, {Route: "GET /b"}})
	if b.Len() != 2 || b.QueuedQueries[1].Arguments[1] != "GET /b" {
		t.Errorf("batch = %d consultas", b.Len())
	}
}
