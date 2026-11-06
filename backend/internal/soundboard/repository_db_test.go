package soundboard

import (
	"errors"
	"github.com/google/uuid"
	"reflect"
	"testing"
)

func TestRepositoryUpdate(t *testing.T) {
	db, ctx := favoritesDB(t)
	repo := NewRepository(db)
	user := dbUser(t, db)
	server := dbServer(t, db, user, "Edição")
	original := dbSound(t, repo, server, user, "antigo")
	emoji := "🔥"
	got, err := repo.Update(ctx, server, original.ID, "novo", &emoji)
	if err != nil {
		t.Fatal(err)
	}
	expected := original
	expected.Name = "novo"
	expected.Emoji = &emoji
	if !reflect.DeepEqual(*got, expected) {
		t.Fatalf("atualizado = %+v, esperado %+v", got, expected)
	}
	persisted, err := repo.FindByID(ctx, original.ID)
	if err != nil || !reflect.DeepEqual(persisted, got) {
		t.Fatalf("persistido = %+v, erro %v", persisted, err)
	}
	got, err = repo.Update(ctx, server, original.ID, "sem emoji", nil)
	if err != nil || got.Emoji != nil {
		t.Fatalf("limpar emoji: %+v, %v", got, err)
	}
	if _, err := repo.Update(ctx, uuid.NewString(), original.ID, "fora", nil); !errors.Is(err, ErrSoundNotFound) {
		t.Fatalf("outro servidor: %v", err)
	}
	if _, err := repo.Update(ctx, server, uuid.NewString(), "ausente", nil); !errors.Is(err, ErrSoundNotFound) {
		t.Fatalf("inexistente: %v", err)
	}
}

// ListForUser: só os servidores de que a pessoa é membro, cada um com seus sons;
// servidor sem som não vem.
func TestListForUserDB(t *testing.T) {
	db, ctx := favoritesDB(t)
	repo := NewRepository(db)
	me := dbUser(t, db)
	other := dbUser(t, db)
	alfa := dbServer(t, db, me, "Alfa")
	beta := dbServer(t, db, me, "Beta")
	vazio := dbServer(t, db, me, "Vazio")
	alheio := dbServer(t, db, other, "Alheio")
	for _, srv := range []string{alfa, beta, vazio} {
		dbExec(t, db, `INSERT INTO server_members (server_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, srv, me)
	}
	a := dbSound(t, repo, alfa, me, "buzina")
	b := dbSound(t, repo, beta, other, "apito")
	dbSound(t, repo, alheio, other, "segredo")

	groups, err := repo.ListForUser(ctx, me)
	if err != nil {
		t.Fatal(err)
	}
	got := map[string][]string{}
	for _, g := range groups {
		got[g.ServerID] = ids(g.Sounds)
	}
	want := map[string][]string{alfa: {a.ID}, beta: {b.ID}}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("grupos = %v, want %v", got, want)
	}
	if groups[0].ServerName != "Alfa" || groups[1].Sounds[0].UploaderName == "" {
		t.Fatalf("nome do servidor/autor: %+v", groups)
	}
}
