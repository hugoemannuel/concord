package apptheme

import (
	"context"
	"os"
	"testing"

	"gin-quickstart/backend/internal/platform/database"

	"github.com/google/uuid"
)

// Num Postgres de verdade (TEST_DATABASE_URL, já migrado): lê vazio, grava,
// troca a lista e some junto com a conta.
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
	if _, err := db.Exec(ctx, `INSERT INTO users (id, username, display_name, email, password_hash) VALUES ($1, $2::text, $2::text, $2::text || '@ex.com', 'x')`, userID, "t"+userID[:8]); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Exec(ctx, `DELETE FROM users WHERE id = $1`, userID) })
	repo := NewRepository(db)

	got, err := repo.Themes(ctx, userID)
	if err != nil || got == nil || len(got) != 0 {
		t.Fatalf("vazio = %v, %v", got, err)
	}
	first := []Theme{{ID: "a1", Name: "Rubro", Accent: "#e11d48", Background: "#2a0a0a", Sidebar: "#1f0707", Card: "#3b0d0d", Text: "#ffffff", Glow: "#dc2626"}}
	if err := repo.SaveThemes(ctx, userID, first); err != nil {
		t.Fatal(err)
	}
	second := append(first, Theme{ID: "b2", Name: "Claro", Accent: "#5865f2", Background: "#ffffff", Sidebar: "#fbfbfb", Card: "#ffffff", Text: "#2e2e34"})
	if err := repo.SaveThemes(ctx, userID, second); err != nil {
		t.Fatal(err)
	}
	got, err = repo.Themes(ctx, userID)
	if err != nil || len(got) != 2 || got[0] != second[0] || got[1] != second[1] {
		t.Fatalf("lista = %+v, %v", got, err)
	}

	if _, err := db.Exec(ctx, `DELETE FROM users WHERE id = $1`, userID); err != nil {
		t.Fatal(err)
	}
	var left int
	if err := db.QueryRow(ctx, `SELECT count(*) FROM user_app_themes WHERE user_id = $1`, userID).Scan(&left); err != nil || left != 0 {
		t.Fatalf("sobrou %d, %v", left, err)
	}
}
