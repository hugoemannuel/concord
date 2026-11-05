package emoji

import (
	"context"
	"errors"
	"fmt"
	"os"
	"reflect"
	"sync"
	"testing"

	"gin-quickstart/backend/internal/platform/database"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Estes testes rodam num Postgres de verdade (TEST_DATABASE_URL, banco
// descartável e já migrado) e cobrem o SQL: nome único sem diferenciar
// maiúsculas, a listagem só dos servidores da pessoa e a exclusão.

func emojiDB(t *testing.T) (*pgxpool.Pool, context.Context) {
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
	return db, context.Background()
}

func mustExec(t *testing.T, db *pgxpool.Pool, sql string, args ...any) {
	t.Helper()
	if _, err := db.Exec(context.Background(), sql, args...); err != nil {
		t.Fatalf("%s: %v", sql, err)
	}
}

// seedUserAndServer cria uma pessoa e um servidor dela (membro).
func seedUserAndServer(t *testing.T, db *pgxpool.Pool, serverName string) (userID, serverID string) {
	t.Helper()
	userID, serverID = uuid.NewString(), uuid.NewString()
	mustExec(t, db, `INSERT INTO users (id, username, display_name, email, password_hash) VALUES ($1, $2, $2, $3, 'x')`,
		userID, "u"+userID[:8], userID[:8]+"@teste.dev")
	mustExec(t, db, `INSERT INTO servers (id, name, owner_id) VALUES ($1, $2, $3)`, serverID, serverName, userID)
	mustExec(t, db, `INSERT INTO server_members (server_id, user_id) VALUES ($1, $2)`, serverID, userID)
	t.Cleanup(func() {
		mustExec(t, db, `DELETE FROM servers WHERE id = $1`, serverID)
		mustExec(t, db, `DELETE FROM users WHERE id = $1`, userID)
	})
	return userID, serverID
}

func TestRepositoryEmojis(t *testing.T) {
	db, ctx := emojiDB(t)
	repo := NewRepository(db)
	ana, srvA := seedUserAndServer(t, db, "Alfa")
	_, srvB := seedUserAndServer(t, db, "Beta")

	festa := &Emoji{ID: uuid.NewString(), ServerID: srvA, UploaderID: ana, Name: "festa", ContentType: "image/png", SizeBytes: 10}
	if err := repo.Create(ctx, festa); err != nil || festa.CreatedAt.IsZero() {
		t.Fatalf("create: %v %v", err, festa.CreatedAt)
	}
	dup := &Emoji{ID: uuid.NewString(), ServerID: srvA, UploaderID: ana, Name: "FESTA", ContentType: "image/png", SizeBytes: 10}
	if err := repo.Create(ctx, dup); !errors.Is(err, ErrNameTaken) {
		t.Fatalf("nome repetido: %v", err)
	}
	other := &Emoji{ID: uuid.NewString(), ServerID: srvB, UploaderID: ana, Name: "festa", ContentType: "image/gif", SizeBytes: 10}
	if err := repo.Create(ctx, other); err != nil {
		t.Fatalf("mesmo nome em outro servidor: %v", err)
	}

	groups, err := repo.ListForUser(ctx, ana)
	if err != nil || len(groups) != 1 || groups[0].ServerID != srvA || groups[0].ServerName != "Alfa" || len(groups[0].Emojis) != 1 {
		t.Fatalf("ana só vê o Alfa: %v %+v", err, groups)
	}
	if n, err := repo.CountByServer(ctx, srvA); err != nil || n != 1 {
		t.Fatalf("count: %d %v", n, err)
	}
	got, err := repo.FindByID(ctx, festa.ID)
	if err != nil || got.Name != "festa" || got.ServerID != srvA {
		t.Fatalf("find: %v %+v", err, got)
	}
	if err := repo.Delete(ctx, festa.ID); err != nil {
		t.Fatal(err)
	}
	if _, err := repo.FindByID(ctx, festa.ID); !errors.Is(err, ErrEmojiNotFound) {
		t.Fatalf("depois de apagar: %v", err)
	}
	if err := repo.Delete(ctx, festa.ID); !errors.Is(err, ErrEmojiNotFound) {
		t.Fatalf("apagar de novo: %v", err)
	}
}

func TestRepositoryLimiteDoServidor(t *testing.T) {
	db, ctx := emojiDB(t)
	repo := NewRepository(db)
	ana, srv := seedUserAndServer(t, db, "Cheio")
	errs := make(chan error, MaxEmojisPerServer+5)
	var wg sync.WaitGroup
	for i := 0; i < MaxEmojisPerServer+5; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			e := &Emoji{ID: uuid.NewString(), ServerID: srv, UploaderID: ana, Name: fmt.Sprintf("e%d", i), ContentType: "image/png", SizeBytes: 1}
			errs <- repo.Create(ctx, e)
		}(i)
	}
	wg.Wait()
	close(errs)
	full := 0
	for err := range errs {
		if errors.Is(err, ErrServerFull) {
			full++
		} else if err != nil {
			t.Fatal(err)
		}
	}
	if n, _ := repo.CountByServer(ctx, srv); n != MaxEmojisPerServer || full != 5 {
		t.Fatalf("envios ao mesmo tempo: %d gravados, %d recusados", n, full)
	}
}

