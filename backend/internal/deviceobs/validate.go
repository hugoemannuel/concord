package deviceobs

import (
	"errors"
	"fmt"
	"strings"
	"unicode/utf8"

	"github.com/google/uuid"
)

// ErrInvalidBatch: o pedido não dá para gravar (400).
var ErrInvalidBatch = errors.New("métricas do aparelho inválidas")

// Limites: o que passa disso é cortado (texto) ou vai ao teto (número).
const (
	maxSamples = 10
	maxText    = 120
	maxVersion = 32
	maxTarget  = 16
	maxCores   = 1024
	minSeconds = 1.0
	maxSeconds = 900.0
	maxAgo     = 3600.0
	maxPct     = 100.0
	maxMs      = 600_000.0
	maxMB      = 1_048_576.0
	maxCount   = 100_000
	maxLoadAvg = 1024.0
)

var (
	states      = map[string]bool{StateIdle: true, StateCall: true, StateStream: true}
	gpuStatuses = map[string]bool{GPUEnabled: true, GPUSoftware: true, GPUDisabled: true}
)

// Validate confere o lote inteiro (uma linha ruim recusa o pedido) e põe o
// resto dentro dos limites.
func (b *Batch) Validate() error {
	if !isUUID(b.Session.ID) {
		return fmt.Errorf("%w: sessão %q", ErrInvalidBatch, b.Session.ID)
	}
	if len(b.Samples) == 0 || len(b.Samples) > maxSamples {
		return fmt.Errorf("%w: %d linhas", ErrInvalidBatch, len(b.Samples))
	}
	for i := range b.Samples {
		if !states[b.Samples[i].State] {
			return fmt.Errorf("%w: estado %q", ErrInvalidBatch, b.Samples[i].State)
		}
		b.Samples[i].clean()
	}
	b.Session.clean()
	return nil
}

func isUUID(s string) bool {
	_, err := uuid.Parse(s)
	return err == nil && len(s) == 36
}

func (s *Session) clean() {
	s.OS = cut(s.OS, maxText)
	s.AppVersion = cut(s.AppVersion, maxVersion)
	s.Target = cut(s.Target, maxTarget)
	s.GPU = cut(s.GPU, maxText)
	s.Cores = max(0, min(s.Cores, maxCores))
	s.MemTotalMB = intIn(s.MemTotalMB, int(maxMB))
	s.StartupMs = intIn(s.StartupMs, int(maxMs))
	if !gpuStatuses[s.GPUStatus] {
		s.GPUStatus = ""
	}
}

func (s *Sample) clean() {
	s.Seconds = max(minSeconds, min(s.Seconds, maxSeconds))
	s.AgoS = max(0, min(s.AgoS, maxAgo))
	capAll(maxPct, &s.VisiblePct, &s.FocusedPct, &s.CPUBrowser, &s.CPURenderer, &s.CPUGPU, &s.CPUOther,
		&s.CPUAppMax, &s.CPUHelpers, &s.SysCPUPct, &s.SpeedLimitPct)
	capAll(maxMB, &s.MemAppMB, &s.MemRendererMB, &s.MemGPUMB, &s.MemHelpersMB, &s.SysMemFreeMB, &s.HeapMB)
	capAll(maxMs, &s.LagP95Ms, &s.LagMaxMs, &s.LongMs, &s.LongMaxMs, &s.InputMaxMs,
		&s.WSRTTMs, &s.WSRTTMaxMs, &s.APIMsP50, &s.APIMsP95)
	s.LoadAvg = floatIn(s.LoadAvg, maxLoadAvg)
	for _, p := range []*int{&s.Hangs, &s.GPUCrashes, &s.LongCount, &s.SlowInputs, &s.APICount} {
		*p = max(0, min(*p, maxCount))
	}
}

// capAll aplica floatIn com o mesmo teto em todos.
func capAll(hi float64, ps ...**float64) {
	for _, p := range ps {
		*p = floatIn(*p, hi)
	}
}

// cut: sem espaços nas pontas e no máximo n bytes, sem partir um caractere.
func cut(s string, n int) string {
	s = strings.TrimSpace(s)
	for len(s) > n {
		_, size := utf8.DecodeLastRuneInString(s)
		s = s[:len(s)-size]
	}
	return s
}

// floatIn: negativo vira vazio; acima do teto, o teto.
func floatIn(p *float64, hi float64) *float64 {
	if p == nil || *p < 0 {
		return nil
	}
	v := min(*p, hi)
	return &v
}

func intIn(p *int, hi int) *int {
	if p == nil || *p < 0 {
		return nil
	}
	v := min(*p, hi)
	return &v
}
