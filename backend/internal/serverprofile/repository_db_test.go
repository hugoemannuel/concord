package serverprofile

import (
	"context"
	"errors"
	"os"
	"testing"

	"gin-quickstart/backend/internal/platform/database"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Num Postgres de verdade (TEST_DATABASE_URL, já migrado).
type dbFixture struct {
	db     *pgxpool.Pool
	repo   *Repository
	server string
	owner  string
	guest  string
}

func newDBFixture(t *testing.T) *dbFixture {
	t.Helper()
	url := os.Getenv("TEST_DATABASE_URL")
	if url == "" {
		t.Skip("TEST_DATABASE_URL não definido")
	}
	db, err := database.Connect(url)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(db.Close)
	ctx := context.Background()
	f := &dbFixture{db: db, repo: NewRepository(db), server: uuid.NewString(), owner: uuid.NewString(), guest: uuid.NewString()}
	for _, id := range []string{f.owner, f.guest} {
		if _, err := db.Exec(ctx, `INSERT INTO users (id, username, display_name, email, password_hash) VALUES ($1, $2::text, $2::text, $2::text || '@ex.com', 'x')`, id, "t"+id[:8]); err != nil {
			t.Fatal(err)
		}
	}
	if _, err := db.Exec(ctx, `INSERT INTO servers (id, name, owner_id) VALUES ($1, 'Salinha', $2)`, f.server, f.owner); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(ctx, `INSERT INTO server_members (server_id, user_id) VALUES ($1, $2)`, f.server, f.owner); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		db.Exec(ctx, `DELETE FROM servers WHERE id = $1`, f.server)
		db.Exec(ctx, `DELETE FROM users WHERE id = ANY($1::uuid[])`, []string{f.owner, f.guest})
	})
	return f
}

func (f *dbFixture) setTag(t *testing.T, name string) {
	t.Helper()
	ctx := context.Background()
	_, _, err := f.repo.Edit(ctx, f.server, func(p Profile) (Profile, bool, error) {
		next, change, err := applyPatch(p, f.server, Patch{Tag: &TagEdit{Name: name, Badge: "raio", Color: "#123456"}})
		return next, change.TagReset, err
	})
	if err != nil {
		t.Fatal(err)
	}
}

func TestDBPerfil(t *testing.T) {
	f := newDBFixture(t)
	ctx := context.Background()

	empty, err := f.repo.Profile(ctx, f.server)
	if err != nil {
		t.Fatal(err)
	}
	if empty.Traits == nil || empty.Games == nil || empty.Tag != nil || empty.Theme.Dim != DefaultThemeDim {
		t.Errorf("padrão = %+v", empty)
	}

	_, after, err := f.repo.Edit(ctx, f.server, func(p Profile) (Profile, bool, error) {
		p.Description = "oi"
		p.Traits = []Trait{{Emoji: "🎮", Text: "jogos"}}
		p.Games = []Game{{Name: "Dota 2", AppID: 570}}
		p.Private = true
		p.Banner = Art{Preset: "azul"}
		p.Strip = Art{Image: ImagePath + "x"}
		return p, false, nil
	})
	if err != nil || after.Description != "oi" {
		t.Fatalf("Edit = %+v, %v", after, err)
	}
	got, err := f.repo.Profile(ctx, f.server)
	if err != nil {
		t.Fatal(err)
	}
	if got.Description != "oi" || !got.Private || got.Traits[0].Text != "jogos" || got.Games[0].AppID != 570 || got.Banner.Preset != "azul" {
		t.Errorf("lido = %+v", got)
	}
	used, err := f.repo.ImagesInUse(ctx)
	if err != nil {
		t.Fatal(err)
	}
	found := false
	for _, url := range used {
		found = found || url == ImagePath+"x"
	}
	if !found {
		t.Errorf("imagens em uso = %v", used)
	}

	// Erro na edição não grava nada.
	boom := errors.New("não")
	if _, _, err := f.repo.Edit(ctx, f.server, func(p Profile) (Profile, bool, error) {
		p.Description = "perdido"
		return p, false, boom
	}); !errors.Is(err, boom) {
		t.Errorf("erro = %v", err)
	}
	got, _ = f.repo.Profile(ctx, f.server)
	if got.Description != "oi" {
		t.Errorf("gravou com erro: %q", got.Description)
	}
}

func TestDBFatosEAcesso(t *testing.T) {
	f := newDBFixture(t)
	ctx := context.Background()

	facts, err := f.repo.ServerFacts(ctx, f.server)
	if err != nil || facts == nil || facts.Name != "Salinha" || len(facts.MemberIDs) != 1 {
		t.Fatalf("fatos = %+v, %v", facts, err)
	}
	if missing, err := f.repo.ServerFacts(ctx, uuid.NewString()); err != nil || missing != nil {
		t.Errorf("inexistente = %+v, %v", missing, err)
	}

	member, invited, err := f.repo.CanSeePrivate(ctx, f.server, f.owner)
	if err != nil || !member || invited {
		t.Errorf("dono = %v %v %v", member, invited, err)
	}
	member, invited, err = f.repo.CanSeePrivate(ctx, f.server, f.guest)
	if err != nil || member || invited {
		t.Errorf("estranho = %v %v %v", member, invited, err)
	}
	if member, invited, err := f.repo.CanSeePrivate(ctx, f.server, ""); err != nil || member || invited {
		t.Errorf("anônimo = %v %v %v", member, invited, err)
	}
	if _, err := f.db.Exec(ctx, `INSERT INTO server_invites (id, server_id, inviter_id, invitee_id) VALUES ($1, $2, $3, $4)`, uuid.NewString(), f.server, f.owner, f.guest); err != nil {
		t.Fatal(err)
	}
	if _, invited, err := f.repo.CanSeePrivate(ctx, f.server, f.guest); err != nil || !invited {
		t.Errorf("convidado = %v %v", invited, err)
	}
}

