package serverobs

import (
	"context"
	"testing"
	"time"
)

func TestAPIRepositoryGravaLeEApaga(t *testing.T) {
	db := newTestDB(t, apiMigration)
	repo := NewAPIRepository(db)
	ctx := context.Background()
	now := time.Now().UTC().Truncate(time.Minute)
	rows := []APIMinute{
		{Minute: now.Add(-15 * 24 * time.Hour), Requests: 1},
		{Minute: now.Add(-2 * time.Minute), Seconds: 60, Requests: 100, Status2xx: 90, Status5xx: 10, P50Ms: ptr(5.0), P95Ms: ptr(80.0), MaxMs: ptr(900.0), WSOpen: 4, DBInUse: 2, Panics: 1},
		{Minute: now.Add(-time.Minute), Seconds: 60, Requests: 50, Status2xx: 50, P50Ms: ptr(3.0), P95Ms: ptr(40.0), WSOpen: 6, DBInUse: 1},
	}
	for _, r := range rows {
		if err := repo.InsertAPIMinute(ctx, r); err != nil {
			t.Fatal(err)
		}
	}
	// Mesmo minuto de novo: substitui.
	again := rows[2]
	again.Requests = 60
	if err := repo.InsertAPIMinute(ctx, again); err != nil {
		t.Fatal(err)
	}
	latest, err := repo.LatestAPI(ctx)
	if err != nil || latest == nil || latest.Requests != 60 || !latest.Minute.Equal(again.Minute) {
		t.Fatalf("última = %+v, %v", latest, err)
	}
	recent, err := repo.RecentAPI(ctx, 5)
	if err != nil || len(recent) != 2 || recent[0].Requests != 100 {
		t.Fatalf("últimos 5 min = %+v, %v; quer 2, do mais antigo ao mais novo", recent, err)
	}
	series, err := repo.APISeries(ctx, now.Add(-time.Hour), now.Add(time.Minute), 5*time.Minute)
	if err != nil {
		t.Fatal(err)
	}
	var total, s5xx, ws int
	for _, p := range series {
		total += p.Requests
		s5xx += p.Status5xx
		ws = max(ws, p.WSOpen)
	}
	if total != 160 || s5xx != 10 || ws != 6 {
		t.Errorf("série = %+v, quer 160 pedidos, 10 5xx, 6 ws", series)
	}
	if err := repo.Prune(ctx, now.Add(-14*24*time.Hour)); err != nil {
		t.Fatal(err)
	}
	if all, _ := repo.APISeries(ctx, now.Add(-30*24*time.Hour), now.Add(time.Minute), 24*time.Hour); sumRequests(all) != 160 {
		t.Errorf("depois da retenção = %+v, quer só os recentes", all)
	}
}

func sumRequests(points []APIPoint) int {
	n := 0
	for _, p := range points {
		n += p.Requests
	}
	return n
}

func TestAPIRepositoryVazioNaoTemUltima(t *testing.T) {
	repo := NewAPIRepository(newTestDB(t, apiMigration))
	if latest, err := repo.LatestAPI(context.Background()); err != nil || latest != nil {
		t.Errorf("vazio = %+v, %v; quer nil sem erro", latest, err)
	}
}

func TestAPIRepositoryRotasDoPeriodo(t *testing.T) {
	db := newTestDB(t, apiMigration)
	repo := NewAPIRepository(db)
	ctx := context.Background()
	at := time.Date(2026, 11, 25, 12, 5, 0, 0, time.UTC)
	windows := []RouteWindow{
		{Minute: at, Route: "GET /api/a", Requests: 100, TotalMs: 1000, P95Ms: ptr(20.0), MaxMs: ptr(50.0)},
		{Minute: at, Route: "POST /api/b", Requests: 2, Status5xx: 1, TotalMs: 30, MaxMs: ptr(25.0)},
		{Minute: at.Add(5 * time.Minute), Route: "GET /api/a", Requests: 100, TotalMs: 3000, P95Ms: ptr(60.0), MaxMs: ptr(70.0)},
		{Minute: at.Add(5 * time.Minute), Route: "GET /api/c", Requests: 1, TotalMs: 5000, MaxMs: ptr(5000.0)},
	}
	if err := repo.InsertRoutes(ctx, windows[:2]); err != nil {
		t.Fatal(err)
	}
	if err := repo.InsertRoutes(ctx, windows[2:]); err != nil {
		t.Fatal(err)
	}
	if err := repo.InsertRoutes(ctx, nil); err != nil {
		t.Fatal(err)
	}
	routes, err := repo.Routes(ctx, at.Add(-time.Minute), at.Add(time.Hour), 10)
	if err != nil {
		t.Fatal(err)
	}
	if len(routes) != 3 || routes[0].Route != "POST /api/b" || routes[1].Route != "GET /api/c" {
		t.Fatalf("rotas = %+v, quer 5xx primeiro e depois o maior tempo total", routes)
	}
	a := routes[2]
	if a.Requests != 200 || a.TotalMs != 4000 || *a.AvgMs != 20 || *a.P95Ms != 60 || *a.MaxMs != 70 {
		t.Errorf("GET /api/a = %+v", a)
	}
}
