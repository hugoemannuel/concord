package serverobs

import (
	"context"
	"log"
	"time"
)

// every roda fn a cada intervalo, alinhado ao relógio (o minuto cheio), até
// ctx acabar; erros só vão para o log.
func every(ctx context.Context, interval time.Duration, what string, fn func(context.Context) error) {
	first := time.NewTimer(time.Until(time.Now().Truncate(interval).Add(interval)))
	defer first.Stop()
	select {
	case <-ctx.Done():
		return
	case <-first.C:
	}
	ticker := time.NewTicker(interval)
	defer ticker.Stop()
	for {
		run(ctx, what, fn)
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
		}
	}
}

// tickTimeout: prazo de uma coleta (banco travado não segura o coletor).
const tickTimeout = 20 * time.Second

func run(ctx context.Context, what string, fn func(context.Context) error) {
	ctx, cancel := context.WithTimeout(ctx, tickTimeout)
	defer cancel()
	if err := fn(ctx); err != nil {
		log.Printf("[serverobs] %s: %v", what, err)
	}
}
