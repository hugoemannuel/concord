package httpmetrics

import (
	"cmp"
	"slices"
	"sync"

	"github.com/gin-gonic/gin"
)

// NoRoute: pedidos que não casaram com rota nenhuma (404). Sem o método: o
// método de um pedido sem rota é texto livre do cliente.
const NoRoute = "(sem rota)"

// Config: ConnectionRoute (o /ws) conta como conexão, não como pedido; Skip
// tira o pedido da conta (healthz, downloads longos, outros WebSockets).
type Config struct {
	ConnectionRoute string
	Skip            func(c *gin.Context) bool
}

// Minute: o que aconteceu desde o TakeMinute anterior (InFlight e WSOpen são
// o valor agora).
type Minute struct {
	Requests                                   uint64
	Status2xx, Status3xx, Status4xx, Status5xx uint64
	Latency                                    Summary
	InFlight, InFlightMax                      int64
	Panics                                     uint64
	WSOpen                                     int64
	WSConnects, WSDisconnects                  uint64
}

// Route: uma rota (método + padrão do gin) desde o TakeRoutes anterior.
type Route struct {
	Route                string
	Status4xx, Status5xx uint64
	Summary
}

type routeAcc struct {
	hist                 Histogram
	status4xx, status5xx uint64
}

// Recorder guarda os contadores; um mutex só (um Lock por pedido).
type Recorder struct {
	cfg    Config
	mu     sync.Mutex
	minute Minute
	hist   Histogram
	routes map[string]*routeAcc
}

func New(cfg Config) *Recorder {
	return &Recorder{cfg: cfg, routes: map[string]*routeAcc{}}
}

// TakeMinute devolve o minuto e zera os contadores (não os valores do agora).
func (r *Recorder) TakeMinute() Minute {
	r.mu.Lock()
	defer r.mu.Unlock()
	m := r.minute
	m.Latency = r.hist.Summary()
	r.hist.Reset()
	r.minute = Minute{InFlight: m.InFlight, InFlightMax: m.InFlight, WSOpen: m.WSOpen}
	return m
}

// TakeRoutes devolve até limit rotas (mais 5xx primeiro, depois mais tempo
// total gasto) e zera as rotas.
func (r *Recorder) TakeRoutes(limit int) []Route {
	r.mu.Lock()
	acc := r.routes
	r.routes = map[string]*routeAcc{}
	r.mu.Unlock()
	out := make([]Route, 0, len(acc))
	for name, a := range acc {
		out = append(out, Route{Route: name, Status4xx: a.status4xx, Status5xx: a.status5xx, Summary: a.hist.Summary()})
	}
	slices.SortFunc(out, func(a, b Route) int {
		return cmp.Or(cmp.Compare(b.Status5xx, a.Status5xx), cmp.Compare(b.TotalMs, a.TotalMs), cmp.Compare(a.Route, b.Route))
	})
	return out[:min(limit, len(out))]
}

func (r *Recorder) begin() {
	r.mu.Lock()
	r.minute.InFlight++
	r.minute.InFlightMax = max(r.minute.InFlightMax, r.minute.InFlight)
	r.mu.Unlock()
}

func (r *Recorder) end() {
	r.mu.Lock()
	r.minute.InFlight--
	r.mu.Unlock()
}

func (r *Recorder) connect(delta int64) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.minute.WSOpen += delta
	if delta > 0 {
		r.minute.WSConnects++
	} else {
		r.minute.WSDisconnects++
	}
}

// observe grava um pedido terminado.
func (r *Recorder) observe(o observation) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.minute.InFlight--
	r.minute.Requests++
	if o.panicked {
		r.minute.Panics++
	}
	r.countClass(o.status)
	r.hist.Observe(o.latency)
	a := r.routes[o.route]
	if a == nil {
		a = &routeAcc{}
		r.routes[o.route] = a
	}
	a.hist.Observe(o.latency)
	switch o.status / 100 {
	case 4:
		a.status4xx++
	case 5:
		a.status5xx++
	}
}

func (r *Recorder) countClass(status int) {
	switch status / 100 {
	case 2:
		r.minute.Status2xx++
	case 3:
		r.minute.Status3xx++
	case 4:
		r.minute.Status4xx++
	case 5:
		r.minute.Status5xx++
	}
}
