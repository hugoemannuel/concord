// Package httpmetrics conta os pedidos da API em memória (middleware do gin)
// para o coletor por minuto do serverobs (docs/adr/0067-metricas-da-api-e-da-vps.md).
package httpmetrics

import (
	"math"
	"time"
)

// bounds: limite de cima de cada balde, em ms; o último balde (+∞) fica além.
var bounds = [...]float64{1, 2, 5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000, 30000}

// Histogram: latências em baldes fixos (sem guardar cada valor). Não é
// seguro para uso concorrente: quem usa protege com o próprio mutex.
type Histogram struct {
	counts  [len(bounds) + 1]uint64
	count   uint64
	totalMs float64
	maxMs   float64
}

// Summary: o resumo de uma janela. Quantis e máximo são nil sem pedido.
type Summary struct {
	Count         uint64
	TotalMs       float64
	P50, P95, P99 *float64
	Max           *float64
}

func (h *Histogram) Observe(d time.Duration) {
	ms := float64(d) / float64(time.Millisecond)
	h.counts[bucketOf(ms)]++
	h.count++
	h.totalMs += ms
	h.maxMs = math.Max(h.maxMs, ms)
}

func bucketOf(ms float64) int {
	for i, b := range bounds {
		if ms <= b {
			return i
		}
	}
	return len(bounds)
}

func (h *Histogram) Reset() { *h = Histogram{} }

func (h *Histogram) Summary() Summary {
	s := Summary{Count: h.count, TotalMs: h.totalMs}
	if h.count == 0 {
		return s
	}
	maxMs := h.maxMs
	s.P50, s.P95, s.P99, s.Max = h.quantile(0.50), h.quantile(0.95), h.quantile(0.99), &maxMs
	return s
}

// quantile: interpolação linear dentro do balde onde cai a posição q×n,
// limitada ao máximo visto (o balde +∞ devolve o máximo).
func (h *Histogram) quantile(q float64) *float64 {
	target := q * float64(h.count)
	var before float64
	for i, n := range h.counts {
		inBucket := float64(n)
		if n == 0 || before+inBucket < target {
			before += inBucket
			continue
		}
		v := h.maxMs
		if i < len(bounds) {
			v = math.Min(v, lowerOf(i)+(bounds[i]-lowerOf(i))*(target-before)/inBucket)
		}
		return &v
	}
	v := h.maxMs
	return &v
}

func lowerOf(i int) float64 {
	if i == 0 {
		return 0
	}
	return bounds[i-1]
}
