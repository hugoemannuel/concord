package message

import (
	"context"
	"errors"
	"fmt"
	"os"
	"strings"
	"testing"
	"time"

	"gin-quickstart/backend/internal/database"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

// O cursor "before" é o id da mensagem mais antiga já carregada. Os ids são
// UUID v4 (aleatórios), então a página seguinte tem de ser "o que vem antes
// em (created_at, id)", nunca "id menor": senão volta mensagem nova (que
// aparece no topo da conversa) e some mensagem velha.
func TestListPagesFollowCreatedAtKeyset(t *testing.T) {
	if !strings.Contains(listBeforeCondition, "(m.created_at, m.id) <") {
		t.Fatalf("cursor before deve ser keyset (created_at, id), não só o id (UUID aleatório): %s", listBeforeCondition)
	}
}

// Mesmo teste num Postgres de verdade (TEST_DATABASE_URL, banco descartável).
func TestListPaginationDB(t *testing.T) {
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

	exec := func(sql string, args ...any) {
		t.Helper()
		if _, err := db.Exec(ctx, sql, args...); err != nil {
			t.Fatal(err)
		}
	}
	userA, userB := uuid.NewString(), uuid.NewString()
	if userA > userB {
		userA, userB = userB, userA
	}
	serverID, channelID, convID := uuid.NewString(), uuid.NewString(), uuid.NewString()
	for _, u := range []string{userA, userB} {
		name := "u" + strings.ReplaceAll(u, "-", "")[:12]
		exec(`INSERT INTO users (id, username, display_name, email, password_hash) VALUES ($1, $2::text, $2::text, $2::text || '@ex.com', 'x')`, u, name)
	}
	t.Cleanup(func() {
		db.Exec(ctx, `DELETE FROM servers WHERE id = $1`, serverID)
		db.Exec(ctx, `DELETE FROM conversations WHERE id = $1`, convID)
		db.Exec(ctx, `DELETE FROM users WHERE id = ANY($1)`, []string{userA, userB})
	})
	exec(`INSERT INTO servers (id, name, icon_url, owner_id) VALUES ($1, 's', '', $2)`, serverID, userA)
	exec(`INSERT INTO channels (id, server_id, name, type, created_by, position) VALUES ($1, $2, 'geral', 'text', $3, 0)`, channelID, serverID, userA)
	exec(`INSERT INTO conversations (id, user_a_id, user_b_id) VALUES ($1, $2, $3)`, convID, userA, userB)

	repo := MessageRepository(db)
	t.Run("channel", func(t *testing.T) {
		want := seedMessages(t, db, "channel_id", channelID, userA)
		checkPages(t, want, func(before string) ([]Message, error) {
			return repo.ListByChannel(ctx, channelID, 50, before)
		})
	})
	t.Run("conversation", func(t *testing.T) {
		want := seedMessages(t, db, "conversation_id", convID, userA)
		checkPages(t, want, func(before string) ([]Message, error) {
			return repo.ListByConversation(ctx, convID, 50, before)
		})
	})
}

// seedMessages grava 120 mensagens e devolve os ids da mais nova para a mais
// antiga. Os ids são uma permutação (ordem de id ≠ ordem de envio) e há um
// bloco com o mesmo created_at atravessando a fronteira da 1ª página (índice
// 70), como acontece com mensagens no mesmo microssegundo.
func seedMessages(t *testing.T, db *pgxpool.Pool, column, roomID, authorID string) []string {
	t.Helper()
	const n = 120
	t0 := time.Date(2026, 10, 25, 12, 0, 0, 0, time.UTC)
	ids := make([]string, n)
	created := make([]time.Time, n)
	for i := 0; i < n; i++ {
		ids[i] = fmt.Sprintf("%08x-%s-4000-8000-%012x", (i*37)%n, roomID[:4], i)
		created[i] = t0.Add(time.Duration(i) * time.Second)
		if i >= 66 && i <= 73 {
			created[i] = t0.Add(66 * time.Second)
		}
		_, err := db.Exec(context.Background(),
			`INSERT INTO messages (id, author_id, `+column+`, content, created_at) VALUES ($1, $2, $3, $4, $5)`,
			ids[i], authorID, roomID, fmt.Sprintf("m%d", i), created[i])
		if err != nil {
			t.Fatal(err)
		}
	}
	// Ordem esperada: created_at DESC, id DESC.
	want := make([]string, 0, n)
	for i := n - 1; i >= 0; i-- {
		want = append(want, ids[i])
	}
	// Dentro do empate, id DESC.
	tie := want[n-1-73 : n-1-66+1]
	for a := 0; a < len(tie); a++ {
		for b := a + 1; b < len(tie); b++ {
			if tie[b] > tie[a] {
				tie[a], tie[b] = tie[b], tie[a]
			}
		}
	}
	return want
}

func checkPages(t *testing.T, want []string, list func(before string) ([]Message, error)) {
	t.Helper()
	var got []string
	before := ""
	for pages := 0; pages < 10; pages++ {
		page, err := list(before)
		if err != nil {
			t.Fatal(err)
		}
		if len(page) == 0 {
			break
		}
		for _, m := range page {
			got = append(got, m.ID)
		}
		before = page[len(page)-1].ID
	}
	seen := map[string]int{}
	for i, id := range got {
		if prev, dup := seen[id]; dup {
			t.Errorf("mensagem %s veio de novo na posição %d (já estava na %d): uma página \"anterior\" trouxe mensagem mais nova", id, i, prev)
		}
		seen[id] = i
	}
	if len(got) != len(want) {
		t.Fatalf("paginação devolveu %d mensagens, want %d (repetidas ou puladas)", len(got), len(want))
	}
	for i := range want {
		if got[i] != want[i] {
			t.Fatalf("posição %d: got %s, want %s", i, got[i], want[i])
		}
	}
}

// Edição num Postgres de verdade: só o autor grava, edited_at volta nas
// leituras e a ordem (created_at) não muda.
func TestUpdateContentDB(t *testing.T) {
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

	exec := func(sql string, args ...any) {
		t.Helper()
		if _, err := db.Exec(ctx, sql, args...); err != nil {
			t.Fatal(err)
		}
	}
	author, other := uuid.NewString(), uuid.NewString()
	serverID, channelID := uuid.NewString(), uuid.NewString()
	for _, u := range []string{author, other} {
		name := "u" + strings.ReplaceAll(u, "-", "")[:12]
		exec(`INSERT INTO users (id, username, display_name, email, password_hash) VALUES ($1, $2::text, $2::text, $2::text || '@ex.com', 'x')`, u, name)
	}
	t.Cleanup(func() {
		db.Exec(ctx, `DELETE FROM servers WHERE id = $1`, serverID)
		db.Exec(ctx, `DELETE FROM users WHERE id = ANY($1)`, []string{author, other})
	})
	exec(`INSERT INTO servers (id, name, icon_url, owner_id) VALUES ($1, 's', '', $2)`, serverID, author)
	exec(`INSERT INTO channels (id, server_id, name, type, created_by, position) VALUES ($1, $2, 'geral', 'text', $3, 0)`, channelID, serverID, author)

	repo := MessageRepository(db)
	first := &Message{ID: uuid.NewString(), AuthorID: author, ChannelID: &channelID, Content: "@all primeira", MentionEveryone: strPtr(MentionAll)}
	second := &Message{ID: uuid.NewString(), AuthorID: author, ChannelID: &channelID, Content: "segunda"}
	for _, m := range []*Message{first, second} {
		if err := repo.Create(ctx, m); err != nil {
			t.Fatal(err)
		}
	}

	if err := repo.UpdateContent(ctx, first.ID, other, "x", nil); !errors.Is(err, ErrMessageNotFound) {
		t.Fatalf("outra pessoa: err = %v, want ErrMessageNotFound", err)
	}
	if err := repo.UpdateContent(ctx, first.ID, author, "primeira, editada", nil); err != nil {
		t.Fatal(err)
	}

	got, err := repo.FindByID(ctx, first.ID)
	if err != nil {
		t.Fatal(err)
	}
	if got.Content != "primeira, editada" || got.EditedAt == nil || got.MentionEveryone != nil {
		t.Fatalf("depois da edição: %+v", got)
	}
	if !got.CreatedAt.Equal(first.CreatedAt) {
		t.Fatalf("created_at mudou: %v → %v", first.CreatedAt, got.CreatedAt)
	}
	if has, err := repo.HasPoll(ctx, first.ID); err != nil || has {
		t.Fatalf("HasPoll = %v, %v", has, err)
	}

	list, err := repo.ListByChannel(ctx, channelID, 10, "")
	if err != nil {
		t.Fatal(err)
	}
	if len(list) != 2 || list[0].ID != second.ID || list[1].ID != first.ID || list[1].EditedAt == nil || list[0].EditedAt != nil {
		t.Fatalf("lista depois da edição fora de ordem ou sem edited_at: %+v", list)
	}
}

type countingScanner struct{ n int }

func (c *countingScanner) Scan(dest ...interface{}) error {
	c.n = len(dest)
	return nil
}

// O Scan do pgx exige um destino por coluna; destino a mais ou a menos dá
// "number of field descriptions must equal number of destinations" e quebra
// toda leitura de mensagem. FindByID e as listagens usam scanMessageRow.
func TestScanMessageRowMatchesColumns(t *testing.T) {
	var c countingScanner
	if _, err := scanMessageRow(&c); err != nil {
		t.Fatal(err)
	}
	cols, depth := 1, 0
	for _, r := range messageColumns {
		switch r {
		case '(':
			depth++
		case ')':
			depth--
		case ',':
			if depth == 0 {
				cols++
			}
		}
	}
	if c.n != cols {
		t.Fatalf("scanMessageRow tem %d destinos, messageColumns tem %d colunas", c.n, cols)
	}
}
