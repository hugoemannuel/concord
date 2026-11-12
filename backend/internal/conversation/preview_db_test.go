package conversation

import (
	"context"
	"os"
	"testing"

	"gin-quickstart/backend/internal/platform/database"

	"github.com/google/uuid"
)

// Lista de conversas num Postgres de verdade (TEST_DATABASE_URL): a última
// mensagem só com um arquivo genérico aparece como "📎 Arquivo"; com vários
// anexos, o rótulo que já existia ("N anexos").
func TestLastMessageFileLabelDB(t *testing.T) {
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
	a, b := newTestUser(t, db, `nameplate_mode = 'off'`), newTestUser(t, db, `nameplate_mode = 'off'`)
	if b < a {
		a, b = b, a
	}
	repo := ConversationRepository(db)
	conv := &Conversation{ID: uuid.NewString(), UserAID: a, UserBID: b}
	if err := repo.CreateDM(ctx, conv, a); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Exec(ctx, `DELETE FROM conversations WHERE id = $1`, conv.ID) })

	sendFiles := func(kinds ...string) {
		t.Helper()
		messageID := uuid.NewString()
		if _, err := db.Exec(ctx, `INSERT INTO messages (id, conversation_id, author_id, content) VALUES ($1, $2, $3, '')`, messageID, conv.ID, a); err != nil {
			t.Fatal(err)
		}
		for _, kind := range kinds {
			if _, err := db.Exec(ctx, `INSERT INTO message_attachments (id, message_id, uploader_id, conversation_id, kind, content_type, filename, size_bytes)
				VALUES ($1, $2, $3, $4, $5, 'application/octet-stream', 'a.zip', 10)`, uuid.NewString(), messageID, a, conv.ID, kind); err != nil {
				t.Fatal(err)
			}
		}
	}
	lastContent := func() string {
		t.Helper()
		list, err := repo.ListByUserID(ctx, a)
		if err != nil {
			t.Fatal(err)
		}
		if len(list) != 1 || list[0].LastMessage == nil {
			t.Fatalf("lista de conversas: %+v", list)
		}
		return list[0].LastMessage.Content
	}

	sendFiles("file")
	if got := lastContent(); got != "📎 Arquivo" {
		t.Errorf("um arquivo: prévia = %q", got)
	}
	sendFiles("file", "image")
	if got := lastContent(); got != "📎 2 anexos" {
		t.Errorf("dois anexos: prévia = %q", got)
	}
}

// Mensagem vencida (entre dois ticks do sweeper) não vira prévia da DM nem
// conta como não lida.
func TestPreviaENaoLidasDaDMIgnoramVencida(t *testing.T) {
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
	a, b := newTestUser(t, db, `nameplate_mode = 'off'`), newTestUser(t, db, `nameplate_mode = 'off'`)
	if b < a {
		a, b = b, a
	}
	repo := ConversationRepository(db)
	conv := &Conversation{ID: uuid.NewString(), UserAID: a, UserBID: b}
	if err := repo.CreateDM(ctx, conv, a); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Exec(ctx, `DELETE FROM conversations WHERE id = $1`, conv.ID) })

	anterior, vencida := uuid.NewString(), uuid.NewString()
	for i, id := range []string{anterior, vencida} {
		if _, err := db.Exec(ctx, `INSERT INTO messages (id, conversation_id, author_id, content, created_at) VALUES ($1, $2, $3, $4, now() - $5 * interval '1 second')`,
			id, conv.ID, b, "msg "+id, 10-i); err != nil {
			t.Fatal(err)
		}
	}
	if _, err := db.Exec(ctx, `UPDATE conversation_members SET last_read_at = now() - interval '1 hour' WHERE conversation_id = $1`, conv.ID); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(ctx, `UPDATE messages SET expires_at = now() - interval '1 minute' WHERE id = $1`, vencida); err != nil {
		t.Fatal(err)
	}

	list, err := repo.ListByUserID(ctx, a)
	if err != nil {
		t.Fatal(err)
	}
	if len(list) != 1 || list[0].LastMessage == nil || list[0].LastMessage.ID != anterior {
		t.Fatalf("prévia = %+v, quer a mensagem anterior", list)
	}
	if list[0].UnreadCount != 1 {
		t.Errorf("não lidas = %d, quer 1 (a vencida não conta)", list[0].UnreadCount)
	}
}

// Última mensagem só com mídia de visualização única: a prévia da DM é o
// rótulo, nunca "Imagem"/"Vídeo".
func TestPreviaDaDMViewOnce(t *testing.T) {
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
	a, b := newTestUser(t, db, `nameplate_mode = 'off'`), newTestUser(t, db, `nameplate_mode = 'off'`)
	if b < a {
		a, b = b, a
	}
	repo := ConversationRepository(db)
	conv := &Conversation{ID: uuid.NewString(), UserAID: a, UserBID: b}
	if err := repo.CreateDM(ctx, conv, a); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Exec(ctx, `DELETE FROM conversations WHERE id = $1`, conv.ID) })

	for _, kind := range []string{"image", "video"} {
		messageID := uuid.NewString()
		if _, err := db.Exec(ctx, `INSERT INTO messages (id, conversation_id, author_id, content) VALUES ($1, $2, $3, '')`, messageID, conv.ID, a); err != nil {
			t.Fatal(err)
		}
		if _, err := db.Exec(ctx, `INSERT INTO message_attachments (id, message_id, uploader_id, conversation_id, kind, content_type, filename, size_bytes, view_once)
			VALUES ($1, $2, $3, $4, $5, 'application/octet-stream', 'a.bin', 10, true)`, uuid.NewString(), messageID, a, conv.ID, kind); err != nil {
			t.Fatal(err)
		}
		list, err := repo.ListByUserID(ctx, a)
		if err != nil || len(list) != 1 || list[0].LastMessage == nil {
			t.Fatalf("lista: %+v (err=%v)", list, err)
		}
		want := map[string]string{"image": "Foto de visualização única", "video": "Vídeo de visualização única"}[kind]
		if got := list[0].LastMessage.Content; got != want {
			t.Errorf("%s: prévia = %q, esperava %q", kind, got, want)
		}
	}
}
