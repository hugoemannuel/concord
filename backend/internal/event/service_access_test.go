package event

import (
	"context"
	"errors"
	"testing"
)

// fakeAccess: o que cada pessoa pode fazer com eventos, mais a configuração por
// cargo (só o dono mexe). "dono" é o dono do servidor.
type fakeAccess struct {
	actions map[string]Actions
	roles   map[string]Actions
	names   map[string]string
}

func newFakeAccess() *fakeAccess {
	return &fakeAccess{
		actions: map[string]Actions{"dono": AllActions},
		roles:   map[string]Actions{},
		names:   map[string]string{"cargo-a": "Cargo A", "cargo-b": "Cargo B"},
	}
}

func (f *fakeAccess) EventActions(_ context.Context, _, userID string) (Actions, error) {
	return f.actions[userID], nil
}

func (f *fakeAccess) IsOwner(_ context.Context, _, userID string) (bool, error) {
	return userID == "dono", nil
}

func (f *fakeAccess) RoleAccessList(context.Context, string) ([]RoleAccess, error) {
	out := []RoleAccess{}
	for _, id := range []string{"cargo-a", "cargo-b"} {
		a := f.roles[id]
		out = append(out, RoleAccess{RoleID: id, Name: f.names[id], Create: a.Has(ActionCreate), Edit: a.Has(ActionEdit), Delete: a.Has(ActionDelete), Configure: a.Has(ActionConfigure)})
	}
	return out, nil
}

func (f *fakeAccess) SetRoleActions(_ context.Context, _, roleID string, a Actions) error {
	if _, ok := f.names[roleID]; !ok {
		return ErrRoleNotFound
	}
	f.roles[roleID] = a
	return nil
}

func TestActionsBitmask(t *testing.T) {
	a := ActionCreate | ActionDelete
	if !a.Has(ActionCreate) || !a.Has(ActionDelete) || a.Has(ActionEdit) {
		t.Fatalf("%b: criar e excluir sim, editar não", a)
	}
	if !a.Has(ActionCreate|ActionDelete) || a.Has(ActionCreate|ActionEdit) {
		t.Fatal("Has com várias ações exige todas")
	}
	if CrudActions != 7 || AllActions != 15 {
		t.Fatalf("CrudActions = %d, AllActions = %d, esperava 7 e 15 (criar, editar e excluir; mais configurar)", CrudActions, AllActions)
	}
}

// Cada cargo faz só o que o dono marcou: A só cria, B só edita, C só exclui.
func TestEachActionNeedsItsOwnPermission(t *testing.T) {
	e := newEnv()
	e.access.actions["a"], e.access.actions["b"], e.access.actions["c"] = ActionCreate, ActionEdit, ActionDelete
	ctx := context.Background()

	if _, err := e.svc.Create(ctx, "s1", "b", goodInput()); !errors.Is(err, ErrMissingPermission) {
		t.Errorf("quem só edita não cria: %v", err)
	}
	if _, err := e.svc.Create(ctx, "s1", "c", goodInput()); !errors.Is(err, ErrMissingPermission) {
		t.Errorf("quem só exclui não cria: %v", err)
	}
	created, err := e.svc.Create(ctx, "s1", "a", goodInput())
	if err != nil {
		t.Fatalf("quem pode criar cria: %v", err)
	}

	if _, err := e.svc.Update(ctx, "s1", created.ID, "a", goodInput()); !errors.Is(err, ErrMissingPermission) {
		t.Errorf("quem só cria não edita: %v", err)
	}
	if _, err := e.svc.Update(ctx, "s1", created.ID, "c", goodInput()); !errors.Is(err, ErrMissingPermission) {
		t.Errorf("quem só exclui não edita: %v", err)
	}
	if _, err := e.svc.Update(ctx, "s1", created.ID, "b", goodInput()); err != nil {
		t.Fatalf("quem pode editar edita: %v", err)
	}

	if err := e.svc.Cancel(ctx, "s1", created.ID, "a"); !errors.Is(err, ErrMissingPermission) {
		t.Errorf("quem só cria não exclui: %v", err)
	}
	if err := e.svc.Cancel(ctx, "s1", created.ID, "b"); !errors.Is(err, ErrMissingPermission) {
		t.Errorf("quem só edita não exclui: %v", err)
	}
	if err := e.svc.Cancel(ctx, "s1", created.ID, "c"); err != nil {
		t.Fatalf("quem pode excluir exclui: %v", err)
	}
}

func TestOwnerCanDoEverythingAndMembersWithoutRolesNothing(t *testing.T) {
	e := newEnv()
	ctx := context.Background()
	created, err := e.svc.Create(ctx, "s1", "dono", goodInput())
	if err != nil {
		t.Fatal(err)
	}
	if _, err := e.svc.Update(ctx, "s1", created.ID, "dono", goodInput()); err != nil {
		t.Fatal(err)
	}
	if err := e.svc.Cancel(ctx, "s1", created.ID, "dono"); err != nil {
		t.Fatal(err)
	}
	if _, err := e.svc.Create(ctx, "s1", "membro", goodInput()); !errors.Is(err, ErrMissingPermission) {
		t.Fatalf("membro sem cargo: %v", err)
	}
}

