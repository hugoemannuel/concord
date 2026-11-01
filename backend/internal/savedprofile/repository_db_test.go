package savedprofile

import (
	"context"
	"errors"
	"os"
	"strings"
	"testing"

	"gin-quickstart/backend/internal/namestyle"
	"gin-quickstart/backend/internal/platform/database"
	"gin-quickstart/backend/internal/profiletheme"
	"gin-quickstart/backend/internal/user"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Perfis salvos num Postgres de verdade (TEST_DATABASE_URL, banco
// descartável): limite, nome único, dono, mídia em uso e aplicar de volta.
func openDB(t *testing.T) *pgxpool.Pool {
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
	if err := database.Migrate(db, "../../migrations"); err != nil {
		t.Fatal(err)
	}
	return db
}

func newDBUser(t *testing.T, db *pgxpool.Pool) string {
	t.Helper()
	ctx := context.Background()
	id := uuid.NewString()
	name := "t" + strings.ReplaceAll(id, "-", "")[:12]
	if _, err := db.Exec(ctx, `INSERT INTO users (id, username, display_name, email, password_hash) VALUES ($1, $2::text, $2::text, $2::text || '@ex.com', 'x')`, id, name); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Exec(ctx, `DELETE FROM users WHERE id = $1`, id) })
	return id
}

func TestRepositoryDB(t *testing.T) {
	db := openDB(t)
	ctx := context.Background()
	repo := NewRepository(db)
	me, other := newDBUser(t, db), newDBUser(t, db)

	a, color := avatarA, "#112233"
	style := namestyle.Default()
	theme := profiletheme.Default()
	snap := user.ProfileSnapshot{
		Fields:    user.ProfileInput{DisplayName: "Mugis", BannerColor: &color, Links: []user.ProfileLink{{URL: "https://x.com"}}, NameStyle: &style, ProfileTheme: &theme},
		AvatarURL: &a,
	}
	sp, err := repo.Create(ctx, me, "Gamer", snap)
	if err != nil {
		t.Fatal(err)
	}
	got, err := repo.Find(ctx, me, sp.ID)
	if err != nil {
		t.Fatal(err)
	}
	if got.Fields.DisplayName != "Mugis" || *got.Fields.BannerColor != color || got.Fields.ProfileTheme == nil || *got.AvatarURL != a || got.BannerURL != nil {
		t.Fatalf("lido = %+v", got)
	}

	if _, err := repo.Create(ctx, me, "GAMER", snap); !errors.Is(err, ErrNameTaken) {
		t.Fatalf("nome repetido: %v", err)
	}
	if _, err := repo.Create(ctx, other, "Gamer", snap); err != nil {
		t.Fatalf("outra pessoa pode usar o mesmo nome: %v", err)
	}
	if _, err := repo.Find(ctx, other, sp.ID); !errors.Is(err, ErrNotFound) {
		t.Fatalf("de outra pessoa: %v", err)
	}
	if _, err := repo.Create(ctx, uuid.NewString(), "x", snap); !errors.Is(err, user.ErrUserNotFound) {
		t.Fatalf("conta que não existe: %v", err)
	}

	used, err := repo.MediaInUse(ctx, a)
	if err != nil || !used {
		t.Fatalf("avatar em uso = %v, %v", used, err)
	}
	if used, _ := repo.MediaInUse(ctx, avatarB); used {
		t.Fatal("ninguém usa o avatar B")
	}

	for i := 1; i < MaxPerUser; i++ {
		if _, err := repo.Create(ctx, me, "p"+string(rune('a'+i)), snap); err != nil {
			t.Fatal(err)
		}
	}
	if _, err := repo.Create(ctx, me, "um a mais", snap); !errors.Is(err, ErrLimit) {
		t.Fatalf("limite: %v", err)
	}
	list, err := repo.List(ctx, me)
	if err != nil || len(list) != MaxPerUser || list[0].ID != sp.ID {
		t.Fatalf("lista = %d, %v", len(list), err)
	}

	if _, err := repo.Rename(ctx, me, sp.ID, "pb"); !errors.Is(err, ErrNameTaken) {
		t.Fatalf("renomear para nome usado: %v", err)
	}
	if r, err := repo.Rename(ctx, me, sp.ID, "Novo"); err != nil || r.Name != "Novo" {
		t.Fatalf("renomear = %+v, %v", r, err)
	}
	if _, err := repo.Rename(ctx, other, sp.ID, "x"); !errors.Is(err, ErrNotFound) {
		t.Fatalf("renomear de outra pessoa: %v", err)
	}
	checkOverwriteDB(t, repo, me, other, sp.ID)
	if _, err := repo.Delete(ctx, other, sp.ID); !errors.Is(err, ErrNotFound) {
		t.Fatalf("excluir de outra pessoa: %v", err)
	}
	if gone, err := repo.Delete(ctx, me, sp.ID); err != nil || gone.ID != sp.ID {
		t.Fatalf("excluir = %+v, %v", gone, err)
	}
}

