package apptheme

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
)

const meID = "11111111-1111-4111-8111-111111111111"

// fakeStore guarda em memória (o SQL tem teste próprio com Postgres).
type fakeStore struct {
	themes map[string][]Theme
	fail   bool
}

func (f *fakeStore) Themes(_ context.Context, userID string) ([]Theme, error) {
	if f.fail {
		return nil, errors.New("banco fora")
	}
	if list, ok := f.themes[userID]; ok {
		return list, nil
	}
	return []Theme{}, nil
}

func (f *fakeStore) SaveThemes(_ context.Context, userID string, list []Theme) error {
	if f.fail {
		return errors.New("banco fora")
	}
	f.themes[userID] = list
	return nil
}

func newRouter(store *fakeStore) *gin.Engine {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	auth := func(c *gin.Context) { c.Set("userID", meID); c.Next() }
	Routes(r.Group("/api"), NewHandler(NewService(store)), auth)
	return r
}

func do(r *gin.Engine, method, body string) (int, map[string]json.RawMessage) {
	w := httptest.NewRecorder()
	req := httptest.NewRequest(method, "/api/users/me/app-themes", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	r.ServeHTTP(w, req)
	var out map[string]json.RawMessage
	_ = json.Unmarshal(w.Body.Bytes(), &out)
	return w.Code, out
}

func TestHandler(t *testing.T) {
	t.Run("GET sem nada salvo devolve lista vazia", func(t *testing.T) {
		code, out := do(newRouter(&fakeStore{themes: map[string][]Theme{}}), http.MethodGet, "")
		if code != http.StatusOK || string(out["themes"]) != "[]" {
			t.Fatalf("%d %s", code, out["themes"])
		}
	})

	t.Run("PUT salva e devolve a lista limpa; GET traz de volta", func(t *testing.T) {
		store := &fakeStore{themes: map[string][]Theme{}}
		r := newRouter(store)
		code, out := do(r, http.MethodPut, `{"themes":[{"id":"abc","name":" Rubro ","accent":"#E11D48","background":"#2a0a0a","sidebar":"#1f0707","card":"#3b0d0d","text":"#ffffff","glow":""}]}`)
		if code != http.StatusOK {
			t.Fatalf("PUT %d", code)
		}
		var got []Theme
		_ = json.Unmarshal(out["themes"], &got)
		if len(got) != 1 || got[0].Name != "Rubro" || got[0].Accent != "#e11d48" {
			t.Fatalf("got %+v", got)
		}
		if len(store.themes[meID]) != 1 {
			t.Fatal("não gravou")
		}
		_, out = do(r, http.MethodGet, "")
		if !strings.Contains(string(out["themes"]), `"Rubro"`) {
			t.Fatalf("GET %s", out["themes"])
		}
	})

	t.Run("PUT inválido é 400 e não grava", func(t *testing.T) {
		store := &fakeStore{themes: map[string][]Theme{}}
		for _, body := range []string{`{"themes":[{"id":"x","name":"a","accent":"vermelho"}]}`, `nada`} {
			if code, _ := do(newRouter(store), http.MethodPut, body); code != http.StatusBadRequest {
				t.Fatalf("%s → %d", body, code)
			}
		}
		if len(store.themes) != 0 {
			t.Fatal("gravou lixo")
		}
	})

	t.Run("corpo grande demais é 400", func(t *testing.T) {
		body := `{"themes":[],"x":"` + strings.Repeat("a", MaxBodyBytes) + `"}`
		if code, _ := do(newRouter(&fakeStore{themes: map[string][]Theme{}}), http.MethodPut, body); code != http.StatusBadRequest {
			t.Fatalf("%d", code)
		}
	})

	t.Run("banco fora é 500", func(t *testing.T) {
		r := newRouter(&fakeStore{fail: true})
		if code, _ := do(r, http.MethodGet, ""); code != http.StatusInternalServerError {
			t.Fatalf("GET %d", code)
		}
		if code, _ := do(r, http.MethodPut, `{"themes":[]}`); code != http.StatusInternalServerError {
			t.Fatalf("PUT %d", code)
		}
	})
}
