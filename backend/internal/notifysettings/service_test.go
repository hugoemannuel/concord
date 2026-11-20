package notifysettings

import (
	"context"
	"encoding/json"
	"errors"
	"testing"
	"time"

	"gin-quickstart/backend/internal/permission"
)

type fakeStore struct {
	servers  map[string]Settings
	channels map[string]Settings
}

func newFakeStore() *fakeStore {
	return &fakeStore{servers: map[string]Settings{}, channels: map[string]Settings{}}
}

func (f *fakeStore) AllFor(context.Context, []string) (map[string]All, error) {
	return nil, nil
}
func (f *fakeStore) All(context.Context, string) (All, error) {
	return All{Servers: f.servers, Channels: f.channels}, nil
}
func (f *fakeStore) SetServer(_ context.Context, _, id string, s Settings) error {
	f.servers[id] = s
	return nil
}
func (f *fakeStore) DeleteServer(_ context.Context, _, id string) error {
	delete(f.servers, id)
	return nil
}
func (f *fakeStore) SetChannel(_ context.Context, _, id string, s Settings) error {
	f.channels[id] = s
	return nil
}
func (f *fakeStore) DeleteChannel(_ context.Context, _, id string) error {
	delete(f.channels, id)
	return nil
}

type fakePerms struct{ err error }

func (f fakePerms) Require(context.Context, string, string, int64) error        { return f.err }
func (f fakePerms) RequireChannel(context.Context, string, string, int64) error { return f.err }

type fakePublisher struct {
	user   string
	events [][]byte
}

func (f *fakePublisher) SendToUser(userID string, event []byte) {
	f.user = userID
	f.events = append(f.events, event)
}

var testNow = time.Date(2026, 10, 25, 12, 0, 0, 0, time.UTC)

func testService(st *fakeStore, perms fakePerms, pub *fakePublisher) *Service {
	svc := newService(st, perms, pub)
	svc.now = func() time.Time { return testNow }
	return svc
}

func TestNormalize(t *testing.T) {
	future := testNow.Add(time.Hour)
	past := testNow.Add(-time.Minute)

	cases := []struct {
		name    string
		in      Settings
		want    Settings
		wantErr bool
	}{
		{"nível vazio vira all", Settings{}, Settings{Level: LevelAll}, false},
		{"nível inválido", Settings{Level: "tudo"}, Settings{}, true},
		{"mute com prazo futuro continua", Settings{Muted: true, MutedUntil: &future, Level: LevelAll}, Settings{Muted: true, MutedUntil: &future, Level: LevelAll}, false},
		{"prazo vencido reativa", Settings{Muted: true, MutedUntil: &past, Level: LevelAll}, Settings{Level: LevelAll}, false},
		{"sem mute descarta prazo", Settings{MutedUntil: &future, Level: LevelMentions}, Settings{Level: LevelMentions}, false},
		{"até reativar", Settings{Muted: true, Level: LevelNothing}, Settings{Muted: true, Level: LevelNothing}, false},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			got, err := c.in.normalize(testNow)
			if (err != nil) != c.wantErr {
				t.Fatalf("err = %v, wantErr %v", err, c.wantErr)
			}
			if c.wantErr {
				return
			}
			if got.Muted != c.want.Muted || got.Level != c.want.Level || got.SuppressEveryone != c.want.SuppressEveryone {
				t.Fatalf("got %+v, want %+v", got, c.want)
			}
			if (got.MutedUntil == nil) != (c.want.MutedUntil == nil) {
				t.Fatalf("muted_until got %v, want %v", got.MutedUntil, c.want.MutedUntil)
			}
		})
	}
}

