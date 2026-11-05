package channelcategory

import (
	"testing"

	"gin-quickstart/backend/internal/permission"
)

func privacySnapshot() *permission.Snapshot {
	return permission.NewSnapshot("s1", "dono", permission.DefaultEveryone).
		WithRole("vip", 1, 0).
		WithRole("gerente", 2, permission.ManageChannels|permission.ManageRoles).
		WithMember("dono").WithMember("ana").WithMember("gi", "gerente")
}

func TestPrivacyOverwrites(t *testing.T) {
	snap := privacySnapshot()
	closed := permission.Overwrite{TargetType: permission.TargetRole, TargetID: "everyone", Deny: permission.ViewChannel}
	vip := permission.Overwrite{TargetType: permission.TargetRole, TargetID: "vip", Allow: accessBits}
	ana := permission.Overwrite{TargetType: permission.TargetMember, TargetID: "ana", Allow: accessBits}
	t.Run("privada: fecha para todos e abre para os escolhidos", func(t *testing.T) {
		got := privacyOverwrites(snap, "dono", PrivacyInput{Private: true, RoleIDs: []string{"vip"}, MemberIDs: []string{"ana"}}, nil)
		if !permission.SameOverwrites(got, []permission.Overwrite{closed, vip, ana}) {
			t.Fatalf("%+v", got)
		}
	})
	t.Run("quem criou sem cargo escolhido não se tranca fora", func(t *testing.T) {
		got := privacyOverwrites(snap, "gi", PrivacyInput{Private: true}, nil)
		gi := permission.Overwrite{TargetType: permission.TargetMember, TargetID: "gi", Allow: accessBits}
		if !permission.SameOverwrites(got, []permission.Overwrite{closed, gi}) {
			t.Fatalf("%+v", got)
		}
	})
	t.Run("trocar os escolhidos tira o acesso de quem saiu e guarda o resto", func(t *testing.T) {
		mute := permission.Overwrite{TargetType: permission.TargetRole, TargetID: "vip", Allow: accessBits, Deny: permission.SendMessages}
		got := privacyOverwrites(snap, "dono", PrivacyInput{Private: true, MemberIDs: []string{"ana"}}, []permission.Overwrite{closed, mute})
		want := []permission.Overwrite{closed, ana, {TargetType: permission.TargetRole, TargetID: "vip", Deny: permission.SendMessages}}
		if !permission.SameOverwrites(got, want) {
			t.Fatalf("%+v", got)
		}
	})
	t.Run("pública: abre e não deixa regra de acesso sobrando", func(t *testing.T) {
		got := privacyOverwrites(snap, "dono", PrivacyInput{Private: false}, []permission.Overwrite{closed, vip, ana})
		if len(got) != 0 {
			t.Fatalf("%+v", got)
		}
	})
	t.Run("não dá o bit que quem mexe não tem", func(t *testing.T) {
		semConectar := privacySnapshot()
		semConectar.Everyone.Permissions = permission.ViewChannel
		got := privacyOverwrites(semConectar, "gi", PrivacyInput{Private: true, RoleIDs: []string{"vip"}}, nil)
		for _, row := range got {
			if row.Allow&permission.Connect != 0 {
				t.Fatalf("liberou conectar: %+v", got)
			}
		}
	})
}

func TestPrivacyValidateRefusesWhoIsNotInTheServer(t *testing.T) {
	snap := privacySnapshot()
	for _, in := range []PrivacyInput{{RoleIDs: []string{"everyone"}}, {RoleIDs: []string{"de-fora"}}, {MemberIDs: []string{"de-fora"}}} {
		if err := in.validate(snap); err == nil {
			t.Errorf("aceitou %+v", in)
		}
	}
	if err := (PrivacyInput{RoleIDs: []string{"vip"}, MemberIDs: []string{"ana"}}).validate(snap); err != nil {
		t.Fatal(err)
	}
}

func TestChangedBits(t *testing.T) {
	a := permission.Overwrite{TargetType: permission.TargetRole, TargetID: "x", Allow: permission.ViewChannel}
	b := permission.Overwrite{TargetType: permission.TargetRole, TargetID: "x", Deny: permission.SendMessages}
	c := permission.Overwrite{TargetType: permission.TargetMember, TargetID: "y", Allow: permission.Connect}
	if got := changedBits([]permission.Overwrite{a}, []permission.Overwrite{b, c}); got != permission.ViewChannel|permission.SendMessages|permission.Connect {
		t.Fatalf("%d", got)
	}
	if got := changedBits([]permission.Overwrite{a}, []permission.Overwrite{a}); got != 0 {
		t.Fatalf("%d", got)
	}
}

func TestWithOverwrite(t *testing.T) {
	a := permission.Overwrite{TargetType: permission.TargetRole, TargetID: "x", Allow: permission.ViewChannel}
	next := permission.Overwrite{Deny: permission.SendMessages}
	got := withOverwrite([]permission.Overwrite{a}, permission.TargetRole, "x", &next)
	if len(got) != 1 || got[0].Deny != permission.SendMessages || got[0].TargetID != "x" {
		t.Fatalf("%+v", got)
	}
	if got := withOverwrite([]permission.Overwrite{a}, permission.TargetRole, "x", nil); len(got) != 0 {
		t.Fatalf("%+v", got)
	}
}

func TestValidTarget(t *testing.T) {
	snap := privacySnapshot()
	for _, tc := range []struct {
		kind, id string
		want     bool
	}{
		{permission.TargetRole, "vip", true},
		{permission.TargetRole, "x", false},
		{permission.TargetMember, "ana", true},
		{permission.TargetMember, "x", false},
		{"channel", "ana", false},
	} {
		if validTarget(snap, tc.kind, tc.id) != tc.want {
			t.Errorf("%+v", tc)
		}
	}
}
