package apperrors

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"gin-quickstart/backend/internal/platform/ratelimit"

	"github.com/gin-gonic/gin"
)

type savedCall struct {
	userID string
	cc     ClientContext
	errs   []Captured
}

type fakeSaver struct {
	calls []savedCall
	err   error
}

func (f *fakeSaver) SaveAll(_ context.Context, userID string, cc ClientContext, errs []Captured, _ time.Time) error {
	f.calls = append(f.calls, savedCall{userID, cc, errs})
	return f.err
}

func (f *fakeSaver) total() int {
	n := 0
	for _, c := range f.calls {
		n += len(c.errs)
	}
	return n
}

func ingestRouter(h *IngestHandler, userID string, guest bool) *gin.Engine {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	auth := func(c *gin.Context) {
		c.Set("userID", userID)
		if guest {
			c.Set("guest", true)
		}
	}
	IngestRoutes(r.Group("/api"), h, auth)
	return r
}

func post(r *gin.Engine, body string) *httptest.ResponseRecorder {
	w := httptest.NewRecorder()
	r.ServeHTTP(w, httptest.NewRequest(http.MethodPost, "/api/obs/errors", strings.NewReader(body)))
	return w
}

func batchJSON(t *testing.T, n int) string {
	t.Helper()
	b := validBatch()
	b.Errors = nil
	for range n {
		b.Errors = append(b.Errors, validBatch().Errors[0])
	}
	raw, err := json.Marshal(b)
	if err != nil {
		t.Fatal(err)
	}
	return string(raw)
}

func TestIngestRespostas(t *testing.T) {
	ok := batchJSON(t, 1)
	tests := []struct {
		name   string
		user   string
		guest  bool
		body   string
		err    error
		status int
	}{
		{"grava", userAna, false, ok, nil, http.StatusNoContent},
		{"sem conta", "", false, ok, nil, http.StatusUnauthorized},
		{"visitante", userAna, true, ok, nil, http.StatusUnauthorized},
		{"json quebrado", userAna, false, "{", nil, http.StatusBadRequest},
		{"origem backend", userAna, false, strings.Replace(ok, `"renderer"`, `"backend"`, 1), nil, http.StatusBadRequest},
		{"corpo grande demais", userAna, false, `{"context":{"os":"` + strings.Repeat("x", maxBodyBytes) + `"}}`, nil, http.StatusBadRequest},
		{"banco fora", userAna, false, ok, errors.New("fora"), http.StatusInternalServerError},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			store := &fakeSaver{err: tt.err}
			w := post(ingestRouter(NewIngestHandler(store), tt.user, tt.guest), tt.body)
			if w.Code != tt.status {
				t.Fatalf("status = %d (%s), quer %d", w.Code, w.Body.String(), tt.status)
			}
		})
	}
}

func TestIngestGravaLimpoComAImpressaoDoServidor(t *testing.T) {
	store := &fakeSaver{}
	body := strings.Replace(batchJSON(t, 1), `"Cannot read`, `"ana@exemplo.com Cannot read`, 1)
	if w := post(ingestRouter(NewIngestHandler(store), userAna, false), body); w.Code != http.StatusNoContent {
		t.Fatalf("status = %d", w.Code)
	}
	if len(store.calls) != 1 || store.calls[0].userID != userAna || store.calls[0].cc.Target != TargetDesktop {
		t.Fatalf("gravou %+v", store.calls)
	}
	e := store.calls[0].errs[0]
	if !strings.HasPrefix(e.Message, "<email> ") || e.Fingerprint == "" || e.Count != 3 {
		t.Errorf("erro gravado = %+v", e)
	}
}

func TestIngestLimitaPedidosPorMinuto(t *testing.T) {
	r := ingestRouter(NewIngestHandler(&fakeSaver{}), userAna, false)
	body := batchJSON(t, 1)
	for i := range requestsPerMinute {
		if w := post(r, body); w.Code != http.StatusNoContent {
			t.Fatalf("pedido %d = %d", i+1, w.Code)
		}
	}
	w := post(r, body)
	if w.Code != http.StatusTooManyRequests || w.Header().Get("Retry-After") == "" {
		t.Fatalf("pedido além do limite = %d, Retry-After %q", w.Code, w.Header().Get("Retry-After"))
	}
}

func TestIngestDescartaAlemDoTetoPorPessoaEmSilencio(t *testing.T) {
	store := &fakeSaver{}
	h := NewIngestHandler(store)
	h.requests = ratelimit.New(1000, time.Minute, 10)
	r := ingestRouter(h, userAna, false)
	body := batchJSON(t, maxErrors)
	for range perUserPerHour/maxErrors + 2 {
		if w := post(r, body); w.Code != http.StatusNoContent {
			t.Fatalf("status = %d, quer 204 mesmo acima do teto", w.Code)
		}
	}
	if got := store.total(); got != perUserPerHour {
		t.Errorf("gravados = %d, quer %d", got, perUserPerHour)
	}
	if len(store.calls) != perUserPerHour/maxErrors {
		t.Errorf("idas ao banco = %d: acima do teto não devia gravar nada", len(store.calls))
	}
}

func TestIngestTetoGlobal(t *testing.T) {
	store := &fakeSaver{}
	h := NewIngestHandler(store)
	h.requests = ratelimit.New(1000, time.Minute, 10)
	h.global = ratelimit.New(15, time.Hour, 1)
	body := batchJSON(t, maxErrors)
	post(ingestRouter(h, userAna, false), body)
	post(ingestRouter(h, userBia, false), body)
	if got := store.total(); got != 15 {
		t.Fatalf("gravados = %d, quer 15 (teto global)", got)
	}
	// quem foi barrado pelo teto global não perde a cota pessoal.
	if retry, blocked := h.perUser.Blocked(userBia); blocked {
		t.Errorf("cota da bia bloqueada (%v)", retry)
	}
	h.global = ratelimit.New(1000, time.Hour, 1)
	post(ingestRouter(h, userBia, false), batchJSON(t, maxErrors))
	if got := store.total(); got != 25 {
		t.Errorf("gravados = %d, quer 25", got)
	}
}
