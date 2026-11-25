package httpmetrics

import (
	"errors"
	"net/http"
	"syscall"
	"time"

	"github.com/gin-gonic/gin"
)

type observation struct {
	route    string
	status   int
	latency  time.Duration
	panicked bool
}

// Middleware: precisa ficar depois do gin.Recovery (vê o panic, conta e
// relança para o Recovery responder e escrever no journal como sempre).
func (r *Recorder) Middleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		switch {
		case r.cfg.Skip != nil && r.cfg.Skip(c):
			c.Next()
		case r.cfg.ConnectionRoute != "" && c.FullPath() == r.cfg.ConnectionRoute:
			r.connect(1)
			defer r.connect(-1)
			c.Next()
		default:
			r.request(c)
		}
	}
}

func (r *Recorder) request(c *gin.Context) {
	start := time.Now()
	route := routeOf(c)
	r.begin()
	defer func() {
		if p := recover(); p != nil {
			r.observe(panicObservation(c, route, time.Since(start), p))
			panic(p)
		}
	}()
	c.Next()
	r.observe(observation{route: route, status: c.Writer.Status(), latency: time.Since(start)})
}

func routeOf(c *gin.Context) string {
	if c.FullPath() == "" {
		return NoRoute
	}
	return c.Request.Method + " " + c.FullPath()
}

// panicObservation: panic de verdade vira 5xx e conta; conexão quebrada fica
// com o status que já tinha saído.
func panicObservation(c *gin.Context, route string, latency time.Duration, p any) observation {
	if isBrokenConnection(p) {
		return observation{route: route, status: c.Writer.Status(), latency: latency}
	}
	return observation{route: route, status: http.StatusInternalServerError, latency: latency, panicked: true}
}

// isBrokenConnection: a mesma regra do gin.Recovery (cliente fechou a
// conexão; http.ErrAbortHandler é o jeito normal de cortar uma resposta).
func isBrokenConnection(p any) bool {
	err, ok := p.(error)
	return ok && (errors.Is(err, http.ErrAbortHandler) || errors.Is(err, syscall.EPIPE) || errors.Is(err, syscall.ECONNRESET))
}
