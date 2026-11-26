package changelog

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
)

type fakeStore struct {
	releases []Release
	upserts  map[string]Publication
}

func (f *fakeStore) List(context.Context) ([]Release, error) { return f.releases, nil }

func (f *fakeStore) Upsert(_ context.Context, version string, p Publication) error {
	if f.upserts == nil {
		f.upserts = map[string]Publication{}
	}
	f.upserts[version] = p
	return nil
}

func serve(t *testing.T, st *fakeStore, token, method, path, sentToken, body string, logged bool) *httptest.ResponseRecorder {
	t.Helper()
	return serveWith(t, NewHandler(st, token), method, path, sentToken, body, logged)
}

func serveWith(t *testing.T, h *Handler, method, path, sentToken, body string, logged bool) *httptest.ResponseRecorder {
	t.Helper()
	gin.SetMode(gin.TestMode)
	r := gin.New()
	auth := func(c *gin.Context) {
		if !logged {
			c.AbortWithStatus(http.StatusUnauthorized)
			return
		}
		c.Next()
	}
	Routes(r.Group("/api"), h, auth)
	req := httptest.NewRequest(method, path, bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	if sentToken != "" {
		req.Header.Set("X-Changelog-Token", sentToken)
	}
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	return w
}

const goodBody = `{"entries":[{"kind":"feature","text":"Changelog"},{"kind":"fix","text":"Corrigido"}]}`

func TestListRequiresLogin(t *testing.T) {
	w := serve(t, &fakeStore{}, "tok", http.MethodGet, "/api/changelog", "", "", false)
	if w.Code != http.StatusUnauthorized {
		t.Fatalf("status = %d", w.Code)
	}
}

func TestListReturnsReleasesAndNeverNull(t *testing.T) {
	empty := serve(t, &fakeStore{}, "tok", http.MethodGet, "/api/changelog", "", "", true)
	if empty.Code != http.StatusOK || empty.Body.String() != "[]" {
		t.Fatalf("vazio: %d %q", empty.Code, empty.Body.String())
	}
	st := &fakeStore{releases: []Release{{
		Version: "0.6.2", ReleasedAt: time.Date(2026, 10, 24, 12, 0, 0, 0, time.UTC),
		Entries: []Entry{{Kind: KindFix, Text: "Corrigido"}},
	}}}
	w := serve(t, st, "tok", http.MethodGet, "/api/changelog", "", "", true)
	var got []Release
	if err := json.Unmarshal(w.Body.Bytes(), &got); err != nil || len(got) != 1 || got[0].Version != "0.6.2" {
		t.Fatalf("resposta inesperada: %v %s", err, w.Body.String())
	}
}

func TestPublishNeedsTheToken(t *testing.T) {
	st := &fakeStore{}
	for _, sent := range []string{"", "errado"} {
		w := serve(t, st, "tok", http.MethodPut, "/api/changelog/0.6.3", sent, goodBody, false)
		if w.Code != http.StatusUnauthorized {
			t.Fatalf("token %q: status = %d", sent, w.Code)
		}
	}
	if len(st.upserts) != 0 {
		t.Fatal("publicou sem token válido")
	}
}

func TestPublishDisabledWithoutConfiguredToken(t *testing.T) {
	w := serve(t, &fakeStore{}, "", http.MethodPut, "/api/changelog/0.6.3", "qualquer", goodBody, false)
	if w.Code != http.StatusServiceUnavailable {
		t.Fatalf("status = %d", w.Code)
	}
}

func TestPublishStoresTheRelease(t *testing.T) {
	st := &fakeStore{}
	w := serve(t, st, "tok", http.MethodPut, "/api/changelog/0.6.3", "tok", goodBody, false)
	if w.Code != http.StatusNoContent {
		t.Fatalf("status = %d: %s", w.Code, w.Body.String())
	}
	got := st.upserts["0.6.3"]
	if len(got.Entries) != 2 || got.Entries[1].Kind != KindFix {
		t.Fatalf("entradas = %+v", got.Entries)
	}
	// Repetir o deploy não pode falhar nem duplicar: é um Upsert pela versão.
	if w := serve(t, st, "tok", http.MethodPut, "/api/changelog/0.6.3", "tok", goodBody, false); w.Code != http.StatusNoContent {
		t.Fatalf("repetido: status = %d", w.Code)
	}
}

func entryBody(text string) string {
	b, _ := json.Marshal(Publication{Entries: []Entry{{Kind: KindFeature, Text: text}}})
	return string(b)
}

// Regressão da 0.6.43: o limite contava bytes, e uma nota de 535 caracteres
// (559 bytes por causa dos acentos) voltou 400 no deploy.
func TestPublishCountsCharactersNotBytes(t *testing.T) {
	st := &fakeStore{}
	accented := strings.Repeat("é", maxEntryText)
	w := serve(t, st, "tok", http.MethodPut, "/api/changelog/0.6.3", "tok", entryBody(accented), false)
	if w.Code != http.StatusNoContent {
		t.Fatalf("status = %d: %s", w.Code, w.Body.String())
	}
}

func TestPublishCountsSummaryCharactersNotBytes(t *testing.T) {
	st := &fakeStore{}
	body := `{"summary":"` + strings.Repeat("é", maxSummary) + `","entries":[]}`
	w := serve(t, st, "tok", http.MethodPut, "/api/changelog/0.6.3", "tok", body, false)
	if w.Code != http.StatusNoContent {
		t.Fatalf("status = %d: %s", w.Code, w.Body.String())
	}
}

func TestPublishAcceptsTheLongestNoteSoFar(t *testing.T) {
	st := &fakeStore{}
	w := serve(t, st, "tok", http.MethodPut, "/api/changelog/0.6.3", "tok", entryBody(strings.Repeat("ã", 535)), false)
	if w.Code != http.StatusNoContent {
		t.Fatalf("status = %d: %s", w.Code, w.Body.String())
	}
}

func TestPublishRejectsBadInput(t *testing.T) {
	cases := map[string]struct{ path, body string }{
		"versão inválida": {"/api/changelog/abc", goodBody},
		"kind inválido":   {"/api/changelog/0.6.3", `{"entries":[{"kind":"x","text":"a"}]}`},
		"texto vazio":     {"/api/changelog/0.6.3", `{"entries":[{"kind":"fix","text":"  "}]}`},
		"texto longo":     {"/api/changelog/0.6.3", entryBody(strings.Repeat("a", maxEntryText+1))},
		"summary longo":   {"/api/changelog/0.6.3", `{"summary":"` + strings.Repeat("a", maxSummary+1) + `"}`},
		"json quebrado":   {"/api/changelog/0.6.3", `{`},
	}
	for name, tc := range cases {
		st := &fakeStore{}
		w := serve(t, st, "tok", http.MethodPut, tc.path, "tok", tc.body, false)
		if w.Code != http.StatusBadRequest {
			t.Errorf("%s: status = %d", name, w.Code)
		}
		if len(st.upserts) != 0 {
			t.Errorf("%s: gravou", name)
		}
	}
}
