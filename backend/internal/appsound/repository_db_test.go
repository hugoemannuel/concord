package appsound

import (
	"context"
	"os"
	"testing"

	"gin-quickstart/backend/internal/platform/database"

	"github.com/google/uuid"
)

// Num Postgres de verdade (TEST_DATABASE_URL, já migrado): grava, troca e
// apaga escolhas e áudios próprios.
func TestDBRepository(t *testing.T) {
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
	userID := uuid.NewString()
	if _, err := db.Exec(ctx, `INSERT INTO users (id, username, display_name, email, password_hash) VALUES ($1, $2::text, $2::text, $2::text || '@ex.com', 'x')`, userID, "s"+userID[:8]); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Exec(ctx, `DELETE FROM users WHERE id = $1`, userID) })
	repo := NewRepository(db)

	got, err := repo.Settings(ctx, userID)
	if err != nil || got.Pack != DefaultPack || got.Volume != DefaultVolume || got.Events == nil {
		t.Fatalf("padrão = %+v, %v", got, err)
	}
	want := Settings{Pack: "cristal", Volume: 180, Events: map[string]string{"mute": "off", "mention": "custom"}}
	if err := repo.SaveSettings(ctx, userID, want); err != nil {
		t.Fatal(err)
	}
	want.Volume = 40
	if err := repo.SaveSettings(ctx, userID, want); err != nil {
		t.Fatal(err)
	}
	got, err = repo.Settings(ctx, userID)
	if err != nil || got.Pack != "cristal" || got.Volume != 40 || got.Events["mute"] != "off" || got.Events["mention"] != "custom" {
		t.Fatalf("salvo = %+v, %v", got, err)
	}

	first, second := uuid.NewString(), uuid.NewString()
	if old, err := repo.SetFile(ctx, userID, "mention", first, 900); err != nil || old != "" {
		t.Fatalf("primeiro envio: old = %q, %v", old, err)
	}
	if old, err := repo.SetFile(ctx, userID, "mention", second, 900); err != nil || old != first {
		t.Fatalf("troca: old = %q, quer %q (%v)", old, first, err)
	}
	files, err := repo.Files(ctx, userID)
	if err != nil || len(files) != 1 || files["mention"] != second {
		t.Fatalf("arquivos = %v, %v", files, err)
	}
	if old, err := repo.RemoveFile(ctx, userID, "mention"); err != nil || old != second {
		t.Fatalf("remover: old = %q, %v", old, err)
	}
	if old, err := repo.RemoveFile(ctx, userID, "mention"); err != nil || old != "" {
		t.Fatalf("remover de novo: old = %q, %v", old, err)
	}
}
