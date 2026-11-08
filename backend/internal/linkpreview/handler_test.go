package linkpreview

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"

	"gin-quickstart/backend/internal/platform/media"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

type fakeSource struct {
	cached  map[string]*Preview
	fetched int
	result  *Preview
}

func (s *fakeSource) Cached(_ context.Context, key string) (*Preview, bool, error) {
	p, ok := s.cached[key]
	return p, ok, nil
}

func (s *fakeSource) Fetch(context.Context, string) (*Preview, error) {
	s.fetched++
	return s.result, nil
}

// fakeAuth: "Authorization: Bearer <id>" vira o usuário; sem ele, 401.
func fakeAuth(c *gin.Context) {
	id := strings.TrimPrefix(c.GetHeader("Authorization"), "Bearer ")
	if id == "" {
		c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}
	c.Set("userID", id)
}

func newRouter(t *testing.T, src *fakeSource, images *media.Store) *gin.Engine {
	t.Helper()
	gin.SetMode(gin.TestMode)
	r := gin.New()
	Routes(r.Group("/api"), NewHandler(src, images), fakeAuth)
	return r
}

func get(r *gin.Engine, target, user string) *httptest.ResponseRecorder {
	req := httptest.NewRequest(http.MethodGet, target, nil)
	if user != "" {
		req.Header.Set("Authorization", "Bearer "+user)
	}
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	return w
}

func previewTarget(u string) string { return "/api/link-previews?url=" + url.QueryEscape(u) }

func TestHandlerExigeLogin(t *testing.T) {
	r := newRouter(t, &fakeSource{}, nil)
	if w := get(r, previewTarget("https://a.com/"), ""); w.Code != http.StatusUnauthorized {
		t.Fatalf("sem login: %d, want 401", w.Code)
	}
}

func TestHandlerURLInvalida(t *testing.T) {
	src := &fakeSource{}
	r := newRouter(t, src, nil)
	for _, u := range []string{"", "javascript:alert(1)", "ftp://a.com/", "https://a.com:8080/"} {
		if w := get(r, previewTarget(u), "u1"); w.Code != http.StatusBadRequest {
			t.Errorf("url %q: %d, want 400", u, w.Code)
		}
	}
	if src.fetched != 0 {
		t.Error("URL inválida não busca")
	}
}

func TestHandlerDevolveCartaoOu204(t *testing.T) {
	src := &fakeSource{result: &Preview{URL: "https://a.com/", Title: "A"}}
	r := newRouter(t, src, nil)

	w := get(r, previewTarget("https://A.com/#x"), "u1")
	var p Preview
	if w.Code != http.StatusOK || json.Unmarshal(w.Body.Bytes(), &p) != nil || p.Title != "A" {
		t.Fatalf("status %d, corpo %s", w.Code, w.Body)
	}
	src.result = nil
	if w := get(r, previewTarget("https://b.com/"), "u1"); w.Code != http.StatusNoContent {
		t.Fatalf("sem cartão: %d, want 204", w.Code)
	}
}

func TestHandlerLimitePorUsuarioSoSemCache(t *testing.T) {
	src := &fakeSource{cached: map[string]*Preview{"https://cache.com/": {URL: "https://cache.com/", Title: "C"}}}
	r := newRouter(t, src, nil)

	for i := 0; i < 40; i++ {
		if w := get(r, previewTarget("https://cache.com/"), "ana"); w.Code != http.StatusOK {
			t.Fatalf("cache acertado %d: %d, want 200 (não conta no limite)", i, w.Code)
		}
	}
	for i := 0; i < previewsPerMinute; i++ {
		if w := get(r, previewTarget("https://novo.com/"), "ana"); w.Code == http.StatusTooManyRequests {
			t.Fatalf("pedido %d já barrado", i+1)
		}
	}
	w := get(r, previewTarget("https://novo.com/"), "ana")
	if w.Code != http.StatusTooManyRequests || w.Header().Get("Retry-After") == "" {
		t.Fatalf("pedido %d: %d, want 429 com Retry-After", previewsPerMinute+1, w.Code)
	}
	if w := get(r, previewTarget("https://novo.com/"), "bia"); w.Code == http.StatusTooManyRequests {
		t.Error("o limite é por usuário")
	}
}

func newImageStore(t *testing.T) *media.Store {
	t.Helper()
	s, err := media.NewStore(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	return s
}

func TestImagemServidaSemLoginComCabecalhos(t *testing.T) {
	images := newImageStore(t)
	id := uuid.NewString()
	if _, _, err := images.Save(id, strings.NewReader(pngBytes), maxImageBytes); err != nil {
		t.Fatal(err)
	}
	r := newRouter(t, &fakeSource{}, images)

	w := get(r, "/api/link-previews/image/"+id, "")
	if w.Code != http.StatusOK || w.Body.String() != pngBytes {
		t.Fatalf("status %d", w.Code)
	}
	h := w.Header()
	if h.Get("Content-Type") != "image/png" || h.Get("X-Content-Type-Options") != "nosniff" ||
		!strings.Contains(h.Get("Content-Security-Policy"), "sandbox") || !strings.Contains(h.Get("Cache-Control"), "max-age") {
		t.Errorf("cabeçalhos = %v", h)
	}
}

func TestImagemInvalidaOuQueNaoEImagem(t *testing.T) {
	images := newImageStore(t)
	html := uuid.NewString()
	images.Save(html, strings.NewReader("<html><script>alert(1)</script>"), maxImageBytes)
	r := newRouter(t, &fakeSource{}, images)

	for _, id := range []string{"nao-e-uuid", "..%2F..%2Fetc", uuid.NewString(), html} {
		if w := get(r, "/api/link-previews/image/"+id, ""); w.Code != http.StatusNotFound {
			t.Errorf("id %q: %d, want 404", id, w.Code)
		}
	}
}
