package cosmetics_test

import (
	"context"
	"encoding/json"
	"os"
	"strings"
	"testing"

	"gin-quickstart/backend/internal/conversation"
	"gin-quickstart/backend/internal/message"
	"gin-quickstart/backend/internal/platform/database"
	"gin-quickstart/backend/internal/role"
	"gin-quickstart/backend/internal/server"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Faixa e moldura chegam junto com as listas (membros do servidor, conversas
// e autor das mensagens), num Postgres de verdade (TEST_DATABASE_URL).
func TestListsCarryLookDB(t *testing.T) {
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
	styled := newUser(t, db, `nameplate_mode = 'banner', banner_url = '/api/profile-media/b', avatar_decoration_url = '/api/profile-media/a_d'`)
	plain := newUser(t, db, `nameplate_mode = 'off', banner_url = '/api/profile-media/x'`)

	t.Run("membros do servidor", func(t *testing.T) {
		repo := server.ServerRepository(db)
		srv := &server.Server{Name: "s", OwnerID: styled}
		if err := server.ServerService(repo, nil, role.RoleRepository(db)).Create(ctx, srv); err != nil {
			t.Fatal(err)
		}
		t.Cleanup(func() { db.Exec(ctx, `DELETE FROM servers WHERE id = $1`, srv.ID) })
		members, err := repo.ListMembers(ctx, srv.ID)
		if err != nil {
			t.Fatal(err)
		}
		var found bool
		for _, m := range members {
			if m.UserID == styled {
				found = true
				assertLook(t, m, "/api/profile-media/b", "/api/profile-media/a_d")
			}
		}
		if !found {
			t.Fatal("dono não está na lista de membros")
		}
		one, err := repo.FindMemberByUserID(ctx, srv.ID, styled)
		if err != nil {
			t.Fatal(err)
		}
		assertLook(t, one, "/api/profile-media/b", "/api/profile-media/a_d")
	})

	convID := uuid.NewString()
	repo := conversation.ConversationRepository(db)
	// A DM guarda o par em ordem (user_a_id < user_b_id).
	a, b := styled, plain
	if b < a {
		a, b = b, a
	}
	if err := repo.CreateDM(ctx, &conversation.Conversation{ID: convID, UserAID: a, UserBID: b}, plain); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Exec(ctx, `DELETE FROM conversations WHERE id = $1`, convID) })

	t.Run("participantes da conversa", func(t *testing.T) {
		members, err := repo.Members(ctx, convID)
		if err != nil {
			t.Fatal(err)
		}
		for _, m := range members {
			switch m.ID {
			case styled:
				assertLook(t, m, "/api/profile-media/b", "/api/profile-media/a_d")
			case plain:
				assertLook(t, m, "", "")
			}
		}
		list, err := repo.ListByUserID(ctx, plain)
		if err != nil {
			t.Fatal(err)
		}
		if len(list) == 0 {
			t.Fatal("conversa não aparece na lista")
		}
		for _, m := range list[0].Members {
			if m.ID == styled {
				assertLook(t, m, "/api/profile-media/b", "/api/profile-media/a_d")
			}
		}
	})

	t.Run("autor da mensagem", func(t *testing.T) {
		msgs := message.MessageRepository(db)
		msg := &message.Message{ID: uuid.NewString(), AuthorID: styled, ConversationID: &convID, Content: "oi"}
		if err := msgs.Create(ctx, msg); err != nil {
			t.Fatal(err)
		}
		list, err := msgs.ListByConversation(ctx, convID, 10, "")
		if err != nil {
			t.Fatal(err)
		}
		if len(list) != 1 || list[0].Author == nil {
			t.Fatalf("mensagens: %+v", list)
		}
		raw, _ := json.Marshal(list[0].Author)
		if !strings.Contains(string(raw), `"avatar_decoration_url":"/api/profile-media/a_d"`) {
			t.Errorf("autor sem a moldura: %s", raw)
		}
	})
}

func newUser(t *testing.T, db *pgxpool.Pool, set string) string {
	t.Helper()
	ctx := context.Background()
	id := uuid.NewString()
	name := "t" + strings.ReplaceAll(id, "-", "")[:12]
	if _, err := db.Exec(ctx, `INSERT INTO users (id, username, display_name, email, password_hash) VALUES ($1, $2::text, $2::text, $2::text || '@ex.com', 'x')`, id, name); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(ctx, `UPDATE users SET `+set+` WHERE id = $1`, id); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Exec(ctx, `DELETE FROM users WHERE id = $1`, id) })
	return id
}

// assertLook confere o JSON de quem embute o Look ("" = a chave não vem).
func assertLook(t *testing.T, v any, nameplate, decoration string) {
	t.Helper()
	raw, err := json.Marshal(v)
	if err != nil {
		t.Fatal(err)
	}
	var got map[string]any
	json.Unmarshal(raw, &got)
	check := func(key, want string) {
		value, ok := got[key]
		if want == "" {
			if ok {
				t.Errorf("%s não devia vir: %v", key, value)
			}
			return
		}
		if value != want {
			t.Errorf("%s = %v, quer %s", key, value, want)
		}
	}
	check("nameplate_url", nameplate)
	check("avatar_decoration_url", decoration)
}
