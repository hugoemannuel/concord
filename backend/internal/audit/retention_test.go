package audit

import (
	"context"
	"errors"
	"sync"
	"testing"
	"testing/synctest"
	"time"
)

type fakePruner struct{ before time.Time }

func (p *fakePruner) Prune(_ context.Context, before time.Time) error {
	p.before = before
	return nil
}

func TestRetentionApagaOQuePassouDe90Dias(t *testing.T) {
	now := time.Date(2026, 10, 30, 12, 0, 0, 0, time.UTC)
	p := &fakePruner{}
	r := NewRetention(p)
	r.now = func() time.Time { return now }
	if err := r.Prune(context.Background()); err != nil {
		t.Fatal(err)
	}
	if want := now.AddDate(0, 0, -90); !p.before.Equal(want) {
		t.Fatalf("apagou antes de %v, quer %v", p.before, want)
	}
}

type countPruner struct {
	mu    sync.Mutex
	calls int
}

func (p *countPruner) Prune(context.Context, time.Time) error {
	p.mu.Lock()
	defer p.mu.Unlock()
	p.calls++
	if p.calls == 1 {
		return errors.New("banco fora") // só vai para o log; a próxima rodada tenta de novo
	}
	return nil
}

func (p *countPruner) count() int {
	p.mu.Lock()
	defer p.mu.Unlock()
	return p.calls
}

// Run limpa no boot, de novo a cada dia (mesmo depois de uma falha) e para
// quando o contexto acaba.
func TestRetentionRun(t *testing.T) {
	synctest.Test(t, func(t *testing.T) {
		ctx, cancel := context.WithCancel(context.Background())
		p := &countPruner{}
		done := make(chan struct{})
		go func() {
			NewRetention(p).Run(ctx)
			close(done)
		}()
		synctest.Wait()
		if got := p.count(); got != 1 {
			t.Fatalf("no boot: %d limpezas, quer 1", got)
		}
		time.Sleep(retentionInterval)
		synctest.Wait()
		if got := p.count(); got != 2 {
			t.Fatalf("depois de um dia: %d limpezas, quer 2", got)
		}
		cancel()
		<-done
	})
}
