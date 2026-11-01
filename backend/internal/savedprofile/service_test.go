package savedprofile

import (
	"context"
	"errors"
	"strings"
	"testing"

	"gin-quickstart/backend/internal/namestyle"
	"gin-quickstart/backend/internal/profiletheme"
	"gin-quickstart/backend/internal/user"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

const meID = "11111111-1111-4111-8111-111111111111"

const (
	avatarA = "/api/profile-media/a_33333333-3333-4333-8333-333333333333"
	avatarB = "/api/profile-media/44444444-4444-4444-8444-444444444444"
)

// fakeStore guarda os perfis salvos na memória, com as mesmas regras do banco
// (limite por pessoa, nome único sem diferenciar maiúsculas).
type fakeStore struct {
	items []SavedProfile
	owner map[string]string
}

func newFakeStore() *fakeStore { return &fakeStore{owner: map[string]string{}} }

func (f *fakeStore) List(_ context.Context, userID string) ([]SavedProfile, error) {
	out := []SavedProfile{}
	for _, sp := range f.items {
		if f.owner[sp.ID] == userID {
			out = append(out, sp)
		}
	}
	return out, nil
}

func (f *fakeStore) index(userID, id string) int {
	for i, sp := range f.items {
		if sp.ID == id && f.owner[id] == userID {
			return i
		}
	}
	return -1
}

func (f *fakeStore) Find(_ context.Context, userID, id string) (*SavedProfile, error) {
	i := f.index(userID, id)
	if i < 0 {
		return nil, ErrNotFound
	}
	sp := f.items[i]
	return &sp, nil
}

func (f *fakeStore) nameTaken(userID, id, name string) bool {
	for _, sp := range f.items {
		if f.owner[sp.ID] == userID && sp.ID != id && strings.EqualFold(sp.Name, name) {
			return true
		}
	}
	return false
}

func (f *fakeStore) Create(ctx context.Context, userID, name string, snap user.ProfileSnapshot) (*SavedProfile, error) {
	mine, _ := f.List(ctx, userID)
	if len(mine) >= MaxPerUser {
		return nil, ErrLimit
	}
	if f.nameTaken(userID, "", name) {
		return nil, ErrNameTaken
	}
	sp := SavedProfile{ID: uuid.NewString(), Name: name, ProfileSnapshot: snap}
	f.items = append(f.items, sp)
	f.owner[sp.ID] = userID
	return &sp, nil
}

func (f *fakeStore) Rename(_ context.Context, userID, id, name string) (*SavedProfile, error) {
	i := f.index(userID, id)
	if i < 0 {
		return nil, ErrNotFound
	}
	if f.nameTaken(userID, id, name) {
		return nil, ErrNameTaken
	}
	f.items[i].Name = name
	sp := f.items[i]
	return &sp, nil
}

func (f *fakeStore) Overwrite(_ context.Context, userID, id string, snap user.ProfileSnapshot) (*SavedProfile, *SavedProfile, error) {
	i := f.index(userID, id)
	if i < 0 {
		return nil, nil, ErrNotFound
	}
	old := f.items[i]
	f.items[i].ProfileSnapshot = snap
	sp := f.items[i]
	return &sp, &old, nil
}

func (f *fakeStore) Delete(_ context.Context, userID, id string) (*SavedProfile, error) {
	i := f.index(userID, id)
	if i < 0 {
		return nil, ErrNotFound
	}
	sp := f.items[i]
	f.items = append(f.items[:i], f.items[i+1:]...)
	return &sp, nil
}

// fakeProfiles é o perfil atual da pessoa (o user.Service e o ProfileService).
type fakeProfiles struct {
	me      *user.User
	applied []user.ProfileSnapshot
}

func newFakeProfiles() *fakeProfiles {
	a := avatarA
	return &fakeProfiles{me: &user.User{
		ID: meID, DisplayName: "Mugis", AvatarURL: &a, Links: []user.ProfileLink{},
		NameStyle: namestyle.Default(), ProfileTheme: profiletheme.Default(),
	}}
}

func (p *fakeProfiles) FindByID(_ context.Context, id string) (*user.User, error) {
	if id != meID {
		return nil, pgx.ErrNoRows // como o user.Repository
	}
	copied := *p.me
	return &copied, nil
}

func (p *fakeProfiles) ApplySnapshot(_ context.Context, _ string, s user.ProfileSnapshot) (*user.User, []*string, error) {
	p.applied = append(p.applied, s)
	old := p.me.AvatarURL
	p.me.DisplayName, p.me.AvatarURL = s.Fields.DisplayName, s.AvatarURL
	copied := *p.me
	return &copied, []*string{old}, nil
}

func newTestService() (*Service, *fakeStore, *fakeProfiles) {
	store, profiles := newFakeStore(), newFakeProfiles()
	return NewService(store, profiles, profiles), store, profiles
}

func TestSaveTakesSnapshotOfCurrentProfile(t *testing.T) {
	s, _, _ := newTestService()
	sp, err := s.Save(context.Background(), meID, "  Gamer  ")
	if err != nil {
		t.Fatal(err)
	}
	if sp.Name != "Gamer" || sp.Fields.DisplayName != "Mugis" || sp.AvatarURL == nil || *sp.AvatarURL != avatarA {
		t.Fatalf("perfil salvo = %+v", sp)
	}
}

func TestSaveRejectsBadNames(t *testing.T) {
	s, _, _ := newTestService()
	for _, name := range []string{"", "   ", strings.Repeat("a", MaxNameLength+1), "a​b"} {
		if _, err := s.Save(context.Background(), meID, name); !errors.Is(err, ErrInvalidName) {
			t.Fatalf("%q: err = %v", name, err)
		}
	}
	if _, err := s.Save(context.Background(), meID, strings.Repeat("ç", MaxNameLength)); err != nil {
		t.Fatalf("32 caracteres com acento valem: %v", err)
	}
}

func TestSaveLimitAndDuplicateName(t *testing.T) {
	s, _, _ := newTestService()
	ctx := context.Background()
	if _, err := s.Save(ctx, meID, "Casual"); err != nil {
		t.Fatal(err)
	}
	if _, err := s.Save(ctx, meID, "CASUAL"); !errors.Is(err, ErrNameTaken) {
		t.Fatalf("nome repetido: err = %v", err)
	}
	for i := 1; i < MaxPerUser; i++ {
		if _, err := s.Save(ctx, meID, "p"+string(rune('a'+i))); err != nil {
			t.Fatal(err)
		}
	}
	if _, err := s.Save(ctx, meID, "um a mais"); !errors.Is(err, ErrLimit) {
		t.Fatalf("passou do limite: err = %v", err)
	}
}

func TestSaveUnknownUser(t *testing.T) {
	s, _, _ := newTestService()
	if _, err := s.Save(context.Background(), uuid.NewString(), "x"); !errors.Is(err, user.ErrUserNotFound) {
		t.Fatalf("err = %v", err)
	}
}

func TestSaveRejectsInvalidCurrentProfile(t *testing.T) {
	s, _, profiles := newTestService()
	profiles.me.DisplayName = ""
	if _, err := s.Save(context.Background(), meID, "x"); !errors.Is(err, user.ErrInvalidProfile) {
		t.Fatalf("err = %v", err)
	}
}

func TestApplyUsesSavedSnapshot(t *testing.T) {
	s, _, profiles := newTestService()
	ctx := context.Background()
	sp, _ := s.Save(ctx, meID, "Antigo")
	b := avatarB
	profiles.me.DisplayName, profiles.me.AvatarURL = "Outro nome", &b

	u, old, err := s.Apply(ctx, meID, sp.ID)
	if err != nil {
		t.Fatal(err)
	}
	if u.DisplayName != "Mugis" || *u.AvatarURL != avatarA {
		t.Fatalf("usuário = %+v", u)
	}
	if len(old) != 1 || *old[0] != avatarB {
		t.Fatalf("antigas = %v", old)
	}
}

func TestOtherUsersSavedProfilesAreNotFound(t *testing.T) {
	s, store, _ := newTestService()
	ctx := context.Background()
	sp, _ := s.Save(ctx, meID, "Meu")
	store.owner[sp.ID] = uuid.NewString()

	if _, _, err := s.Apply(ctx, meID, sp.ID); !errors.Is(err, ErrNotFound) {
		t.Fatalf("aplicar: err = %v", err)
	}
	if _, err := s.Rename(ctx, meID, sp.ID, "x"); !errors.Is(err, ErrNotFound) {
		t.Fatalf("renomear: err = %v", err)
	}
	if _, err := s.Delete(ctx, meID, sp.ID); !errors.Is(err, ErrNotFound) {
		t.Fatalf("excluir: err = %v", err)
	}
}

func TestRenameAndDelete(t *testing.T) {
	s, _, _ := newTestService()
	ctx := context.Background()
	sp, _ := s.Save(ctx, meID, "A")
	s.Save(ctx, meID, "B")

	if _, err := s.Rename(ctx, meID, sp.ID, " "); !errors.Is(err, ErrInvalidName) {
		t.Fatalf("err = %v", err)
	}
	if _, err := s.Rename(ctx, meID, sp.ID, "b"); !errors.Is(err, ErrNameTaken) {
		t.Fatalf("err = %v", err)
	}
	renamed, err := s.Rename(ctx, meID, sp.ID, " Novo ")
	if err != nil || renamed.Name != "Novo" {
		t.Fatalf("renomear = %+v, %v", renamed, err)
	}
	gone, err := s.Delete(ctx, meID, sp.ID)
	if err != nil || gone.ID != sp.ID {
		t.Fatalf("excluir = %+v, %v", gone, err)
	}
	list, _ := s.List(ctx, meID)
	if len(list) != 1 || list[0].Name != "B" {
		t.Fatalf("lista = %+v", list)
	}
}

func TestOverwriteTakesCurrentSnapshotKeepingName(t *testing.T) {
	s, _, profiles := newTestService()
	sp, _ := s.Save(context.Background(), meID, "Gamer")
	b := avatarB
	profiles.me.AvatarURL, profiles.me.DisplayName = &b, "Outro"

	got, old, err := s.Overwrite(context.Background(), meID, sp.ID)
	if err != nil {
		t.Fatal(err)
	}
	if got.Name != "Gamer" || got.Fields.DisplayName != "Outro" || *got.AvatarURL != avatarB || *old.AvatarURL != avatarA {
		t.Fatalf("novo = %+v, antigo = %+v", got, old)
	}
}

func TestOverwriteErrors(t *testing.T) {
	s, _, _ := newTestService()
	if _, _, err := s.Overwrite(context.Background(), meID, "99999999-9999-4999-8999-999999999999"); !errors.Is(err, ErrNotFound) {
		t.Fatalf("não existe: %v", err)
	}
	if _, _, err := s.Overwrite(context.Background(), "22222222-2222-4222-8222-222222222222", "x"); !errors.Is(err, user.ErrUserNotFound) {
		t.Fatalf("conta que não existe: %v", err)
	}
}
