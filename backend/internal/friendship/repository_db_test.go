package friendship

import (
	"context"
	"os"
	"strings"
	"testing"

	"gin-quickstart/backend/internal/cosmetics"
	"gin-quickstart/backend/internal/platform/database"

	"github.com/google/uuid"
)

const (
	faixaURL   = "https://ex.com/faixa.png"
	molduraURL = "https://ex.com/moldura.png"
)

func lookOK(look cosmetics.Look) bool {
	return look.NameplateURL != nil && *look.NameplateURL == faixaURL &&
		look.AvatarDecorationURL != nil && *look.AvatarDecorationURL == molduraURL
}

// As listagens trazem faixa e moldura (cosmetics.Expr no SELECT) num Postgres
// de verdade (TEST_DATABASE_URL, banco descartável). Coluna no SELECT sem
// destino no Scan faz a listagem inteira falhar.
func TestFriendshipListsDB(t *testing.T) {
	url := os.Getenv("TEST_DATABASE_URL")
	if url == "" {
		t.Skip("TEST_DATABASE_URL não definido")
	}
	ctx := context.Background()
	db, err := database.Connect(url)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	if err := database.Migrate(db, "../../migrations"); err != nil {
		t.Fatal(err)
	}

	// Todo mundo com faixa e moldura: qualquer linha devolvida tem de trazê-las.
	mk := func(label string) string {
		id := uuid.NewString()
		name := label + strings.ReplaceAll(id, "-", "")[:10]
		if _, err := db.Exec(ctx, `INSERT INTO users (id, username, display_name, email, password_hash, nameplate_mode, nameplate_url, avatar_decoration_url) VALUES ($1, $2::text, $2::text, $2::text || '@ex.com', 'x', 'custom', $3, $4)`, id, name, faixaURL, molduraURL); err != nil {
			t.Fatal(err)
		}
		t.Cleanup(func() { db.Exec(ctx, `DELETE FROM users WHERE id = $1`, id) })
		return id
	}
	repo := FriendshipRepository(db)
	befriend := func(a, b string) {
		if err := repo.Create(ctx, a, b); err != nil {
			t.Fatal(err)
		}
		if err := repo.UpdateStatus(ctx, a, b, "accepted"); err != nil {
			t.Fatal(err)
		}
	}

	eu, amigo, outro, pedinte, bloqueado := mk("eu"), mk("amigo"), mk("outro"), mk("pedinte"), mk("bloq")
	befriend(eu, amigo)
	befriend(outro, amigo)
	if err := repo.Create(ctx, pedinte, eu); err != nil {
		t.Fatal(err)
	}
	if err := repo.Block(ctx, eu, bloqueado); err != nil {
		t.Fatal(err)
	}

	friends, err := repo.ListFriends(ctx, eu)
	if err != nil || len(friends) != 1 || friends[0].ID != amigo || !lookOK(friends[0].Look) {
		t.Errorf("ListFriends = %+v, %v", friends, err)
	}
	pending, err := repo.ListPending(ctx, eu)
	if err != nil || len(pending) != 1 || pending[0].UserID != pedinte || !lookOK(pending[0].Look) {
		t.Errorf("ListPending = %+v, %v", pending, err)
	}
	sent, err := repo.ListSent(ctx, pedinte)
	if err != nil || len(sent) != 1 || sent[0].UserID != eu {
		t.Errorf("ListSent = %+v, %v", sent, err)
	}
	blocked, err := repo.ListBlocked(ctx, eu)
	if err != nil || len(blocked) != 1 || blocked[0].ID != bloqueado || !lookOK(blocked[0].Look) {
		t.Errorf("ListBlocked = %+v, %v", blocked, err)
	}
	mutual, err := repo.MutualFriends(ctx, eu, outro)
	if err != nil || len(mutual) != 1 || mutual[0].ID != amigo || !lookOK(mutual[0].Look) {
		t.Errorf("MutualFriends = %+v, %v", mutual, err)
	}
}
