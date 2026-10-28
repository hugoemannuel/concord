package role

import (
	"context"
	"errors"
	"fmt"
	"reflect"
	"sort"
	"testing"

	"gin-quickstart/backend/internal/audit"
	"gin-quickstart/backend/internal/permission"
)

// fakeStore guarda tudo num permission.Snapshot: o mesmo dado serve de
// store e de fonte de permissões, como o banco de verdade.
type fakeStore struct {
	snap *permission.Snapshot
	next int
}

func newFake() *fakeStore {
	// dono; admin (cargo com ADMINISTRATOR, posição 3); gerente (MANAGE_ROLES,
	// posição 2); vip (posição 1); ana só @everyone.
	snap := permission.NewSnapshot("s1", "dono", permission.DefaultEveryone).
		WithRole("admin", 3, permission.Administrator).
		WithRole("gerente", 2, permission.DefaultEveryone|permission.ManageRoles|permission.KickMembers).
		WithRole("vip", 1, 0).
		WithMember("dono").
		WithMember("chefe", "admin").
		WithMember("gerente", "gerente").
		WithMember("vip", "vip").
		WithMember("ana")
	return &fakeStore{snap: snap}
}

func (f *fakeStore) Snapshot(_ context.Context, serverID string) (*permission.Snapshot, error) {
	if serverID != f.snap.ServerID {
		return nil, permission.ErrNotMember
	}
	return f.snap, nil
}

func (f *fakeStore) List(context.Context, string) ([]Role, error) {
	roles := []Role{}
	for _, r := range f.snap.Roles {
		roles = append(roles, r)
	}
	sort.Slice(roles, func(i, j int) bool { return roles[i].Position > roles[j].Position })
	return roles, nil
}

func (f *fakeStore) Create(_ context.Context, role *Role, _ *audit.Mark) error {
	base := 1
	for id, r := range f.snap.Roles {
		if r.IsSystem {
			base = 2
		} else if !r.IsDefault {
			r.Position++
			f.snap.Roles[id] = r
		}
	}
	f.next++
	role.ID = fmt.Sprintf("novo%d", f.next)
	role.Position = base
	f.snap.Roles[role.ID] = *role
	return nil
}

func (f *fakeStore) Update(_ context.Context, role *Role, _ *audit.Mark) error {
	f.snap.Roles[role.ID] = *role
	if role.IsDefault {
		f.snap.Everyone = *role
	}
	return nil
}

func (f *fakeStore) Delete(_ context.Context, _ string, roleID string, _ *audit.Mark) error {
	delete(f.snap.Roles, roleID)
	for uid, ids := range f.snap.MemberRoles {
		f.snap.MemberRoles[uid] = without(ids, roleID)
	}
	return nil
}

func (f *fakeStore) SetPositions(_ context.Context, _ string, positions map[string]int, _ *audit.Mark) error {
	for id, pos := range positions {
		r := f.snap.Roles[id]
		r.Position = pos
		f.snap.Roles[id] = r
	}
	return nil
}

func (f *fakeStore) AddMemberRole(_ context.Context, _ string, userID, roleID string, _ *audit.Mark) error {
	for _, id := range f.snap.MemberRoles[userID] {
		if id == roleID {
			return nil
		}
	}
	f.snap.MemberRoles[userID] = append(f.snap.MemberRoles[userID], roleID)
	return nil
}

func (f *fakeStore) RemoveMemberRole(_ context.Context, _ string, userID, roleID string, _ *audit.Mark) error {
	f.snap.MemberRoles[userID] = without(f.snap.MemberRoles[userID], roleID)
	return nil
}

func (f *fakeStore) MemberRoleIDs(_ context.Context, _ string, userID string) ([]string, error) {
	return append([]string{}, f.snap.MemberRoles[userID]...), nil
}

func without(ids []string, drop string) []string {
	out := []string{}
	for _, id := range ids {
		if id != drop {
			out = append(out, id)
		}
	}
	return out
}

type recorder struct {
	events []string
}

func (r *recorder) PublishRoleCreate(e RoleEvent)   { r.events = append(r.events, "create:"+e.Role.ID) }
func (r *recorder) PublishRoleUpdate(e RoleEvent)   { r.events = append(r.events, "update:"+e.Role.ID) }
func (r *recorder) PublishRoleDelete(e DeleteEvent) { r.events = append(r.events, "delete:"+e.RoleID) }
func (r *recorder) PublishRoleReorder(ReorderEvent) { r.events = append(r.events, "reorder") }
func (r *recorder) PublishMemberRoles(e MemberRolesEvent) {
	r.events = append(r.events, "member:"+e.UserID)
}
func (r *recorder) PublishPermissionsChanged(string) { r.events = append(r.events, "invalidate") }

