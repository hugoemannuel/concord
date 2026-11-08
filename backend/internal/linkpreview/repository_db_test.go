package linkpreview

import (
	"context"
	"os"
	"testing"
	"time"

	"gin-quickstart/backend/internal/platform/database"

	"github.com/google/uuid"
)

// Num Postgres de verdade (TEST_DATABASE_URL, banco descartável e já migrado).
func previewsDB(t *testing.T) *Repository {
	t.Helper()
	dsn := os.Getenv("TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("TEST_DATABASE_URL não definido")
	}
	db, err := database.Connect(dsn)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(db.Close)
	return NewRepository(db)
}

func TestRepositoryGravaAchaERegrava(t *testing.T) {
	repo := previewsDB(t)
	ctx := context.Background()
	key := "https://teste.example/" + uuid.NewString()
	t.Cleanup(func() { repo.db.Exec(ctx, `DELETE FROM link_previews WHERE url = $1`, key) })

	if _, ok, err := repo.Find(ctx, key); err != nil || ok {
		t.Fatalf("Find antes de gravar = %v, %v", ok, err)
	}
	img := uuid.NewString()
	at := time.Now().UTC().Truncate(time.Second)
	want := Entry{Preview: Preview{URL: key, SiteName: "S", Title: "T", Description: "D", ImageID: img, Color: "#fff", YouTubeID: "dQw4w9WgXcQ"}, FetchedAt: at}
	if err := repo.Save(ctx, want); err != nil {
		t.Fatal(err)
	}
	got, ok, err := repo.Find(ctx, key)
	if err != nil || !ok || got.Preview != want.Preview || got.Failed || !got.FetchedAt.Equal(at) {
		t.Fatalf("Find = %+v, %v, %v; want %+v", got, ok, err, want)
	}
	failed := Entry{Preview: Preview{URL: key}, Failed: true, FetchedAt: at.Add(time.Hour)}
	if err := repo.Save(ctx, failed); err != nil {
		t.Fatal(err)
	}
	got, _, _ = repo.Find(ctx, key)
	if !got.Failed || got.ImageID != "" || got.Title != "" {
		t.Fatalf("regravar não trocou a linha: %+v", got)
	}
}

func TestRepositoryApagaVencidosEListaImagens(t *testing.T) {
	repo := previewsDB(t)
	ctx := context.Background()
	old, fresh := "https://teste.example/velho-"+uuid.NewString(), "https://teste.example/novo-"+uuid.NewString()
	t.Cleanup(func() { repo.db.Exec(ctx, `DELETE FROM link_previews WHERE url = ANY($1)`, []string{old, fresh}) })
	oldImg, freshImg := uuid.NewString(), uuid.NewString()
	now := time.Now()
	repo.Save(ctx, Entry{Preview: Preview{URL: old, Title: "v", ImageID: oldImg}, FetchedAt: now.Add(-48 * time.Hour)})
	repo.Save(ctx, Entry{Preview: Preview{URL: fresh, Title: "n", ImageID: freshImg}, FetchedAt: now})

	if _, err := repo.DeleteExpired(ctx, now.Add(-24*time.Hour)); err != nil {
		t.Fatal(err)
	}
	if _, ok, _ := repo.Find(ctx, old); ok {
		t.Error("linha vencida ficou")
	}
	used, err := repo.ImageIDs(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if !used[freshImg] || used[oldImg] {
		t.Errorf("imagens em uso = %v", used)
	}
}
