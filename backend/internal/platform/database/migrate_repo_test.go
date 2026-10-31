package database

import (
	"path/filepath"
	"testing"
)

// As migrations de verdade (backend/migrations) precisam carregar: dois PRs
// que escolhem o mesmo número passam sozinhos, mas juntos na develop o backend
// não sobe e o deploy da main fica travado. Este teste pega a colisão antes do
// release (o `affected-tests full` do passo de release roda o pacote).
func TestRepoMigrationsLoadWithUniqueNumbers(t *testing.T) {
	migrations, err := loadMigrations(filepath.Join("..", "..", "..", "migrations"))
	if err != nil {
		t.Fatalf("as migrations do repositório não carregam: %v", err)
	}
	if len(migrations) == 0 {
		t.Fatal("nenhuma migration encontrada em backend/migrations")
	}
}
