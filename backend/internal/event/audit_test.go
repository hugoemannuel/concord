package event

import (
	"context"
	"reflect"
	"testing"
	"time"

	"gin-quickstart/backend/internal/audit"
	"gin-quickstart/backend/internal/audit/audittest"
)

func TestAuditEventos(t *testing.T) {
	ctx := context.Background()
	e := newEnv()
	log := &audittest.Recorder{}
	e.svc.SetAudit(log)

	created, err := e.svc.Create(ctx, "s1", "mod", goodInput())
	if err != nil {
		t.Fatal(err)
	}
	ev := func(action audit.Action, name string, changes ...audit.Change) audit.Event {
		return audit.Event{ServerID: "s1", ActorID: "mod", Action: action, TargetType: audit.TargetEvent, TargetID: created.ID, TargetName: name, Changes: changes}
	}
	start := testNow.Add(time.Hour).UTC().Format(time.RFC3339)
	want := []audit.Event{ev(audit.EventCreate, "Noite",
		audit.Change{Field: "title", Before: "", After: "Noite"},
		audit.Change{Field: "starts_at", Before: "", After: start},
		audit.Change{Field: "duration_minutes", Before: 0, After: 120},
		audit.Change{Field: "recurrence", Before: "", After: string(RecWeekly)},
	)}

	in := goodInput()
	in.Title = "Noitada"
	if _, err := e.svc.Update(ctx, "s1", created.ID, "mod", in); err != nil {
		t.Fatal(err)
	}
	want = append(want, ev(audit.EventUpdate, "Noitada", audit.Change{Field: "title", Before: "Noite", After: "Noitada"}))

	// Já começou: só os dados básicos mudam, e mesmo assim vai para o registro.
	e.store.events[created.ID].NextStartAt = testNow.Add(-time.Minute)
	in.Title = "Noitada 2"
	if _, err := e.svc.Update(ctx, "s1", created.ID, "mod", in); err != nil {
		t.Fatal(err)
	}
	want = append(want, ev(audit.EventUpdate, "Noitada 2", audit.Change{Field: "title", Before: "Noitada", After: "Noitada 2"}))

	if err := e.svc.Cancel(ctx, "s1", created.ID, "mod"); err != nil {
		t.Fatal(err)
	}
	want = append(want, ev(audit.EventDelete, "Noitada 2"))

	if got := log.Events(); !reflect.DeepEqual(got, want) {
		t.Fatalf("eventos:\n got %+v\nwant %+v", got, want)
	}
}

func TestAuditEventoRecusadoNaoGrava(t *testing.T) {
	ctx := context.Background()
	e := newEnv()
	log := &audittest.Recorder{}
	e.svc.SetAudit(log)
	_, _ = e.svc.Create(ctx, "s1", "membro", goodInput())
	_ = e.svc.Cancel(ctx, "s1", "nao-existe", "mod")
	_ = e.svc.SetRoleActions(ctx, "s1", "membro", "cargo-a", ActionCreate)
	if got := log.Events(); len(got) != 0 {
		t.Fatalf("eventos = %+v", got)
	}
}

func TestAuditAcessoDosCargosAosEventos(t *testing.T) {
	e := newEnv()
	log := &audittest.Recorder{}
	e.svc.SetAudit(log)
	if err := e.svc.SetRoleActions(context.Background(), "s1", "dono", "cargo-a", ActionCreate|ActionEdit); err != nil {
		t.Fatal(err)
	}
	want := []audit.Event{{ServerID: "s1", ActorID: "dono", Action: audit.EventAccess, TargetType: audit.TargetRole, TargetID: "cargo-a",
		Changes: []audit.Change{{Field: "event_actions", After: int(ActionCreate | ActionEdit)}}}}
	if got := log.Events(); !reflect.DeepEqual(got, want) {
		t.Fatalf("eventos:\n got %+v\nwant %+v", got, want)
	}
}
