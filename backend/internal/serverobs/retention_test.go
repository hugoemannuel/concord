package serverobs

import (
	"context"
	"errors"
	"testing"
	"testing/synctest"
	"time"
)

type fakePruner struct {
	before time.Time
	err    error
	calls  int
}

func (f *fakePruner) Prune(_ context.Context, before time.Time) error {
	f.before = before
	f.calls++
	return f.err
}

func TestRetentionApagaTodasAsTabelasMesmoComErro(t *testing.T) {
	a, b := &fakePruner{err: errors.New("falhou")}, &fakePruner{}
	r := NewRetention(a, b)
	r.now = func() time.Time { return t0 }
	if err := r.Prune(context.Background()); err == nil {
		t.Error("quer o erro de a")
	}
	if want := t0.Add(-14 * 24 * time.Hour); !a.before.Equal(want) || !b.before.Equal(want) {
		t.Errorf("antes de = %v / %v, quer %v", a.before, b.before, want)
	}
}

func TestEveryAlinhaNoIntervaloERodaAteCancelar(t *testing.T) {
	synctest.Test(t, func(t *testing.T) {
		ctx, cancel := context.WithCancel(context.Background())
		var at []time.Time
		done := make(chan struct{})
		go func() {
			defer close(done)
			every(ctx, time.Minute, "teste", func(context.Context) error {
				at = append(at, time.Now())
				return errors.New("só vai para o log")
			})
		}()
		time.Sleep(3*time.Minute + time.Second)
		synctest.Wait()
		cancel()
		<-done
		if len(at) != 3 {
			t.Fatalf("chamadas = %d, quer 3", len(at))
		}
		for _, x := range at {
			if x.Second() != 0 {
				t.Errorf("rodou em %v, quer no minuto cheio", x)
			}
		}
	})
}

func TestRunDosColetoresParaComOContexto(t *testing.T) {
	synctest.Test(t, func(t *testing.T) {
		ctx, cancel := context.WithCancel(context.Background())
		p := &fakePruner{}
		done := make(chan struct{})
		go func() {
			defer close(done)
			NewRetention(p).Run(ctx)
		}()
		synctest.Wait()
		cancel()
		<-done
		if p.calls != 1 {
			t.Errorf("chamadas = %d, quer 1 (no boot)", p.calls)
		}
	})
}
