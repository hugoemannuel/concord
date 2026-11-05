package sticker

import (
	"context"
	"errors"
	"os"
	"reflect"
	"testing"

	"gin-quickstart/backend/internal/platform/database"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Num Postgres de verdade (TEST_DATABASE_URL, banco descartável e já migrado):
// só os servidores da pessoa, agrupados, e a marca de publicada.
func TestRepositoryListForUserEPublicada(t *testing.T) {
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
	ana, alfa, beta, fora := uuid.NewString(), uuid.NewString(), uuid.NewString(), uuid.NewString()
	exec(`INSERT INTO users (id, username, display_name, email, password_hash) VALUES ($1, $2::text, $2::text, $2::text || '@ex.com', 'x')`, ana, "u"+ana[:8])
	exec(`INSERT INTO servers (id, name, owner_id) VALUES ($1, 'Alfa', $4), ($2, 'Beta', $4), ($3, 'Fora', $4)`, alfa, beta, fora, ana)
	exec(`INSERT INTO server_members (server_id, user_id) VALUES ($1, $3), ($2, $3)`, alfa, beta, ana)
	t.Cleanup(func() {
		db.Exec(ctx, `DELETE FROM servers WHERE id = ANY($1)`, []string{alfa, beta, fora})
		db.Exec(ctx, `DELETE FROM users WHERE id = $1`, ana)
	})
	repo := NewRepository(db)
	gato := &Sticker{ID: uuid.NewString(), ServerID: alfa, UploaderID: ana, Name: "gato", ContentType: "image/png", SizeBytes: 10}
	cao := &Sticker{ID: uuid.NewString(), ServerID: alfa, UploaderID: ana, Name: "cão", ContentType: "image/png", SizeBytes: 10}
	escondida := &Sticker{ID: uuid.NewString(), ServerID: fora, UploaderID: ana, Name: "escondida", ContentType: "image/png", SizeBytes: 10}
	for _, s := range []*Sticker{gato, cao, escondida} {
		if err := repo.Create(ctx, s); err != nil {
			t.Fatal(err)
		}
	}

	groups, err := repo.ListForUser(ctx, ana)
	if err != nil {
		t.Fatal(err)
	}
	if len(groups) != 1 || groups[0].ServerID != alfa || groups[0].ServerName != "Alfa" || len(groups[0].Stickers) != 2 {
		t.Fatalf("Ana só vê as do Alfa (o Beta não tem nenhuma): %+v", groups)
	}
	if got := groups[0].Stickers[0]; got.ServerID != alfa || got.UploaderName == "" {
		t.Fatalf("figurinha: %+v", got)
	}
	if empty, err := repo.ListForUser(ctx, "nem-uuid"); err != nil || len(empty) != 0 {
		t.Fatalf("id inválido: %v %+v", err, empty)
	}

	found, err := repo.FindByID(ctx, gato.ID)
	if err != nil || found.PublishedAt != nil {
		t.Fatalf("nova não está publicada: %v %+v", err, found)
	}
	exec(`UPDATE server_stickers SET published_at = NOW() WHERE id = $1`, gato.ID)
	if found, err = repo.FindByID(ctx, gato.ID); err != nil || found.PublishedAt == nil {
		t.Fatalf("publicada: %v %+v", err, found)
	}
	if _, err := repo.FindByID(ctx, uuid.NewString()); !errors.Is(err, ErrStickerNotFound) {
		t.Fatalf("inexistente: %v", err)
	}
}

func TestRepositoryUpdate(t *testing.T) {
	db, ctx := stickerUpdateDB(t)
	repo := NewRepository(db)
	user, server := seedStickerUpdate(t, db)
	original := &Sticker{ID: uuid.NewString(), ServerID: server, UploaderID: user, Name: "antiga", ContentType: "image/png", SizeBytes: 10}
	if err := repo.Create(ctx, original); err != nil {
		t.Fatal(err)
	}
	got, err := repo.Update(ctx, server, original.ID, "nova")
	if err != nil {
		t.Fatal(err)
	}
	expected := *original
	expected.Name = "nova"
	if !reflect.DeepEqual(*got, expected) {
		t.Fatalf("atualizada = %+v, esperado %+v", got, expected)
	}
	persisted, err := repo.FindByID(ctx, original.ID)
	if err != nil || !reflect.DeepEqual(persisted, got) {
		t.Fatalf("persistida = %+v, erro %v", persisted, err)
	}
	if _, err := repo.Update(ctx, uuid.NewString(), original.ID, "fora"); !errors.Is(err, ErrStickerNotFound) {
		t.Fatalf("outro servidor: %v", err)
	}
	if _, err := repo.Update(ctx, server, uuid.NewString(), "ausente"); !errors.Is(err, ErrStickerNotFound) {
		t.Fatalf("inexistente: %v", err)
	}
	listed, err := repo.ListByServer(ctx, server)
	if err != nil || !reflect.DeepEqual(listed, []Sticker{expected}) {
		t.Fatalf("listagem após editar = %+v, erro %v", listed, err)
	}

	if err := repo.Delete(ctx, got.ID); err != nil {
		t.Fatalf("excluir após editar: %v", err)
	}
	if err := repo.Delete(ctx, got.ID); !errors.Is(err, ErrStickerNotFound) {
		t.Fatalf("excluir novamente: %v", err)
	}

}

func stickerUpdateDB(t *testing.T) (*pgxpool.Pool, context.Context) {
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

func seedStickerUpdate(t *testing.T, db *pgxpool.Pool) (string, string) {
	t.Helper()
	ctx := context.Background()
	user, server := uuid.NewString(), uuid.NewString()
	if _, err := db.Exec(ctx, `INSERT INTO users (id,username,display_name,email,password_hash) VALUES ($1,$2,'Ana',$3,'x')`, user, "u"+user[:8], user+"@teste.dev"); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Exec(ctx, `DELETE FROM users WHERE id=$1`, user) })
	if _, err := db.Exec(ctx, `INSERT INTO servers (id,name,owner_id) VALUES ($1,'Edição',$2)`, server, user); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Exec(ctx, `DELETE FROM servers WHERE id=$1`, server) })
	return user, server
}
