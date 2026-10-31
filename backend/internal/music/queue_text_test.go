package music

import (
	"context"
	"strings"
	"testing"
)

func TestQueueTextListsNowPlayingAndQueue(t *testing.T) {
	m, hub := newTestManager(t, true, true)
	ctx := context.Background()
	if err := m.EnqueueQuery(ctx, "u1", "srv1", "queen"); err != nil {
		t.Fatalf("1º pedido: %v", err)
	}
	if err := m.EnqueueQuery(ctx, "u1", "srv1", "queen de novo"); err != nil {
		t.Fatalf("2º pedido: %v", err)
	}
	eventually(t, "avisos", func() bool { return len(hub.publics()) == 2 })
	p := m.player("voz1")
	if p == nil {
		t.Fatal("player não criado")
	}
	var text string
	eventually(t, "tocando agora", func() bool {
		var ok bool
		text, ok = m.queueText(p)
		return ok
	})
	if !strings.Contains(text, "Never") {
		t.Fatalf("texto = %q", text)
	}
}

func TestStateForOnlyInsideTheCall(t *testing.T) {
	m, _ := newTestManager(t, true, true)
	if _, ok := m.StateFor("u1", "srv1"); ok {
		t.Fatal("sem player não há estado")
	}
	if err := m.EnqueueQuery(context.Background(), "u1", "srv1", "queen"); err != nil {
		t.Fatalf("pedido: %v", err)
	}
	if _, ok := m.StateFor("u1", "srv1"); !ok {
		t.Fatal("na call com player há estado")
	}
	if _, ok := m.StateFor("u1", "outro"); ok {
		t.Fatal("em outro servidor não há estado")
	}
	if _, err := m.playerOf("u1", "outro"); err != ErrNotInMusicCall {
		t.Fatalf("playerOf outro servidor = %v", err)
	}
}
