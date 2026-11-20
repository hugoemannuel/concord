package message

import (
	"context"
	"encoding/json"
	"errors"
	"os"
	"reflect"
	"testing"
	"time"

	"gin-quickstart/backend/internal/permission"
)

type roleMentionVectors struct {
	Handles []struct {
		Name   string `json:"name"`
		Handle string `json:"handle"`
	} `json:"handles"`
	Tokens []struct {
		Content   string `json:"content"`
		Handle    string `json:"handle"`
		Mentioned bool   `json:"mentioned"`
	} `json:"tokens"`
}

func loadRoleMentionVectors(t *testing.T) roleMentionVectors {
	t.Helper()
	raw, err := os.ReadFile("testdata/role_mentions.json")
	if err != nil {
		t.Fatal(err)
	}
	var v roleMentionVectors
	if err := json.Unmarshal(raw, &v); err != nil {
		t.Fatal(err)
	}
	if len(v.Handles) == 0 || len(v.Tokens) == 0 {
		t.Fatal("role_mentions.json sem casos")
	}
	return v
}

func TestRoleHandleVectors(t *testing.T) {
	for _, tc := range loadRoleMentionVectors(t).Handles {
		if got := RoleHandle(tc.Name); got != tc.Handle {
			t.Errorf("RoleHandle(%q) = %q, want %q", tc.Name, got, tc.Handle)
		}
	}
}

func TestRoleTokenVectors(t *testing.T) {
	for _, tc := range loadRoleMentionVectors(t).Tokens {
		if got := mentionsHandle(tc.Content, tc.Handle); got != tc.Mentioned {
			t.Errorf("mentionsHandle(%q, %q) = %v, want %v", tc.Content, tc.Handle, got, tc.Mentioned)
		}
	}
}

// Cargos do servidor dos testes: suporte é aberto a todos; equipe não.
func testRoles() map[string]permission.Role {
	return map[string]permission.Role{
		"everyone": {ID: "everyone", Name: permission.EveryoneName, IsDefault: true, Mentionable: true},
		"bots":     {ID: "bots", Name: permission.BotsRoleName, IsSystem: true, Mentionable: true},
		"suporte":  {ID: "suporte", Name: "Suporte", Mentionable: true},
		"suporte2": {ID: "suporte2", Name: "SUPORTE", Mentionable: true},
		"equipe":   {ID: "equipe", Name: "Equipe de Suporte"},
		"todos":    {ID: "todos", Name: "All", Mentionable: true},
		"fogo":     {ID: "fogo", Name: "🔥", Mentionable: true},
	}
}

func TestRoleMentions(t *testing.T) {
	suporte := RoleMention{ID: "suporte", Handle: "suporte"}
	equipe := RoleMention{ID: "equipe", Handle: "equipe-de-suporte"}
	cases := []struct {
		name          string
		content       string
		ids           []string
		canMentionAny bool
		want          []RoleMention
	}{
		{"cargo aberto, por qualquer pessoa", "@suporte ajuda", []string{"suporte"}, false, []RoleMention{suporte}},
		{"cargo fechado sem a permissão não pinga", "@equipe-de-suporte", []string{"equipe"}, false, nil},
		{"cargo fechado com a permissão pinga", "@equipe-de-suporte", []string{"equipe"}, true, []RoleMention{equipe}},
		{"na ordem pedida", "@equipe-de-suporte e @suporte", []string{"equipe", "suporte"}, true, []RoleMention{equipe, suporte}},
		{"id que não é do servidor é ignorado", "@suporte", []string{"de-outro-servidor", "suporte"}, false, []RoleMention{suporte}},
		{"handle fora do texto não pinga", "oi pessoal", []string{"suporte"}, true, nil},
		{"handle dentro de código não pinga", "`@suporte`", []string{"suporte"}, true, nil},
		{"@everyone e Bots nunca, nem com a permissão", "@everyone @bots", []string{"everyone", "bots"}, true, nil},
		{"cargo chamado All não toma o lugar do @all", "@all", []string{"todos"}, true, nil},
		{"cargo sem handle não pinga", "@", []string{"fogo"}, true, nil},
		{"id repetido conta uma vez", "@suporte", []string{"suporte", "suporte"}, false, []RoleMention{suporte}},
		{"dois cargos com o mesmo handle: vale o primeiro pedido", "@suporte", []string{"suporte2", "suporte"}, false, []RoleMention{{ID: "suporte2", Handle: "suporte"}}},
		{"sem ids, nada", "@suporte", nil, true, nil},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got := roleMentions(tc.content, tc.ids, testRoles(), tc.canMentionAny)
			if !reflect.DeepEqual(got, tc.want) {
				t.Fatalf("got %v, want %v", got, tc.want)
			}
		})
	}
}