// Aplicar pelo user.Repository troca campos, avatar e banner de uma vez.
func TestApplySnapshotDB(t *testing.T) {
	db := openDB(t)
	ctx := context.Background()
	me := newDBUser(t, db)
	users := user.UserRepository(db)
	b := avatarB
	if _, _, err := users.SetAvatar(ctx, me, &b); err != nil {
		t.Fatal(err)
	}

	a := avatarA
	style := namestyle.Style{Font: "default", Effect: "solid", Colors: []string{}}
	theme := profiletheme.Default()
	theme.Border = "neon"
	theme.BorderColors = []string{"#00ffaa"}
	u, old, err := users.ApplySnapshot(ctx, me, user.ProfileSnapshot{
		Fields:    user.ProfileInput{DisplayName: "Outro", Bio: "oi", Links: []user.ProfileLink{}, NameStyle: &style, ProfileTheme: &theme},
		AvatarURL: &a,
	})
	if err != nil {
		t.Fatal(err)
	}
	if u.DisplayName != "Outro" || u.Bio != "oi" || *u.AvatarURL != a || u.BannerURL != nil || u.ProfileTheme.Border != "neon" {
		t.Fatalf("usuário = %+v", u)
	}
	if len(old) != 2 || *old[0] != b || old[1] != nil {
		t.Fatalf("antigas = %v", old)
	}
	if _, _, err := users.ApplySnapshot(ctx, uuid.NewString(), user.ProfileSnapshot{}); err == nil {
		t.Fatal("conta que não existe deveria falhar")
	}
}

// Sobrescrever troca o snapshot, mantém nome e posição e devolve o anterior.
func checkOverwriteDB(t *testing.T, repo *Repository, me, other, id string) {
	t.Helper()
	ctx := context.Background()
	b := avatarB
	snap := user.ProfileSnapshot{Fields: user.ProfileInput{DisplayName: "Novo", Links: []user.ProfileLink{}}, AvatarURL: &b}
	got, old, err := repo.Overwrite(ctx, me, id, snap)
	if err != nil {
		t.Fatal(err)
	}
	if got.Name != "Novo" || got.Fields.DisplayName != "Novo" || *got.AvatarURL != avatarB || got.BannerURL != nil {
		t.Fatalf("novo = %+v", got)
	}
	if old.Fields.DisplayName != "Mugis" || *old.AvatarURL != avatarA {
		t.Fatalf("anterior = %+v", old)
	}
	if list, _ := repo.List(ctx, me); list[0].ID != id {
		t.Fatal("a posição na lista deve ficar")
	}
	if _, _, err := repo.Overwrite(ctx, other, id, snap); !errors.Is(err, ErrNotFound) {
		t.Fatalf("de outra pessoa: %v", err)
	}
}
