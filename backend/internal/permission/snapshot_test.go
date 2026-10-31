package permission

import (
	"context"
	"errors"
	"reflect"
	"testing"
)

func testSnapshot() *Snapshot {
	return NewSnapshot("s1", "dono", DefaultEveryone).
		WithRole("mod", 2, legacyModerator).
		WithRole("vip", 1, 0).
		WithMember("dono").
		WithMember("mod", "mod").
		WithMember("vip", "vip").
		WithMember("ana").
		WithChannel("geral", ChannelText).
		WithChannel("vip-texto", ChannelText,
			Overwrite{TargetType: TargetRole, TargetID: "everyone", Deny: ViewChannel},
			Overwrite{TargetType: TargetRole, TargetID: "vip", Allow: ViewChannel},
		).
		WithChannel("vip-voz", ChannelVoice,
			Overwrite{TargetType: TargetRole, TargetID: "everyone", Deny: ViewChannel | Connect},
			Overwrite{TargetType: TargetRole, TargetID: "vip", Allow: ViewChannel | Connect},
		)
}

func TestVisibleChannels(t *testing.T) {
	snap := testSnapshot()
	cases := map[string]map[string]bool{
		"dono": {"geral": true, "vip-texto": true, "vip-voz": true},
		"vip":  {"geral": true, "vip-texto": true, "vip-voz": true},
		"mod":  {"geral": true},
		"ana":  {"geral": true},
		"zeca": {},
	}
	for user, want := range cases {
		if got := snap.VisibleChannels(user); !reflect.DeepEqual(got, want) {
			t.Errorf("%s: visíveis = %v, want %v", user, got, want)
		}
	}
}

func TestNonMemberHasNothing(t *testing.T) {
	snap := testSnapshot()
	if snap.Server("zeca") != 0 || snap.Channel("geral", "zeca") != 0 {
		t.Fatal("quem não é membro não pode ter permissão")
	}
	if snap.Channel("nao-existe", "ana") != 0 {
		t.Fatal("canal de outro servidor não pode ter permissão")
	}
}

func TestRolesOfOrderedAndHighest(t *testing.T) {
	snap := testSnapshot().WithMember("ana", "vip", "mod")
	roles := snap.RolesOf("ana")
	if len(roles) != 2 || roles[0].ID != "mod" || roles[1].ID != "vip" {
		t.Fatalf("RolesOf = %+v, want mod, vip", roles)
	}
	if snap.Highest("ana") != 2 || snap.Highest("zeca") != 0 {
		t.Fatalf("Highest errado")
	}
	if !snap.CanActOn("mod", "vip") || snap.CanActOn("vip", "mod") || snap.CanActOn("mod", "dono") {
		t.Fatal("hierarquia errada")
	}
	snap = snap.WithMember("mod2", "mod")
	if snap.CanActOn("mod", "mod2") {
		t.Fatal("CanActOn não pode permitir mesmo cargo")
	}
	if !snap.CanManageNicknameOf("mod", "mod2") || !snap.CanManageNicknameOf("mod", "vip") {
		t.Fatal("CanManageNicknameOf deve permitir mesmo cargo ou cargo menor")
	}
	if snap.CanManageNicknameOf("vip", "mod") || snap.CanManageNicknameOf("mod", "dono") {
		t.Fatal("CanManageNicknameOf não pode permitir cargo superior nem o dono")
	}
	if !snap.CanManageNicknameOf("dono", "mod") || !snap.CanManageNicknameOf("dono", "dono") {
		t.Fatal("dono pode alterar apelido de qualquer um")
	}
	if !snap.CanDisconnectMember("mod", "mod2") || !snap.CanDisconnectMember("mod", "vip") {
		t.Fatal("CanDisconnectMember deve permitir mesmo cargo ou cargo menor")
	}
	if snap.CanDisconnectMember("vip", "mod") || snap.CanDisconnectMember("mod", "dono") {
		t.Fatal("CanDisconnectMember não pode permitir cargo superior nem o dono")
	}
	if !snap.CanDisconnectMember("dono", "mod") {
		t.Fatal("dono pode desconectar qualquer um")
	}
	if !snap.CanMoveMember("mod", "mod2") || !snap.CanMoveMember("mod", "vip") {
		t.Fatal("CanMoveMember deve permitir mesmo cargo ou cargo menor")
	}
	if snap.CanMoveMember("vip", "mod") || snap.CanMoveMember("mod", "dono") {
		t.Fatal("CanMoveMember não pode permitir cargo superior nem o dono")
	}
	if !snap.CanMoveMember("dono", "mod") {
		t.Fatal("dono pode mover qualquer um")
	}
	if !snap.CanManageRole("mod", snap.Roles["vip"]) || snap.CanManageRole("mod", snap.Roles["mod"]) {
		t.Fatal("CanManageRole errado")
	}
	if !snap.CanManageRole("dono", snap.Roles["mod"]) {
		t.Fatal("dono gerencia qualquer cargo")
	}
}

func TestNormalizeDropsUnknownBits(t *testing.T) {
	if got := Normalize(All | 1<<32 | 1<<40); got != All {
		t.Fatalf("Normalize = %d, want %d", got, All)
	}
	snap := NewSnapshot("s1", "dono", ViewChannel|1<<32).WithMember("ana").WithChannel("c", ChannelText)
	if got := snap.Server("ana"); got != ViewChannel {
		t.Fatalf("bit desconhecido vazou: %d", got)
	}
}

func TestAllBitsFitInt32(t *testing.T) {
	if All >= 1<<31 {
		t.Fatal("o app faz bitwise em 32 bits: todos os bits precisam ficar abaixo de 1<<31")
	}
}

func TestServiceRequire(t *testing.T) {
	svc := NewService(&StaticStore{Snapshots: map[string]*Snapshot{"s1": testSnapshot()}})
	ctx := context.Background()

	if err := svc.Require(ctx, "s1", "mod", ManageChannels); err != nil {
		t.Fatalf("mod deveria gerenciar canais: %v", err)
	}
	if err := svc.Require(ctx, "s1", "ana", ManageChannels); !errors.Is(err, ErrMissingPermission) {
		t.Fatalf("ana: err = %v, want ErrMissingPermission", err)
	}
	if err := svc.Require(ctx, "s1", "zeca", ViewChannel); !errors.Is(err, ErrNotMember) {
		t.Fatalf("zeca: err = %v, want ErrNotMember", err)
	}
	if err := svc.RequireChannel(ctx, "vip-texto", "vip", SendMessages); err != nil {
		t.Fatalf("vip deveria escrever no canal vip: %v", err)
	}
	if err := svc.RequireChannel(ctx, "vip-texto", "mod", ViewChannel); !errors.Is(err, ErrMissingPermission) {
		t.Fatalf("mod não vê o canal vip: err = %v", err)
	}
	if _, err := svc.ChannelPerms(ctx, "nao-existe", "ana"); !errors.Is(err, ErrChannelNotFound) {
		t.Fatalf("canal inexistente: err = %v", err)
	}
	if _, code, _ := HTTPError(ErrMissingPermission); code != "missing_permission" {
		t.Fatal("código de missing_permission mudou")
	}
	if _, code, _ := HTTPError(ErrNotMember); code != "not_member" {
		t.Fatal("código de not_member mudou")
	}
}