func setup() (*Service, *fakeStore, *recorder) {
	f, rec := newFake(), &recorder{}
	return newService(f, f, rec), f, rec
}

func ptr[T any](v T) *T { return &v }

var ctx = context.Background()

func TestCreateRequiresManageRoles(t *testing.T) {
	svc, _, rec := setup()
	if _, err := svc.Create(ctx, "s1", "ana", Input{Name: ptr("x")}); !errors.Is(err, permission.ErrMissingPermission) {
		t.Fatalf("ana: err = %v, want ErrMissingPermission", err)
	}
	if _, err := svc.Create(ctx, "s1", "zeca", Input{Name: ptr("x")}); !errors.Is(err, permission.ErrNotMember) {
		t.Fatalf("zeca: err = %v, want ErrNotMember", err)
	}
	if len(rec.events) != 0 {
		t.Fatalf("eventos sem permissão: %v", rec.events)
	}
}

func TestCreatePutsRoleAtBottomAndPublishes(t *testing.T) {
	svc, f, rec := setup()
	role, err := svc.Create(ctx, "s1", "gerente", Input{Name: ptr("  Artistas "), Color: ptr(0xff00aa), Hoist: ptr(true)})
	if err != nil {
		t.Fatal(err)
	}
	if role.Name != "Artistas" || role.Position != 1 || *role.Color != 0xff00aa || !role.Hoist {
		t.Fatalf("cargo criado errado: %+v", role)
	}
	if f.snap.Roles["vip"].Position != 2 || f.snap.Roles["gerente"].Position != 3 || f.snap.Roles["admin"].Position != 4 {
		t.Fatal("os outros cargos deviam subir uma posição")
	}
	// gerente continua acima do cargo novo e pode editá-lo.
	if _, err := svc.Update(ctx, "s1", "gerente", role.ID, Input{Name: ptr("Artes")}); err != nil {
		t.Fatalf("gerente devia editar o cargo que criou: %v", err)
	}
	if want := []string{"create:" + role.ID, "reorder", "update:" + role.ID}; !reflect.DeepEqual(rec.events, want) {
		t.Fatalf("eventos = %v, want %v", rec.events, want)
	}
}

func TestCreateCannotGrantMissingPermission(t *testing.T) {
	svc, _, _ := setup()
	if _, err := svc.Create(ctx, "s1", "gerente", Input{Permissions: ptr(permission.BanMembers)}); !errors.Is(err, ErrCannotGrant) {
		t.Fatalf("err = %v, want ErrCannotGrant", err)
	}
	if _, err := svc.Create(ctx, "s1", "gerente", Input{Permissions: ptr(permission.KickMembers | permission.SendMessages)}); err != nil {
		t.Fatalf("devia dar o que tem: %v", err)
	}
	if _, err := svc.Create(ctx, "s1", "chefe", Input{Permissions: ptr(permission.All)}); err != nil {
		t.Fatalf("ADMINISTRATOR dá tudo: %v", err)
	}
}

func TestCreateValidatesInput(t *testing.T) {
	svc, _, _ := setup()
	cases := map[string]struct {
		in   Input
		want error
	}{
		"nome vazio":      {Input{Name: ptr("   ")}, ErrInvalidName},
		"nome longo":      {Input{Name: ptr("123456789012345678901234567890123")}, ErrInvalidName},
		"nome @everyone":  {Input{Name: ptr("@everyone")}, ErrInvalidName},
		"nome Bots":       {Input{Name: ptr("Bots")}, ErrInvalidName},
		"cor negativa":    {Input{Color: ptr(-1)}, ErrInvalidColor},
		"cor fora de RGB": {Input{Color: ptr(0x1000000)}, ErrInvalidColor},
	}
	for name, tc := range cases {
		if _, err := svc.Create(ctx, "s1", "dono", tc.in); !errors.Is(err, tc.want) {
			t.Errorf("%s: err = %v, want %v", name, err, tc.want)
		}
	}
}

