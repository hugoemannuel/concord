package alert

import (
	"context"
	"errors"
	"testing"
	"time"
)

func newTestRunner(ensureErr error) (Runner, *fakeRuns, *fakeSender) {
	store, out, runs := &fakeStore{}, &fakeSender{}, &fakeRuns{}
	poster := NewPoster(nil, func(_ context.Context, _ string, text string, _ bool) error {
		out.msgs = append(out.msgs, sent{text: text})
		return nil
	})
	engine := NewEngine(nil, store, poster, "", nil)
	return Runner{
		Ensure: func(context.Context) (map[ChannelKind]string, error) {
			return map[ChannelKind]string{ChannelInfra: "c1"}, ensureErr
		},
		Poster:    poster,
		Engine:    engine,
		Lifecycle: NewLifecycle(runs, engine, "v1"),
		Database:  NewDatabaseWatch(func(context.Context) error { return nil }, engine.Notify),
	}, runs, out
}

func TestRunnerSobeEGravaAParada(t *testing.T) {
	r, runs, out := newTestRunner(nil)
	ctx, cancel := context.WithCancel(context.Background())
	cancel() // o desligamento já veio: avalia uma vez e para
	r.Run(ctx)
	if len(out.msgs) != 1 || out.msgs[0].text != "Backend no ar, versão v1. Alertas ligados a partir de agora." {
		t.Fatalf("mensagens = %+v", out.msgs)
	}
	if runs.stopped == nil {
		t.Fatal("parada limpa não gravada")
	}
}

func TestRunnerSemCanaisDesliga(t *testing.T) {
	r, runs, out := newTestRunner(errors.New("servidor não existe"))
	r.Run(context.Background())
	if len(out.msgs) != 0 || runs.stopped != nil {
		t.Fatalf("seguiu sem canais: %+v", out.msgs)
	}
}

// Load que falha no boot (banco instável) é tentado de novo: sem o estado, a
// regra bateria no índice único do incidente aberto a cada minuto.
func TestRunnerTentaOLoadDeNovo(t *testing.T) {
	r, _, _ := newTestRunner(nil)
	store := &flakyStore{fakeStore: &fakeStore{}, failures: 2}
	r.Engine.store = store
	if !r.loadState(context.Background()) {
		t.Fatal("desistiu do Load")
	}
	if store.calls != 3 {
		t.Fatalf("Load tentou %d vezes, quer 3", store.calls)
	}
}

type flakyStore struct {
	*fakeStore
	failures, calls int
}

func (f *flakyStore) OpenIncidents(ctx context.Context) ([]Incident, error) {
	f.calls++
	if f.calls <= f.failures {
		return nil, errors.New("banco instável")
	}
	return f.fakeStore.OpenIncidents(ctx)
}

func TestRunnerLoadDesisteNoDesligamento(t *testing.T) {
	r, _, _ := newTestRunner(nil)
	r.Engine.store = &flakyStore{fakeStore: &fakeStore{}, failures: 100}
	r.RetryEvery = time.Hour
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if r.loadState(ctx) {
		t.Fatal("seguiu sem estado")
	}
}
