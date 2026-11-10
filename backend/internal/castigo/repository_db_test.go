package castigo

import (
	"context"
	"os"
	"testing"
	"time"

	"gin-quickstart/backend/internal/platform/database"

	"github.com/google/uuid"
)

// Roda num Postgres de verdade (TEST_DATABASE_URL, banco descartável já com
// as migrations aplicadas): o SQL do repositório.
func TestRepositoryCastigo(t *testing.T) {
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
	userID, serverID := uuid.NewString(), uuid.NewString()
	name := "u" + userID[:8]
	if _, err := db.Exec(ctx, `INSERT INTO users (id, username, display_name, email, password_hash) VALUES ($1, $2::text, $2::text, $2::text || '@ex.com', 'x')`, userID, name); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(ctx, `INSERT INTO servers (id, name, owner_id) VALUES ($1, 'S', $2)`, serverID, userID); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		db.Exec(ctx, `DELETE FROM servers WHERE id = $1`, serverID)
		db.Exec(ctx, `DELETE FROM users WHERE id = $1`, userID)
	})

	repo := NewRepository(db)
	now := time.Now().UTC().Truncate(time.Microsecond)
	soon, past := now.Add(time.Minute), now.Add(-time.Minute)
	if err := repo.Save(ctx, Castigo{ServerID: serverID, UserID: userID, SpeakUntil: &past}); err != nil {
		t.Fatal(err)
	}
	if err := repo.Save(ctx, Castigo{ServerID: serverID, UserID: userID, ListenUntil: &soon}); err != nil {
		t.Fatal(err)
	}
	list, err := repo.Active(ctx, now)
	if err != nil || len(list) != 1 || list[0].SpeakUntil != nil || !list[0].ListenUntil.Equal(soon) {
		t.Fatalf("Active = %+v, %v", list, err)
	}
	if err := repo.DeleteExpired(ctx, soon); err != nil {
		t.Fatal(err)
	}
	if list, _ := repo.Active(ctx, past); len(list) != 0 {
		t.Errorf("vencido apagado: %+v", list)
	}
	if err := repo.Delete(ctx, serverID, userID); err != nil {
		t.Fatal(err)
	}
}
