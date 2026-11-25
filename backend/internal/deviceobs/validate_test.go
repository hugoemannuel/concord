package deviceobs

import (
	"errors"
	"strings"
	"testing"
)

const (
	sessionA = "6f1c1b7e-8a5e-4a51-9f2a-aaaaaaaaaaaa"
	sessionB = "6f1c1b7e-8a5e-4a51-9f2a-bbbbbbbbbbbb"
)

func fp(v float64) *float64 { return &v }
func ip(v int) *int         { return &v }

func goodBatch() Batch {
	return Batch{
		Session: Session{ID: sessionA, OS: "Windows", AppVersion: "1.40.0", Target: "desktop"},
		Samples: []Sample{{Seconds: 60, State: StateCall}},
	}
}

func TestBatchValidateRecusa(t *testing.T) {
	tests := []struct {
		name   string
		change func(b *Batch)
	}{
		{"sessão sem uuid", func(b *Batch) { b.Session.ID = "x" }},
		{"sem linhas", func(b *Batch) { b.Samples = nil }},
		{"linhas demais", func(b *Batch) { b.Samples = make([]Sample, maxSamples+1) }},
		{"estado desconhecido", func(b *Batch) { b.Samples[0].State = "dormindo" }},
		{"estado vazio", func(b *Batch) { b.Samples[0].State = "" }},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			b := goodBatch()
			tt.change(&b)
			if err := b.Validate(); !errors.Is(err, ErrInvalidBatch) {
				t.Errorf("erro = %v, quer ErrInvalidBatch", err)
			}
		})
	}
}

func TestBatchValidateAceitaOsTresEstados(t *testing.T) {
	b := goodBatch()
	b.Samples = []Sample{{State: StateIdle}, {State: StateCall}, {State: StateStream}}
	if err := b.Validate(); err != nil {
		t.Fatal(err)
	}
}

func TestSessionCleanCortaTextoEPoeNosTetos(t *testing.T) {
	b := goodBatch()
	b.Session = Session{
		ID: sessionA, OS: "  " + strings.Repeat("é", 100) + " ", AppVersion: strings.Repeat("1", 40),
		Target: strings.Repeat("d", 20), GPU: strings.Repeat("g", 200), Cores: 5000,
		MemTotalMB: ip(-1), StartupMs: ip(9_000_000), GPUStatus: "talvez",
	}
	if err := b.Validate(); err != nil {
		t.Fatal(err)
	}
	s := b.Session
	if len(s.OS) != 120 || !strings.HasPrefix(s.OS, "é") || len(s.AppVersion) != 32 || len(s.Target) != 16 || len(s.GPU) != 120 {
		t.Errorf("textos = %d %d %d %d", len(s.OS), len(s.AppVersion), len(s.Target), len(s.GPU))
	}
	if s.Cores != 1024 || s.MemTotalMB != nil || *s.StartupMs != 600_000 || s.GPUStatus != "" {
		t.Errorf("sessão = %+v", s)
	}
	b.Session.GPUStatus = GPUSoftware
	b.Session.Cores = -3
	_ = b.Validate()
	if b.Session.GPUStatus != GPUSoftware || b.Session.Cores != 0 {
		t.Errorf("sessão = %+v", b.Session)
	}
}

func TestSampleCleanPoeNosLimites(t *testing.T) {
	b := goodBatch()
	b.Samples[0] = Sample{
		Seconds: 5000, AgoS: -4, State: StateIdle,
		VisiblePct: fp(140), FocusedPct: fp(-1),
		CPUBrowser: fp(300), CPURenderer: fp(6.5), CPUAppMax: fp(-2),
		MemAppMB: fp(9e9), LoadAvg: fp(5000), SpeedLimitPct: fp(120),
		Hangs: -1, GPUCrashes: 1e9, LongCount: 3, SlowInputs: 200_000, APICount: 12,
		LagP95Ms: fp(1e9), WSRTTMs: fp(45), HeapMB: fp(180),
	}
	if err := b.Validate(); err != nil {
		t.Fatal(err)
	}
	s := b.Samples[0]
	checks := []struct {
		name string
		got  *float64
		want *float64
	}{
		{"visível", s.VisiblePct, fp(100)},
		{"foco negativo vira vazio", s.FocusedPct, nil},
		{"cpu", s.CPUBrowser, fp(100)},
		{"cpu dentro", s.CPURenderer, fp(6.5)},
		{"cpu máx negativo", s.CPUAppMax, nil},
		{"memória", s.MemAppMB, fp(1_048_576)},
		{"carga", s.LoadAvg, fp(1024)},
		{"limite", s.SpeedLimitPct, fp(100)},
		{"lag", s.LagP95Ms, fp(600_000)},
		{"rtt", s.WSRTTMs, fp(45)},
		{"heap", s.HeapMB, fp(180)},
	}
	for _, c := range checks {
		if !sameFloat(c.got, c.want) {
			t.Errorf("%s = %v, quer %v", c.name, show(c.got), show(c.want))
		}
	}
	if s.Seconds != 900 || s.AgoS != 0 {
		t.Errorf("seconds/ago = %v/%v", s.Seconds, s.AgoS)
	}
	if s.Hangs != 0 || s.GPUCrashes != 100_000 || s.LongCount != 3 || s.SlowInputs != 100_000 || s.APICount != 12 {
		t.Errorf("contadores = %+v", s)
	}
}

func TestSampleCleanSegundosEAtrasoNasPontas(t *testing.T) {
	b := goodBatch()
	b.Samples[0] = Sample{Seconds: 0, AgoS: 99_999, State: StateCall}
	_ = b.Validate()
	if s := b.Samples[0]; s.Seconds != 1 || s.AgoS != 3600 {
		t.Errorf("seconds/ago = %v/%v, quer 1/3600", s.Seconds, s.AgoS)
	}
}

func sameFloat(a, b *float64) bool {
	if a == nil || b == nil {
		return a == b
	}
	return *a == *b
}

func show(p *float64) any {
	if p == nil {
		return "nil"
	}
	return *p
}
