package giphy

import (
	"context"
	"os"
	"strings"
	"testing"

	"gin-quickstart/backend/internal/platform/database"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Estes testes rodam num Postgres de verdade (TEST_DATABASE_URL, banco
// descartável e já migrado: o teste não roda as migrations).

func favoritesDB(t *testing.T) (*FavoriteRepository, *pgxpool.Pool, string) {
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
	id := uuid.NewString()
	name := "u" + strings.ReplaceAll(id, "-", "")[:10]
	_, err = db.Exec(context.Background(), `INSERT INTO users (id, username, display_name, email, password_hash) VALUES ($1, $2::text, $2::text, $2::text || '@ex.com', 'x')`, id, name)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Exec(context.Background(), `DELETE FROM users WHERE id = $1`, id) })
	return NewFavoriteRepository(db), db, id
}

func ids(gifs []GIFItem) string {
	out := make([]string, len(gifs))
	for i, g := range gifs {
		out[i] = g.ID
	}
	return strings.Join(out, ",")
}

func TestFavoritosNoBancoOrdemAtualizacaoELimite(t *testing.T) {
	repo, db, user := favoritesDB(t)
	ctx := context.Background()
	gif := func(id, title string) GIFItem {
		return GIFItem{ID: id, Title: title, URL: "https://media.giphy.com/" + id + ".gif", PreviewURL: "https://media.giphy.com/" + id + "_s.gif", Width: 10, Height: 20}
	}
	for _, id := range []string{"a", "b"} {
		if err := repo.AddFavorite(ctx, user, gif(id, "t"), 2); err != nil {
			t.Fatalf("AddFavorite %s: %v", id, err)
		}
		// created_at = NOW() é o da transação; separa os dois para a ordem ser determinística.
		db.Exec(ctx, `UPDATE gif_favorites SET created_at = created_at + interval '1 second' * (ascii(gif_id) - 97) WHERE user_id = $1`, user)
	}
	if got, _ := repo.ListFavorites(ctx, user); ids(got) != "b,a" {
		t.Fatalf("ordem = %q, quer b,a (mais novo primeiro)", ids(got))
	}
	// Favoritar de novo atualiza os dados, mesmo no limite, sem mudar a ordem.
	if err := repo.AddFavorite(ctx, user, gif("a", "novo"), 2); err != nil {
		t.Fatalf("refavoritar no limite: %v", err)
	}
	got, _ := repo.ListFavorites(ctx, user)
	if ids(got) != "b,a" || got[1].Title != "novo" || got[1].Width != 10 {
		t.Fatalf("lista = %+v", got)
	}
	if err := repo.AddFavorite(ctx, user, gif("c", "t"), 2); err != ErrFavoritesFull {
		t.Fatalf("acima do limite: err = %v, quer ErrFavoritesFull", err)
	}
	if err := repo.RemoveFavorite(ctx, user, "a"); err != nil {
		t.Fatal(err)
	}
	if err := repo.RemoveFavorite(ctx, user, "nao-existe"); err != nil {
		t.Fatalf("remover o que não estava: %v", err)
	}
	if got, _ := repo.ListFavorites(ctx, user); ids(got) != "b" {
		t.Fatalf("depois de remover = %q, quer b", ids(got))
	}
	// Apagar o usuário leva os favoritos junto.
	db.Exec(ctx, `DELETE FROM users WHERE id = $1`, user)
	var n int
	db.QueryRow(ctx, `SELECT COUNT(*) FROM gif_favorites WHERE user_id = $1`, user).Scan(&n)
	if n != 0 {
		t.Fatalf("sobraram %d favoritos de usuário apagado", n)
	}
}
