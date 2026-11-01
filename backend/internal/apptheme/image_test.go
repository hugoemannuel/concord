package apptheme

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
	"time"

	"gin-quickstart/backend/internal/platform/media"
	"gin-quickstart/backend/internal/user"

	"github.com/gin-gonic/gin"
)

// fakeMedia faz o papel do upload do perfil: "salva" e passa a URL ao apply.
type fakeMedia struct {
	url    string
	served string
}

func (f *fakeMedia) UploadImage(c *gin.Context, apply user.ImageApply) {
	apply(c.Request.Context(), c.GetString("userID"), &f.url)
}

func (f *fakeMedia) ServeMedia(c *gin.Context) {
	f.served = c.Param("id")
	c.Status(http.StatusOK)
}

func imageRouter(m *fakeMedia) *gin.Engine {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	auth := func(c *gin.Context) { c.Set("userID", meID); c.Next() }
	ImageRoutes(r.Group("/api"), NewImageHandler(m), auth)
	return r
}

func TestImageUpload(t *testing.T) {
	const id = "0f8fad5b-d9cb-469f-a165-70867728950e"
	t.Run("imagem parada vira a URL das imagens de tema", func(t *testing.T) {
		w := httptest.NewRecorder()
		r := imageRouter(&fakeMedia{url: "/api/profile-media/" + id})
		r.ServeHTTP(w, httptest.NewRequest(http.MethodPost, "/api/users/me/app-themes/image", nil))
		var out struct{ URL string }
		_ = json.Unmarshal(w.Body.Bytes(), &out)
		if w.Code != http.StatusCreated || out.URL != imagePath+id {
			t.Fatalf("%d %s", w.Code, w.Body)
		}
		th := valid()
		th.Image = out.URL
		if _, err := Normalize([]Theme{th}); err != nil {
			t.Fatalf("a URL devolvida não passa na validação: %v", err)
		}
	})

	t.Run("GIF animado é recusado (fundo não anima)", func(t *testing.T) {
		w := httptest.NewRecorder()
		imageRouter(&fakeMedia{url: "/api/profile-media/a_" + id}).
			ServeHTTP(w, httptest.NewRequest(http.MethodPost, "/api/users/me/app-themes/image", nil))
		if w.Code != http.StatusUnsupportedMediaType {
			t.Fatalf("%d", w.Code)
		}
	})

	t.Run("a imagem é servida sem token", func(t *testing.T) {
		m := &fakeMedia{}
		w := httptest.NewRecorder()
		imageRouter(m).ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/api/app-theme-images/"+id, nil))
		if w.Code != http.StatusOK || m.served != id {
			t.Fatalf("%d %q", w.Code, m.served)
		}
	})
}

type fakeImageRefs struct{ themes []Theme }

func (f fakeImageRefs) ThemesWithImages(context.Context) ([]Theme, error) { return f.themes, nil }

func TestImageJanitorRemovesOnlyOldUnusedFiles(t *testing.T) {
	dir := t.TempDir()
	store, err := media.NewStore(dir)
	if err != nil {
		t.Fatal(err)
	}
	const (
		inUse     = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
		abandoned = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
		fresh     = "cccccccc-cccc-4ccc-8ccc-cccccccccccc"
	)
	old := time.Now().Add(-48 * time.Hour)
	for _, id := range []string{inUse, abandoned, fresh} {
		if _, _, err := store.Save(id, bytes.NewReader([]byte("x")), 1<<20); err != nil {
			t.Fatal(err)
		}
	}
	for _, id := range []string{inUse, abandoned} {
		if err := os.Chtimes(filepath.Join(dir, id), old, old); err != nil {
			t.Fatal(err)
		}
	}
	th := valid()
	th.Image = imagePath + inUse
	removed, err := NewImageJanitor(store, fakeImageRefs{themes: []Theme{th}}).Sweep(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if len(removed) != 1 || removed[0] != abandoned {
		t.Fatalf("apagados = %v, esperava só o abandonado", removed)
	}
}

type failingRefs struct{}

func (failingRefs) ThemesWithImages(context.Context) ([]Theme, error) {
	return nil, errors.New("banco fora")
}

func TestImageJanitorRunSweepsOnceAndStopsWithTheContext(t *testing.T) {
	dir := t.TempDir()
	store, err := media.NewStore(dir)
	if err != nil {
		t.Fatal(err)
	}
	const abandoned = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
	if _, _, err := store.Save(abandoned, bytes.NewReader([]byte("x")), 1<<20); err != nil {
		t.Fatal(err)
	}
	old := time.Now().Add(-48 * time.Hour)
	if err := os.Chtimes(filepath.Join(dir, abandoned), old, old); err != nil {
		t.Fatal(err)
	}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	// Banco fora: só registra e segue (nada apagado).
	NewImageJanitor(store, failingRefs{}).Run(ctx)
	if files, _ := store.List(); len(files) != 1 {
		t.Fatalf("com o banco fora apagou: %v", files)
	}
	NewImageJanitor(store, fakeImageRefs{}).Run(ctx)
	if files, _ := store.List(); len(files) != 0 {
		t.Fatalf("sobrou %v", files)
	}
}
