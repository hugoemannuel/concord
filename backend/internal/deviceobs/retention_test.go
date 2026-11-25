package deviceobs

import (
	"context"
	"errors"
	"sync"
	"testing"
	"testing/synctest"
	"time"
)

type fakePruner struct {
	mu     sync.Mutex
	before []time.Time
	err    error
}

func (f *fakePruner) Prune(_ context.Context, before time.Time) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.before = append(f.before, before)
	return f.err
}

func TestRetentionApagaNoBootEACadaHora(t *testing.T) {
	synctest.Test(t, func(t *testing.T) {
		p := &fakePruner{err: errors.New("falha só vai para o log")}
		start := time.Now()
		ctx, cancel := context.WithCancel(context.Background())
		done := make(chan struct{})
		go func() {
			defer close(done)
			NewRetention(p).Run(ctx)
		}()
		time.Sleep(2*time.Hour + time.Second)
		synctest.Wait()
		cancel()
		<-done
		if len(p.before) != 3 {
			t.Fatalf("limpezas = %d, quer 3 (boot + 2 h)", len(p.before))
		}
		if want := start.Add(-14 * 24 * time.Hour); !p.before[0].Equal(want) {
			t.Errorf("antes de %v, quer %v (14 dias)", p.before[0], want)
		}
	})
}
