package audit

import (
	"context"
	"os"
	"testing"

	"gin-quickstart/backend/internal/platform/database"

	"github.com/google/uuid"
)

func TestRepositoryIsolaServidores(t *testing.T) {
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
	owner, first, second := uuid.NewString(), uuid.NewString(), uuid.NewString()
	name := "u" + owner[:8]
	if _, err := db.Exec(ctx, `INSERT INTO users (id, username, display_name, email, password_hash) VALUES ($1, $2, $2, $3, 'x')`, owner, name, name+"@ex.com"); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _, _ = db.Exec(ctx, `DELETE FROM users WHERE id = $1`, owner) })
	for _, serverID := range []string{first, second} {
		if _, err := db.Exec(ctx, `INSERT INTO servers (id, name, owner_id) VALUES ($1, 'teste', $2)`, serverID, owner); err != nil {
			t.Fatal(err)
		}
		t.Cleanup(func() { _, _ = db.Exec(ctx, `DELETE FROM servers WHERE id = $1`, serverID) })
		if err := Write(ctx, db, Event{ServerID: serverID, ActorID: owner, Action: ChannelCreate, TargetID: serverID}); err != nil {
			t.Fatal(err)
		}
	}
	repo := AuditRepository(db)
	for _, serverID := range []string{first, second} {
		entries, err := repo.List(ctx, serverID, Filter{Limit: 10})
		if err != nil || len(entries) != 1 || entries[0].TargetID != serverID {
			t.Fatalf("servidor %s: registros=%+v erro=%v", serverID, entries, err)
		}
	}
}
