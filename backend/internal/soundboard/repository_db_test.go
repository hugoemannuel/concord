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
