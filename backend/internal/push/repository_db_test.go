package push

import (
	"context"
	"os"
	"sort"
	"testing"

	"gin-quickstart/backend/internal/platform/database"

	"github.com/google/uuid"
)

// Num Postgres de verdade (TEST_DATABASE_URL): quem tem algum dos cargos
// pedidos, sem repetir, e só do servidor certo.
func TestRoleMemberIDsDB(t *testing.T) {
	url := os.Getenv("TEST_DATABASE_URL")
	if url == "" {
		t.Skip("TEST_DATABASE_URL não definido")
	}
	ctx := context.Background()
	db, err := database.Connect(url)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(db.Close)
	if err := database.Migrate(db, "../../migrations"); err != nil {
		t.Fatal(err)
	}
	exec := func(sql string, args ...any) {
		t.Helper()
		if _, err := db.Exec(ctx, sql, args...); err != nil {
			t.Fatalf("%s: %v", sql, err)
		}
	}
	newUser := func() string {
		id := uuid.NewString()
		exec(`INSERT INTO users (id, username, display_name, email, password_hash) VALUES ($1, $2::text, $2::text, $2::text || '@ex.com', 'x')`, id, "p"+id[:8])
		t.Cleanup(func() { db.Exec(ctx, `DELETE FROM users WHERE id = $1`, id) })
		return id
	}
	ana, bia, caio := newUser(), newUser(), newUser()
	server, suporte, equipe, vip := uuid.NewString(), uuid.NewString(), uuid.NewString(), uuid.NewString()
	exec(`INSERT INTO servers (id, name, owner_id) VALUES ($1, 's', $2)`, server, ana)
	t.Cleanup(func() { db.Exec(ctx, `DELETE FROM servers WHERE id = $1`, server) })
	for _, u := range []string{ana, bia, caio} {
		exec(`INSERT INTO server_members (server_id, user_id) VALUES ($1, $2)`, server, u)
	}
	for i, r := range []string{suporte, equipe, vip} {
		exec(`INSERT INTO roles (id, server_id, name, position, permissions) VALUES ($1, $2, 'c', $3, 0)`, r, server, i+1)
	}
	// Ana tem os dois cargos pedidos; Bia, um; Caio, só o que não foi pedido.
	for _, mr := range [][2]string{{ana, suporte}, {ana, equipe}, {bia, equipe}, {caio, vip}} {
		exec(`INSERT INTO member_roles (server_id, user_id, role_id) VALUES ($1, $2, $3)`, server, mr[0], mr[1])
	}

	repo := NewRepository(db)
	got, err := repo.RoleMemberIDs(ctx, server, []string{suporte, equipe})
	if err != nil {
		t.Fatal(err)
	}
	want := []string{ana, bia}
	sort.Strings(got)
	sort.Strings(want)
	if len(got) != 2 || got[0] != want[0] || got[1] != want[1] {
		t.Fatalf("got %v, want %v", got, want)
	}
	if other, err := repo.RoleMemberIDs(ctx, uuid.NewString(), []string{suporte}); err != nil || len(other) != 0 {
		t.Fatalf("outro servidor: got %v, err = %v", other, err)
	}
}
