package channel

import (
	"context"
	"os"
	"testing"

	"gin-quickstart/backend/internal/platform/database"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

// O SQL dos canais num Postgres de verdade (TEST_DATABASE_URL, banco descartável
// já migrado): a marca de canal gerenciado, a lista e a ordem.

func channelDB(t *testing.T) (*pgxpool.Pool, context.Context) {
	t.Helper()
	url := os.Getenv("TEST_DATABASE_URL")
	if url == "" {
		t.Skip("TEST_DATABASE_URL não definido")
	}
	db, err := database.Connect(url)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(db.Close)
	return db, context.Background()
}

func seedServer(t *testing.T, db *pgxpool.Pool, ctx context.Context) (ownerID, serverID string) {
	t.Helper()
	ownerID, serverID = uuid.NewString(), uuid.NewString()
	for _, q := range []struct {
		sql  string
		args []any
	}{
		{`INSERT INTO users (id, username, display_name, email, password_hash) VALUES ($1, $2, $2, $3, 'x')`, []any{ownerID, "u" + ownerID[:8], ownerID[:8] + "@teste.dev"}},
		{`INSERT INTO servers (id, name, owner_id) VALUES ($1, 'Canais', $2)`, []any{serverID, ownerID}},
	} {
		if _, err := db.Exec(ctx, q.sql, q.args...); err != nil {
			t.Fatal(err)
		}
	}
	t.Cleanup(func() {
		_, _ = db.Exec(ctx, `DELETE FROM servers WHERE id = $1`, serverID)
		_, _ = db.Exec(ctx, `DELETE FROM users WHERE id = $1`, ownerID)
	})
	return ownerID, serverID
}

func TestRepositoryKeepsTheManagedFlag(t *testing.T) {
	db, ctx := channelDB(t)
	repo := ChannelRepository(db)
	owner, serverID := seedServer(t, db, ctx)

	add := func(name, kind string, managed bool) *Channel {
		ch := &Channel{ID: uuid.NewString(), ServerID: serverID, Name: name, Type: kind, CreatedBy: owner, Managed: managed}
		if err := repo.Create(ctx, ch, nil); err != nil {
			t.Fatal(err)
		}
		return ch
	}
	plain := add("geral", TypeText, false)
	room := add("evento-noite-chat", TypeText, true)
	voice := add("evento-noite", TypeVoice, true)

	if !room.Managed || plain.Managed {
		t.Fatalf("Create devolve a marca: comum=%v sala=%v", plain.Managed, room.Managed)
	}
	for _, c := range []struct {
		ch   *Channel
		want bool
	}{{plain, false}, {room, true}, {voice, true}} {
		got, err := repo.FindByID(ctx, c.ch.ID)
		if err != nil || got.Managed != c.want {
			t.Errorf("FindByID(%s): managed=%v err=%v, esperava %v", c.ch.Name, got != nil && got.Managed, err, c.want)
		}
	}
	list, err := repo.ListByServerID(ctx, serverID)
	if err != nil || len(list) != 3 {
		t.Fatalf("lista = %+v err=%v", list, err)
	}
	managed := map[string]bool{}
	for _, ch := range list {
		managed[ch.Name] = ch.Managed
	}
	if managed["geral"] || !managed["evento-noite-chat"] || !managed["evento-noite"] {
		t.Errorf("a lista tem que trazer a marca de cada canal: %v", managed)
	}
}

func TestRepositoryReorderChangesTheListOrder(t *testing.T) {
	db, ctx := channelDB(t)
	repo := ChannelRepository(db)
	owner, serverID := seedServer(t, db, ctx)
	var ids []string
	for _, name := range []string{"um", "dois", "tres"} {
		ch := &Channel{ID: uuid.NewString(), ServerID: serverID, Name: name, Type: TypeText, CreatedBy: owner}
		if err := repo.Create(ctx, ch, nil); err != nil {
			t.Fatal(err)
		}
		ids = append(ids, ch.ID)
	}
	order := func() []string {
		list, err := repo.ListByServerID(ctx, serverID)
		if err != nil {
			t.Fatal(err)
		}
		out := make([]string, 0, len(list))
		for _, ch := range list {
			out = append(out, ch.Name)
		}
		return out
	}
	if got := order(); got[0] != "um" || got[1] != "dois" || got[2] != "tres" {
		t.Fatalf("ordem de criação = %v", got)
	}
	if err := repo.Reorder(ctx, serverID, TypeText, []string{ids[2], ids[0], ids[1]}); err != nil {
		t.Fatal(err)
	}
	if got := order(); got[0] != "tres" || got[1] != "um" || got[2] != "dois" {
		t.Fatalf("depois de reordenar = %v", got)
	}
	if err := repo.Reorder(ctx, serverID, TypeText, []string{ids[0]}); err == nil {
		t.Fatal("ordem incompleta tem que ser recusada")
	}
}
