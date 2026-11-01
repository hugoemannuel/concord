package user

import (
	"context"
	"os"
	"testing"

	"gin-quickstart/backend/internal/platform/database"

	"github.com/google/uuid"
)

// A conta "Usuário removido" (migration 000184, ADR 0038) recebe as mensagens
// de quem excluiu a conta: não aparece na busca nem recebe pedido de amizade.
func TestDeletedUserIsHiddenFromSearchAndFriendLookup(t *testing.T) {
	url := os.Getenv("TEST_DATABASE_URL")
	if url == "" {
		t.Skip("TEST_DATABASE_URL não definido")
	}
	db, err := database.Connect(url)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	if err := database.Migrate(db, "../../migrations"); err != nil {
		t.Fatal(err)
	}
	ctx := context.Background()
	repo := UserRepository(db)

	found, err := repo.SearchByUsername(ctx, "usuario-removido", uuid.NewString())
	if err != nil || len(found) != 0 {
		t.Fatalf("busca = %+v, %v; quer vazio", found, err)
	}
	if _, err := repo.FindByUsernameFold(ctx, "usuario-removido"); err == nil {
		t.Fatal("pedido de amizade achou o Usuário removido")
	}
}
