package role

import (
	"reflect"
	"testing"

	"gin-quickstart/backend/internal/audit"
	"gin-quickstart/backend/internal/audit/audittest"
	"gin-quickstart/backend/internal/permission"
)

func setupAudit() (*Service, *fakeStore, *audittest.Recorder) {
	s, f, _ := setup()
	log := &audittest.Recorder{}
	s.SetAudit(log)
	return s, f, log
}

func TestAuditCreateUpdateDelete(t *testing.T) {
	s, _, log := setupAudit()
	created, err := s.Create(ctx, "s1", "gerente", Input{Name: ptr("Staff"), Hoist: ptr(true)})
	if err != nil {
		t.Fatal(err)
	}
	e, _ := log.Last()
	want := audit.Event{
		ServerID: "s1", ActorID: "gerente", Action: audit.RoleCreate,
		TargetType: audit.TargetRole, TargetID: created.ID, TargetName: "Staff",
		Changes: []audit.Change{{Field: "name", Before: "", After: "Staff"}, {Field: "hoist", Before: false, After: true}},
	}
	if !reflect.DeepEqual(e, want) {
		t.Fatalf("criar:\n got %+v\nwant %+v", e, want)
	}

	if _, err := s.Update(ctx, "s1", "gerente", created.ID, Input{Name: ptr("Equipe"), Permissions: ptr(permission.KickMembers)}); err != nil {
		t.Fatal(err)
	}
	e, _ = log.Last()
	wantChanges := []audit.Change{
		{Field: "name", Before: "Staff", After: "Equipe"},
		{Field: "permissions", Before: int64(0), After: permission.KickMembers},
	}
	if e.Action != audit.RoleUpdate || e.TargetName != "Equipe" || !reflect.DeepEqual(e.Changes, wantChanges) {
		t.Fatalf("editar: %+v", e)
	}

	// Salvar sem mudar nada não suja o registro.
	n := len(log.Events())
	if _, err := s.Update(ctx, "s1", "gerente", created.ID, Input{Name: ptr("Equipe")}); err != nil {
		t.Fatal(err)
	}
	if len(log.Events()) != n {
		t.Fatalf("edição sem mudança gravou: %+v", log.Events())
	}

	if err := s.Delete(ctx, "s1", "gerente", created.ID); err != nil {
		t.Fatal(err)
	}
	e, _ = log.Last()
	if e.Action != audit.RoleDelete || e.TargetID != created.ID || e.TargetName != "Equipe" {
		t.Fatalf("apagar: %+v", e)
	}
}

func TestAuditReorderAndMemberRoles(t *testing.T) {
	s, _, log := setupAudit()
	if _, err := s.Reorder(ctx, "s1", "dono", []string{"admin", "vip", "gerente"}); err != nil {
		t.Fatal(err)
	}
	if e, _ := log.Last(); e.Action != audit.RoleReorder || e.ActorID != "dono" {
		t.Fatalf("reordenar: %+v", e)
	}

	if _, err := s.SetMemberRole(ctx, "s1", "dono", "ana", "vip", true); err != nil {
		t.Fatal(err)
	}
	want := audit.Event{
		ServerID: "s1", ActorID: "dono", Action: audit.MemberRoleAdd,
		TargetType: audit.TargetMember, TargetID: "ana",
		Changes: []audit.Change{{Field: "role", After: "vip"}},
	}
	if e, _ := log.Last(); !reflect.DeepEqual(e, want) {
		t.Fatalf("dar cargo:\n got %+v\nwant %+v", e, want)
	}
	if _, err := s.SetMemberRole(ctx, "s1", "dono", "ana", "vip", false); err != nil {
		t.Fatal(err)
	}
	if e, _ := log.Last(); e.Action != audit.MemberRoleRemove || !reflect.DeepEqual(e.Changes, []audit.Change{{Field: "role", Before: "vip"}}) {
		t.Fatalf("tirar cargo: %+v", e)
	}
}

func TestAuditNadaQuandoRecusado(t *testing.T) {
	s, _, log := setupAudit()
	_, _ = s.Create(ctx, "s1", "ana", Input{Name: ptr("x")})
	_ = s.Delete(ctx, "s1", "gerente", "admin")
	_, _ = s.SetMemberRole(ctx, "s1", "vip", "ana", "vip", true)
	if got := log.Events(); len(got) != 0 {
		t.Fatalf("ação recusada foi registrada: %+v", got)
	}
}
