package event

import (
	"errors"
	"testing"

	"github.com/google/uuid"
)

func (w roomWorld) newRole(t *testing.T, serverID, name string) string {
	t.Helper()
	var id string
	err := w.db.QueryRow(w.ctx,
		`INSERT INTO roles (server_id, name, position, permissions) VALUES ($1, $2, 1, 0) RETURNING id`,
		serverID, name).Scan(&id)
	if err != nil {
		t.Fatal(err)
	}
	return id
}

func (w roomWorld) giveRole(t *testing.T, serverID, userID, roleID string) {
	t.Helper()
	mustExec(t, w.db, `INSERT INTO member_roles (server_id, user_id, role_id) VALUES ($1, $2, $3)`, serverID, userID, roleID)
}

func TestEventActionsAreTheUnionOfTheRolesTheOwnerChose(t *testing.T) {
	w := newRoomWorld(t)
	owner, serverID := w.newServer(t)
	alice, bob, carol, dave := w.newUser(t), w.newUser(t), w.newUser(t), w.newUser(t)
	for _, id := range []string{alice, bob, carol, dave} {
		w.join(t, serverID, id)
	}
	roleA, roleB, roleC := w.newRole(t, serverID, "Cargo A"), w.newRole(t, serverID, "Cargo B"), w.newRole(t, serverID, "Cargo C")
	w.giveRole(t, serverID, alice, roleA)
	w.giveRole(t, serverID, alice, roleB)
	w.giveRole(t, serverID, bob, roleC) // este cargo o dono nunca configurou
	roleD := w.newRole(t, serverID, "Cargo D")
	w.giveRole(t, serverID, dave, roleD)
	if err := w.repo.SetRoleActions(w.ctx, serverID, roleD, ActionConfigure); err != nil {
		t.Fatal(err)
	}
	if err := w.repo.SetRoleActions(w.ctx, serverID, roleA, ActionCreate); err != nil {
		t.Fatal(err)
	}
	if err := w.repo.SetRoleActions(w.ctx, serverID, roleB, ActionEdit); err != nil {
		t.Fatal(err)
	}

	cases := map[string]struct {
		user string
		want Actions
	}{
		"dono tem tudo": {owner, AllActions},
		"cargo com configurar soma o bit de configurar": {dave, ActionConfigure},
		"quem tem os cargos A e B soma criar e editar":  {alice, ActionCreate | ActionEdit},
		"cargo que o dono não configurou não dá nada":   {bob, 0},
		"membro sem cargo nada":                         {carol, 0},
	}
	for name, c := range cases {
		got, err := w.repo.EventActions(w.ctx, serverID, c.user)
		if err != nil || got != c.want {
			t.Errorf("%s: %03b err=%v, esperava %03b", name, got, err, c.want)
		}
	}
	if ok, err := w.repo.IsOwner(w.ctx, serverID, owner); err != nil || !ok {
		t.Errorf("o dono é o dono: %v %v", ok, err)
	}
	if ok, _ := w.repo.IsOwner(w.ctx, serverID, alice); ok {
		t.Error("quem tem cargo com todas as ações não vira dono")
	}
}

func TestSetRoleActionsAndList(t *testing.T) {
	w := newRoomWorld(t)
	_, serverID := w.newServer(t)
	roleA, roleB := w.newRole(t, serverID, "Cargo A"), w.newRole(t, serverID, "Cargo B")

	if err := w.repo.SetRoleActions(w.ctx, serverID, roleA, ActionCreate|ActionDelete|ActionConfigure); err != nil {
		t.Fatal(err)
	}
	list, err := w.repo.RoleAccessList(w.ctx, serverID)
	if err != nil {
		t.Fatal(err)
	}
	byID := map[string]RoleAccess{}
	for _, r := range list {
		byID[r.RoleID] = r
	}
	if a := byID[roleA]; !a.Create || a.Edit || !a.Delete || !a.Configure || a.Name != "Cargo A" {
		t.Errorf("cargo A = %+v", a)
	}
	if b, ok := byID[roleB]; !ok || b.Create || b.Edit || b.Delete || b.Configure {
		t.Errorf("cargo B (sem nada marcado) tem que aparecer: %+v ok=%v", b, ok)
	}
	for _, r := range list {
		if r.Name == "@everyone" || r.Name == "Bots" {
			t.Errorf("o cargo padrão e o de bots não entram na lista: %+v", r)
		}
	}

	// Desmarcar tudo tira a linha; trocar sobrescreve.
	if err := w.repo.SetRoleActions(w.ctx, serverID, roleA, ActionEdit); err != nil {
		t.Fatal(err)
	}
	if err := w.repo.SetRoleActions(w.ctx, serverID, roleB, 0); err != nil {
		t.Fatal(err)
	}
	list, _ = w.repo.RoleAccessList(w.ctx, serverID)
	for _, r := range list {
		if r.RoleID == roleA && (r.Create || !r.Edit || r.Delete) {
			t.Errorf("cargo A depois de trocar: %+v", r)
		}
	}
	var rows int
	_ = w.db.QueryRow(w.ctx, `SELECT COUNT(*) FROM event_role_actions WHERE server_id = $1`, serverID).Scan(&rows)
	if rows != 1 {
		t.Errorf("linhas = %d, esperava 1 (só o cargo A)", rows)
	}
}

func TestSetRoleActionsRefusesDefaultAndForeignRoles(t *testing.T) {
	w := newRoomWorld(t)
	_, serverID := w.newServer(t)
	_, otherServer := w.newServer(t)
	foreign := w.newRole(t, otherServer, "De fora")
	var everyone string
	if err := w.db.QueryRow(w.ctx, `SELECT id FROM roles WHERE server_id = $1 AND is_default`, serverID).Scan(&everyone); err != nil {
		t.Fatal(err)
	}
	for name, roleID := range map[string]string{
		"@everyone":               everyone,
		"cargo de outro servidor": foreign,
		"cargo que não existe":    uuid.NewString(),
		"id inválido":             "nao-e-uuid",
	} {
		if err := w.repo.SetRoleActions(w.ctx, serverID, roleID, ActionCreate); !errors.Is(err, ErrRoleNotFound) {
			t.Errorf("%s: erro = %v, esperava ErrRoleNotFound", name, err)
		}
	}
}

func TestDeletingTheRoleClearsItsEventActions(t *testing.T) {
	w := newRoomWorld(t)
	_, serverID := w.newServer(t)
	role := w.newRole(t, serverID, "Cargo A")
	if err := w.repo.SetRoleActions(w.ctx, serverID, role, AllActions); err != nil {
		t.Fatal(err)
	}
	mustExec(t, w.db, `DELETE FROM roles WHERE id = $1`, role)
	var rows int
	_ = w.db.QueryRow(w.ctx, `SELECT COUNT(*) FROM event_role_actions WHERE role_id = $1`, role).Scan(&rows)
	if rows != 0 {
		t.Fatalf("apagar o cargo devia limpar a configuração, sobraram %d linhas", rows)
	}
}
