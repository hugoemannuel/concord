package castigo

import (
	"context"
	"errors"
	"testing"
	"time"

	"gin-quickstart/backend/internal/audit"
	"gin-quickstart/backend/internal/call"
)

func TestApplyDiretoPedeAModeracaoDeCadaEfeito(t *testing.T) {
	cases := []struct {
		name, actor, target string
		effects             Effects
		want                error
	}{
		{"mod castiga de falar", "mod", "ana", Effects{Speak: true}, nil},
		{"mod castiga de tudo", "mod", "ana", Effects{Speak: true, Connect: true, Listen: true}, nil},
		{"chefe só silencia: falar pode", "chefe", "ana", Effects{Speak: true}, nil},
		{"chefe sem ensurdecer não tira a escuta", "chefe", "ana", Effects{Listen: true}, ErrMissingPerm},
		{"chefe sem desconectar não tira a entrada", "chefe", "ana", Effects{Connect: true}, ErrMissingPerm},
		{"comum não castiga direto", "ana", "bia", Effects{Speak: true}, ErrMissingPerm},
		{"mesmo cargo não vale", "mod", "mod2", Effects{Speak: true}, ErrCannotActOn},
		{"dono castiga qualquer um", "dono", "chefe", Effects{Listen: true}, nil},
		{"ninguém castiga o dono", "mod", "dono", Effects{Speak: true}, ErrOwner},
		{"nem a si mesmo", "mod", "mod", Effects{Speak: true}, ErrSelf},
		{"só membros", "mod", "visita", Effects{Speak: true}, ErrNotMember},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			w := newWorld(t)
			_, err := w.svc.Apply(context.Background(), "srv-1", tc.actor, Request{UserID: tc.target, Effects: tc.effects, Duration: 60})
			if !errors.Is(err, tc.want) {
				t.Fatalf("err = %v; quer %v", err, tc.want)
			}
		})
	}
}

func TestApplyRecusaPedidoInvalido(t *testing.T) {
	w := newWorld(t)
	for _, req := range []Request{
		{UserID: "ana", Duration: 60},
		{UserID: "ana", Effects: Effects{Speak: true}, Duration: 61},
		{UserID: "ana", Effects: Effects{Speak: true}, Duration: 0},
		{Effects: Effects{Speak: true}, Duration: 60},
	} {
		if _, err := w.svc.Apply(context.Background(), "srv-1", "mod", req); !errors.Is(err, ErrInvalid) {
			t.Errorf("%+v: err = %v; quer ErrInvalid", req, err)
		}
	}
}

func TestApplyValeNaChamadaGravaEAvisa(t *testing.T) {
	w := newWorld(t)
	c, err := w.svc.Apply(context.Background(), "srv-1", "mod", speak5min("ana"))
	if err != nil {
		t.Fatal(err)
	}
	if c.SpeakUntil == nil || !c.SpeakUntil.Equal(w.now.Add(5*time.Minute)) || c.ConnectUntil != nil {
		t.Fatalf("castigo = %+v", c)
	}
	if r := w.svc.Restriction("srv-1", "ana"); r != (call.Restriction{NoSpeak: true}) {
		t.Errorf("restrição = %+v", r)
	}
	if !w.svc.Punished("ana") || w.svc.Punished("bia") {
		t.Error("Punished: só a ana")
	}
	if _, ok := w.store.rows["srv-1|ana"]; !ok {
		t.Error("castigo gravado no banco")
	}
	if ev := w.last("castigo:update"); ev.to != "server:srv-1" {
		t.Errorf("castigo:update para o servidor: %+v", ev)
	}
	if len(w.calls.enforced) != 1 || w.calls.enforced[0] != "srv-1|ana" {
		t.Errorf("aplicado na call: %v", w.calls.enforced)
	}
	if len(w.audit.events) != 1 || w.audit.events[0].Action != audit.VoiceCastigo || w.audit.events[0].Changes[2].After != "direct" {
		t.Errorf("registro de auditoria: %+v", w.audit.events)
	}
}

func TestCastigosSomadosFicamComOPrazoMaisLongo(t *testing.T) {
	w := newWorld(t)
	ctx := context.Background()
	if _, err := w.svc.Apply(ctx, "srv-1", "mod", Request{UserID: "ana", Effects: Effects{Speak: true}, Duration: 3600}); err != nil {
		t.Fatal(err)
	}
	c, err := w.svc.Apply(ctx, "srv-1", "mod", Request{UserID: "ana", Effects: Effects{Speak: true, Listen: true}, Duration: 60})
	if err != nil {
		t.Fatal(err)
	}
	if !c.SpeakUntil.Equal(w.now.Add(time.Hour)) || !c.ListenUntil.Equal(w.now.Add(time.Minute)) {
		t.Errorf("fala segue 1 h, escuta 1 min: %+v", c)
	}
}

