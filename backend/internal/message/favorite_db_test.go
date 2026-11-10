package message

import (
	"context"
	"errors"
	"os"
	"sort"
	"strings"
	"testing"

	"gin-quickstart/backend/internal/platform/database"

	"github.com/google/uuid"
)

// Num Postgres de verdade (TEST_DATABASE_URL): favoritos de canal e de DM, a
// origem de cada um, o limite e a mensagem apagada que some da lista.
func TestFavoritasNoBanco(t *testing.T) {
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
	if err := database.Migrate(db, "../../migrations"); err != nil {
		t.Fatal(err)
	}
	exec := func(sql string, args ...any) {
		t.Helper()
		if _, err := db.Exec(ctx, sql, args...); err != nil {
			t.Fatalf("%s: %v", sql, err)
		}
	}
	suffix := strings.ReplaceAll(uuid.NewString(), "-", "")[:8]
	ana, caio := uuid.NewString(), uuid.NewString()
	for id, name := range map[string]string{ana: "ana", caio: "caio"} {
		exec(`INSERT INTO users (id, username, display_name, email, password_hash) VALUES ($1, $2::text, $2::text, $2::text || '@ex.com', 'x')`, id, name+suffix)
	}
	serverID, geral, convID := uuid.NewString(), uuid.NewString(), uuid.NewString()
	t.Cleanup(func() {
		db.Exec(ctx, `DELETE FROM servers WHERE id = $1`, serverID)
		db.Exec(ctx, `DELETE FROM conversations WHERE id = $1`, convID)
		db.Exec(ctx, `DELETE FROM messages WHERE author_id = ANY($1)`, []string{ana, caio})
		db.Exec(ctx, `DELETE FROM users WHERE id = ANY($1)`, []string{ana, caio})
	})
	exec(`INSERT INTO servers (id, name, icon_url, owner_id) VALUES ($1, 'Salinha', '', $2)`, serverID, ana)
	exec(`INSERT INTO channels (id, server_id, name, type, created_by, position) VALUES ($1, $2, 'geral', 'text', $3, 0)`, geral, serverID, ana)
	pair := []string{ana, caio}
	sort.Strings(pair)
	exec(`INSERT INTO conversations (id, user_a_id, user_b_id) VALUES ($1, $2, $3)`, convID, pair[0], pair[1])

	noCanal, naDM, apagada := uuid.NewString(), uuid.NewString(), uuid.NewString()
	exec(`INSERT INTO messages (id, author_id, channel_id, content) VALUES ($1, $2, $3, 'no canal')`, noCanal, caio, geral)
	exec(`INSERT INTO messages (id, author_id, conversation_id, content) VALUES ($1, $2, $3, 'na dm')`, naDM, caio, convID)
	exec(`INSERT INTO messages (id, author_id, channel_id, content) VALUES ($1, $2, $3, 'vai sumir')`, apagada, caio, geral)

	repo := MessageRepository(db)
	for _, id := range []string{noCanal, naDM, apagada} {
		if err := repo.AddFavorite(ctx, ana, id, 3); err != nil {
			t.Fatalf("AddFavorite: %v", err)
		}
		// NOW() é o da transação: separa para a ordem ser determinística.
		exec(`UPDATE message_favorites SET created_at = created_at - interval '1 minute' WHERE user_id = $1 AND message_id <> $2`, ana, id)
	}
	if err := repo.AddFavorite(ctx, ana, noCanal, 3); err != nil {
		t.Errorf("favoritar de novo no limite = %v, quer nil", err)
	}
	extra := uuid.NewString()
	exec(`INSERT INTO messages (id, author_id, channel_id, content) VALUES ($1, $2, $3, 'extra')`, extra, caio, geral)
	if err := repo.AddFavorite(ctx, ana, extra, 3); !errors.Is(err, ErrFavoritesFull) {
		t.Errorf("acima do limite = %v, quer ErrFavoritesFull", err)
	}

	exec(`DELETE FROM messages WHERE id = $1`, apagada)

	favs, err := repo.ListFavorites(ctx, ana)
	if err != nil {
		t.Fatalf("ListFavorites: %v", err)
	}
	if len(favs) != 2 || favs[0].MessageID != naDM || favs[1].MessageID != noCanal {
		t.Fatalf("favoritos = %+v, quer [dm, canal] (a apagada some)", favs)
	}
	dm := favs[0].Origin
	if dm.ConversationType != "dm" || dm.DMUser == nil || dm.DMUser.ID != caio || dm.ServerID != "" {
		t.Errorf("origem da DM = %+v, quer dm com o caio", dm)
	}
	canal := favs[1].Origin
	if canal.ServerID != serverID || canal.ServerName != "Salinha" || canal.ChannelName != "geral" || canal.DMUser != nil {
		t.Errorf("origem do canal = %+v, quer Salinha/geral", canal)
	}
	if favs[1].Message.Content != "no canal" || favs[1].Message.Author.ID == "" {
		t.Errorf("mensagem = %+v, quer o conteúdo e o autor", favs[1].Message)
	}
	if err := repo.AttachDetails(ctx, []Message{*favs[1].Message}); err != nil {
		t.Errorf("AttachDetails: %v", err)
	}

	if fav, err := repo.FindFavorite(ctx, ana, noCanal); err != nil || fav.Origin.ChannelName != "geral" {
		t.Errorf("FindFavorite = %+v, %v", fav, err)
	}
	if _, err := repo.FindFavorite(ctx, caio, noCanal); !errors.Is(err, ErrMessageNotFound) {
		t.Errorf("favorito de outra pessoa = %v, quer ErrMessageNotFound", err)
	}

	if err := repo.RemoveFavorite(ctx, ana, naDM); err != nil {
		t.Fatalf("RemoveFavorite: %v", err)
	}
	if ids, _ := repo.FavoriteIDs(ctx, ana); len(ids) != 1 || ids[0] != noCanal {
		t.Errorf("ids = %v, quer só o do canal", ids)
	}
}
