package media

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/google/uuid"
)

const tinyPNG = "\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR"

func serveImage(t *testing.T, s *Store, id string) (*httptest.ResponseRecorder, bool) {
	t.Helper()
	w := httptest.NewRecorder()
	ok := ServeImage(w, httptest.NewRequest(http.MethodGet, "/x", nil), s, id)
	return w, ok
}

func TestServeImageEntregaComCabecalhosSeguros(t *testing.T) {
	s, err := NewStore(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	id := uuid.NewString()
	if _, _, err := s.Save(id, strings.NewReader(tinyPNG), 1<<20); err != nil {
		t.Fatal(err)
	}
	w, ok := serveImage(t, s, id)
	if !ok || w.Code != http.StatusOK || w.Body.String() != tinyPNG {
		t.Fatalf("ok=%v status=%d", ok, w.Code)
	}
	h := w.Header()
	if h.Get("Content-Type") != "image/png" || h.Get("X-Content-Type-Options") != "nosniff" ||
		!strings.Contains(h.Get("Content-Security-Policy"), "sandbox") || !strings.Contains(h.Get("Cache-Control"), "max-age") {
		t.Errorf("cabeçalhos = %v", h)
	}
}

// Só entrega o que os bytes dizem ser imagem: HTML guardado com outro nome
// nunca sai (rodaria script na origem do app web).
func TestServeImageRecusaOQueNaoEImagem(t *testing.T) {
	s, err := NewStore(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	html := uuid.NewString()
	if _, _, err := s.Save(html, strings.NewReader("<html><script>alert(1)</script>"), 1<<20); err != nil {
		t.Fatal(err)
	}
	for _, id := range []string{"nao-e-uuid", "../../etc/passwd", uuid.NewString(), html} {
		if w, ok := serveImage(t, s, id); ok || w.Body.Len() != 0 {
			t.Errorf("id %q: ok=%v corpo=%q", id, ok, w.Body.String())
		}
	}
}
