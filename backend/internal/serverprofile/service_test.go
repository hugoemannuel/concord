package serverprofile

import (
	"context"
	"encoding/json"
	"errors"
	"reflect"
	"testing"
	"time"

	"gin-quickstart/backend/internal/audit"
	"gin-quickstart/backend/internal/audit/audittest"
)

// fakeStore: o banco em memória.
type fakeStore struct {
	profiles map[string]Profile
	facts    map[string]Facts
	members  map[string]bool // serverID|userID
	invited  map[string]bool
	resets   []string
	err      error
}

func newFakeStore() *fakeStore {
	return &fakeStore{
		profiles: map[string]Profile{},
		facts: map[string]Facts{
			"s1": {Name: "Salinha", CreatedAt: time.Date(2026, 3, 1, 0, 0, 0, 0, time.UTC), MemberIDs: []string{"ana", "bia"}},
		},
		members: map[string]bool{"s1|ana": true},
		invited: map[string]bool{},
	}
}

func (f *fakeStore) Profile(_ context.Context, id string) (Profile, error) {
	if f.err != nil {
		return Profile{}, f.err
	}
	return f.profiles[id], nil
}

func (f *fakeStore) ServerFacts(_ context.Context, id string) (*Facts, error) {
	facts, ok := f.facts[id]
	if !ok {
		return nil, nil
	}
	return &facts, nil
}

func (f *fakeStore) CanSeePrivate(_ context.Context, serverID, userID string) (member, invited bool, err error) {
	return f.members[serverID+"|"+userID], f.invited[serverID+"|"+userID], f.err
}

func (f *fakeStore) Edit(_ context.Context, serverID string, edit EditFunc) (Profile, Profile, error) {
	before := f.profiles[serverID]
	next, reset, err := edit(before)
	if err != nil {
		return before, before, err
	}
	if reset {
		f.resets = append(f.resets, serverID)
	}
	f.profiles[serverID] = next
	return before, next, nil
}

// fakePublisher guarda os eventos.
type fakePublisher struct {
	profiles []ProfileEvent
	tags     []TagEvent
	users    []UserTagEvent
}

func (p *fakePublisher) PublishServerProfile(e ProfileEvent) { p.profiles = append(p.profiles, e) }
func (p *fakePublisher) PublishServerTag(e TagEvent)         { p.tags = append(p.tags, e) }
func (p *fakePublisher) PublishUserServerTag(e UserTagEvent) { p.users = append(p.users, e) }

func newTestService(store *fakeStore, pub *fakePublisher) *Service {
	s := NewService(store, pub, func(ids []string) map[string]string {
		out := map[string]string{}
		for _, id := range ids {
			out[id] = "offline"
		}
		out["ana"] = "online"
		return out
	})
	s.resolve = func(_ context.Context, code string) (string, error) {
		if code == "CODIGO" {
			return "s1", nil
		}
		return "", ErrInvalidInvite
	}
	return s
}

func TestCardPublico(t *testing.T) {
	store := newFakeStore()
	store.profiles["s1"] = Profile{Description: "oi", Strip: Art{Preset: "azul"}, Theme: Theme{Starter: "oceano"}}
	s := newTestService(store, &fakePublisher{})

	card, err := s.Card(context.Background(), "s1", "estranho", "")
	if err != nil {
		t.Fatal(err)
	}
	if card.Locked || card.Name != "Salinha" || card.MemberCount != 2 || card.OnlineCount != 1 || card.IsMember {
		t.Errorf("cartão = %+v", card)
	}
	if card.CreatedAt == nil || card.Profile.Description != "oi" {
		t.Errorf("cartão incompleto: %+v", card)
	}
	// A faixa e o fundo são de quem está no servidor.
	if card.Profile.Strip != (Art{}) || card.Profile.Theme != (Theme{}) {
		t.Errorf("faixa ou fundo vazaram: %+v", card.Profile)
	}

	member, err := s.Card(context.Background(), "s1", "ana", "")
	if err != nil {
		t.Fatal(err)
	}
	if !member.IsMember || member.Profile.Strip.Preset != "azul" || member.Profile.Theme.Starter != "oceano" {
		t.Errorf("cartão do membro = %+v", member)
	}
}

