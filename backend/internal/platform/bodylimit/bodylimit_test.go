package bodylimit

import (
	"bytes"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
)

// readAll: rota que lê o corpo inteiro e diz quantos bytes leu (ou 413).
func readAll(c *gin.Context) {
	n, err := io.Copy(io.Discard, c.Request.Body)
	if err != nil {
		c.Status(http.StatusRequestEntityTooLarge)
		return
	}
	c.String(http.StatusOK, "%d", n)
}

func newEngine(cfg Config) *gin.Engine {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	api := r.Group("/api", Middleware(cfg))
	api.POST("/json", readAll)
	api.POST("/users/me/entrance-sound", readAll)
	return r
}

func post(r *gin.Engine, path, contentType string, size int) *httptest.ResponseRecorder {
	req := httptest.NewRequest(http.MethodPost, path, bytes.NewReader(make([]byte, size)))
	req.Header.Set("Content-Type", contentType)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	return w
}

var testCfg = Config{Default: 10, Upload: 100, LargeRoutes: []string{"POST /api/users/me/entrance-sound"}}

func TestJSONAcimaDoPadraoECortado(t *testing.T) {
	r := newEngine(testCfg)
	if w := post(r, "/api/json", "application/json", 10); w.Code != http.StatusOK {
		t.Fatalf("no limite: status %d, want 200", w.Code)
	}
	if w := post(r, "/api/json", "application/json", 11); w.Code != http.StatusRequestEntityTooLarge {
		t.Fatalf("acima do limite: status %d, want 413", w.Code)
	}
}

// Content-Type mentiroso não escapa do padrão: só multipart ganha o teto de upload.
func TestSemContentTypeOuTextoValeOPadrao(t *testing.T) {
	r := newEngine(testCfg)
	for _, ct := range []string{"", "text/plain", "application/octet-stream"} {
		if w := post(r, "/api/json", ct, 11); w.Code != http.StatusRequestEntityTooLarge {
			t.Fatalf("Content-Type %q: status %d, want 413", ct, w.Code)
		}
	}
}

func TestMultipartGanhaOTetoDeUpload(t *testing.T) {
	r := newEngine(testCfg)
	ct := "multipart/form-data; boundary=x"
	if w := post(r, "/api/json", ct, 100); w.Code != http.StatusOK {
		t.Fatalf("multipart no teto: status %d, want 200", w.Code)
	}
	if w := post(r, "/api/json", ct, 101); w.Code != http.StatusRequestEntityTooLarge {
		t.Fatalf("multipart acima do teto: status %d, want 413", w.Code)
	}
}

func TestRotaGrandeGanhaOTetoDeUpload(t *testing.T) {
	r := newEngine(testCfg)
	if w := post(r, "/api/users/me/entrance-sound", "audio/mpeg", 100); w.Code != http.StatusOK {
		t.Fatalf("rota grande no teto: status %d, want 200", w.Code)
	}
	if w := post(r, "/api/users/me/entrance-sound", "", 101); w.Code != http.StatusRequestEntityTooLarge {
		t.Fatalf("rota grande acima do teto: status %d, want 413", w.Code)
	}
}

func TestAPIConfigCobreOsUploadsCrus(t *testing.T) {
	cfg := APIConfig()
	if cfg.Default != DefaultLimit || cfg.Upload != UploadLimit {
		t.Fatalf("limites = %d/%d, want %d/%d", cfg.Default, cfg.Upload, DefaultLimit, UploadLimit)
	}
	want := []string{
		"POST /api/users/me/entrance-sound",
		"POST /api/users/me/app-sounds/:event",
		"PUT /api/changelog/:version",
	}
	got := strings.Join(cfg.LargeRoutes, ",")
	for _, route := range want {
		if !strings.Contains(got, route) {
			t.Fatalf("LargeRoutes = %v, falta %q", cfg.LargeRoutes, route)
		}
	}
}
