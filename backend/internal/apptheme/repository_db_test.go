package apptheme

import (
	"context"
	"os"
	"reflect"
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
	// O segundo já no formato v2: degradês, vidro e forma passam pelo JSONB.
	v2, _ := Normalize([]Theme{{ID: "b2", Name: "Claro", Accent: "#5865f2", Background: "#ffffff", Sidebar: "#fbfbfb", Card: "#ffffff", Text: "#2e2e34",
		Gradients: map[string]Gradient{"accent": {Type: "linear", Angle: 135, Colors: []string{"#991b1b"}}}, Glass: intp(30), Font: "serif"}})
	second := append(first, v2[0])
	if err := repo.SaveThemes(ctx, userID, second); err != nil {
		t.Fatal(err)
	}
	got, err = repo.Themes(ctx, userID)
	if err != nil || !reflect.DeepEqual(got, second) {
		t.Fatalf("lista = %+v, %v", got, err)
	}

	// v3: a faxina das imagens acha os temas que usam imagem de fundo.
	img := "/api/app-theme-images/" + uuid.NewString()
	v3, _ := Normalize([]Theme{{ID: "c3", Name: "Foto", Accent: "#5865f2", Background: "#101010", Sidebar: "#0c0c0c", Card: "#181818", Text: "#ffffff",
		Effect: "snow", Image: img, ImageDim: intp(60)}})
	if err := repo.SaveThemes(ctx, userID, append(second, v3[0])); err != nil {
		t.Fatal(err)
	}
	withImages, err := repo.ThemesWithImages(ctx)
	if err != nil || !hasImage(withImages, img) {
		t.Fatalf("temas com imagem = %+v, %v", withImages, err)
	}

	if _, err := db.Exec(ctx, `DELETE FROM users WHERE id = $1`, userID); err != nil {
		t.Fatal(err)
	}
	var left int
	if err := db.QueryRow(ctx, `SELECT count(*) FROM user_app_themes WHERE user_id = $1`, userID).Scan(&left); err != nil || left != 0 {
		t.Fatalf("sobrou %d, %v", left, err)
	}
}

func hasImage(themes []Theme, url string) bool {
	for _, t := range themes {
		if t.Image == url {
			return true
		}
	}
	return false
}
