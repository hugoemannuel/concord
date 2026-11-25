package httpmetrics

import (
	"math"
	"testing"
	"time"
)

func TestHistogramVazioNaoTemQuantis(t *testing.T) {
	var h Histogram
	if s := h.Summary(); s.Count != 0 || s.P50 != nil || s.Max != nil {
		t.Fatalf("vazio = %+v, quer sem números", s)
	}
}

func TestHistogramQuantisPorInterpolacaoNoBalde(t *testing.T) {
	var h Histogram
	// 100 pedidos: 90 de 3 ms (balde 2–5), 10 de 200 ms (balde 100–250).
	for range 90 {
		h.Observe(3 * time.Millisecond)
	}
	for range 10 {
		h.Observe(200 * time.Millisecond)
	}
	s := h.Summary()
	if s.Count != 100 {
		t.Fatalf("count = %d, quer 100", s.Count)
	}
	// p50: 50º de 90 no balde 2–5 → 2 + 3×50/90.
	if got, want := *s.P50, 2+3*50.0/90; math.Abs(got-want) > 1e-9 {
		t.Errorf("p50 = %v, quer %v", got, want)
	}
	// p95: 5º de 10 no balde 100–250 → 100 + 150×5/10 = 175.
	if got := *s.P95; math.Abs(got-175) > 1e-9 {
		t.Errorf("p95 = %v, quer 175", got)
	}
	if got := *s.Max; got != 200 {
		t.Errorf("max = %v, quer 200", got)
	}
	if got := s.TotalMs; math.Abs(got-(90*3+10*200)) > 1e-9 {
		t.Errorf("total = %v, quer 2270", got)
	}
}

func TestHistogramQuantilNuncaPassaDoMaximo(t *testing.T) {
	var h Histogram
	h.Observe(120 * time.Millisecond)
	s := h.Summary()
	if *s.P99 != 120 || *s.P50 != 120 {
		t.Errorf("p50=%v p99=%v, quer 120 (o máximo)", *s.P50, *s.P99)
	}
}

func TestHistogramAcimaDoUltimoBaldeUsaOMaximo(t *testing.T) {
	var h Histogram
	h.Observe(90 * time.Second)
	if s := h.Summary(); *s.P50 != 90000 {
		t.Errorf("p50 = %v, quer 90000", *s.P50)
	}
}

func TestHistogramResetZera(t *testing.T) {
	var h Histogram
	h.Observe(time.Second)
	h.Reset()
	if s := h.Summary(); s.Count != 0 {
		t.Errorf("depois do reset count = %d", s.Count)
	}
}