func TestCreateLimit(t *testing.T) {
	svc, f, _ := setup()
	for i := len(f.snap.Roles) - 1; i < MaxRoles; i++ {
		if _, err := svc.Create(ctx, "s1", "dono", Input{}); err != nil {
			t.Fatalf("cargo %d: %v", i, err)
		}
	}
	if _, err := svc.Create(ctx, "s1", "dono", Input{}); !errors.Is(err, ErrTooManyRoles) {
		t.Fatalf("err = %v, want ErrTooManyRoles", err)
	}
}

func TestUpdateRespectsHierarchy(t *testing.T) {
	svc, _, _ := setup()
	cases := []struct {
		actor, role string
		want        error
	}{
		{"gerente", "vip", nil},
		{"gerente", "gerente", ErrRoleHierarchy}, // o próprio cargo mais alto
		{"gerente", "admin", ErrRoleHierarchy},
		{"chefe", "gerente", nil},
		{"dono", "admin", nil},
		{"gerente", "nao-existe", ErrRoleNotFound},
	}
	for _, tc := range cases {
		_, err := svc.Update(ctx, "s1", tc.actor, tc.role, Input{Name: ptr("renomeado")})
		if !errors.Is(err, tc.want) {
			t.Errorf("%s editando %s: err = %v, want %v", tc.actor, tc.role, err, tc.want)
		}
	}
}

func TestUpdatePermissionsOnlyChangesBitsActorHas(t *testing.T) {
	svc, f, rec := setup()
	vip := f.snap.Roles["vip"]
	vip.Permissions = permission.BanMembers // algo que o gerente não tem
	f.snap.Roles["vip"] = vip

	// Manter BAN (que ele não tem) e ligar KICK (que tem) pode.
	if _, err := svc.Update(ctx, "s1", "gerente", "vip", Input{Permissions: ptr(permission.BanMembers | permission.KickMembers)}); err != nil {
		t.Fatalf("devia poder: %v", err)
	}
	// Tirar BAN, não.
	if _, err := svc.Update(ctx, "s1", "gerente", "vip", Input{Permissions: ptr(permission.KickMembers)}); !errors.Is(err, ErrCannotGrant) {
		t.Fatalf("err = %v, want ErrCannotGrant", err)
	}
	if rec.events[len(rec.events)-1] != "invalidate" {
		t.Fatalf("mudar permissões devia invalidar: %v", rec.events)
	}
}

func TestEveryoneRoleRules(t *testing.T) {
	svc, f, _ := setup()
	if _, err := svc.Update(ctx, "s1", "dono", "everyone", Input{Name: ptr("todos")}); !errors.Is(err, ErrEveryoneRole) {
		t.Fatalf("renomear @everyone: err = %v", err)
	}
	if err := svc.Delete(ctx, "s1", "dono", "everyone"); !errors.Is(err, ErrEveryoneRole) {
		t.Fatalf("apagar @everyone: err = %v", err)
	}
	if _, err := svc.SetMemberRole(ctx, "s1", "dono", "ana", "everyone", true); !errors.Is(err, ErrEveryoneRole) {
		t.Fatalf("dar @everyone: err = %v", err)
	}
	// Permissões do @everyone mudam (qualquer um com cargo acima dele).
	next := permission.DefaultEveryone &^ permission.SendMessages
	if _, err := svc.Update(ctx, "s1", "gerente", "everyone", Input{Permissions: ptr(next)}); err != nil {
		t.Fatalf("editar permissões do @everyone: %v", err)
	}
	if f.snap.Everyone.ID != "everyone" || f.snap.Roles["everyone"].Permissions != next {
		t.Fatal("permissões do @everyone não mudaram")
	}
}

