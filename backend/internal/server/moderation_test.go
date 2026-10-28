package server

import (
	"context"
	"errors"
	"reflect"
	"testing"

	"gin-quickstart/backend/internal/audit"
	"gin-quickstart/backend/internal/permission"
)

// modPerms: as permissões de um cargo de moderação típico (as do antigo cargo
// Moderador, que servidor novo não cria mais).
const modPerms = permission.DefaultEveryone | permission.ManageChannels |
	permission.ManageServer |
	permission.MentionEveryone |
	permission.ManageMessages |
	permission.MoveMembers |
	permission.MuteMembers |
	permission.DeafenMembers |
	permission.KickMembers |
	permission.ManageExpressions |
	permission.ManageNicknames |
	permission.DisconnectMembers

// fakeModeration guarda membros e bans num permission.Snapshot.
type fakeModeration struct {
	snap *permission.Snapshot
	bans map[string]string // userID -> motivo
}

func newFakeModeration() *fakeModeration {
	snap := permission.NewSnapshot("s1", "dono", permission.DefaultEveryone).
		WithRole("admin", 3, modPerms|permission.BanMembers).
		WithRole("mod", 2, modPerms).
		WithRole("vip", 1, 0).
		WithMember("dono").
		WithMember("chefe", "admin").
		WithMember("mod", "mod").
		WithMember("mod2", "mod").
		WithMember("vip", "vip").
		WithMember("ana")
	return &fakeModeration{snap: snap, bans: map[string]string{}}
}

func (f *fakeModeration) Snapshot(context.Context, string) (*permission.Snapshot, error) {
	return f.snap, nil
}

func (f *fakeModeration) RemoveMember(_ context.Context, _ string, userID string, _ *audit.Mark) error {
	delete(f.snap.MemberRoles, userID)
	return nil
}

func (f *fakeModeration) BanMember(_ context.Context, _ string, userID, _ string, reason *string, _ *audit.Mark) error {
	f.bans[userID] = ""
	if reason != nil {
		f.bans[userID] = *reason
	}
	delete(f.snap.MemberRoles, userID)
	return nil
}

func (f *fakeModeration) Unban(_ context.Context, _ string, userID string, _ *audit.Mark) (bool, error) {
	_, ok := f.bans[userID]
	delete(f.bans, userID)
	return ok, nil
}

func (f *fakeModeration) ListBans(context.Context, string) ([]Ban, error) {
	bans := []Ban{}
	for id := range f.bans {
		bans = append(bans, Ban{UserID: id})
	}
	return bans, nil
}

type removedRecorder struct {
	events []MemberRemovedEvent
}

func (r *removedRecorder) PublishMemberRemoved(e MemberRemovedEvent) { r.events = append(r.events, e) }

func setupModeration() (*Moderation, *fakeModeration, *removedRecorder, *[]string) {
	f, rec := newFakeModeration(), &removedRecorder{}
	m := newModeration(f, f, rec)
	var leftCalls []string
	m.SetOnRemoved(func(_ context.Context, _ string, userID string) { leftCalls = append(leftCalls, userID) })
	return m, f, rec, &leftCalls
}

func TestKickRespectsPermissionAndHierarchy(t *testing.T) {
	ctx := context.Background()
	cases := []struct {
		actor, target string
		want          error
	}{
		{"ana", "vip", permission.ErrMissingPermission},
		{"zeca", "ana", permission.ErrNotMember},
		{"mod", "mod2", ErrCannotActOn},  // mesmo cargo
		{"mod", "chefe", ErrCannotActOn}, // cargo acima
		{"mod", "dono", ErrCannotActOn},  // dono é intocável
		{"mod", "mod", ErrCannotTargetSelf},
		{"mod", "zeca", ErrMemberNotFound},
	}
	for _, tc := range cases {
		m, f, rec, _ := setupModeration()
		if err := m.Kick(ctx, "s1", tc.actor, tc.target); !errors.Is(err, tc.want) {
			t.Errorf("%s expulsando %s: err = %v, want %v", tc.actor, tc.target, err, tc.want)
		}
		if len(rec.events) != 0 || len(f.snap.MemberRoles) != 6 {
			t.Errorf("%s expulsando %s: não devia remover ninguém", tc.actor, tc.target)
		}
	}
}

