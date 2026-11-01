package accountdeletion

import (
	"context"
	"errors"
	"os"
	"slices"
	"testing"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	"gin-quickstart/backend/internal/platform/database"
)

// Num Postgres de verdade (TEST_DATABASE_URL, banco descartável e já migrado).

func eraseDB(t *testing.T) *pgxpool.Pool {
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

type fixture struct {
	t  *testing.T
	db *pgxpool.Pool
}

func (f fixture) exec(sql string, args ...any) {
	f.t.Helper()
	if _, err := f.db.Exec(context.Background(), sql, args...); err != nil {
		f.t.Fatalf("%s: %v", sql, err)
	}
}

func (f fixture) exists(sql string, args ...any) bool {
	f.t.Helper()
	var ok bool
	if err := f.db.QueryRow(context.Background(), "SELECT EXISTS("+sql+")", args...).Scan(&ok); err != nil {
		f.t.Fatalf("%s: %v", sql, err)
	}
	return ok
}

func (f fixture) user() string {
	f.t.Helper()
	id := uuid.NewString()
	name := "u" + id[:8]
	f.exec(`INSERT INTO users (id, username, display_name, email, password_hash) VALUES ($1, $2::text, $2::text, $2::text || '@ex.com', 'x')`, id, name)
	f.t.Cleanup(func() { f.db.Exec(context.Background(), `DELETE FROM users WHERE id = $1`, id) })
	return id
}

func (f fixture) server(owner string, members ...string) string {
	f.t.Helper()
	id := uuid.NewString()
	f.exec(`INSERT INTO servers (id, name, owner_id) VALUES ($1, $3, $2)`, id, owner, "s-"+id[:8])
	f.t.Cleanup(func() { f.db.Exec(context.Background(), `DELETE FROM servers WHERE id = $1`, id) })
	for _, m := range append([]string{owner}, members...) {
		f.exec(`INSERT INTO server_members (server_id, user_id) VALUES ($1, $2)`, id, m)
	}
	return id
}

func (f fixture) channel(serverID, creator string) string {
	f.t.Helper()
	id := uuid.NewString()
	f.exec(`INSERT INTO channels (id, server_id, name, created_by) VALUES ($1, $2, 'geral', $3)`, id, serverID, creator)
	return id
}

func (f fixture) message(author, channelID, conversationID string) string {
	f.t.Helper()
	id := uuid.NewString()
	f.exec(`INSERT INTO messages (id, author_id, channel_id, conversation_id, content) VALUES ($1, $2, NULLIF($3, '')::uuid, NULLIF($4, '')::uuid, 'oi')`, id, author, channelID, conversationID)
	return id
}

func (f fixture) attachment(uploader, messageID, channelID string) string {
	f.t.Helper()
	id := uuid.NewString()
	f.exec(`INSERT INTO message_attachments (id, message_id, uploader_id, channel_id, kind, content_type, filename, size_bytes)
		VALUES ($1, NULLIF($2, '')::uuid, $3, $4, 'image', 'image/png', 'a.png', 10)`, id, messageID, uploader, channelID)
	return id
}

func (f fixture) dm(a, b string) string {
	f.t.Helper()
	if a > b {
		a, b = b, a
	}
	id := uuid.NewString()
	f.exec(`INSERT INTO conversations (id, user_a_id, user_b_id, type) VALUES ($1, $2, $3, 'dm')`, id, a, b)
	return id
}

func (f fixture) group(owner string, members ...string) string {
	f.t.Helper()
	id := uuid.NewString()
	f.exec(`INSERT INTO conversations (id, type, name, owner_id) VALUES ($1, 'group', 'grupo', $2)`, id, owner)
	f.t.Cleanup(func() { f.db.Exec(context.Background(), `DELETE FROM conversations WHERE id = $1`, id) })
	for _, m := range append([]string{owner}, members...) {
		f.exec(`INSERT INTO conversation_members (conversation_id, user_id) VALUES ($1, $2)`, id, m)
	}
	return id
}

func hasFile(files []File, kind FileKind, id string) bool {
	return slices.Contains(files, File{Kind: kind, ID: id})
}

func TestDBEraseRecusaDonoDeServidorComMembros(t *testing.T) {
	db := eraseDB(t)
	f := fixture{t, db}
	me, friend := f.user(), f.user()
	srv := f.server(me, friend)

	_, err := NewRepository(db).Erase(context.Background(), me)

	var owns *OwnsServersError
	if !errors.As(err, &owns) || len(owns.Servers) != 1 || owns.Servers[0].ID != srv {
		t.Fatalf("Erase = %v, quer OwnsServersError com %s", err, srv)
	}
	if !f.exists(`SELECT 1 FROM users WHERE id = $1`, me) {
		t.Fatal("a conta foi apagada mesmo com o servidor no caminho")
	}
}

func TestDBEraseNaoApagaContaInexistenteNemUsuarioRemovido(t *testing.T) {
	db := eraseDB(t)
	repo := NewRepository(db)
	for _, id := range []string{uuid.NewString(), DeletedUserID} {
		if _, err := repo.Erase(context.Background(), id); !errors.Is(err, ErrNotFound) {
			t.Errorf("Erase(%s) = %v, quer ErrNotFound", id, err)
		}
	}
}

func TestDBEraseApagaContaEPassaMensagensParaUsuarioRemovido(t *testing.T) {
	db := eraseDB(t)
	f := fixture{t, db}
	me, other := f.user(), f.user()
	avatar, entrance, appSound, sticker, emoji := uuid.NewString(), uuid.NewString(), uuid.NewString(), uuid.NewString(), uuid.NewString()
	f.exec(`UPDATE users SET avatar_url = '/api/profile-media/a_' || $2, entrance_sound_url = '/api/entrance-sounds/' || $3 WHERE id = $1`, me, avatar, entrance)
	f.exec(`INSERT INTO user_app_sound_files (user_id, event, file_id, duration_ms) VALUES ($1, 'message', $2, 500)`, me, appSound)

	// Servidor só meu: vai junto, com a figurinha.
	mine := f.server(me)
	f.exec(`INSERT INTO server_stickers (id, server_id, uploader_id, name, file_id, content_type, size_bytes) VALUES ($1, $2, $3, 'fig', $1, 'image/png', 10)`, sticker, mine, me)

	// Servidor de outra pessoa: canal que criei, mensagem com anexo, upload pendente, emoji e sobrescrita.
	theirs := f.server(other, me)
	ch := f.channel(theirs, me)
	msg := f.message(me, ch, "")
	att := f.attachment(me, msg, ch)
	pending := f.attachment(me, "", ch)
	f.exec(`INSERT INTO server_emojis (id, server_id, uploader_id, name, content_type, size_bytes) VALUES ($1, $2, $3, 'emo', 'image/png', 10)`, emoji, theirs, me)
	f.exec(`INSERT INTO channel_overwrites (channel_id, target_type, target_id, allow, deny) VALUES ($1, 'member', $2, 0, 0)`, ch, me)

	// Conversa a dois (some para os dois) e grupo (a mensagem fica).
	dm := f.dm(me, other)
	f.message(other, "", dm)
	grp := f.group(me, other)
	groupMsg := f.message(me, "", grp)

	got, err := NewRepository(db).Erase(context.Background(), me)
	if err != nil {
		t.Fatalf("Erase: %v", err)
	}

	for _, c := range []struct {
		name  string
		sql   string
		args  []any
		wants bool
	}{
		{"conta", `SELECT 1 FROM users WHERE id = $1`, []any{me}, false},
		{"servidor só meu", `SELECT 1 FROM servers WHERE id = $1`, []any{mine}, false},
		{"servidor dos outros", `SELECT 1 FROM servers WHERE id = $1`, []any{theirs}, true},
		{"mensagem no servidor, do Usuário removido", `SELECT 1 FROM messages WHERE id = $1 AND author_id = $2`, []any{msg, DeletedUserID}, true},
		{"anexo da mensagem, do Usuário removido", `SELECT 1 FROM message_attachments WHERE id = $1 AND uploader_id = $2`, []any{att, DeletedUserID}, true},
		{"upload pendente", `SELECT 1 FROM message_attachments WHERE id = $1`, []any{pending}, false},
		{"canal, criado pelo Usuário removido", `SELECT 1 FROM channels WHERE id = $1 AND created_by = $2`, []any{ch, DeletedUserID}, true},
		{"sobrescrita do membro", `SELECT 1 FROM channel_overwrites WHERE target_id = $1`, []any{me}, false},
		{"emoji que enviei", `SELECT 1 FROM server_emojis WHERE id = $1`, []any{emoji}, false},
		{"conversa a dois", `SELECT 1 FROM conversations WHERE id = $1`, []any{dm}, false},
		{"grupo", `SELECT 1 FROM conversations WHERE id = $1`, []any{grp}, true},
		{"mensagem no grupo, do Usuário removido", `SELECT 1 FROM messages WHERE id = $1 AND author_id = $2`, []any{groupMsg, DeletedUserID}, true},
	} {
		if got := f.exists(c.sql, c.args...); got != c.wants {
			t.Errorf("%s: existe = %v, quer %v", c.name, got, c.wants)
		}
	}

	if !slices.Equal(got.LeftServers, []string{theirs}) {
		t.Errorf("LeftServers = %v, quer [%s]", got.LeftServers, theirs)
	}
	if !slices.Equal(got.DeletedServers, []string{mine}) {
		t.Errorf("DeletedServers = %v, quer [%s]", got.DeletedServers, mine)
	}
	for _, want := range []File{{KindProfile, avatar}, {KindEntrance, entrance}, {KindAppSound, appSound}, {KindSticker, sticker}, {KindEmoji, emoji}} {
		if !hasFile(got.Files, want.Kind, want.ID) {
			t.Errorf("Files = %v, falta %v", got.Files, want)
		}
	}
}
