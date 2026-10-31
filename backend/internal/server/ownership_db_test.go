package server

import (
	"context"
	"os"
	"testing"

	"github.com/google/uuid"

	"gin-quickstart/backend/internal/platform/database"
)

func TestTransferOwnerDB(t *testing.T) {
	url := os.Getenv("TEST_DATABASE_URL")
	if url == "" {
		t.Skip("TEST_DATABASE_URL não definido")
	}
	db, err := database.Connect(url)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(db.Close)
	if err := database.Migrate(db, "../../migrations"); err != nil {
		t.Fatal(err)
	}
	ctx := context.Background()
	exec := func(sql string, args ...any) {
		t.Helper()
		if _, err := db.Exec(ctx, sql, args...); err != nil {
			t.Fatalf("%s: %v", sql, err)
		}
	}
	newUser := func(bot bool) string {
		id := uuid.NewString()
		exec(`INSERT INTO users (id, username, display_name, email, password_hash, is_bot) VALUES ($1, $2::text, $2::text, $2::text || '@ex.com', 'x', $3)`, id, "o"+id[:8], bot)
		t.Cleanup(func() { db.Exec(ctx, `DELETE FROM users WHERE id = $1`, id) })
		return id
	}
	owner, member, bot, outsider := newUser(false), newUser(false), newUser(true), newUser(false)
	serverID := uuid.NewString()
	exec(`INSERT INTO servers (id, name, owner_id) VALUES ($1, 'Turma', $2)`, serverID, owner)
	t.Cleanup(func() { db.Exec(ctx, `DELETE FROM servers WHERE id = $1`, serverID) })
	for _, m := range []string{owner, member, bot} {
		exec(`INSERT INTO server_members (server_id, user_id) VALUES ($1, $2)`, serverID, m)
	}
	repo := ServerRepository(db)

	for _, to := range []string{outsider, bot} {
		if ok, err := repo.TransferOwner(ctx, serverID, owner, to); err != nil || ok {
			t.Errorf("TransferOwner para %s = %v, %v; quer recusado", to, ok, err)
		}
	}
	if ok, err := repo.TransferOwner(ctx, serverID, owner, member); err != nil || !ok {
		t.Fatalf("TransferOwner para membro = %v, %v", ok, err)
	}
	if ok, _ := repo.TransferOwner(ctx, serverID, owner, member); ok {
		t.Error("o dono antigo transferiu de novo")
	}
}