func TestCastigoVenceSozinho(t *testing.T) {
	w := newWorld(t)
	ctx := context.Background()
	if _, err := w.svc.Apply(ctx, "srv-1", "mod", Request{UserID: "ana", Effects: Effects{Speak: true}, Duration: 60}); err != nil {
		t.Fatal(err)
	}
	if _, err := w.svc.Apply(ctx, "srv-1", "mod", Request{UserID: "ana", Effects: Effects{Connect: true}, Duration: 300}); err != nil {
		t.Fatal(err)
	}
	w.calls.enforced = nil

	w.now = w.now.Add(61 * time.Second)
	if r := w.svc.Restriction("srv-1", "ana"); r != (call.Restriction{NoConnect: true}) {
		t.Errorf("a fala já voltou antes da varredura: %+v", r)
	}
	w.svc.Sweep(ctx)
	if c := w.store.rows["srv-1|ana"]; c.SpeakUntil != nil || c.ConnectUntil == nil {
		t.Errorf("banco sem a fala, com a entrada: %+v", c)
	}
	if len(w.calls.enforced) != 1 {
		t.Errorf("a call recebe o fim do castigo de falar: %v", w.calls.enforced)
	}

	w.now = w.now.Add(5 * time.Minute)
	w.svc.Sweep(ctx)
	if _, ok := w.store.rows["srv-1|ana"]; ok || w.svc.Punished("ana") {
		t.Error("castigo vencido sai do banco e da memória")
	}
	w.svc.Sweep(ctx)
	if len(w.calls.enforced) != 2 {
		t.Errorf("sem nada vencendo, a varredura não mexe na call: %v", w.calls.enforced)
	}
}

func TestLift(t *testing.T) {
	w := newWorld(t)
	ctx := context.Background()
	if err := w.svc.Lift(ctx, "srv-1", "mod", "ana"); !errors.Is(err, ErrNotFound) {
		t.Fatalf("sem castigo: %v", err)
	}
	if _, err := w.svc.Apply(ctx, "srv-1", "mod", Request{UserID: "ana", Effects: Effects{Listen: true}, Duration: 600}); err != nil {
		t.Fatal(err)
	}
	if err := w.svc.Lift(ctx, "srv-1", "chefe", "ana"); !errors.Is(err, ErrMissingPerm) {
		t.Errorf("tirar o castigo de ouvir pede ensurdecer: %v", err)
	}
	if err := w.svc.Lift(ctx, "srv-1", "mod", "ana"); err != nil {
		t.Fatal(err)
	}
	if w.svc.Punished("ana") || len(w.store.rows) != 0 {
		t.Error("castigo tirado sai da memória e do banco")
	}
	if ev := w.last("castigo:update"); string(ev.payload) != `{"server_id":"srv-1","user_id":"ana","speak_until":null,"connect_until":null,"listen_until":null}` {
		t.Errorf("aviso do fim: %s", ev.payload)
	}
	if got := w.audit.events[len(w.audit.events)-1].Action; got != audit.VoiceCastigoLift {
		t.Errorf("auditoria: %v", got)
	}
}

func TestListEWarm(t *testing.T) {
	w := newWorld(t)
	ctx := context.Background()
	if _, err := w.svc.Apply(ctx, "srv-1", "mod", speak5min("ana")); err != nil {
		t.Fatal(err)
	}
	if _, err := w.svc.List(ctx, "srv-1", "visita"); !errors.Is(err, ErrNotMember) {
		t.Errorf("quem não é membro não vê: %v", err)
	}
	list, err := w.svc.List(ctx, "srv-1", "bia")
	if err != nil || len(list) != 1 || list[0].UserID != "ana" {
		t.Fatalf("lista = %+v, %v", list, err)
	}

	// Reinício: um castigo vencido no banco some; o que vale volta.
	expired := w.now.Add(-time.Minute)
	w.store.rows["srv-1|bia"] = Castigo{ServerID: "srv-1", UserID: "bia", ListenUntil: &expired}
	again := NewService(w.store, fakePerms{}, w.calls, w.pub)
	again.now = w.svc.now
	if err := again.Warm(ctx); err != nil {
		t.Fatal(err)
	}
	if !again.Restriction("srv-1", "ana").NoSpeak || again.Punished("bia") {
		t.Error("o reinício mantém o castigo que vale e esquece o vencido")
	}
	if _, ok := w.store.rows["srv-1|bia"]; ok {
		t.Error("o vencido sai do banco")
	}
}

func TestRunSweeperVarreAteOContextoAcabar(t *testing.T) {
	w := newWorld(t)
	ctx, cancel := context.WithCancel(context.Background())
	if _, err := w.svc.Apply(ctx, "srv-1", "mod", Request{UserID: "ana", Effects: Effects{Speak: true}, Duration: 60}); err != nil {
		t.Fatal(err)
	}
	// Já venceu quando a varredura começa (o relógio não muda depois).
	w.now = w.now.Add(2 * time.Minute)
	done := make(chan struct{})
	go func() {
		w.svc.RunSweeper(ctx, time.Millisecond)
		close(done)
	}()
	deadline := time.After(2 * time.Second)
	for w.svc.Punished("ana") {
		select {
		case <-deadline:
			t.Fatal("a varredura não rodou")
		case <-time.After(time.Millisecond):
		}
	}
	cancel()
	<-done
}
