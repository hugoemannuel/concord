package permission

import (
	"fmt"
	"math/rand"
	"testing"
)

func denyView(target string) Overwrite {
	return Overwrite{TargetType: TargetRole, TargetID: target, Deny: ViewChannel}
}

func allowView(target string) Overwrite {
	return Overwrite{TargetType: TargetRole, TargetID: target, Allow: ViewChannel | Connect}
}

func privateCategorySnapshot() *Snapshot {
	return NewSnapshot("s1", "dono", DefaultEveryone).
		WithRole("vip", 1, 0).
		WithRole("admin", 2, Administrator).
		WithMember("dono").
		WithMember("ana").
		WithMember("bia", "vip").
		WithMember("chefe", "admin").
		WithCategory("secreta", denyView("everyone"), allowView("vip")).
		WithChannel("vinculado", ChannelText, denyView("everyone"), allowView("vip")).
		WithChannel("proprio", ChannelVoice, Overwrite{TargetType: TargetRole, TargetID: "everyone", Allow: ViewChannel}).
		WithChannel("solto", ChannelText).
		InCategory("vinculado", "secreta").
		InCategory("proprio", "secreta")
}

func TestCategoryHidesItsChannels(t *testing.T) {
	snap := privateCategorySnapshot()
	for _, tc := range []struct {
		user, channel string
		want          bool
	}{
		{"ana", "vinculado", false},
		// Permissão própria não abre o canal para quem não vê a categoria.
		{"ana", "proprio", false},
		{"ana", "solto", true},
		{"bia", "vinculado", true},
		{"bia", "proprio", true},
		{"dono", "vinculado", true},
		{"dono", "proprio", true},
		{"chefe", "vinculado", true},
		{"chefe", "proprio", true},
	} {
		if got := snap.CanView(tc.channel, tc.user); got != tc.want {
			t.Errorf("%s vê %s: %v, esperado %v", tc.user, tc.channel, got, tc.want)
		}
	}
	if perms := snap.Channel("proprio", "ana"); perms != 0 {
		t.Errorf("sem ver a categoria não sobra permissão nenhuma no canal: %d", perms)
	}
	if visible := snap.VisibleChannels("ana"); len(visible) != 1 || !visible["solto"] {
		t.Errorf("canais de ana: %v", visible)
	}
}

func TestCanViewCategory(t *testing.T) {
	snap := privateCategorySnapshot().WithCategory("aberta")
	for _, tc := range []struct {
		user, category string
		want           bool
	}{
		{"ana", "secreta", false},
		{"bia", "secreta", true},
		{"dono", "secreta", true},
		{"chefe", "secreta", true},
		{"ana", "aberta", true},
		{"estranho", "aberta", false},
		{"ana", "inexistente", false},
	} {
		if got := snap.CanViewCategory(tc.category, tc.user); got != tc.want {
			t.Errorf("%s vê %s: %v, esperado %v", tc.user, tc.category, got, tc.want)
		}
	}
}

func TestSameOverwritesIgnoresOrderAndChannel(t *testing.T) {
	a := []Overwrite{denyView("everyone"), allowView("vip")}
	b := []Overwrite{{ChannelID: "x", TargetType: TargetRole, TargetID: "vip", Allow: ViewChannel | Connect}, {ChannelID: "x", TargetType: TargetRole, TargetID: "everyone", Deny: ViewChannel}}
	if !SameOverwrites(a, b) {
		t.Fatal("as mesmas regras em outra ordem são iguais")
	}
	if !SameOverwrites(nil, []Overwrite{}) {
		t.Fatal("nenhuma regra é igual a lista vazia")
	}
	if !SameOverwrites(a, append(append([]Overwrite{}, b...), Overwrite{TargetType: TargetMember, TargetID: "ana"})) {
		t.Fatal("regra vazia não muda nada")
	}
	if SameOverwrites(a, []Overwrite{denyView("everyone")}) {
		t.Fatal("regra a menos é diferente")
	}
	if SameOverwrites(a, []Overwrite{denyView("everyone"), {TargetType: TargetRole, TargetID: "vip", Allow: ViewChannel}}) {
		t.Fatal("bits diferentes são diferentes")
	}
}