func TestRoleMentionsIgnoresIDsBeyondTheLimit(t *testing.T) {
	ids := make([]string, maxMentionRoleIDs)
	for i := range ids {
		ids[i] = "desconhecido"
	}
	if got := roleMentions("@suporte", append(ids, "suporte"), testRoles(), true); got != nil {
		t.Fatalf("id depois do limite pingou: %v", got)
	}
}

// fakeRoleSource é o snapshot de permissões do servidor (só os cargos importam).
type fakeRoleSource struct {
	roles map[string]permission.Role
	err   error
	calls *int
}

func (f fakeRoleSource) Snapshot(context.Context, string) (*permission.Snapshot, error) {
	if f.calls != nil {
		*f.calls++
	}
	if f.err != nil {
		return nil, f.err
	}
	return &permission.Snapshot{Roles: f.roles}, nil
}

func TestResolveMassMentionWithRoles(t *testing.T) {
	clock := &fakeClock{now: time.Date(2026, 1, 1, 12, 0, 0, 0, time.UTC)}
	mods := fakeModerators{allowed: map[string]bool{"ch1|mod": true}}
	newService := func(roles RoleSource) *Service {
		s := MessageService(nil, nil, nil, nil, nil, mods)
		s.mentionLimiter = newMentionLimiter(30*time.Second, clock.Now)
		s.SetRoleSource(roles)
		return s
	}
	roles := fakeRoleSource{roles: testRoles()}
	ctx := context.Background()

	t.Run("membro comum pinga o cargo aberto, mas não o fechado nem o @all", func(t *testing.T) {
		got := newService(roles).resolveMassMention(ctx, "srv", "ch1", "membro", "@all @suporte @equipe-de-suporte", []string{"suporte", "equipe"})
		if got.Everyone != nil || !reflect.DeepEqual(got.Roles, []RoleMention{{ID: "suporte", Handle: "suporte"}}) {
			t.Fatalf("got %+v", got)
		}
	})

	t.Run("quem tem a permissão pinga @all e qualquer cargo na mesma mensagem", func(t *testing.T) {
		got := newService(roles).resolveMassMention(ctx, "srv", "ch1", "mod", "@all @equipe-de-suporte", []string{"equipe"})
		if got.Everyone == nil || *got.Everyone != MentionAll || len(got.Roles) != 1 || got.Roles[0].ID != "equipe" {
			t.Fatalf("got %+v", got)
		}
	})

	t.Run("anti-spam é um só para @all, @here e cargos", func(t *testing.T) {
		s := newService(roles)
		if got := s.resolveMassMention(ctx, "srv", "ch1", "mod", "@all", nil); got.Everyone == nil {
			t.Fatal("o primeiro devia pingar")
		}
		clock.now = clock.now.Add(5 * time.Second)
		if got := s.resolveMassMention(ctx, "srv", "ch1", "mod", "@suporte", []string{"suporte"}); got.pings() {
			t.Fatalf("cargo dentro dos 30s do @all pingou: %+v", got)
		}
		clock.now = clock.now.Add(30 * time.Second)
		if got := s.resolveMassMention(ctx, "srv", "ch1", "mod", "@suporte", []string{"suporte"}); len(got.Roles) != 1 {
			t.Fatal("depois dos 30s devia pingar")
		}
	})

	t.Run("cargo que não pinga não gasta a vez", func(t *testing.T) {
		s := newService(roles)
		s.resolveMassMention(ctx, "srv", "ch1", "membro", "@equipe-de-suporte", []string{"equipe"})
		if got := s.resolveMassMention(ctx, "srv", "ch1", "membro", "@suporte", []string{"suporte"}); len(got.Roles) != 1 {
			t.Fatal("a tentativa recusada gastou a vez do anti-spam")
		}
	})

	t.Run("sem ids não lê os cargos", func(t *testing.T) {
		calls := 0
		newService(fakeRoleSource{roles: testRoles(), calls: &calls}).resolveMassMention(ctx, "srv", "ch1", "mod", "@all @suporte", nil)
		if calls != 0 {
			t.Fatalf("leu os cargos %d vez(es) sem id nenhum", calls)
		}
	})

	t.Run("falha ao ler os cargos: o @all sai, o cargo não", func(t *testing.T) {
		got := newService(fakeRoleSource{err: errors.New("db fora")}).resolveMassMention(ctx, "srv", "ch1", "mod", "@all @suporte", []string{"suporte"})
		if got.Everyone == nil || len(got.Roles) != 0 {
			t.Fatalf("got %+v", got)
		}
	})

	t.Run("sem fonte de cargos ou em DM, cargo é texto", func(t *testing.T) {
		if got := newService(nil).resolveMassMention(ctx, "srv", "ch1", "mod", "@suporte", []string{"suporte"}); got.pings() {
			t.Fatalf("sem fonte: %+v", got)
		}
		if got := newService(roles).resolveMassMention(ctx, "", "", "mod", "@suporte", []string{"suporte"}); got.pings() {
			t.Fatalf("em DM: %+v", got)
		}
	})
}