func TestDBTags(t *testing.T) {
	f := newDBFixture(t)
	ctx := context.Background()

	if _, err := f.repo.ApplyTag(ctx, f.owner, f.server); !errors.Is(err, ErrNoTag) {
		t.Errorf("sem tag = %v", err)
	}
	f.setTag(t, "ABC")
	if _, err := f.repo.ApplyTag(ctx, f.guest, f.server); !errors.Is(err, ErrNotMember) {
		t.Errorf("de fora = %v", err)
	}
	tag, err := f.repo.ApplyTag(ctx, f.owner, f.server)
	if err != nil || tag.Name != "ABC" || tag.Color != "#123456" {
		t.Fatalf("aplicar = %+v, %v", tag, err)
	}
	options, err := f.repo.TagOptions(ctx, f.owner)
	if err != nil || len(options) != 1 || options[0].ServerName != "Salinha" {
		t.Errorf("opções = %+v, %v", options, err)
	}
	if none, err := f.repo.TagOptions(ctx, f.guest); err != nil || len(none) != 0 {
		t.Errorf("opções de quem está fora = %+v, %v", none, err)
	}

	// Trocar o nome tira a tag dos membros.
	f.setTag(t, "XYZ")
	tags, err := f.repo.LookupTags(ctx, []string{f.owner})
	if err != nil || len(tags) != 0 {
		t.Errorf("depois de trocar o nome = %+v, %v", tags, err)
	}

	// Trocar só a cor, não.
	if _, err := f.repo.ApplyTag(ctx, f.owner, f.server); err != nil {
		t.Fatal(err)
	}
	if _, _, err := f.repo.Edit(ctx, f.server, func(p Profile) (Profile, bool, error) {
		next, change, err := applyPatch(p, f.server, Patch{Tag: &TagEdit{Name: "XYZ", Badge: "lua", Color: "#ffffff"}})
		return next, change.TagReset, err
	}); err != nil {
		t.Fatal(err)
	}
	tags, _ = f.repo.LookupTags(ctx, []string{f.owner})
	if tags[f.owner].Badge != "lua" {
		t.Errorf("depois de trocar o emblema = %+v", tags)
	}

	if err := f.repo.ClearTag(ctx, f.owner); err != nil {
		t.Fatal(err)
	}
	tags, _ = f.repo.LookupTags(ctx, []string{f.owner})
	if len(tags) != 0 {
		t.Errorf("depois de tirar = %+v", tags)
	}
}

// Sair, ser expulso ou banido tira a linha de server_members: a tag sai junto.
func TestDBSairDoServidorTiraATag(t *testing.T) {
	f := newDBFixture(t)
	ctx := context.Background()
	if _, err := f.db.Exec(ctx, `INSERT INTO server_members (server_id, user_id) VALUES ($1, $2)`, f.server, f.guest); err != nil {
		t.Fatal(err)
	}
	f.setTag(t, "ABC")
	if _, err := f.repo.ApplyTag(ctx, f.guest, f.server); err != nil {
		t.Fatal(err)
	}
	if _, err := f.db.Exec(ctx, `DELETE FROM server_members WHERE server_id = $1 AND user_id = $2`, f.server, f.guest); err != nil {
		t.Fatal(err)
	}
	tags, err := f.repo.LookupTags(ctx, []string{f.guest})
	if err != nil || len(tags) != 0 {
		t.Errorf("depois de sair = %+v, %v", tags, err)
	}
}

func TestDBJogos(t *testing.T) {
	f := newDBFixture(t)
	ctx := context.Background()
	if _, err := f.db.Exec(ctx, `INSERT INTO server_members (server_id, user_id) VALUES ($1, $2)`, f.server, f.guest); err != nil {
		t.Fatal(err)
	}
	if none, err := f.repo.MemberGames(ctx, f.server, 5); err != nil || none == nil || len(none) != 0 {
		t.Errorf("sem amostras = %+v, %v", none, err)
	}
	for i := 0; i < 2; i++ {
		if err := f.repo.RecordGameSamples(ctx, []PlayedGame{
			{UserID: f.owner, Game: Game{Name: "Dota 2", AppID: 570}},
			{UserID: f.guest, Game: Game{Name: "Dota 2", AppID: 570}},
			{UserID: f.guest, Game: Game{Name: "VALORANT"}},
		}); err != nil {
			t.Fatal(err)
		}
	}
	games, err := f.repo.MemberGames(ctx, f.server, 5)
	if err != nil || len(games) != 2 || games[0].Name != "Dota 2" || games[0].AppID != 570 {
		t.Fatalf("jogos = %+v, %v", games, err)
	}
	if err := f.repo.TrimGameSamples(ctx); err != nil {
		t.Fatal(err)
	}
}