func TestBotSystemRoleRules(t *testing.T) {
	svc, f, _ := setup()
	// Ajusta cargos existentes para posições 2..4 e adiciona o cargo de sistema Bots na posição 1.
	for _, id := range []string{"vip", "gerente", "admin"} {
		r := f.snap.Roles[id]
		r.Position++
		f.snap.Roles[id] = r
	}
	f.snap.Roles["bots"] = Role{
		ID:       "bots",
		ServerID: "s1",
		Name:     permission.BotsRoleName,
		Position: 1,
		Hoist:    true,
		IsSystem: true,
	}

	if err := svc.Delete(ctx, "s1", "dono", "bots"); !errors.Is(err, ErrBotRole) {
		t.Fatalf("apagar Bots: err = %v, want ErrBotRole", err)
	}
	if _, err := svc.SetMemberRole(ctx, "s1", "dono", "ana", "bots", true); !errors.Is(err, ErrBotRole) {
		t.Fatalf("atribuir Bots a usuário: err = %v, want ErrBotRole", err)
	}
	if _, err := svc.SetMemberRole(ctx, "s1", "dono", "ana", "bots", false); !errors.Is(err, ErrBotRole) {
		t.Fatalf("remover Bots via API: err = %v, want ErrBotRole", err)
	}
	if _, err := svc.Update(ctx, "s1", "dono", "bots", Input{Name: ptr("Outros")}); !errors.Is(err, ErrBotRole) {
		t.Fatalf("renomear Bots: err = %v, want ErrBotRole", err)
	}
	if _, err := svc.Update(ctx, "s1", "dono", "bots", Input{Hoist: ptr(false)}); !errors.Is(err, ErrBotRole) {
		t.Fatalf("desativar hoist do Bots: err = %v, want ErrBotRole", err)
	}
	// Tentar subir Bots acima de outro cargo na reordenação é bloqueado.
	if _, err := svc.Reorder(ctx, "s1", "dono", []string{"admin", "gerente", "bots", "vip"}); !errors.Is(err, ErrBotRole) {
		t.Fatalf("subir Bots na ordem: err = %v, want ErrBotRole", err)
	}
	// Reordenar os cargos normais mantém Bots na posição 1 e os demais acima (2..4).
	if _, err := svc.Reorder(ctx, "s1", "dono", []string{"gerente", "vip", "admin"}); err != nil {
		t.Fatalf("reordenar cargos normais: %v", err)
	}
	if f.snap.Roles["bots"].Position != 1 || f.snap.Roles["admin"].Position != 2 || f.snap.Roles["vip"].Position != 3 || f.snap.Roles["gerente"].Position != 4 {
		t.Fatalf("posições incorretas após reorder com Bots: bots=%d admin=%d vip=%d gerente=%d",
			f.snap.Roles["bots"].Position, f.snap.Roles["admin"].Position, f.snap.Roles["vip"].Position, f.snap.Roles["gerente"].Position)
	}
}

func TestDeleteRole(t *testing.T) {
	svc, f, rec := setup()
	if err := svc.Delete(ctx, "s1", "gerente", "admin"); !errors.Is(err, ErrRoleHierarchy) {
		t.Fatalf("err = %v, want ErrRoleHierarchy", err)
	}
	if err := svc.Delete(ctx, "s1", "ana", "vip"); !errors.Is(err, permission.ErrMissingPermission) {
		t.Fatalf("err = %v, want ErrMissingPermission", err)
	}
	if err := svc.Delete(ctx, "s1", "gerente", "vip"); err != nil {
		t.Fatal(err)
	}
	if _, ok := f.snap.Roles["vip"]; ok || len(f.snap.MemberRoles["vip"]) != 0 {
		t.Fatal("cargo não foi apagado")
	}
	if want := []string{"delete:vip", "invalidate"}; !reflect.DeepEqual(rec.events, want) {
		t.Fatalf("eventos = %v, want %v", rec.events, want)
	}
}

func TestReorder(t *testing.T) {
	svc, f, _ := setup()
	// gerente (2) troca só o que está abaixo dele: não há outro além do vip,
	// então mover o vip para cima do gerente é proibido.
	if _, err := svc.Reorder(ctx, "s1", "gerente", []string{"admin", "vip", "gerente"}); !errors.Is(err, ErrRoleHierarchy) {
		t.Fatalf("err = %v, want ErrRoleHierarchy", err)
	}
	if _, err := svc.Reorder(ctx, "s1", "gerente", []string{"admin", "gerente"}); !errors.Is(err, ErrInvalidOrder) {
		t.Fatalf("faltando cargo: err = %v", err)
	}
	if _, err := svc.Reorder(ctx, "s1", "gerente", []string{"admin", "gerente", "vip", "vip"}); !errors.Is(err, ErrInvalidOrder) {
		t.Fatalf("repetido: err = %v", err)
	}
	if _, err := svc.Reorder(ctx, "s1", "gerente", []string{"admin", "gerente", "everyone"}); !errors.Is(err, ErrInvalidOrder) {
		t.Fatalf("com @everyone: err = %v", err)
	}
	// Mesma ordem: nada muda, nada é proibido.
	if _, err := svc.Reorder(ctx, "s1", "gerente", []string{"admin", "gerente", "vip"}); err != nil {
		t.Fatal(err)
	}
	// O admin (3) reordena gerente e vip.
	if _, err := svc.Reorder(ctx, "s1", "chefe", []string{"admin", "vip", "gerente"}); err != nil {
		t.Fatal(err)
	}
	if f.snap.Roles["vip"].Position != 2 || f.snap.Roles["gerente"].Position != 1 {
		t.Fatal("posições não mudaram")
	}
	// O dono reordena tudo.
	if _, err := svc.Reorder(ctx, "s1", "dono", []string{"gerente", "vip", "admin"}); err != nil {
		t.Fatal(err)
	}
	if f.snap.Roles["gerente"].Position != 3 || f.snap.Roles["admin"].Position != 1 {
		t.Fatal("dono devia reordenar tudo")
	}
}