func TestEditedMentionRoles(t *testing.T) {
	original := []RoleMention{{ID: "suporte", Handle: "suporte"}, {ID: "equipe", Handle: "equipe-de-suporte"}}
	cases := []struct {
		name     string
		original []RoleMention
		content  string
		want     []RoleMention
	}{
		{"os dois continuam no texto", original, "@suporte e @equipe-de-suporte, editado", original},
		{"um saiu do texto", original, "só o @equipe-de-suporte agora", original[1:]},
		{"todos saíram: nil", original, "deixa pra lá", nil},
		{"editar nunca põe cargo", nil, "@suporte", nil},
		{"handle que virou código sai", original[:1], "`@suporte`", nil},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := editedMentionRoles(tc.original, tc.content); !reflect.DeepEqual(got, tc.want) {
				t.Fatalf("got %v, want %v", got, tc.want)
			}
		})
	}
}

func TestStripRoleMentions(t *testing.T) {
	suporte := []RoleMention{{ID: "r1", Handle: "suporte"}}
	equipe := []RoleMention{{ID: "r2", Handle: "equipe-de-suporte"}}
	cases := []struct {
		name    string
		content string
		roles   []RoleMention
		want    string
	}{
		{"tira o @handle do cargo pingado", "oi @Suporte, e @ana", suporte, "oi  , e @ana"},
		{"todas as ocorrências", "@suporte @suporte", suporte, "   "},
		{"handle com hífen sai inteiro", "@equipe-de-suporte ajuda", equipe, "  ajuda"},
		{"nick maior não é o cargo", "@suportes", suporte, "@suportes"},
		{"sem cargo pingado, o texto fica igual", "@Suporte e @Ana", nil, "@Suporte e @Ana"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := StripRoleMentions(tc.content, tc.roles); got != tc.want {
				t.Fatalf("got %q, want %q", got, tc.want)
			}
		})
	}
}