func TestRestrictsView(t *testing.T) {
	if RestrictsView(nil) || RestrictsView([]Overwrite{allowView("vip")}) {
		t.Fatal("sem deny de ver não restringe")
	}
	if !RestrictsView([]Overwrite{denyView("everyone")}) {
		t.Fatal("deny de ver restringe")
	}
}

// Quem deixou de estar na categoria nunca passa a ver o canal: o selo só tira.
func TestSealOverwritesNeverWidens(t *testing.T) {
	roles := []string{"everyone", "a", "b", "c"}
	members := map[string][]string{"m0": {}, "m1": {"a"}, "m2": {"b"}, "m3": {"a", "b"}, "m4": {"c"}, "m5": {"a", "c"}}
	rng := rand.New(rand.NewSource(194))
	random := func() []Overwrite {
		var rows []Overwrite
		for _, role := range roles {
			if rng.Intn(2) == 0 {
				continue
			}
			row := Overwrite{TargetType: TargetRole, TargetID: role}
			switch rng.Intn(3) {
			case 0:
				row.Allow = ViewChannel | Connect
			case 1:
				row.Deny = ViewChannel
			default:
				row.Deny = SendMessages
			}
			rows = append(rows, row)
		}
		for member := range members {
			if rng.Intn(5) != 0 {
				continue
			}
			row := Overwrite{TargetType: TargetMember, TargetID: member, Allow: ViewChannel}
			if rng.Intn(2) == 0 {
				row = Overwrite{TargetType: TargetMember, TargetID: member, Deny: ViewChannel}
			}
			rows = append(rows, row)
		}
		return rows
	}
	build := func(channel []Overwrite, category []Overwrite) *Snapshot {
		snap := NewSnapshot("s", "dono", DefaultEveryone).WithRole("a", 1, 0).WithRole("b", 2, 0).WithRole("c", 3, 0)
		for member, ids := range members {
			snap.WithMember(member, ids...)
		}
		snap.WithChannel("x", ChannelText, append([]Overwrite{}, channel...)...)
		if category != nil {
			snap.WithCategory("cat", append([]Overwrite{}, category...)...).InCategory("x", "cat")
		}
		return snap
	}
	for i := 0; i < 5000; i++ {
		channel, category := random(), random()
		if category == nil {
			category = []Overwrite{}
		}
		before := build(channel, category)
		sealed := SealOverwrites(channel, category, "everyone")
		after := build(sealed, nil)
		for member := range members {
			if after.CanView("x", member) && !before.CanView("x", member) {
				t.Fatalf("%s passou a ver\ncanal: %+v\ncategoria: %+v\nselado: %+v", member, channel, category, sealed)
			}
		}
	}
}

func TestSealOverwritesKeepsAccessWhenItCan(t *testing.T) {
	everyone := "everyone"
	t.Run("categoria sem restrição não muda nada", func(t *testing.T) {
		own := []Overwrite{{TargetType: TargetRole, TargetID: "vip", Deny: SendMessages}}
		if got := SealOverwrites(own, []Overwrite{allowView("vip")}, everyone); !SameOverwrites(got, own) {
			t.Fatalf("%+v", got)
		}
	})
	t.Run("canal sem restrição ganha a lista da categoria", func(t *testing.T) {
		own := []Overwrite{{TargetType: TargetRole, TargetID: "vip", Deny: SendMessages}}
		got := SealOverwrites(own, []Overwrite{denyView(everyone), allowView("vip")}, everyone)
		want := []Overwrite{denyView(everyone), {TargetType: TargetRole, TargetID: "vip", Allow: ViewChannel | Connect, Deny: SendMessages}}
		if !SameOverwrites(got, want) {
			t.Fatal(fmt.Sprintf("%+v", got))
		}
	})
	t.Run("canal já restrito fica só com quem as duas listas liberam", func(t *testing.T) {
		own := []Overwrite{denyView(everyone), allowView("vip"), allowView("fora")}
		got := SealOverwrites(own, []Overwrite{denyView(everyone), allowView("vip"), allowView("outro")}, everyone)
		want := []Overwrite{denyView(everyone), allowView("vip"), {TargetType: TargetRole, TargetID: "fora", Allow: Connect}}
		if !SameOverwrites(got, want) {
			t.Fatal(fmt.Sprintf("%+v", got))
		}
	})
}
