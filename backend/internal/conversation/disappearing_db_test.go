package conversation

import (
	"context"
	"os"
	"testing"

	"gin-quickstart/backend/internal/platform/database"

	"github.com/google/uuid"
)

// A coluna disappearing_seconds chega em Conversation: NULL vira nil (desativado)
// e um prazo gravado volta como ponteiro para o valor.
func TestConversationLeDisappearingSeconds(t *testing.T) {
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
	a, b := newTestUser(t, db, `nameplate_mode = 'off'`), newTestUser(t, db, `nameplate_mode = 'off'`)
	if b < a {
		a, b = b, a
	}
	repo := ConversationRepository(db)
	conv := &Conversation{ID: uuid.NewString(), UserAID: a, UserBID: b}
	if err := repo.CreateDM(ctx, conv, a); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Exec(ctx, `DELETE FROM conversations WHERE id = $1`, conv.ID) })

	got, err := repo.FindByID(ctx, conv.ID)
	if err != nil {
		t.Fatal(err)
	}
	if got.DisappearingSeconds != nil {
		t.Fatalf("sem prazo: esperava nil, veio %d", *got.DisappearingSeconds)
	}

	if _, err := db.Exec(ctx, `UPDATE conversations SET disappearing_seconds = 604800 WHERE id = $1`, conv.ID); err != nil {
		t.Fatal(err)
	}
	got, err = repo.FindByID(ctx, conv.ID)
	if err != nil {
		t.Fatal(err)
	}
	if got.DisappearingSeconds == nil || *got.DisappearingSeconds != 604800 {
		t.Fatalf("esperava 604800, veio %v", got.DisappearingSeconds)
	}
}

// SetDisappearing grava o prazo e nil volta a coluna para NULL (desativado).
func TestSetDisappearingGrava(t *testing.T) {
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
	a, b := newTestUser(t, db, `nameplate_mode = 'off'`), newTestUser(t, db, `nameplate_mode = 'off'`)
	if b < a {
		a, b = b, a
	}
	repo := ConversationRepository(db)
	conv := &Conversation{ID: uuid.NewString(), UserAID: a, UserBID: b}
	if err := repo.CreateDM(ctx, conv, a); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Exec(ctx, `DELETE FROM conversations WHERE id = $1`, conv.ID) })

	week := 604800
	if err := repo.SetDisappearing(ctx, conv.ID, &week); err != nil {
		t.Fatal(err)
	}
	got, err := repo.FindByID(ctx, conv.ID)
	if err != nil {
		t.Fatal(err)
	}
	if got.DisappearingSeconds == nil || *got.DisappearingSeconds != week {
		t.Fatalf("esperava 604800, veio %v", got.DisappearingSeconds)
	}

	if err := repo.SetDisappearing(ctx, conv.ID, nil); err != nil {
		t.Fatal(err)
	}
	got, err = repo.FindByID(ctx, conv.ID)
	if err != nil {
		t.Fatal(err)
	}
	if got.DisappearingSeconds != nil {
		t.Fatalf("esperava nil, veio %d", *got.DisappearingSeconds)
	}
}
