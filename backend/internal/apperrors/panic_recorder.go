package apperrors

import (
	"context"
	"log"
	"runtime"
	"strings"
	"sync"
	"time"

	"gin-quickstart/backend/internal/platform/recovery"
)

// Panics do backend (observador do internal/platform/recovery): juntam em
// memória por impressão digital e pessoa, e um laço grava de 10 em 10 s. Fila
// cheia: o panic novo é descartado e contado no log da próxima gravação.
const (
	maxPending    = 50
	flushInterval = 10 * time.Second
	flushTimeout  = 5 * time.Second
)

type pendingKey struct {
	fingerprint string
	userID      string
}

// PanicRecorder guarda os panics até a próxima gravação.
type PanicRecorder struct {
	store   errorSaver
	mu      sync.Mutex
	pending map[pendingKey]*Captured
	dropped int
	now     func() time.Time
	ticker  func(time.Duration) (<-chan time.Time, func())
}

func NewPanicRecorder(store errorSaver) *PanicRecorder {
	return &PanicRecorder{store: store, pending: map[pendingKey]*Captured{}, now: time.Now, ticker: realTicker}
}

func realTicker(d time.Duration) (<-chan time.Time, func()) {
	t := time.NewTicker(d)
	return t.C, t.Stop
}

// Observe: o recovery chama no pedido que quebrou (só junta em memória).
func (r *PanicRecorder) Observe(p recovery.Panic) {
	e := Captured{Source: SourceBackend, Kind: "panic", Message: p.Value,
		Stack: trimGoNoise(string(p.Stack)), Screen: panicScreen(p), Count: 1}
	prepare(&e)
	key := pendingKey{e.Fingerprint, p.UserID}
	r.mu.Lock()
	defer r.mu.Unlock()
	if cur, ok := r.pending[key]; ok {
		cur.Count = clampCount(cur.Count + 1)
		return
	}
	if len(r.pending) >= maxPending {
		r.dropped++
		return
	}
	r.pending[key] = &e
}

// panicScreen: a rota do gin; sem rota (404 que quebrou num middleware), o método.
func panicScreen(p recovery.Panic) string {
	if p.Route != "" {
		return p.Route
	}
	return p.Method + " rota desconhecida"
}

// trimGoNoise tira o cabeçalho da goroutine e os quadros do runtime, do
// recovery e do gin do começo, para a pilha guardada começar no app.
func trimGoNoise(stack string) string {
	lines := strings.Split(stack, "\n")
	i := 0
	if len(lines) > 0 && strings.HasPrefix(lines[0], "goroutine ") {
		i = 1
	}
	for i+1 < len(lines) {
		f, ok := parseGoFrame(lines[i], lines[i+1])
		if !ok || !goNoise(f) {
			break
		}
		i += 2
	}
	return strings.Join(lines[i:], "\n")
}

// Run grava a cada 10 s até ctx acabar; no fim, grava o que ficou.
func (r *PanicRecorder) Run(ctx context.Context) {
	tick, stop := r.ticker(flushInterval)
	defer stop()
	for {
		select {
		case <-ctx.Done():
			final, cancel := context.WithTimeout(context.WithoutCancel(ctx), flushTimeout)
			r.Flush(final)
			cancel()
			return
		case <-tick:
			r.Flush(ctx)
		}
	}
}

// Flush grava os pendentes (uma ida ao banco por pessoa) e esvazia a fila.
func (r *PanicRecorder) Flush(ctx context.Context) {
	byUser, dropped := r.take()
	if dropped > 0 {
		log.Printf("[apperrors] %d panics descartados (fila cheia)", dropped)
	}
	cc := ClientContext{OS: runtime.GOOS, Target: TargetServer}
	for userID, errs := range byUser {
		if err := r.store.SaveAll(ctx, userID, cc, errs, r.now()); err != nil {
			log.Printf("[apperrors] gravar panics: %v", err)
		}
	}
}

func (r *PanicRecorder) take() (map[string][]Captured, int) {
	r.mu.Lock()
	pending, dropped := r.pending, r.dropped
	r.pending, r.dropped = map[pendingKey]*Captured{}, 0
	r.mu.Unlock()
	byUser := map[string][]Captured{}
	for key, e := range pending {
		byUser[key.userID] = append(byUser[key.userID], *e)
	}
	return byUser, dropped
}
