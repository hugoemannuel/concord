package server

import (
	"context"
	"errors"
	"reflect"
	"strings"
	"testing"

	"gin-quickstart/backend/internal/permission"
)

// fakeNicknames guarda os apelidos e os eventos publicados; os membros e
// cargos são os mesmos do fake de moderação (dono > chefe > mod = mod2 > vip > ana).
type fakeNicknames struct {
	snap   *permission.Snapshot
	nicks  map[string]*string
	events []NicknameEvent
}

func newFakeNicknames() *fakeNicknames {
	return &fakeNicknames{snap: newFakeModeration().snap, nicks: map[string]*string{}}
}

func (f *fakeNicknames) Snapshot(context.Context, string) (*permission.Snapshot, error) {
	return f.snap, nil
}

func (f *fakeNicknames) SetNickname(_ context.Context, _ string, userID string, nickname *string) (bool, error) {
	if !f.snap.IsMember(userID) {
		return false, nil
	}
	f.nicks[userID] = nickname
	return true, nil
}

func (f *fakeNicknames) PublishMemberNickname(e NicknameEvent) { f.events = append(f.events, e) }

func setupNicknames() (*Nicknames, *fakeNicknames) {
	f := newFakeNicknames()
	return newNicknames(f, f, f), f
}

func strPtr(s string) *string { return &s }

func TestNormalizeNickname(t *testing.T) {
	cases := []struct {
		in   string
		want *string
		err  bool
	}{
		{"Aninha", strPtr("Aninha"), false},
		{"  Aninha  ", strPtr("Aninha"), false},
		{"", nil, false},    // vazio limpa
		{"   ", nil, false}, // só espaço também
		{strings.Repeat("a", MaxNickname), strPtr(strings.Repeat("a", MaxNickname)), false},
		{strings.Repeat("ç", MaxNickname), strPtr(strings.Repeat("ç", MaxNickname)), false}, // conta caractere, não byte
		{strings.Repeat("🎮", MaxNickname), strPtr(strings.Repeat("🎮", MaxNickname)), false},
		{strings.Repeat("a", MaxNickname+1), nil, true},
		{" " + strings.Repeat("a", MaxNickname) + " ", strPtr(strings.Repeat("a", MaxNickname)), false},
		{"👨\U0000200d👩\U0000200d👧", strPtr("👨\U0000200d👩\U0000200d👧"), false}, // ZWJ entre emoji vale
		{"\U0000200b", nil, true},   // zero-width
		{"a\U0000200bb", nil, true}, // zero-width no meio
		{"\U00003164", nil, true},   // hangul filler (nome "em branco")
		{"\U00002800", nil, true},   // braille em branco
		{"a\U0000202eb", nil, true}, // bidi override
		{"a\U00002066b", nil, true}, // bidi isolate
		{"a\nb", nil, true},         // quebra de linha
		{"a\tb", nil, true},         // tab
		{"\x00", nil, true},         // NUL (o Postgres recusa: dava 500)
		{"\U00000301", nil, true},   // só marca combinante: nada visível
	}
	for _, tc := range cases {
		got, err := NormalizeNickname(tc.in)
		if tc.err {
			if !errors.Is(err, ErrInvalidNickname) {
				t.Errorf("%q: err = %v, want ErrInvalidNickname", tc.in, err)
			}
			continue
		}
		if err != nil {
			t.Errorf("%q: err = %v", tc.in, err)
			continue
		}
		if !reflect.DeepEqual(got, tc.want) {
			t.Errorf("%q: got %v, want %v", tc.in, deref(got), deref(tc.want))
		}
	}
}

func deref(s *string) string {
	if s == nil {
		return "<nil>"
	}
	return *s
}

func TestSetNicknameSelf(t *testing.T) {
	ctx := context.Background()
	n, f := setupNicknames()

	// Todo mundo tem CHANGE_NICKNAME no @everyone padrão.
	got, err := n.Set(ctx, "s1", "ana", "ana", "  Aninha ")
	if err != nil {
		t.Fatal(err)
	}
	if deref(got) != "Aninha" || deref(f.nicks["ana"]) != "Aninha" {
		t.Fatalf("apelido = %v / %v", deref(got), deref(f.nicks["ana"]))
	}
	want := []NicknameEvent{{ServerID: "s1", UserID: "ana", Nickname: strPtr("Aninha")}}
	if !reflect.DeepEqual(f.events, want) {
		t.Fatalf("eventos = %+v", f.events)
	}

	// Vazio limpa (e avisa com nickname nulo).
	if got, err := n.Set(ctx, "s1", "ana", "ana", ""); err != nil || got != nil {
		t.Fatalf("limpar: got %v, err %v", deref(got), err)
	}
	if f.nicks["ana"] != nil || len(f.events) != 2 || f.events[1].Nickname != nil {
		t.Fatalf("devia limpar e avisar: %+v", f.events)
	}
}

