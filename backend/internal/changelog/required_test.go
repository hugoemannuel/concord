package changelog

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestPublishMarksTheReleaseRequiredByItsNewNotes(t *testing.T) {
	st := &fakeStore{}
	body := `{"entries":[{"kind":"feature","text":"Novo protocolo","source":"a.md","required":true,"highlight":true}]}`
	w := serve(t, st, "tok", http.MethodPut, "/api/changelog/1.0.0", "tok", body, false)
	if w.Code != http.StatusNoContent {
		t.Fatalf("status = %d %s", w.Code, w.Body.String())
	}
	got := st.upserts["1.0.0"]
	if !got.Required {
		t.Fatal("release com nota obrigatória nova deveria ser obrigatória")
	}
	if len(got.Entries) != 1 || !got.Entries[0].Highlight {
		t.Fatalf("destaque perdido: %+v", got.Entries)
	}
}

// O deploy reenvia os arquivos já publicados: a nota obrigatória de uma versão
// antiga não pode tornar as versões seguintes obrigatórias.
func TestRequiredNoteAlreadyPublishedDoesNotMakeTheNextReleaseRequired(t *testing.T) {
	st := &fakeStore{releases: []Release{{Version: "1.0.0", Required: true,
		Entries: []Entry{{Kind: KindFeature, Text: "Novo protocolo", Source: "a.md"}}}}}
	body := `{"entries":[{"kind":"feature","text":"Novo protocolo","source":"a.md","required":true},{"kind":"fix","text":"Outra","source":"b.md"}]}`
	w := serve(t, st, "tok", http.MethodPut, "/api/changelog/1.0.1", "tok", body, false)
	if w.Code != http.StatusNoContent {
		t.Fatalf("status = %d", w.Code)
	}
	if st.upserts["1.0.1"].Required {
		t.Fatal("1.0.1 não trouxe nota obrigatória nova")
	}
}

func TestRequiredVersionIsTheHighestRequiredRelease(t *testing.T) {
	releases := []Release{
		{Version: "0.10.1"},
		{Version: "0.10.0", Required: true},
		{Version: "0.9.12", Required: true},
		{Version: "0.9.11"},
	}
	if got := requiredVersion(releases); got != "0.10.0" {
		t.Fatalf("requiredVersion = %q", got)
	}
	if got := requiredVersion([]Release{{Version: "1.0.0"}}); got != "" {
		t.Fatalf("sem obrigatória = %q", got)
	}
	// Ordem do banco é por data: a versão é comparada número a número.
	if got := requiredVersion([]Release{{Version: "0.9.9", Required: true}, {Version: "0.10.0", Required: true}}); got != "0.10.0" {
		t.Fatalf("comparação numérica = %q", got)
	}
}

func TestRequiredEndpointIsPublic(t *testing.T) {
	st := &fakeStore{releases: []Release{{Version: "1.2.0"}, {Version: "1.1.0", Required: true}}}
	w := serve(t, st, "tok", http.MethodGet, "/api/changelog/required", "", "", false)
	if w.Code != http.StatusOK {
		t.Fatalf("status = %d", w.Code)
	}
	var got map[string]string
	if err := json.Unmarshal(w.Body.Bytes(), &got); err != nil || got["min_version"] != "1.1.0" {
		t.Fatalf("resposta: %v %s", err, w.Body.String())
	}
}

func TestPublishNotifiesAfterSaving(t *testing.T) {
	st := &fakeStore{}
	notified := 0
	h := NewHandler(st, "tok").OnPublish(func() { notified++ })
	w := serveHandler(t, h, http.MethodPut, "/api/changelog/1.0.0", "tok", goodBody)
	if w.Code != http.StatusNoContent || notified != 1 {
		t.Fatalf("status %d, avisos %d", w.Code, notified)
	}
	serveHandler(t, h, http.MethodPut, "/api/changelog/1.0.0", "errado", goodBody)
	if notified != 1 {
		t.Fatal("publicação recusada não deveria avisar")
	}
}

func TestListShowsHighlightButNotTheRequiredInputFlag(t *testing.T) {
	st := &fakeStore{releases: []Release{{Version: "1.0.0", Required: true,
		Entries: []Entry{{Kind: KindFeature, Text: "A", Source: "a.md", Highlight: true, Required: true}}}}}
	w := serve(t, st, "tok", http.MethodGet, "/api/changelog", "", "", true)
	want := `[{"version":"1.0.0","released_at":"0001-01-01T00:00:00Z","summary":"","required":true,"entries":[{"kind":"feature","text":"A","highlight":true}]}]`
	if w.Body.String() != want {
		t.Fatalf("got  %s\nwant %s", w.Body.String(), want)
	}
}

func serveHandler(t *testing.T, h *Handler, method, path, sentToken, body string) *httptest.ResponseRecorder {
	t.Helper()
	return serveWith(t, h, method, path, sentToken, body, true)
}
