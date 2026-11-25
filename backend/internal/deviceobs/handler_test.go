package deviceobs

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
)

type fakeSaver struct {
	saved []Batch
	err   error
}

func (f *fakeSaver) Save(_ context.Context, _ string, b Batch) error {
	if f.err != nil {
		return f.err
	}
	f.saved = append(f.saved, b)
	return nil
}

func postDevice(t *testing.T, h *Handler, user, body string) *httptest.ResponseRecorder {
	t.Helper()
	gin.SetMode(gin.TestMode)
	r := gin.New()
	auth := func(c *gin.Context) {
		if user != "" {
			c.Set("userID", user)
		}
	}
	IngestRoutes(r.Group("/api"), h, auth)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, httptest.NewRequest(http.MethodPost, "/api/obs/device", strings.NewReader(body)))
	return w
}

const goodBody = `{"session":{"id":"` + sessionA + `","os":"Windows","target":"desktop","gpu_status":"enabled"},
	"samples":[{"seconds":60,"ago_s":0,"state":"call","cpu_renderer":6.5,"hangs":0}]}`

func TestHandlerIngest(t *testing.T) {
	tests := []struct {
		name  string
		user  string
		body  string
		err   error
		want  int
		saved int
	}{
		{"grava", userAna, goodBody, nil, http.StatusNoContent, 1},
		{"sem login", "", goodBody, nil, http.StatusUnauthorized, 0},
		{"json quebrado", userAna, `{"session":`, nil, http.StatusBadRequest, 0},
		{"estado inválido", userAna, `{"session":{"id":"` + sessionA + `"},"samples":[{"seconds":60,"state":"x"}]}`,
			nil, http.StatusBadRequest, 0},
		{"grande demais", userAna, `{"samples":[],"x":"` + strings.Repeat("a", maxBodyBytes) + `"}`,
			nil, http.StatusBadRequest, 0},
		{"banco fora", userAna, goodBody, errors.New("x"), http.StatusInternalServerError, 0},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			saver := &fakeSaver{err: tt.err}
			w := postDevice(t, NewHandler(saver), tt.user, tt.body)
			if w.Code != tt.want {
				t.Fatalf("status = %d, quer %d (%s)", w.Code, tt.want, w.Body)
			}
			if len(saver.saved) != tt.saved {
				t.Errorf("gravados = %d, quer %d", len(saver.saved), tt.saved)
			}
		})
	}
}

func TestHandlerGravaOLoteLimpo(t *testing.T) {
	saver := &fakeSaver{}
	body := `{"session":{"id":"` + sessionA + `","gpu_status":"talvez"},"samples":[{"seconds":5000,"state":"parado"}]}`
	if w := postDevice(t, NewHandler(saver), userAna, body); w.Code != http.StatusNoContent {
		t.Fatalf("status = %d", w.Code)
	}
	if b := saver.saved[0]; b.Session.GPUStatus != "" || b.Samples[0].Seconds != maxSeconds {
		t.Errorf("lote = %+v", b)
	}
}

func bodyOf(session string) string {
	return `{"session":{"id":"` + session + `"},"samples":[{"seconds":60,"state":"parado"}]}`
}

// O limite é por abertura do app (pessoa + sessão): duas abas ou dois
// aparelhos da mesma pessoa não dividem a cota.
func TestHandlerLimitaPorAbertura(t *testing.T) {
	h := NewHandler(&fakeSaver{})
	for i := range perWindow {
		if w := postDevice(t, h, userAna, bodyOf(sessionA)); w.Code != http.StatusNoContent {
			t.Fatalf("pedido %d: %d", i, w.Code)
		}
	}
	w := postDevice(t, h, userAna, bodyOf(sessionA))
	if w.Code != http.StatusTooManyRequests || w.Header().Get("Retry-After") == "" {
		t.Fatalf("acima do limite: %d, Retry-After %q", w.Code, w.Header().Get("Retry-After"))
	}
	if w := postDevice(t, h, userAna, bodyOf(sessionB)); w.Code != http.StatusNoContent {
		t.Errorf("outra abertura da mesma pessoa bloqueada: %d", w.Code)
	}
	if w := postDevice(t, h, userBia, bodyOf(sessionA)); w.Code != http.StatusNoContent {
		t.Errorf("outra pessoa bloqueada: %d", w.Code)
	}
}

func TestHandlerCorpoQuebradoNaoGastaACota(t *testing.T) {
	h := NewHandler(&fakeSaver{})
	for range perWindow + 1 {
		postDevice(t, h, userAna, `{"session":`)
	}
	if w := postDevice(t, h, userAna, bodyOf(sessionA)); w.Code != http.StatusNoContent {
		t.Errorf("cota gasta por corpo quebrado: %d", w.Code)
	}
}