func TestRepositoryIdsInvalidos(t *testing.T) {
	repo := NewRepository(nil)
	ctx := context.Background()
	if g, err := repo.ListForUser(ctx, "nao-uuid"); err != nil || len(g) != 0 {
		t.Fatalf("list: %v %v", g, err)
	}
	if _, err := repo.FindByID(ctx, "nao-uuid"); !errors.Is(err, ErrEmojiNotFound) {
		t.Fatalf("find: %v", err)
	}
	if n, err := repo.CountByServer(ctx, "nao-uuid"); err != nil || n != 0 {
		t.Fatalf("count: %d %v", n, err)
	}
	if err := repo.Delete(ctx, "nao-uuid"); !errors.Is(err, ErrEmojiNotFound) {
		t.Fatalf("delete: %v", err)
	}
}

func TestInsertError(t *testing.T) {
	if !errors.Is(insertError(pgx.ErrNoRows), ErrServerFull) {
		t.Fatal("sem linha = servidor cheio")
	}
	if !errors.Is(insertError(&pgconn.PgError{Code: uniqueViolation}), ErrNameTaken) {
		t.Fatal("índice único = nome repetido")
	}
	other := errors.New("x")
	if insertError(nil) != nil || insertError(other) != other {
		t.Fatal("o resto passa como veio")
	}
}

func TestAppendToGroup(t *testing.T) {
	var groups []ServerEmojis
	groups = appendToGroup(groups, ServerEmojis{ServerID: "a"}, Emoji{ID: "1"})
	groups = appendToGroup(groups, ServerEmojis{ServerID: "a"}, Emoji{ID: "2"})
	groups = appendToGroup(groups, ServerEmojis{ServerID: "b"}, Emoji{ID: "3"})
	if len(groups) != 2 || len(groups[0].Emojis) != 2 || groups[1].Emojis[0].ID != "3" {
		t.Fatalf("grupos = %+v", groups)
	}
}

func TestRepositoryUpdate(t *testing.T) {
	db, ctx := emojiDB(t)
	repo := NewRepository(db)
	user, server := seedUserAndServer(t, db, "Edição")
	_, other := seedUserAndServer(t, db, "Outro")
	original := &Emoji{ID: uuid.NewString(), ServerID: server, UploaderID: user, Name: "antigo", ContentType: "image/png", SizeBytes: 10}
	if err := repo.Create(ctx, original); err != nil {
		t.Fatal(err)
	}
	got, err := repo.Update(ctx, server, original.ID, "novo")
	if err != nil {
		t.Fatal(err)
	}
	expected := *original
	expected.Name = "novo"
	if !reflect.DeepEqual(*got, expected) {
		t.Fatalf("atualizado = %+v, esperado %+v", got, expected)
	}
	persisted, err := repo.FindByID(ctx, original.ID)
	if err != nil || !reflect.DeepEqual(persisted, got) {
		t.Fatalf("persistido = %+v, erro %v", persisted, err)
	}
	if _, err := repo.Update(ctx, other, original.ID, "fora"); !errors.Is(err, ErrEmojiNotFound) {
		t.Fatalf("outro servidor: %v", err)
	}
	if _, err := repo.Update(ctx, server, uuid.NewString(), "ausente"); !errors.Is(err, ErrEmojiNotFound) {
		t.Fatalf("inexistente: %v", err)
	}
	duplicate := &Emoji{ID: uuid.NewString(), ServerID: server, UploaderID: user, Name: "ocupado", ContentType: "image/png", SizeBytes: 10}
	if err := repo.Create(ctx, duplicate); err != nil {
		t.Fatal(err)
	}
	if _, err := repo.Update(ctx, server, original.ID, "OCUPADO"); !errors.Is(err, ErrNameTaken) {
		t.Fatalf("nome duplicado: %v", err)
	}
	if _, err := repo.Update(ctx, server, original.ID, "NOVO"); err != nil {
		t.Fatalf("mesmo emoji: %v", err)
	}
	if _, err := repo.Update(ctx, other, duplicate.ID, "novo"); !errors.Is(err, ErrEmojiNotFound) {
		t.Fatalf("servidor incorreto: %v", err)
	}
}
