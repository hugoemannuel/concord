package cosmetics

import (
	"context"
	"os"
	"strings"
	"testing"

	"gin-quickstart/backend/internal/platform/database"

	"github.com/google/uuid"
)

// A URL efetiva da faixa num Postgres de verdade (TEST_DATABASE_URL, banco
// descartável): cada modo e o banner que falta.
func TestLookDB(t *testing.T) {
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

	str := func(s string) *string { return &s }
	cases := []struct {
		name       string
		mode       string
		banner     *string
		custom     *string
		decoration *string
		want       *string
	}{
		{"desligada com banner", "off", str("/api/profile-media/b"), nil, nil, nil},
		{"banner", "banner", str("/api/profile-media/b"), nil, nil, str("/api/profile-media/b")},
		{"banner sem banner", "banner", nil, str("/api/profile-media/n"), nil, nil},
		{"própria", "custom", str("/api/profile-media/b"), str("/api/profile-media/n"), str("/api/profile-media/d"), str("/api/profile-media/n")},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			if _, err := db.Exec(ctx, `UPDATE users SET nameplate_mode = $2, banner_url = $3, nameplate_url = $4, avatar_decoration_url = $5 WHERE id = $1`,
				id, c.mode, c.banner, c.custom, c.decoration); err != nil {
				t.Fatal(err)
			}
			var got Look
			if err := db.QueryRow(ctx, `SELECT `+Expr("u")+` FROM users u WHERE u.id = $1`, id).Scan(&got); err != nil {
				t.Fatal(err)
			}
			if !same(got.NameplateURL, c.want) {
				t.Errorf("NameplateURL = %v, quer %v", deref(got.NameplateURL), deref(c.want))
			}
			if !same(got.AvatarDecorationURL, c.decoration) {
				t.Errorf("AvatarDecorationURL = %v, quer %v", deref(got.AvatarDecorationURL), deref(c.decoration))
			}
		})
	}
}

func same(a, b *string) bool {
	if a == nil || b == nil {
		return a == b
	}
	return *a == *b
}

func deref(s *string) string {
	if s == nil {
		return "<nil>"
	}
	return *s
}
