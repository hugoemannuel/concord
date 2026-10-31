package musiclinks

import (
	"sync"
	"time"
)

// limiter: balde de fichas por fonte, para não estourar a cota das APIs
// gratuitas (iTunes ~20/min). Sem ficha, a fonte fica de fora dessa vez.
type limiter struct {
	mu     sync.Mutex
	now    func() time.Time
	max    float64
	per    time.Duration
	tokens float64
	last   time.Time
}

func newLimiter(n int, per time.Duration) *limiter {
	return &limiter{now: time.Now, max: float64(n), per: per, tokens: float64(n)}
}

// allow gasta uma ficha; nil = sem limite.
func (l *limiter) allow() bool {
	if l == nil {
		return true
	}
	l.mu.Lock()
	defer l.mu.Unlock()
	now := l.now()
	if !l.last.IsZero() {
		l.tokens = min(l.max, l.tokens+l.max*float64(now.Sub(l.last))/float64(l.per))
	}
	l.last = now
	if l.tokens < 1 {
		return false
	}
	l.tokens--
	return true
}
