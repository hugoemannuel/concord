package conversation

import (
	"context"
	"encoding/json"
	"os"
	"slices"
	"strings"
	"testing"

	"gin-quickstart/backend/internal/platform/database"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Participantes num Postgres de verdade (TEST_DATABASE_URL): ids, dados de
// cada um e a lista de conversas, com a faixa e a moldura (#482).
func TestMembersDB(t *testing.T) {
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
	styled := newTestUser(t, db, `nameplate_mode = 'custom', nameplate_url = '/api/profile-media/n', avatar_decoration_url = '/api/profile-media/d'`)
	plain := newTestUser(t, db, `nameplate_mode = 'off'`)
	a, b := styled, plain
	if b < a {
		a, b = b, a
	}
	repo := ConversationRepository(db)
	conv := &Conversation{ID: uuid.NewString(), UserAID: a, UserBID: b}
	if err := repo.CreateDM(ctx, conv, styled); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Exec(ctx, `DELETE FROM conversations WHERE id = $1`, conv.ID) })

	ids, err := repo.ConversationParticipantIDs(ctx, conv.ID)
	if err != nil {
		t.Fatal(err)
	}
	slices.Sort(ids)
	if !slices.Equal(ids, []string{a, b}) {
		t.Errorf("participantes = %v, quer %v", ids, []string{a, b})
	}

	members, err := repo.Members(ctx, conv.ID)
	if err != nil {
		t.Fatal(err)
	}
	if len(members) != 2 {
		t.Fatalf("%d membros, quer 2", len(members))
	}
	for _, m := range members {
		checkLook(t, m, m.ID == styled)
	}

	list, err := repo.ListByUserID(ctx, styled)
	if err != nil {
		t.Fatal(err)
	}
	if len(list) != 1 || len(list[0].Members) != 2 {
		t.Fatalf("lista de conversas: %+v", list)
	}
	for _, m := range list[0].Members {
		checkLook(t, m, m.ID == styled)
	}
}

func newTestUser(t *testing.T, db *pgxpool.Pool, set string) string {
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

// checkLook: quem tem faixa e moldura manda as duas; quem não tem, nenhuma.
func checkLook(t *testing.T, m OtherUser, styled bool) {
	t.Helper()
	raw, _ := json.Marshal(m)
	has := strings.Contains(string(raw), `"nameplate_url":"/api/profile-media/n"`) &&
		strings.Contains(string(raw), `"avatar_decoration_url":"/api/profile-media/d"`)
	none := !strings.Contains(string(raw), "nameplate_url") && !strings.Contains(string(raw), "avatar_decoration_url")
	if (styled && !has) || (!styled && !none) {
		t.Errorf("membro %s (com faixa: %v): %s", m.ID, styled, raw)
	}
}
