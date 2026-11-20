package notifysettings

import (
	"context"
	"os"
	"reflect"
	"testing"

	"gin-quickstart/backend/internal/platform/database"

	"github.com/google/uuid"
)

// Num Postgres de verdade (TEST_DATABASE_URL): AllFor devolve, para cada
// pessoa, exatamente o que All devolveria (e o padrão para quem não gravou).
func TestDBAllForMatchesAllPerUser(t *testing.T) {
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
			t.Fatal(err)
		}
	}
	newUser := func() string {
		id := uuid.NewString()
		exec(`INSERT INTO users (id, username, display_name, email, password_hash) VALUES ($1, $2::text, $2::text, $2::text || '@ex.com', 'x')`, id, "n"+id[:8])
		t.Cleanup(func() { db.Exec(ctx, `DELETE FROM users WHERE id = $1`, id) })
		return id
	}
	ana, bia, caio := newUser(), newUser(), newUser()
	serverID, channelID := uuid.NewString(), uuid.NewString()
	exec(`INSERT INTO servers (id, name, owner_id) VALUES ($1, 'S', $2)`, serverID, ana)
	t.Cleanup(func() { db.Exec(ctx, `DELETE FROM servers WHERE id = $1`, serverID) })
	exec(`INSERT INTO channels (id, server_id, name, type, created_by, position, is_system) VALUES ($1, $2, 'geral', 'text', $3, 0, false)`, channelID, serverID, ana)

	repo := NotifySettingsRepository(db)
	if err := repo.SetServer(ctx, ana, serverID, Settings{Level: LevelMentions, SuppressEveryone: true, SuppressRoles: true}); err != nil {
		t.Fatal(err)
	}
	if err := repo.SetChannel(ctx, ana, channelID, Settings{Muted: true, Level: LevelAll}); err != nil {
		t.Fatal(err)
	}
	if err := repo.SetChannel(ctx, bia, channelID, Settings{Level: LevelNothing}); err != nil {
		t.Fatal(err)
	}

	batch, err := repo.AllFor(ctx, []string{ana, bia, caio})
	if err != nil {
		t.Fatal(err)
	}
	if got := batch[ana].Servers[serverID]; !got.SuppressRoles || !got.SuppressEveryone {
		t.Fatalf("preferências da Ana no servidor: %+v", got)
	}
	for _, id := range []string{ana, bia, caio} {
		one, err := repo.All(ctx, id)
		if err != nil {
			t.Fatal(err)
		}
		if !reflect.DeepEqual(batch[id], one) {
			t.Fatalf("%s: AllFor = %+v, All = %+v", id, batch[id], one)
		}
	}
}
