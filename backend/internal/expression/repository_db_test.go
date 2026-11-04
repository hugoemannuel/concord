package expression

import (
	"context"
	"errors"
	"os"
	"testing"

	"gin-quickstart/backend/internal/platform/database"

	"github.com/google/uuid"
)

// O SQL deste pacote num Postgres de verdade (TEST_DATABASE_URL, banco
// descartável e já migrado). O caminho completo, com mensagens e permissões,
// está em message/expressions_db_test.go.
func TestRepository(t *testing.T) {
	url := os.Getenv("TEST_DATABASE_URL")
	if url == "" {
		t.Skip("TEST_DATABASE_URL não definido")
	}
	ctx := context.Background()
	db, err := database.Connect(url)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(db.Close)
	exec := func(sql string, args ...any) {
		t.Helper()
		if _, err := db.Exec(ctx, sql, args...); err != nil {
			t.Fatalf("%s: %v", sql, err)
		}
	}

	ana, bia, alfa := uuid.NewString(), uuid.NewString(), uuid.NewString()
	emoji, sticker := uuid.NewString(), uuid.NewString()
	for _, id := range []string{ana, bia} {
		exec(`INSERT INTO users (id, username, display_name, email, password_hash) VALUES ($1, $2::text, $2::text, $2::text || '@ex.com', 'x')`, id, "u"+id[:8])
	}
	exec(`INSERT INTO servers (id, name, owner_id) VALUES ($1, 'Alfa', $2)`, alfa, ana)
	exec(`INSERT INTO server_members (server_id, user_id) VALUES ($1, $2)`, alfa, ana)
	exec(`INSERT INTO server_emojis (id, server_id, uploader_id, name, content_type, size_bytes) VALUES ($1, $2, $3, 'festa', 'image/png', 10)`, emoji, alfa, ana)
	exec(`INSERT INTO server_stickers (id, server_id, uploader_id, name, file_id, content_type, size_bytes) VALUES ($1, $2, $3, 'gato', $1, 'image/png', 10)`, sticker, alfa, ana)
	t.Cleanup(func() {
		db.Exec(ctx, `DELETE FROM deleted_emojis WHERE id = $1`, emoji)
		db.Exec(ctx, `DELETE FROM servers WHERE id = $1`, alfa)
		db.Exec(ctx, `DELETE FROM users WHERE id = ANY($1)`, []string{ana, bia})
	})
	repo := NewRepository(db)

	t.Run("ids inválidos não vão ao banco", func(t *testing.T) {
		refs, err := repo.EmojisByID(ctx, []string{"nem-uuid"})
		if err != nil || len(refs) != 0 {
			t.Fatalf("%v %v", err, refs)
		}
		rows, err := repo.VisibleEmojis(ctx, []string{"nem-uuid"}, ana)
		if err != nil || len(rows) != 0 {
			t.Fatalf("%v %v", err, rows)
		}
		names, err := repo.DeletedEmojis(ctx, []string{"nem-uuid"})
		if err != nil || len(names) != 0 {
			t.Fatalf("%v %v", err, names)
		}
		if _, err := repo.StickerServer(ctx, "nem-uuid"); !errors.Is(err, ErrUnknownSticker) {
			t.Fatalf("%v", err)
		}
	})

	t.Run("referências", func(t *testing.T) {
		refs, err := repo.EmojisByID(ctx, []string{emoji, uuid.NewString()})
		if err != nil || len(refs) != 1 || refs[emoji] != (EmojiRef{Name: "festa", ServerID: alfa}) {
			t.Fatalf("%v %+v", err, refs)
		}
		if got, err := repo.StickerServer(ctx, sticker); err != nil || got != alfa {
			t.Fatalf("%v %q", err, got)
		}
		if _, err := repo.StickerServer(ctx, uuid.NewString()); !errors.Is(err, ErrUnknownSticker) {
			t.Fatalf("%v", err)
		}
	})

	t.Run("só membro vê até publicar, e publicar não troca a data", func(t *testing.T) {
		for name, list := range map[string]func(context.Context, []string, string) ([]OriginRow, error){
			"emoji": repo.VisibleEmojis, "figurinha": repo.VisibleStickers,
		} {
			id := emoji
			if name == "figurinha" {
				id = sticker
			}
			rows, err := list(ctx, []string{id}, ana)
			if err != nil || len(rows) != 1 || !rows[0].Member || rows[0].ServerName != "Alfa" {
				t.Fatalf("%s, membro: %v %+v", name, err, rows)
			}
			if rows, err = list(ctx, []string{id}, bia); err != nil || len(rows) != 0 {
				t.Fatalf("%s, antes de publicar: %v %+v", name, err, rows)
			}
		}

		if err := repo.PublishEmojis(ctx, []string{emoji}); err != nil {
			t.Fatal(err)
		}
		if err := repo.PublishSticker(ctx, sticker); err != nil {
			t.Fatal(err)
		}
		rows, err := repo.VisibleEmojis(ctx, []string{emoji}, bia)
		if err != nil || len(rows) != 1 || rows[0].Member || rows[0].Name != "festa" {
			t.Fatalf("emoji publicado: %v %+v", err, rows)
		}
		rows, err = repo.VisibleStickers(ctx, []string{sticker}, bia)
		if err != nil || len(rows) != 1 || rows[0].Member || rows[0].Name != "gato" {
			t.Fatalf("figurinha publicada: %v %+v", err, rows)
		}

		var before, after string
		query := `SELECT published_at::text FROM server_emojis WHERE id = $1`
		if err := db.QueryRow(ctx, query, emoji).Scan(&before); err != nil {
			t.Fatal(err)
		}
		if err := repo.PublishEmojis(ctx, []string{emoji}); err != nil {
			t.Fatal(err)
		}
		if err := db.QueryRow(ctx, query, emoji).Scan(&after); err != nil || before != after {
			t.Fatalf("data mudou: %v %s %s", err, before, after)
		}
	})

	t.Run("sem pedir servidor nenhum, nenhum é privado", func(t *testing.T) {
		private, err := repo.PrivateServers(ctx, nil)
		if err != nil || len(private) != 0 {
			t.Fatalf("%v %v", err, private)
		}
	})

	t.Run("privados: o perfil do servidor (#528)", func(t *testing.T) {
		exec(`INSERT INTO server_profiles (server_id, private) VALUES ($1, TRUE)`, alfa)
		private, err := repo.PrivateServers(ctx, []string{alfa, uuid.NewString()})
		if err != nil || len(private) != 1 || !private[alfa] {
			t.Fatalf("%v %v", err, private)
		}
	})

	t.Run("apagado deixa o nome", func(t *testing.T) {
		exec(`DELETE FROM server_emojis WHERE id = $1`, emoji)
		names, err := repo.DeletedEmojis(ctx, []string{emoji})
		if err != nil || names[emoji] != "festa" {
			t.Fatalf("%v %v", err, names)
		}
		refs, err := repo.EmojisByID(ctx, []string{emoji})
		if err != nil || len(refs) != 0 {
			t.Fatalf("%v %v", err, refs)
		}
	})
}
