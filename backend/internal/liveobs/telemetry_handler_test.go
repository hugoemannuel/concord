package liveobs

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
)

// fakeSaver grava o lote inteiro ou nada (como a transação); sessão de
// outra pessoa (ErrNotOwner em errs) é pulada.
type fakeSaver struct {
	saved []Report
	errs  map[string]error
	calls int
}

func (f *fakeSaver) SaveAll(_ context.Context, userID string, reports []Report) error {
	f.calls++
	var owned []Report
	for _, r := range reports {
		err := f.errs[r.SessionID]
		if errors.Is(err, ErrNotOwner) {
			continue
		}
		if err != nil {
			return err
		}
		owned = append(owned, r)
	}
	f.saved = append(f.saved, owned...)
	return nil
}

func postTelemetry(t *testing.T, h *TelemetryHandler, user, body string) *httptest.ResponseRecorder {
	t.Helper()
	gin.SetMode(gin.TestMode)
	r := gin.New()
	auth := func(c *gin.Context) {
		if user != "" {
			c.Set("userID", user)
		}
	}
	TelemetryRoutes(r.Group("/api"), h, auth)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, httptest.NewRequest(http.MethodPost, "/api/obs/telemetry", strings.NewReader(body)))
	return w
}

const goodBody = `{"reports":[{"session_id":"` + sessionA + `","kind":"transmite","sample":{"seconds":20,"codec":"H264"}}]}`

func TestTelemetryHandler(t *testing.T) {
	other := "6f1c1b7e-8a5e-4a51-9f2a-dddddddddddd"
	tests := []struct {
		name  string
		user  string
		body  string
		errs  map[string]error
		want  int
		saved int
	}{
		{"grava", userAna, goodBody, nil, http.StatusNoContent, 1},
		{"sem login", "", goodBody, nil, http.StatusUnauthorized, 0},
		{"json quebrado", userAna, `{"reports":`, nil, http.StatusBadRequest, 0},
		{"sessão inválida", userAna, `{"reports":[{"session_id":"x","kind":"call"}]}`, nil, http.StatusBadRequest, 0},
		{"grande demais", userAna, `{"reports":[],"x":"` + strings.Repeat("a", maxBodyBytes) + `"}`, nil, http.StatusBadRequest, 0},
		{"sessão de outra pessoa é pulada", userAna,
			`{"reports":[{"session_id":"` + other + `","kind":"call"},{"session_id":"` + sessionA + `","kind":"call"}]}`,
			map[string]error{other: ErrNotOwner}, http.StatusNoContent, 1},
		{"banco fora", userAna, goodBody, map[string]error{sessionA: errors.New("x")}, http.StatusInternalServerError, 0},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			saver := &fakeSaver{errs: tt.errs}
			w := postTelemetry(t, NewTelemetryHandler(saver), tt.user, tt.body)
			if w.Code != tt.want {
				t.Fatalf("status = %d, quer %d (%s)", w.Code, tt.want, w.Body)
			}
			if len(saver.saved) != tt.saved {
				t.Errorf("gravados = %d, quer %d", len(saver.saved), tt.saved)
			}
			if saver.calls > 1 {
				t.Errorf("gravações = %d, quer o pedido inteiro numa só", saver.calls)
			}
		})
	}
}

func TestTelemetryHandlerLimitaPorPessoa(t *testing.T) {
	h := NewTelemetryHandler(&fakeSaver{})
	for i := range perMinute {
		if w := postTelemetry(t, h, userAna, goodBody); w.Code != http.StatusNoContent {
			t.Fatalf("pedido %d: %d", i, w.Code)
		}
	}
	w := postTelemetry(t, h, userAna, goodBody)
	if w.Code != http.StatusTooManyRequests || w.Header().Get("Retry-After") == "" {
		t.Fatalf("acima do limite: %d, Retry-After %q", w.Code, w.Header().Get("Retry-After"))
	}
	if w := postTelemetry(t, h, userBia, goodBody); w.Code != http.StatusNoContent {
		t.Errorf("outra pessoa bloqueada: %d", w.Code)
	}
}