// Perfil privado: fora do servidor e sem convite, nada além do "trancado".
func TestCardPrivado(t *testing.T) {
	store := newFakeStore()
	store.profiles["s1"] = Profile{Private: true, Description: "segredo"}
	store.invited["s1|convidada"] = true
	s := newTestService(store, &fakePublisher{})
	ctx := context.Background()

	locked, err := s.Card(ctx, "s1", "estranho", "")
	if err != nil {
		t.Fatal(err)
	}
	want := &Card{ServerID: "s1", Locked: true}
	if !reflect.DeepEqual(locked, want) {
		t.Errorf("trancado = %+v, quer só %+v", locked, want)
	}

	for _, c := range []struct{ name, user, code string }{
		{"membro", "ana", ""},
		{"convite pendente", "convidada", ""},
		{"código do link", "estranho", "CODIGO"},
	} {
		t.Run(c.name, func(t *testing.T) {
			card, err := s.Card(ctx, "s1", c.user, c.code)
			if err != nil {
				t.Fatal(err)
			}
			if card.Locked || card.Profile.Description != "segredo" {
				t.Errorf("cartão = %+v", card)
			}
		})
	}

	wrong, err := s.Card(ctx, "s1", "estranho", "OUTRO")
	if err != nil {
		t.Fatal(err)
	}
	if !wrong.Locked {
		t.Error("código errado abriu o perfil privado")
	}
}

// Servidor que não existe responde igual ao privado: não dá para sondar ids.
func TestCardInexistenteIgualAoTrancado(t *testing.T) {
	s := newTestService(newFakeStore(), &fakePublisher{})
	card, err := s.Card(context.Background(), "nao-existe", "estranho", "")
	if err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(card, &Card{ServerID: "nao-existe", Locked: true}) {
		t.Errorf("cartão = %+v", card)
	}
}

func TestCardErroDoBanco(t *testing.T) {
	store := newFakeStore()
	store.err = errors.New("banco fora")
	s := newTestService(store, &fakePublisher{})
	if _, err := s.Card(context.Background(), "s1", "ana", ""); err == nil {
		t.Fatal("quer erro")
	}
}

func TestCardPeloConvite(t *testing.T) {
	store := newFakeStore()
	store.profiles["s1"] = Profile{Private: true, Description: "segredo"}
	s := newTestService(store, &fakePublisher{})
	ctx := context.Background()

	card, err := s.CardByInvite(ctx, "CODIGO", "")
	if err != nil {
		t.Fatal(err)
	}
	if card.Locked || card.Profile.Description != "segredo" {
		t.Errorf("cartão = %+v", card)
	}
	if card.ServerID != "" {
		t.Errorf("anônimo recebeu o id: %q", card.ServerID)
	}

	logged, err := s.CardByInvite(ctx, "CODIGO", "ana")
	if err != nil {
		t.Fatal(err)
	}
	if logged.ServerID != "s1" || !logged.IsMember {
		t.Errorf("cartão logado = %+v", logged)
	}

	if _, err := s.CardByInvite(ctx, "RUIM", ""); !errors.Is(err, ErrInvalidInvite) {
		t.Errorf("erro = %v", err)
	}
}

// Quem não é membro não acompanha o online segundo a segundo.
func TestContagemGuardadaParaQuemEstaFora(t *testing.T) {
	store := newFakeStore()
	s := newTestService(store, &fakePublisher{})
	now := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)
	s.counts.now = func() time.Time { return now }
	ctx := context.Background()

	first, _ := s.Card(ctx, "s1", "estranho", "")
	store.facts["s1"] = Facts{Name: "Salinha", MemberIDs: []string{"ana", "bia", "caio"}}
	cached, _ := s.Card(ctx, "s1", "estranho", "")
	if cached.MemberCount != first.MemberCount {
		t.Errorf("contagem = %d, quer guardada %d", cached.MemberCount, first.MemberCount)
	}
	member, _ := s.Card(ctx, "s1", "ana", "")
	if member.MemberCount != 3 {
		t.Errorf("membro vê %d, quer 3 ao vivo", member.MemberCount)
	}
	now = now.Add(cardCountsTTL + time.Second)
	fresh, _ := s.Card(ctx, "s1", "estranho", "")
	if fresh.MemberCount != 3 {
		t.Errorf("depois do prazo = %d, quer 3", fresh.MemberCount)
	}
}

