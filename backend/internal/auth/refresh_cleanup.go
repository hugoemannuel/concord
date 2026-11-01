package auth

import (
	"context"
	"log"
	"time"
)

type expiredRefreshTokens interface {
	DeleteExpiredRefreshTokens(ctx context.Context, now time.Time) (int64, error)
}

// RefreshCleanupInterval: de quanto em quanto tempo os refresh tokens
// vencidos saem do banco (eles já não valem; só ocupam espaço e backup).
const RefreshCleanupInterval = 6 * time.Hour

// RunRefreshCleanup apaga os vencidos agora e a cada every, até ctx acabar.
func RunRefreshCleanup(ctx context.Context, store expiredRefreshTokens, every time.Duration) {
	ticker := time.NewTicker(every)
	defer ticker.Stop()
	for {
		cleanExpiredRefreshTokens(ctx, store, time.Now())
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
		}
	}
}

func cleanExpiredRefreshTokens(ctx context.Context, store expiredRefreshTokens, now time.Time) {
	n, err := store.DeleteExpiredRefreshTokens(ctx, now)
	switch {
	case err != nil:
		log.Printf("[auth] limpar refresh tokens vencidos: %v", err)
	case n > 0:
		log.Printf("[auth] %d refresh token(s) vencido(s) apagado(s)", n)
	}
}