func TestSetMemberRole(t *testing.T) {
	svc, f, rec := setup()
	ids, err := svc.SetMemberRole(ctx, "s1", "gerente", "ana", "vip", true)
	if err != nil || !reflect.DeepEqual(ids, []string{"vip"}) {
		t.Fatalf("ids = %v, err = %v", ids, err)
	}
	if f.snap.Highest("ana") != 1 {
		t.Fatal("ana devia ter o vip")
	}
	if _, err := svc.SetMemberRole(ctx, "s1", "gerente", "ana", "gerente", true); !errors.Is(err, ErrRoleHierarchy) {
		t.Fatalf("dar o próprio cargo: err = %v", err)
	}
	if _, err := svc.SetMemberRole(ctx, "s1", "gerente", "ana", "admin", true); !errors.Is(err, ErrRoleHierarchy) {
		t.Fatalf("dar cargo acima: err = %v", err)
	}
	if _, err := svc.SetMemberRole(ctx, "s1", "gerente", "zeca", "vip", true); !errors.Is(err, ErrMemberNotFound) {
		t.Fatalf("não membro: err = %v", err)
	}
	if _, err := svc.SetMemberRole(ctx, "s1", "vip", "ana", "vip", false); !errors.Is(err, permission.ErrMissingPermission) {
		t.Fatalf("sem MANAGE_ROLES: err = %v", err)
	}
	ids, err = svc.SetMemberRole(ctx, "s1", "gerente", "ana", "vip", false)
	if err != nil || len(ids) != 0 {
		t.Fatalf("tirar: ids = %v, err = %v", ids, err)
	}
	if want := []string{"member:ana", "invalidate", "member:ana", "invalidate"}; !reflect.DeepEqual(rec.events, want) {
		t.Fatalf("eventos = %v, want %v", rec.events, want)
	}
}

// Regressão da issue #331: o dono dá e tira de si mesmo qualquer cargo, até o
// mais alto, mesmo sem cargo nenhum (a hierarquia não vale para ele).
func TestOwnerSetsOwnRoles(t *testing.T) {
	svc, f, _ := setup()
	ids, err := svc.SetMemberRole(ctx, "s1", "dono", "dono", "admin", true)
	if err != nil || !reflect.DeepEqual(ids, []string{"admin"}) {
		t.Fatalf("dar a si mesmo: ids = %v, err = %v", ids, err)
	}
	if f.snap.Highest("dono") != 3 {
		t.Fatal("o dono devia ter o cargo mais alto")
	}
	if ids, err := svc.SetMemberRole(ctx, "s1", "dono", "dono", "admin", false); err != nil || len(ids) != 0 {
		t.Fatalf("tirar de si mesmo: ids = %v, err = %v", ids, err)
	}
}

// Os cargos do dono só o próprio dono mexe (nem quem tem Administrador).
func TestOnlyOwnerSetsOwnerRoles(t *testing.T) {
	svc, f, _ := setup()
	f.snap.MemberRoles["dono"] = []string{"vip"}
	for _, actor := range []string{"chefe", "gerente"} {
		if _, err := svc.SetMemberRole(ctx, "s1", actor, "dono", "vip", false); !errors.Is(err, ErrOwnerRoles) {
			t.Fatalf("%s tirando cargo do dono: err = %v, want ErrOwnerRoles", actor, err)
		}
	}
	if _, err := svc.SetMemberRole(ctx, "s1", "gerente", "dono", "vip", true); !errors.Is(err, ErrOwnerRoles) {
		t.Fatalf("dando cargo ao dono: err = %v, want ErrOwnerRoles", err)
	}
	// Fora o dono, a pessoa mexe nos próprios cargos como nos dos outros.
	if _, err := svc.SetMemberRole(ctx, "s1", "gerente", "gerente", "vip", true); err != nil {
		t.Fatalf("gerente se dando vip: %v", err)
	}
}
