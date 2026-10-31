package server

import (
	"context"
	"reflect"
	"testing"

	"gin-quickstart/backend/internal/audit"
	"gin-quickstart/backend/internal/audit/audittest"
)

func setupModerationAudit() (*Moderation, *audittest.Recorder) {
	f := newFakeModeration()
	m := newModeration(f, f, nil)
	log := &audittest.Recorder{}
	m.SetAudit(log)
	return m, log
}

func TestAuditModeration(t *testing.T) {
	ctx := context.Background()
	m, log := setupModerationAudit()
	member := func(action audit.Action, actor, target, reason string) audit.Event {
		return audit.Event{ServerID: "s1", ActorID: actor, Action: action, TargetType: audit.TargetMember, TargetID: target, Reason: reason}
	}

	if err := m.Kick(ctx, "s1", "mod", "ana"); err != nil {
		t.Fatal(err)
	}
	if err := m.Ban(ctx, "s1", "chefe", "vip", "  spam  "); err != nil {
		t.Fatal(err)
	}
	if err := m.Unban(ctx, "s1", "chefe", "vip"); err != nil {
		t.Fatal(err)
	}
	if err := m.Leave(ctx, "s1", "mod2"); err != nil {
		t.Fatal(err)
	}
	want := []audit.Event{
		member(audit.MemberKick, "mod", "ana", ""),
		member(audit.MemberBan, "chefe", "vip", "spam"),
		member(audit.MemberUnban, "chefe", "vip", ""),
		member(audit.MemberLeave, "mod2", "mod2", ""),
	}
	if got := log.Events(); !reflect.DeepEqual(got, want) {
		t.Fatalf("eventos:\n got %+v\nwant %+v", got, want)
	}
}

func TestAuditModerationRecusadaNaoGrava(t *testing.T) {
	ctx := context.Background()
	m, log := setupModerationAudit()
	_ = m.Kick(ctx, "s1", "ana", "vip")
	_ = m.Ban(ctx, "s1", "mod", "chefe", "")
	_ = m.Unban(ctx, "s1", "chefe", "ninguem")
	_ = m.Leave(ctx, "s1", "dono")
	if got := log.Events(); len(got) != 0 {
		t.Fatalf("ação recusada foi registrada: %+v", got)
	}
}

func TestAuditNickname(t *testing.T) {
	ctx := context.Background()
	n, f := setupNicknames()
	log := &audittest.Recorder{}
	n.SetAudit(log)
	f.nicks["vip"] = strPtr("Vip")

	// O próprio apelido não entra no registro (só o trocado por outra pessoa).
	if _, err := n.Set(ctx, "s1", "ana", "ana", "Aninha"); err != nil {
		t.Fatal(err)
	}
	if len(log.Events()) != 0 {
		t.Fatalf("apelido próprio gravou: %+v", log.Events())
	}

	if _, err := n.Set(ctx, "s1", "mod", "vip", "VIP de ouro"); err != nil {
		t.Fatal(err)
	}
	want := audit.Event{ServerID: "s1", ActorID: "mod", Action: audit.MemberNickname, TargetType: audit.TargetMember, TargetID: "vip",
		Changes: []audit.Change{{Field: "nick", Before: "Vip", After: "VIP de ouro"}}}
	if e, _ := log.Last(); !reflect.DeepEqual(e, want) {
		t.Fatalf("apelido:\n got %+v\nwant %+v", e, want)
	}

	if _, err := n.Set(ctx, "s1", "mod", "vip", ""); err != nil {
		t.Fatal(err)
	}
	if e, _ := log.Last(); !reflect.DeepEqual(e.Changes, []audit.Change{{Field: "nick", Before: "VIP de ouro"}}) {
		t.Fatalf("tirar apelido: %+v", e)
	}

	_, _ = n.Set(ctx, "s1", "ana", "vip", "x") // sem permissão
	if got := len(log.Events()); got != 2 {
		t.Fatalf("eventos = %d, quer 2", got)
	}
}
