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

	"github.com/gin-gonic/gin"
)

var fpA = strings.Repeat("a", 64)

type fakeDevs struct {
	dev bool
	err error
}

func (f fakeDevs) IsDev(context.Context, string) (bool, error) { return f.dev, f.err }

type fakeReportStore struct {
	err      error
	groupErr error
	query    groupQuery
	limit    int
}

func (f *fakeReportStore) Groups(_ context.Context, q groupQuery) ([]GroupSummary, error) {
	f.query = q
	return []GroupSummary{{Fingerprint: fpA, Source: SourceRenderer, Versions: []string{"1.4.2"}}}, f.err
}

func (f *fakeReportStore) Versions(context.Context, time.Time, time.Time, string) ([]string, error) {
	return []string{"1.4.1", "1.4.2"}, nil
}

func (f *fakeReportStore) VersionIndex(context.Context) ([]groupVersions, error) {
	return []groupVersions{{SourceRenderer, fpA, []string{"1.4.2"}}, {SourceRenderer, "b", []string{"1.4.1"}}}, nil
}

func (f *fakeReportStore) Group(_ context.Context, fp string, from, to time.Time) (GroupSummary, string, error) {
	f.query = groupQuery{From: from, To: to}
	return GroupSummary{Fingerprint: fp, Source: SourceRenderer, Versions: []string{"1.4.2"}}, "    at e (assets/index-Ab3_xY9z.js:1:22)", f.groupErr
}

func (f *fakeReportStore) Screens(context.Context, string, time.Time, time.Time) ([]ScreenCount, error) {
	return nil, f.err
}

func (f *fakeReportStore) Recent(_ context.Context, _ string, _, _ time.Time, limit int) ([]Occurrence, error) {
	f.limit = limit
	return nil, nil
}

type fakeTranslator struct{}

func (fakeTranslator) Translate(stack string) string { return "traduzida: " + stack }

func getPanel(t *testing.T, devs fakeDevs, store *fakeReportStore, path string) *httptest.ResponseRecorder {
	t.Helper()
	gin.SetMode(gin.TestMode)
	r := gin.New()
	h := NewReportHandler(devs, store, fakeTranslator{})
	h.now = func() time.Time { return t0 }
	ReportRoutes(r.Group("/api"), h, func(c *gin.Context) { c.Set("userID", userAna) })
	w := httptest.NewRecorder()
	r.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/api"+path, nil))
	return w
}

func TestReportHandlerRespostas(t *testing.T) {
	boom := errors.New("banco fora")
	dev := fakeDevs{dev: true}
	tests := []struct {
		name  string
		devs  fakeDevs
		store fakeReportStore
		path  string
		want  int
	}{
		{"dev vê a lista", dev, fakeReportStore{}, "/obs/errors", http.StatusOK},
		{"quem não é dev não vê", fakeDevs{}, fakeReportStore{}, "/obs/errors", http.StatusForbidden},
		{"erro ao conferir dev", fakeDevs{err: boom}, fakeReportStore{}, "/obs/errors", http.StatusInternalServerError},
		{"dias inválidos", dev, fakeReportStore{}, "/obs/errors?days=15", http.StatusBadRequest},
		{"dias zero", dev, fakeReportStore{}, "/obs/errors?days=0", http.StatusBadRequest},
		{"origem inválida", dev, fakeReportStore{}, "/obs/errors?source=plugin", http.StatusBadRequest},
		{"versão longa", dev, fakeReportStore{}, "/obs/errors?version=" + strings.Repeat("9", 33), http.StatusBadRequest},
		{"banco fora na lista", dev, fakeReportStore{err: boom}, "/obs/errors", http.StatusInternalServerError},
		{"detalhe", dev, fakeReportStore{}, "/obs/errors/" + fpA, http.StatusOK},
		{"detalhe só para dev", fakeDevs{}, fakeReportStore{}, "/obs/errors/" + fpA, http.StatusForbidden},
		{"detalhe com dias inválidos", dev, fakeReportStore{}, "/obs/errors/" + fpA + "?days=x", http.StatusBadRequest},
		{"impressão fora do formato", dev, fakeReportStore{}, "/obs/errors/XYZ", http.StatusNotFound},
		{"grupo que não existe", dev, fakeReportStore{groupErr: ErrGroupNotFound}, "/obs/errors/" + fpA, http.StatusNotFound},
		{"banco fora no detalhe", dev, fakeReportStore{groupErr: boom}, "/obs/errors/" + fpA, http.StatusInternalServerError},
		{"banco fora nas telas", dev, fakeReportStore{err: boom}, "/obs/errors/" + fpA, http.StatusInternalServerError},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			store := tt.store
			if w := getPanel(t, tt.devs, &store, tt.path); w.Code != tt.want {
				t.Errorf("status = %d (%s), quer %d", w.Code, w.Body.String(), tt.want)
			}
		})
	}
}

func TestReportHandlerLista(t *testing.T) {
	store := &fakeReportStore{}
	w := getPanel(t, fakeDevs{dev: true}, store, "/obs/errors?days=3&source=renderer&version=1.4.2")
	var got ErrorsReport
	if err := json.Unmarshal(w.Body.Bytes(), &got); err != nil {
		t.Fatal(err)
	}
	q := store.query
	if !q.From.Equal(t0.Add(-72*time.Hour)) || !q.To.Equal(t0) || q.Source != SourceRenderer || q.Version != "1.4.2" {
		t.Errorf("consulta = %+v", q)
	}
	if len(got.Groups) != 1 || !got.Groups[0].NewInVersion || got.Versions[0] != "1.4.2" {
		t.Errorf("relatório = %+v", got)
	}
}

func TestReportHandlerDetalhe(t *testing.T) {
	store := &fakeReportStore{}
	w := getPanel(t, fakeDevs{dev: true}, store, "/obs/errors/"+fpA)
	var got map[string]json.RawMessage
	if err := json.Unmarshal(w.Body.Bytes(), &got); err != nil {
		t.Fatal(err)
	}
	for _, key := range []string{"group", "stack", "translated", "screens", "recent"} {
		if _, ok := got[key]; !ok {
			t.Errorf("falta %q no detalhe: %s", key, w.Body.String())
		}
	}
	if string(got["screens"]) != "[]" || string(got["recent"]) != "[]" {
		t.Errorf("listas vazias devem ser [], não null: %s", w.Body.String())
	}
	if !strings.HasPrefix(string(got["translated"]), `"traduzida: `) || store.limit != maxRecent {
		t.Errorf("tradução = %s, limite = %d", got["translated"], store.limit)
	}
	if !strings.Contains(string(got["group"]), `"new_in_version":true`) {
		t.Errorf("grupo sem o selo: %s", got["group"])
	}
	if !store.query.From.Equal(t0.Add(-defaultDays * 24 * time.Hour)) {
		t.Errorf("janela padrão = %v", store.query.From)
	}
}
