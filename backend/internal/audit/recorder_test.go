package audit

import (
	"context"
	"errors"
	"testing"
)

type fakeInserter struct {
	events []Event
	err    error
	ctxErr error
}

func (f *fakeInserter) Insert(ctx context.Context, e Event) error {
	f.ctxErr = ctx.Err()
	f.events = append(f.events, e)
	return f.err
}

func TestRecorderGrava(t *testing.T) {
	store := &fakeInserter{}
	r := NewRecorder(store)
	r.Record(context.Background(), Event{ServerID: "s1", ActorID: "u1", Action: MemberKick, TargetType: TargetMember, TargetID: "u2"})
	if len(store.events) != 1 || store.events[0].Action != MemberKick {
		t.Fatalf("eventos = %+v", store.events)
	}
}

// A ação principal já aconteceu: o pedido cancelado não pode perder o registro.
func TestRecorderIgnoraCancelamentoDoPedido(t *testing.T) {
	store := &fakeInserter{}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	NewRecorder(store).Record(ctx, Event{ServerID: "s1", Action: ChannelDelete})
	if len(store.events) != 1 || store.ctxErr != nil {
		t.Fatalf("gravou=%d ctxErr=%v, quer 1 e nil", len(store.events), store.ctxErr)
	}
}

// Falha ao gravar só vai para o log: Record não devolve erro nem entra em pânico.
func TestRecorderFalhaNaoQuebra(t *testing.T) {
	store := &fakeInserter{err: errors.New("banco fora")}
	NewRecorder(store).Record(context.Background(), Event{ServerID: "s1", Action: RoleCreate})
	if len(store.events) != 1 {
		t.Fatalf("tentou gravar %d vezes, quer 1", len(store.events))
	}
}

func TestRecorderSemServidorOuNilNaoGrava(t *testing.T) {
	store := &fakeInserter{}
	NewRecorder(store).Record(context.Background(), Event{Action: RoleCreate})
	var nilRecorder *Recorder
	nilRecorder.Record(context.Background(), Event{ServerID: "s1", Action: RoleCreate})
	if len(store.events) != 0 {
		t.Fatalf("gravou sem servidor: %+v", store.events)
	}
}
