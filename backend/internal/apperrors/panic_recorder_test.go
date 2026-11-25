package apperrors

import (
	"context"
	"fmt"
	"runtime"
	"strings"
	"testing"
	"time"

	"gin-quickstart/backend/internal/platform/recovery"
)

func newTestRecorder(store errorSaver) *PanicRecorder {
	r := NewPanicRecorder(store)
	r.now = func() time.Time { return t0 }
	return r
}

func samplePanic(route, user string) recovery.Panic {
	return recovery.Panic{Route: route, Method: "GET", Value: "runtime error: index out of range [3] with length 2",
		Stack: []byte(goPanicStack), UserID: user}
}

func TestPanicRecorderJuntaPorImpressaoEPessoa(t *testing.T) {
	store := &fakeSaver{}
	r := newTestRecorder(store)
	r.Observe(samplePanic("/api/servers/:id", userAna))
	r.Observe(samplePanic("/api/servers/:id", userAna))
	r.Observe(samplePanic("/api/servers/:id", ""))
	r.Flush(context.Background())

	if len(store.calls) != 2 {
		t.Fatalf("idas ao banco = %d, quer 2 (ana e sem conta)", len(store.calls))
	}
	byUser := map[string]savedCall{}
	for _, c := range store.calls {
		byUser[c.userID] = c
	}
	ana := byUser[userAna]
	if len(ana.errs) != 1 || ana.errs[0].Count != 2 {
		t.Fatalf("ana = %+v, quer um erro com count 2", ana.errs)
	}
	e := ana.errs[0]
	if e.Source != SourceBackend || e.Kind != "panic" || e.Screen != "/api/servers/:id" || e.Fingerprint == "" {
		t.Errorf("erro = %+v", e)
	}
	if strings.HasPrefix(e.Stack, "goroutine") || !strings.HasPrefix(e.Stack, "gin-quickstart/backend/internal/server.(*Handler).Get") {
		t.Errorf("pilha devia começar no quadro do app:\n%s", e.Stack)
	}
	cc := ana.cc
	if cc.Target != TargetServer || cc.AppVersion != "" || cc.OS != runtime.GOOS {
		t.Errorf("contexto = %+v", cc)
	}
	if _, ok := byUser[""]; !ok {
		t.Error("panic sem conta não foi gravado")
	}
	store.calls = nil
	r.Flush(context.Background())
	if len(store.calls) != 0 {
		t.Errorf("segunda descarga regravou %d", len(store.calls))
	}
}

func TestPanicRecorderRotaDesconhecida(t *testing.T) {
	store := &fakeSaver{}
	r := newTestRecorder(store)
	p := samplePanic("", "")
	p.Method = "POST"
	r.Observe(p)
	r.Flush(context.Background())
	if got := store.calls[0].errs[0].Screen; got != "POST rota desconhecida" {
		t.Errorf("tela = %q", got)
	}
}

func TestPanicRecorderAte50Pendentes(t *testing.T) {
	store := &fakeSaver{}
	r := newTestRecorder(store)
	for i := range maxPending + 5 {
		p := samplePanic("/x", "")
		p.Value = fmt.Sprintf("erro %c", 'A'+i) // mensagem diferente: grupo diferente
		r.Observe(p)
	}
	r.Observe(samplePanic("/x", "")) // nova também: descartada
	r.Flush(context.Background())
	if got := store.total(); got != maxPending {
		t.Errorf("gravados = %d, quer %d", got, maxPending)
	}
}

func TestPanicRecorderRunGravaACadaTique(t *testing.T) {
	store := &fakeSaver{}
	r := newTestRecorder(store)
	tick := make(chan time.Time)
	r.ticker = func(time.Duration) (<-chan time.Time, func()) { return tick, func() {} }
	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan struct{})
	go func() { r.Run(ctx); close(done) }()

	r.Observe(samplePanic("/x", userAna))
	tick <- t0
	tick <- t0 // o segundo tique só entra depois que o primeiro gravou
	if len(store.calls) != 1 {
		t.Fatalf("idas ao banco depois do tique = %d, quer 1", len(store.calls))
	}
	r.Observe(samplePanic("/y", userAna))
	cancel()
	<-done
	if len(store.calls) != 2 {
		t.Errorf("ao desligar, o pendente devia ser gravado: %d idas", len(store.calls))
	}
}