func TestAccessTellsWhatTheMemberCanDo(t *testing.T) {
	e := newEnv()
	e.access.actions["a"] = ActionCreate | ActionEdit
	ctx := context.Background()

	got, err := e.svc.Access(ctx, "s1", "a")
	if err != nil || got != (AccessView{Create: true, Edit: true}) {
		t.Fatalf("a = %+v err=%v", got, err)
	}
	owner, _ := e.svc.Access(ctx, "s1", "dono")
	if owner != (AccessView{Create: true, Edit: true, Delete: true, Configure: true, Owner: true}) {
		t.Fatalf("dono = %+v", owner)
	}
	if _, err := e.svc.Access(ctx, "s1", "estranho"); !errors.Is(err, ErrNotMember) {
		t.Fatalf("não membro = %v", err)
	}
}

func TestWithoutConfigureOnlyTheOwnerIsNotEnough(t *testing.T) {
	e := newEnv()
	e.access.actions["a"] = CrudActions // criar, editar e excluir não dão o poder de configurar
	ctx := context.Background()

	if _, err := e.svc.RoleSettings(ctx, "s1", "a"); !errors.Is(err, ErrMissingPermission) {
		t.Fatalf("ver a configuração: %v", err)
	}
	if err := e.svc.SetRoleActions(ctx, "s1", "a", "cargo-a", ActionEdit); !errors.Is(err, ErrMissingPermission) {
		t.Fatalf("mudar a configuração: %v", err)
	}
	if len(e.pub.sent) != 0 {
		t.Fatalf("nada devia ser publicado: %+v", e.pub.sent)
	}
}

func TestOwnerSeesAndChangesTheRoleSettings(t *testing.T) {
	e := newEnv()
	ctx := context.Background()
	if err := e.svc.SetRoleActions(ctx, "s1", "dono", "cargo-a", ActionCreate|ActionEdit|ActionConfigure); err != nil {
		t.Fatal(err)
	}
	roles, err := e.svc.RoleSettings(ctx, "s1", "dono")
	if err != nil || len(roles) != 2 {
		t.Fatalf("cargos = %+v err=%v", roles, err)
	}
	if !roles[0].Create || !roles[0].Edit || roles[0].Delete || !roles[0].Configure || roles[1].Create {
		t.Fatalf("configuração = %+v", roles)
	}
}

// O dono liberou o cargo A para configurar: quem tem o cargo A abre a configuração e
// escolhe criar, editar e excluir dos cargos, mas não liga nem desliga o "configurar".
func TestDelegateConfiguresButCannotGrantConfigure(t *testing.T) {
	e := newEnv()
	e.access.actions["delegado"] = ActionConfigure
	e.access.roles["cargo-a"] = ActionConfigure | ActionEdit
	ctx := context.Background()

	roles, err := e.svc.RoleSettings(ctx, "s1", "delegado")
	if err != nil || len(roles) != 2 {
		t.Fatalf("o delegado vê a configuração: %+v err=%v", roles, err)
	}

	// Muda o cargo B: criar e excluir sim, "configurar" pedido é ignorado.
	if err := e.svc.SetRoleActions(ctx, "s1", "delegado", "cargo-b", ActionCreate|ActionDelete|ActionConfigure); err != nil {
		t.Fatal(err)
	}
	if got := e.access.roles["cargo-b"]; got != ActionCreate|ActionDelete {
		t.Fatalf("cargo B = %04b, esperava criar e excluir sem configurar", got)
	}

	// No cargo A (que já configura) o "configurar" fica, mesmo se o delegado tentar tirar.
	if err := e.svc.SetRoleActions(ctx, "s1", "delegado", "cargo-a", ActionCreate); err != nil {
		t.Fatal(err)
	}
	if got := e.access.roles["cargo-a"]; got != ActionCreate|ActionConfigure {
		t.Fatalf("cargo A = %04b, esperava criar e continuar configurando", got)
	}
}

func TestOnlyTheOwnerGrantsOrRevokesConfigure(t *testing.T) {
	e := newEnv()
	ctx := context.Background()
	if err := e.svc.SetRoleActions(ctx, "s1", "dono", "cargo-b", ActionConfigure); err != nil {
		t.Fatal(err)
	}
	if got := e.access.roles["cargo-b"]; got != ActionConfigure {
		t.Fatalf("o dono liga: %04b", got)
	}
	if err := e.svc.SetRoleActions(ctx, "s1", "dono", "cargo-b", 0); err != nil {
		t.Fatal(err)
	}
	if got := e.access.roles["cargo-b"]; got != 0 {
		t.Fatalf("o dono desliga: %04b", got)
	}
}

func TestChangingTheRoleSettingsTellsTheApp(t *testing.T) {
	e := newEnv()
	if err := e.svc.SetRoleActions(context.Background(), "s1", "dono", "cargo-a", ActionDelete); err != nil {
		t.Fatal(err)
	}
	last := e.pub.sent[len(e.pub.sent)-1]
	if last.room != "server:s1" || last.event["type"] != "event:access" {
		t.Fatalf("publicado = %+v, esperava event:access", last)
	}
}

func TestSetRoleActionsUnknownRole(t *testing.T) {
	e := newEnv()
	e.access.actions["delegado"] = ActionConfigure
	for _, actor := range []string{"dono", "delegado"} {
		if err := e.svc.SetRoleActions(context.Background(), "s1", actor, "outro", ActionEdit); !errors.Is(err, ErrRoleNotFound) {
			t.Fatalf("%s: erro = %v", actor, err)
		}
	}
}