func TestSetNicknameSelfNeedsChangeNickname(t *testing.T) {
	ctx := context.Background()
	n, f := setupNicknames()
	// Servidor que tirou o "Alterar apelido" do @everyone.
	f.snap.Everyone.Permissions = permission.DefaultEveryone &^ permission.ChangeNickname
	f.snap.Roles[f.snap.Everyone.ID] = f.snap.Everyone
	// Um cargo só com "Gerenciar apelidos" também não muda o próprio.
	f.snap.WithRole("apelidos", 1, permission.ManageNicknames).WithMember("vip", "apelidos")

	for _, actor := range []string{"ana", "vip"} {
		if _, err := n.Set(ctx, "s1", actor, actor, "Novo"); !errors.Is(err, permission.ErrMissingPermission) {
			t.Errorf("%s: err = %v, want ErrMissingPermission", actor, err)
		}
	}
	// O dono sempre pode (tem tudo).
	if _, err := n.Set(ctx, "s1", "dono", "dono", "Chefão"); err != nil {
		t.Fatalf("dono: %v", err)
	}
	// O Moderador padrão continua podendo: o cargo dele também traz o bit.
	if _, err := n.Set(ctx, "s1", "mod", "mod", "Mod"); err != nil {
		t.Fatalf("mod: %v", err)
	}
	if len(f.nicks) != 2 {
		t.Fatalf("só dono e mod deviam ter apelido: %v", f.nicks)
	}
}

func TestSetNicknameOthersRespectsPermissionAndHierarchy(t *testing.T) {
	ctx := context.Background()
	cases := []struct {
		actor, target string
		want          error
	}{
		{"ana", "vip", permission.ErrMissingPermission}, // sem "Gerenciar apelidos"
		{"vip", "ana", permission.ErrMissingPermission}, // cargo acima, mas sem a permissão
		{"zeca", "ana", permission.ErrNotMember},
		{"mod", "chefe", ErrCannotActOn}, // cargo acima
		{"mod", "dono", ErrCannotActOn},  // dono é intocável
		{"chefe", "dono", ErrCannotActOn},
		{"mod", "zeca", ErrMemberNotFound},
	}
	for _, tc := range cases {
		n, f := setupNicknames()
		if _, err := n.Set(ctx, "s1", tc.actor, tc.target, "Apelido"); !errors.Is(err, tc.want) {
			t.Errorf("%s mudando %s: err = %v, want %v", tc.actor, tc.target, err, tc.want)
		}
		if len(f.nicks) != 0 || len(f.events) != 0 {
			t.Errorf("%s mudando %s: não devia gravar nem avisar", tc.actor, tc.target)
		}
	}
}

func TestSetNicknameOthersAllowed(t *testing.T) {
	ctx := context.Background()
	cases := []struct{ actor, target string }{
		{"mod", "mod2"},  // mesmo cargo permitido
		{"mod", "vip"},   // moderador padrão tem "Gerenciar apelidos"
		{"mod", "ana"},   // ana só tem @everyone
		{"chefe", "mod"}, // cargo acima
		{"dono", "chefe"},
	}
	for _, tc := range cases {
		n, f := setupNicknames()
		got, err := n.Set(ctx, "s1", tc.actor, tc.target, "Apelido")
		if err != nil {
			t.Errorf("%s mudando %s: %v", tc.actor, tc.target, err)
			continue
		}
		if deref(got) != "Apelido" || deref(f.nicks[tc.target]) != "Apelido" {
			t.Errorf("%s mudando %s: apelido não gravado", tc.actor, tc.target)
		}
		want := []NicknameEvent{{ServerID: "s1", UserID: tc.target, Nickname: strPtr("Apelido")}}
		if !reflect.DeepEqual(f.events, want) {
			t.Errorf("%s mudando %s: eventos = %+v", tc.actor, tc.target, f.events)
		}
	}
}

func TestSetNicknameManageNicknamesAloneIsEnough(t *testing.T) {
	// Cargo só com "Gerenciar apelidos" (sem expulsar etc.) muda quem está abaixo.
	n, f := setupNicknames()
	f.snap.WithRole("apelidos", 1, permission.ManageNicknames).WithMember("ana", "apelidos")
	if _, err := n.Set(context.Background(), "s1", "ana", "zeca", "x"); !errors.Is(err, ErrMemberNotFound) {
		t.Fatalf("err = %v", err)
	}
	f.snap.WithMember("bia")
	if _, err := n.Set(context.Background(), "s1", "ana", "bia", "Bibi"); err != nil {
		t.Fatal(err)
	}
	// vip (posição 1) empata com o cargo de ana: permitido mudar
	if _, err := n.Set(context.Background(), "s1", "ana", "vip", "x"); err != nil {
		t.Fatalf("mesmo cargo deveria poder mudar apelido: %v", err)
	}
	// mod (posição 2) acima de ana: negado
	if _, err := n.Set(context.Background(), "s1", "ana", "mod", "x"); !errors.Is(err, ErrCannotActOn) {
		t.Fatalf("err = %v, want ErrCannotActOn", err)
	}
}

func TestSetNicknameValidatesAfterPermission(t *testing.T) {
	ctx := context.Background()
	n, f := setupNicknames()
	long := strings.Repeat("a", MaxNickname+1)
	if _, err := n.Set(ctx, "s1", "ana", "ana", long); !errors.Is(err, ErrInvalidNickname) {
		t.Fatalf("err = %v, want ErrInvalidNickname", err)
	}
	// Sem permissão, o erro é de permissão (não revela a validação).
	if _, err := n.Set(ctx, "s1", "ana", "vip", long); !errors.Is(err, permission.ErrMissingPermission) {
		t.Fatalf("err = %v, want ErrMissingPermission", err)
	}
	if len(f.nicks) != 0 || len(f.events) != 0 {
		t.Fatal("não devia gravar nada")
	}
}

func (f *fakeNicknames) MemberNickname(_ context.Context, _ string, userID string) (*string, error) {
	return f.nicks[userID], nil
}
