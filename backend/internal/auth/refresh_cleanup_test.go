package auth

import (
	"context"
	"errors"
	"testing"
	"time"
)

type fakeExpired struct {
	calls int
	err   error
}

func (f *fakeExpired) DeleteExpiredRefreshTokens(context.Context, time.Time) (int64, error) {
	f.calls++
	return 3, f.err
}

func TestRunRefreshCleanupLimpaNaHoraEParaComOContexto(t *testing.T) {
	for _, store := range []*fakeExpired{{}, {err: errors.New("banco caiu")}} {
		ctx, cancel := context.WithCancel(context.Background())
		cancel()
		RunRefreshCleanup(ctx, store, time.Hour)
		if store.calls != 1 {
			t.Errorf("limpezas = %d, quer 1 (na hora, e para com o contexto)", store.calls)
		}
	}
}
