package user

import (
	"context"
	"os"
	"strings"
	"testing"

	"gin-quickstart/backend/internal/platform/database"

	"github.com/google/uuid"
)

// Faixa e moldura num Postgres de verdade (TEST_DATABASE_URL, banco
// descartável): o modo acompanha a imagem própria e a faixa segue o banner.
func TestCosmeticsDB(t *testing.T) {
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
	id := uuid.NewString()
	name := "t" + strings.ReplaceAll(id, "-", "")[:12]
	if _, err := db.Exec(ctx, `INSERT INTO users (id, username, display_name, email, password_hash) VALUES ($1, $2::text, $2::text, $2::text || '@ex.com', 'x')`, id, name); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Exec(ctx, `DELETE FROM users WHERE id = $1`, id) })
	repo := UserRepository(db)
	str := func(s string) *string { return &s }

	u, err := repo.FindByID(ctx, id)
	if err != nil {
		t.Fatal(err)
	}
	if u.NameplateMode != "off" || u.NameplateURL != nil || u.AvatarDecorationURL != nil {
		t.Fatalf("padrão: modo %q, faixa %v, moldura %v", u.NameplateMode, u.NameplateURL, u.AvatarDecorationURL)
	}

	u, _, err = repo.SetNameplate(ctx, id, str("/api/profile-media/n"))
	if err != nil {
		t.Fatal(err)
	}
	if u.NameplateMode != "custom" || val(u.NameplateURL) != "/api/profile-media/n" {
		t.Errorf("depois do upload: modo %q, faixa %s", u.NameplateMode, val(u.NameplateURL))
	}

	if _, _, err := repo.SetBanner(ctx, id, str("/api/profile-media/b")); err != nil {
		t.Fatal(err)
	}
	u, err = repo.SetNameplateMode(ctx, id, "banner")
	if err != nil {
		t.Fatal(err)
	}
	if val(u.NameplateURL) != "/api/profile-media/b" || val(u.NameplateCustomURL) != "/api/profile-media/n" {
		t.Errorf("modo banner: faixa %s, própria %s", val(u.NameplateURL), val(u.NameplateCustomURL))
	}

	u, old, err := repo.SetNameplate(ctx, id, nil)
	if err != nil {
		t.Fatal(err)
	}
	if u.NameplateMode != "banner" || val(old) != "/api/profile-media/n" {
		t.Errorf("apagar no modo banner: modo %q, antiga %s", u.NameplateMode, val(old))
	}

	if _, _, err := repo.SetBanner(ctx, id, nil); err != nil {
		t.Fatal(err)
	}
	u, err = repo.FindByID(ctx, id)
	if err != nil {
		t.Fatal(err)
	}
	if u.NameplateURL != nil {
		t.Errorf("banner removido, faixa %s", val(u.NameplateURL))
	}

	u, _, err = repo.SetDecoration(ctx, id, str("/api/profile-media/a_d"))
	if err != nil {
		t.Fatal(err)
	}
	if val(u.AvatarDecorationURL) != "/api/profile-media/a_d" {
		t.Errorf("moldura %s", val(u.AvatarDecorationURL))
	}
	if p := u.Public("online"); val(p.AvatarDecorationURL) != "/api/profile-media/a_d" {
		t.Errorf("perfil público sem a moldura")
	}
}