func TestUpdatePublicaEAudita(t *testing.T) {
	store := newFakeStore()
	store.profiles["s1"] = Profile{Tag: &Tag{ServerID: "s1", Name: "ABC", Badge: "raio", Color: "#000000"}}
	pub := &fakePublisher{}
	rec := &audittest.Recorder{}
	s := newTestService(store, pub)
	s.SetAudit(rec)
	ctx := context.Background()

	card, err := s.Update(ctx, "s1", "ana", Patch{Description: ptr("nova"), Private: ptr(true)})
	if err != nil {
		t.Fatal(err)
	}
	if card.Profile.Description != "nova" || !card.Profile.Private {
		t.Errorf("cartão = %+v", card)
	}
	if len(pub.profiles) != 1 || pub.profiles[0].ServerID != "s1" {
		t.Errorf("eventos = %+v", pub.profiles)
	}
	if len(pub.tags) != 0 {
		t.Errorf("tag não mudou e avisou: %+v", pub.tags)
	}
	events := rec.Events()
	if len(events) != 1 || events[0].Action != audit.ServerUpdate || events[0].ActorID != "ana" {
		t.Fatalf("auditoria = %+v", events)
	}
	fields := map[string]bool{}
	for _, c := range events[0].Changes {
		fields[c.Field] = true
	}
	if !fields["description"] || !fields["profile_private"] || len(fields) != 2 {
		t.Errorf("campos auditados = %v", fields)
	}
	// O registro leva o nome do servidor, como as outras edições.
	if events[0].TargetName != "Salinha" {
		t.Errorf("alvo = %q", events[0].TargetName)
	}
}

func TestUpdateTagAvisaTodoMundo(t *testing.T) {
	store := newFakeStore()
	store.profiles["s1"] = Profile{Tag: &Tag{ServerID: "s1", Name: "ABC", Badge: "raio", Color: "#000000"}}
	pub := &fakePublisher{}
	s := newTestService(store, pub)
	ctx := context.Background()

	if _, err := s.Update(ctx, "s1", "ana", Patch{Tag: &TagEdit{Name: "ABC", Badge: "lua", Color: "#000000"}}); err != nil {
		t.Fatal(err)
	}
	if len(store.resets) != 0 {
		t.Errorf("trocar o emblema tirou a tag dos membros: %v", store.resets)
	}
	if len(pub.tags) != 1 || pub.tags[0].ServerID != "s1" {
		t.Errorf("evento = %+v", pub.tags)
	}

	if _, err := s.Update(ctx, "s1", "ana", Patch{Tag: &TagEdit{Name: "XYZ", Badge: "lua", Color: "#000000"}}); err != nil {
		t.Fatal(err)
	}
	if len(store.resets) != 1 {
		t.Errorf("trocar o nome não tirou a tag dos membros: %v", store.resets)
	}
	if len(pub.tags) != 2 {
		t.Errorf("evento = %+v", pub.tags)
	}
}

// O aviso vai para todo mundo: não pode levar a tag de um servidor privado.
func TestEventoDaTagNaoLevaATag(t *testing.T) {
	raw, err := json.Marshal(TagEvent{ServerID: "s1"})
	if err != nil {
		t.Fatal(err)
	}
	if string(raw) != `{"server_id":"s1"}` {
		t.Errorf("evento = %s", raw)
	}
}

// Trocar uma imagem por outra, ou só o escurecimento, também vai para o registro.
func TestAuditoriaDasImagens(t *testing.T) {
	fields := func(before, after Profile) map[string]bool {
		out := map[string]bool{}
		for _, c := range profileChanges(before, after) {
			out[c.Field] = true
		}
		return out
	}
	a, b := ImagePath+"a", ImagePath+"b"
	if got := fields(Profile{Banner: Art{Image: a}}, Profile{Banner: Art{Image: b}}); !got["banner"] {
		t.Errorf("banner: %v", got)
	}
	if got := fields(Profile{Strip: Art{Image: a}}, Profile{Strip: Art{Image: b}}); !got["strip"] {
		t.Errorf("faixa: %v", got)
	}
	if got := fields(Profile{Theme: Theme{Image: a}}, Profile{Theme: Theme{Image: b}}); !got["server_theme_image"] {
		t.Errorf("imagem de fundo: %v", got)
	}
	if got := fields(Profile{Theme: Theme{Image: a, Dim: 10}}, Profile{Theme: Theme{Image: a, Dim: 20}}); !got["server_theme_dim"] {
		t.Errorf("escurecimento: %v", got)
	}
	if got := fields(Profile{Theme: Theme{Image: a, Starter: "x"}}, Profile{Theme: Theme{Image: a, Starter: "y"}}); !got["server_theme"] {
		t.Errorf("ponto de partida: %v", got)
	}
}

func TestUpdateInvalidoNaoGrava(t *testing.T) {
	store := newFakeStore()
	pub := &fakePublisher{}
	s := newTestService(store, pub)
	_, err := s.Update(context.Background(), "s1", "ana", Patch{Tag: &TagEdit{Name: "NOMELONGO", Badge: "raio", Color: "#000000"}})
	if !errors.Is(err, ErrInvalidProfile) {
		t.Fatalf("erro = %v", err)
	}
	if len(pub.profiles)+len(pub.tags) != 0 {
		t.Error("avisou sem gravar")
	}
}
