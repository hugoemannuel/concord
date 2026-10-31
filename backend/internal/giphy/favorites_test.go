package giphy

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
)

// fakeFavorites guarda os favoritos em memória (user -> GIFs, o mais novo primeiro).
type fakeFavorites struct {
	byUser map[string][]GIFItem
	fail   error
}

func (f *fakeFavorites) ListFavorites(_ context.Context, userID string) ([]GIFItem, error) {
	if f.fail != nil {
		return nil, f.fail
	}
	return append([]GIFItem{}, f.byUser[userID]...), nil
}

func (f *fakeFavorites) AddFavorite(_ context.Context, userID string, gif GIFItem, max int) error {
	if f.fail != nil {
		return f.fail
	}
	for _, g := range f.byUser[userID] {
		if g.ID == gif.ID {
			return nil
		}
	}
	if len(f.byUser[userID]) >= max {
		return ErrFavoritesFull
	}
	f.byUser[userID] = append([]GIFItem{gif}, f.byUser[userID]...)
	return nil
}

func (f *fakeFavorites) RemoveFavorite(_ context.Context, userID, gifID string) error {
	kept := make([]GIFItem, 0)
	for _, g := range f.byUser[userID] {
		if g.ID != gifID {
			kept = append(kept, g)
		}
	}
	f.byUser[userID] = kept
	return nil
}

func favoritesRouter(f *fakeFavorites, max int) *gin.Engine {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	h := NewFavoritesHandler(f)
	h.max = max
	api := r.Group("/")
	FavoriteRoutes(api, h, func(c *gin.Context) {
		if c.GetHeader("X-User") != "" {
			c.Set("userID", c.GetHeader("X-User"))
		}
		c.Next()
	})
	return r
}

func doFav(r *gin.Engine, method, path, user, body string) *httptest.ResponseRecorder {
	req := httptest.NewRequest(method, path, strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	if user != "" {
		req.Header.Set("X-User", user)
	}
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	return w
}

const gifJSON = `{"id":"abc123","title":"gato","url":"https://media3.giphy.com/media/abc123/giphy.gif","preview_url":"https://media3.giphy.com/media/abc123/200.gif","width":480,"height":270}`

func decodeList(t *testing.T, w *httptest.ResponseRecorder) []GIFItem {
	t.Helper()
	var out []GIFItem
	if err := json.Unmarshal(w.Body.Bytes(), &out); err != nil {
		t.Fatalf("corpo inválido %q: %v", w.Body.String(), err)
	}
	return out
}

func TestFavoritosSemLoginDa401(t *testing.T) {
	t.Parallel()
	r := favoritesRouter(&fakeFavorites{byUser: map[string][]GIFItem{}}, 10)
	if w := doFav(r, http.MethodGet, "/users/me/gif-favorites", "", ""); w.Code != http.StatusUnauthorized {
		t.Fatalf("status = %d, quer 401", w.Code)
	}
}

func TestFavoritosListaVaziaEhArrayVazio(t *testing.T) {
	t.Parallel()
	r := favoritesRouter(&fakeFavorites{byUser: map[string][]GIFItem{}}, 10)
	w := doFav(r, http.MethodGet, "/users/me/gif-favorites", "u1", "")
	if w.Code != http.StatusOK || strings.TrimSpace(w.Body.String()) != "[]" {
		t.Fatalf("resposta = %d %q, quer 200 []", w.Code, w.Body.String())
	}
}

func TestFavoritarDevolveListaEIdempotente(t *testing.T) {
	t.Parallel()
	r := favoritesRouter(&fakeFavorites{byUser: map[string][]GIFItem{}}, 10)
	for i := 0; i < 2; i++ {
		w := doFav(r, http.MethodPut, "/users/me/gif-favorites/abc123", "u1", gifJSON)
		if w.Code != http.StatusOK {
			t.Fatalf("status = %d (%s)", w.Code, w.Body.String())
		}
		if got := decodeList(t, w); len(got) != 1 || got[0].ID != "abc123" || got[0].Width != 480 {
			t.Fatalf("lista = %+v", got)
		}
	}
}

func TestFavoritarRejeitaDadoInvalido(t *testing.T) {
	t.Parallel()
	casos := map[string]string{
		"id diferente da rota": strings.Replace(gifJSON, `"abc123","title"`, `"outro","title"`, 1),
		"url fora do giphy":    strings.Replace(gifJSON, "https://media3.giphy.com/media/abc123/giphy.gif", "https://evil.com/x.gif", 1),
		"url sem https":        strings.Replace(gifJSON, "https://media3.giphy.com/media/abc123/giphy.gif", "http://media3.giphy.com/x.gif", 1),
		"host disfarçado":      strings.Replace(gifJSON, "media3.giphy.com/media/abc123/giphy.gif", "giphy.com.evil.com/x.gif", 1),
		"prévia fora do giphy": strings.Replace(gifJSON, "https://media3.giphy.com/media/abc123/200.gif", "https://evil.com/p.gif", 1),
		"tamanho absurdo":      strings.Replace(gifJSON, `"width":480`, `"width":999999`, 1),
		"json quebrado":        `{`,
	}
	for nome, body := range casos {
		t.Run(nome, func(t *testing.T) {
			t.Parallel()
			r := favoritesRouter(&fakeFavorites{byUser: map[string][]GIFItem{}}, 10)
			if w := doFav(r, http.MethodPut, "/users/me/gif-favorites/abc123", "u1", body); w.Code != http.StatusBadRequest {
				t.Fatalf("status = %d, quer 400", w.Code)
			}
		})
	}
}

func TestFavoritarAcimaDoLimiteDa409(t *testing.T) {
	t.Parallel()
	r := favoritesRouter(&fakeFavorites{byUser: map[string][]GIFItem{"u1": {{ID: "x"}}}}, 1)
	if w := doFav(r, http.MethodPut, "/users/me/gif-favorites/abc123", "u1", gifJSON); w.Code != http.StatusConflict {
		t.Fatalf("status = %d, quer 409", w.Code)
	}
}

func TestDesfavoritarDevolveListaSemOGif(t *testing.T) {
	t.Parallel()
	f := &fakeFavorites{byUser: map[string][]GIFItem{"u1": {{ID: "abc123"}, {ID: "z"}}, "u2": {{ID: "abc123"}}}}
	r := favoritesRouter(f, 10)
	w := doFav(r, http.MethodDelete, "/users/me/gif-favorites/abc123", "u1", "")
	if got := decodeList(t, w); w.Code != http.StatusOK || len(got) != 1 || got[0].ID != "z" {
		t.Fatalf("resposta = %d %+v", w.Code, got)
	}
	if len(f.byUser["u2"]) != 1 {
		t.Fatal("desfavoritar mexeu nos favoritos de outra pessoa")
	}
}

func TestFavoritosErroDeBancoDa500(t *testing.T) {
	t.Parallel()
	r := favoritesRouter(&fakeFavorites{byUser: map[string][]GIFItem{}, fail: context.DeadlineExceeded}, 10)
	for _, c := range []struct{ method, path, body string }{
		{http.MethodGet, "/users/me/gif-favorites", ""},
		{http.MethodPut, "/users/me/gif-favorites/abc123", gifJSON},
	} {
		if w := doFav(r, c.method, c.path, "u1", c.body); w.Code != http.StatusInternalServerError {
			t.Fatalf("%s: status = %d, quer 500", c.method, w.Code)
		}
	}
}