func TestKickRemovesAndNotifies(t *testing.T) {
	m, f, rec, left := setupModeration()
	if err := m.Kick(context.Background(), "s1", "mod", "vip"); err != nil {
		t.Fatal(err)
	}
	if f.snap.IsMember("vip") {
		t.Fatal("vip devia sair")
	}
	if want := []MemberRemovedEvent{{ServerID: "s1", UserID: "vip", Reason: RemovedKick}}; !reflect.DeepEqual(rec.events, want) {
		t.Fatalf("eventos = %+v", rec.events)
	}
	if !reflect.DeepEqual(*left, []string{"vip"}) {
		t.Fatalf("devia sair da call: %v", *left)
	}
	// O dono expulsa qualquer um, inclusive o cargo mais alto.
	if err := m.Kick(context.Background(), "s1", "dono", "chefe"); err != nil {
		t.Fatal(err)
	}
}

func TestBan(t *testing.T) {
	ctx := context.Background()
	m, f, rec, _ := setupModeration()

	// Moderador padrão não bane.
	if err := m.Ban(ctx, "s1", "mod", "ana", ""); !errors.Is(err, permission.ErrMissingPermission) {
		t.Fatalf("err = %v, want ErrMissingPermission", err)
	}
	long := make([]rune, maxBanReason+1)
	for i := range long {
		long[i] = 'a'
	}
	if err := m.Ban(ctx, "s1", "chefe", "ana", string(long)); !errors.Is(err, ErrReasonTooLong) {
		t.Fatalf("err = %v, want ErrReasonTooLong", err)
	}
	if err := m.Ban(ctx, "s1", "chefe", "ana", "  spam  "); err != nil {
		t.Fatal(err)
	}
	if f.snap.IsMember("ana") || f.bans["ana"] != "spam" {
		t.Fatalf("ana devia ser banida com motivo: %+v", f.bans)
	}
	if want := []MemberRemovedEvent{{ServerID: "s1", UserID: "ana", Reason: RemovedBan}}; !reflect.DeepEqual(rec.events, want) {
		t.Fatalf("eventos = %+v", rec.events)
	}

	// Banir quem não é membro (prevenção) não avisa ninguém.
	if err := m.Ban(ctx, "s1", "chefe", "zeca", ""); err != nil {
		t.Fatal(err)
	}
	if len(rec.events) != 1 {
		t.Fatalf("não devia avisar ban de quem não é membro: %+v", rec.events)
	}
	if err := m.Ban(ctx, "s1", "chefe", "dono", ""); !errors.Is(err, ErrCannotActOn) {
		t.Fatalf("banir o dono: err = %v", err)
	}
}

func TestUnbanAndListBans(t *testing.T) {
	ctx := context.Background()
	m, f, _, _ := setupModeration()
	f.bans["ana"] = ""

	if _, err := m.ListBans(ctx, "s1", "mod"); !errors.Is(err, permission.ErrMissingPermission) {
		t.Fatalf("err = %v", err)
	}
	bans, err := m.ListBans(ctx, "s1", "chefe")
	if err != nil || len(bans) != 1 {
		t.Fatalf("bans = %v, err = %v", bans, err)
	}
	if err := m.Unban(ctx, "s1", "mod", "ana"); !errors.Is(err, permission.ErrMissingPermission) {
		t.Fatalf("err = %v", err)
	}
	if err := m.Unban(ctx, "s1", "chefe", "ana"); err != nil {
		t.Fatal(err)
	}
	if err := m.Unban(ctx, "s1", "chefe", "ana"); !errors.Is(err, ErrBanNotFound) {
		t.Fatalf("desbanir de novo: err = %v", err)
	}
}

func TestLeave(t *testing.T) {
	ctx := context.Background()
	m, f, rec, _ := setupModeration()
	if err := m.Leave(ctx, "s1", "dono"); !errors.Is(err, ErrOwnerCannotLeave) {
		t.Fatalf("err = %v, want ErrOwnerCannotLeave", err)
	}
	if err := m.Leave(ctx, "s1", "zeca"); !errors.Is(err, permission.ErrNotMember) {
		t.Fatalf("err = %v, want ErrNotMember", err)
	}
	if err := m.Leave(ctx, "s1", "ana"); err != nil {
		t.Fatal(err)
	}
	if f.snap.IsMember("ana") || rec.events[0].Reason != RemovedLeave {
		t.Fatalf("ana devia sair: %+v", rec.events)
	}
}