func TestSetServerGravaEPublica(t *testing.T) {
	st, pub := newFakeStore(), &fakePublisher{}
	svc := testService(st, fakePerms{}, pub)

	out, err := svc.SetServer(context.Background(), "u1", "s1", Settings{Muted: true, Level: LevelMentions, SuppressEveryone: true})
	if err != nil {
		t.Fatal(err)
	}
	if !out.Muted || st.servers["s1"].Level != LevelMentions || !st.servers["s1"].SuppressEveryone {
		t.Fatalf("não gravou: %+v", st.servers)
	}
	if pub.user != "u1" || len(pub.events) != 1 {
		t.Fatalf("evento: user=%q n=%d", pub.user, len(pub.events))
	}
	var ev struct {
		Type    string `json:"type"`
		Payload struct {
			Scope string `json:"scope"`
			ID    string `json:"id"`
		} `json:"payload"`
	}
	if err := json.Unmarshal(pub.events[0], &ev); err != nil {
		t.Fatal(err)
	}
	if ev.Type != "notification-settings:update" || ev.Payload.Scope != "server" || ev.Payload.ID != "s1" {
		t.Fatalf("evento errado: %s", pub.events[0])
	}
}

func TestSetServerPadraoApagaALinha(t *testing.T) {
	st := newFakeStore()
	st.servers["s1"] = Settings{Muted: true, Level: LevelAll}
	svc := testService(st, fakePerms{}, &fakePublisher{})

	if _, err := svc.SetServer(context.Background(), "u1", "s1", Settings{Level: LevelAll}); err != nil {
		t.Fatal(err)
	}
	if _, ok := st.servers["s1"]; ok {
		t.Fatal("o padrão deveria apagar a linha")
	}
}

func TestSetChannelIgnoraSuppressEveryone(t *testing.T) {
	st := newFakeStore()
	svc := testService(st, fakePerms{}, &fakePublisher{})

	out, err := svc.SetChannel(context.Background(), "u1", "c1", Settings{Muted: true, Level: LevelAll, SuppressEveryone: true})
	if err != nil {
		t.Fatal(err)
	}
	if out.SuppressEveryone || st.channels["c1"].SuppressEveryone {
		t.Fatal("suppress_everyone não vale por canal")
	}
}

// Ignorar menções de cargo é uma preferência própria do servidor: sozinha já
// não é o padrão (a linha fica), e por canal não vale.
func TestSuppressRolesValeSoPorServidor(t *testing.T) {
	st := newFakeStore()
	svc := testService(st, fakePerms{}, &fakePublisher{})

	out, err := svc.SetServer(context.Background(), "u1", "s1", Settings{Level: LevelAll, SuppressRoles: true})
	if err != nil {
		t.Fatal(err)
	}
	if !out.SuppressRoles || !st.servers["s1"].SuppressRoles || st.servers["s1"].SuppressEveryone {
		t.Fatalf("servidor: %+v", st.servers["s1"])
	}
	out, err = svc.SetChannel(context.Background(), "u1", "c1", Settings{Muted: true, Level: LevelAll, SuppressRoles: true})
	if err != nil {
		t.Fatal(err)
	}
	if out.SuppressRoles || st.channels["c1"].SuppressRoles {
		t.Fatal("suppress_roles não vale por canal")
	}
}

func TestSemPermissaoNaoGravaNemPublica(t *testing.T) {
	st, pub := newFakeStore(), &fakePublisher{}
	svc := testService(st, fakePerms{err: permission.ErrNotMember}, pub)

	if _, err := svc.SetServer(context.Background(), "u1", "s1", Settings{Muted: true, Level: LevelAll}); !errors.Is(err, permission.ErrNotMember) {
		t.Fatalf("server err = %v", err)
	}
	if _, err := svc.SetChannel(context.Background(), "u1", "c1", Settings{Muted: true, Level: LevelAll}); !errors.Is(err, permission.ErrNotMember) {
		t.Fatalf("channel err = %v", err)
	}
	if len(st.servers)+len(st.channels) != 0 || len(pub.events) != 0 {
		t.Fatal("não deveria gravar nem publicar")
	}
}

func TestNivelInvalidoRetornaErro(t *testing.T) {
	svc := testService(newFakeStore(), fakePerms{}, &fakePublisher{})
	if _, err := svc.SetServer(context.Background(), "u1", "s1", Settings{Level: "x"}); !errors.Is(err, ErrInvalidSettings) {
		t.Fatalf("err = %v", err)
	}
}
