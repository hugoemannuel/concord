package httpmetrics

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
)

func newEngine(r *Recorder) *gin.Engine {
	gin.SetMode(gin.TestMode)
	e := gin.New()
	e.Use(gin.CustomRecovery(func(c *gin.Context, _ any) { c.AbortWithStatus(http.StatusInternalServerError) }))
	e.Use(r.Middleware())
	e.GET("/api/channels/:id", func(c *gin.Context) { c.Status(http.StatusOK) })
	e.GET("/api/fail", func(c *gin.Context) { c.Status(http.StatusBadGateway) })
	e.GET("/api/missing", func(c *gin.Context) { c.Status(http.StatusNotFound) })
	e.GET("/api/moved", func(c *gin.Context) { c.Status(http.StatusFound) })
	e.GET("/api/boom", func(*gin.Context) { panic("boom") })
	e.GET("/api/abort", func(*gin.Context) { panic(http.ErrAbortHandler) })
	e.GET("/healthz", func(c *gin.Context) { c.Status(http.StatusOK) })
	e.GET("/ws", func(c *gin.Context) {
		r.mu.Lock()
		got := r.minute.WSOpen
		r.mu.Unlock()
		if got != 1 {
			c.String(http.StatusOK, "ws aberto durante o handler = %d", got)
			return
		}
		c.Status(http.StatusSwitchingProtocols)
	})
	return e
}

func get(e *gin.Engine, path string) *httptest.ResponseRecorder {
	w := httptest.NewRecorder()
	e.ServeHTTP(w, httptest.NewRequest(http.MethodGet, path, nil))
	return w
}

func TestRecorderContaPorClasseDeStatus(t *testing.T) {
	r := New(Config{})
	e := newEngine(r)
	for _, p := range []string{"/api/channels/1", "/api/channels/2", "/api/moved", "/api/missing", "/api/fail", "/nada"} {
		get(e, p)
	}
	m := r.TakeMinute()
	if m.Requests != 6 || m.Status2xx != 2 || m.Status3xx != 1 || m.Status4xx != 2 || m.Status5xx != 1 {
		t.Fatalf("minuto = %+v", m)
	}
	if m.Latency.Count != 6 || m.Latency.Max == nil {
		t.Errorf("latência = %+v, quer 6 pedidos", m.Latency)
	}
	if again := r.TakeMinute(); again.Requests != 0 || again.Latency.Count != 0 {
		t.Errorf("depois de tirar o minuto = %+v, quer zerado", again)
	}
}

func TestRecorderPularNaoConta(t *testing.T) {
	r := New(Config{Skip: func(c *gin.Context) bool { return c.FullPath() == "/healthz" }})
	get(newEngine(r), "/healthz")
	if m := r.TakeMinute(); m.Requests != 0 {
		t.Errorf("pedidos = %d, quer 0", m.Requests)
	}
}

func TestRecorderPanicContaComo5xxERelanca(t *testing.T) {
	r := New(Config{})
	e := newEngine(r)
	if w := get(e, "/api/boom"); w.Code != http.StatusInternalServerError {
		t.Fatalf("status = %d, quer 500 do Recovery", w.Code)
	}
	get(e, "/api/abort")
	m := r.TakeMinute()
	if m.Panics != 1 || m.Status5xx != 2 {
		t.Errorf("panics=%d 5xx=%d, quer 1 panic (o ErrAbortHandler não conta) e 2 5xx", m.Panics, m.Status5xx)
	}
	routes := r.TakeRoutes(10)
	if len(routes) == 0 || routes[0].Status5xx != 1 {
		t.Errorf("rotas = %+v, quer as do panic com 5xx", routes)
	}
}

func TestRecorderWebSocketContaComoConexao(t *testing.T) {
	r := New(Config{ConnectionRoute: "/ws"})
	e := newEngine(r)
	if w := get(e, "/ws"); w.Body.Len() > 0 {
		t.Fatal(w.Body.String())
	}
	m := r.TakeMinute()
	if m.Requests != 0 || m.WSOpen != 0 || m.WSConnects != 1 || m.WSDisconnects != 1 {
		t.Errorf("minuto = %+v, quer só 1 entrada e 1 saída", m)
	}
}

func TestRecorderEmAndamento(t *testing.T) {
	r := New(Config{})
	r.begin()
	r.begin()
	r.end()
	m := r.TakeMinute()
	if m.InFlight != 1 || m.InFlightMax != 2 {
		t.Errorf("em andamento = %d, máx = %d; quer 1 e 2", m.InFlight, m.InFlightMax)
	}
	if m = r.TakeMinute(); m.InFlightMax != 1 {
		t.Errorf("máx do minuto seguinte = %d, quer 1 (o que segue aberto)", m.InFlightMax)
	}
}

func TestTakeRoutesUsaOPadraoDaRotaEOrdenaPor5xxETempo(t *testing.T) {
	r := New(Config{})
	e := newEngine(r)
	for range 3 {
		get(e, "/api/channels/abc")
	}
	get(e, "/api/fail")
	get(e, "/nada/123")
	routes := r.TakeRoutes(10)
	if len(routes) != 3 {
		t.Fatalf("rotas = %+v, quer 3", routes)
	}
	if routes[0].Route != "GET /api/fail" || routes[0].Status5xx != 1 {
		t.Errorf("primeira = %+v, quer a com 5xx", routes[0])
	}
	names := map[string]uint64{}
	for _, x := range routes {
		names[x.Route] = x.Count
	}
	if names["GET /api/channels/:id"] != 3 || names[NoRoute] != 1 {
		t.Errorf("rotas = %v, quer o padrão (nunca o id) e %q", names, NoRoute)
	}
	if again := r.TakeRoutes(10); len(again) != 0 {
		t.Errorf("depois de tirar = %+v, quer vazio", again)
	}
}

func TestTakeRoutesRespeitaOTeto(t *testing.T) {
	r := New(Config{})
	e := newEngine(r)
	get(e, "/api/channels/1")
	get(e, "/api/moved")
	get(e, "/api/fail")
	if routes := r.TakeRoutes(2); len(routes) != 2 || routes[0].Route != "GET /api/fail" {
		t.Errorf("rotas = %+v, quer 2 começando pela com 5xx", routes)
	}
}
