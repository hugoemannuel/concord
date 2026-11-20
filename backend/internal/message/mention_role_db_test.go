package message

import (
	"context"
	"os"
	"reflect"
	"strings"
	"testing"

	"gin-quickstart/backend/internal/platform/database"

	"github.com/google/uuid"
)

// Num Postgres de verdade (TEST_DATABASE_URL): os cargos pingados são gravados
// com a mensagem, voltam nas leituras e a edição só os tira.
func TestMentionRolesDB(t *testing.T) {
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
	exec := func(sql string, args ...any) {
		t.Helper()
		if _, err := db.Exec(ctx, sql, args...); err != nil {
			t.Fatal(err)
		}
	}
	author, serverID, channelID := uuid.NewString(), uuid.NewString(), uuid.NewString()
	name := "u" + strings.ReplaceAll(author, "-", "")[:12]
	exec(`INSERT INTO users (id, username, display_name, email, password_hash) VALUES ($1, $2::text, $2::text, $2::text || '@ex.com', 'x')`, author, name)
	t.Cleanup(func() {
		db.Exec(ctx, `DELETE FROM servers WHERE id = $1`, serverID)
		db.Exec(ctx, `DELETE FROM users WHERE id = $1`, author)
	})
	exec(`INSERT INTO servers (id, name, icon_url, owner_id) VALUES ($1, 's', '', $2)`, serverID, author)
	exec(`INSERT INTO channels (id, server_id, name, type, created_by, position) VALUES ($1, $2, 'geral', 'text', $3, 0)`, channelID, serverID, author)

	roles := []RoleMention{
		{ID: uuid.NewString(), Handle: "suporte"},
		{ID: uuid.NewString(), Handle: "equipe-de-suporte"},
	}
	repo := MessageRepository(db)
	pinga := &Message{ID: uuid.NewString(), AuthorID: author, ChannelID: &channelID, Content: "@suporte e @equipe-de-suporte", MentionRoles: roles}
	comum := &Message{ID: uuid.NewString(), AuthorID: author, ChannelID: &channelID, Content: "@suporte sem pingar"}
	for _, m := range []*Message{pinga, comum} {
		if err := repo.Create(ctx, m); err != nil {
			t.Fatal(err)
		}
	}

	rolesOf := func(id string) []RoleMention {
		t.Helper()
		got, err := repo.FindByID(ctx, id)
		if err != nil {
			t.Fatal(err)
		}
		return got.MentionRoles
	}
	if got := rolesOf(pinga.ID); !reflect.DeepEqual(got, roles) {
		t.Fatalf("gravado: got %v, want %v", got, roles)
	}
	if got := rolesOf(comum.ID); got != nil {
		t.Fatalf("mensagem sem cargo: got %v, want nil", got)
	}
	page, err := repo.ListByChannel(ctx, channelID, 10, "")
	if err != nil {
		t.Fatal(err)
	}
	byID := map[string][]RoleMention{}
	for _, m := range page {
		byID[m.ID] = m.MentionRoles
	}
	if !reflect.DeepEqual(byID[pinga.ID], roles) || byID[comum.ID] != nil {
		t.Fatalf("na listagem: %v", byID)
	}

	if err := repo.UpdateContent(ctx, pinga.ID, author, "só o @suporte", nil, roles[:1]); err != nil {
		t.Fatal(err)
	}
	if got := rolesOf(pinga.ID); !reflect.DeepEqual(got, roles[:1]) {
		t.Fatalf("depois de tirar um: got %v", got)
	}
	if err := repo.UpdateContent(ctx, pinga.ID, author, "nenhum", nil, nil); err != nil {
		t.Fatal(err)
	}
	if got := rolesOf(pinga.ID); got != nil {
		t.Fatalf("depois de tirar todos: got %v, want nil", got)
	}
}
