package alert

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
)

type fakeHistory struct {
	rows       []Incident
	from       time.Time
	err        error
	summary    *time.Time
	summaryErr error
}

func (f *fakeHistory) LastDailySummary(context.Context) (*time.Time, error) {
	return f.summary, f.summaryErr
}

func (f *fakeHistory) History(_ context.Context, from time.Time) ([]Incident, error) {
	f.from = from
	return f.rows, f.err
}

type fakeDevs struct {
	dev bool
	err error
}

func (f fakeDevs) IsDev(context.Context, string) (bool, error) { return f.dev, f.err }

func reportRequest(h *ReportHandler, query string) *httptest.ResponseRecorder {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	ReportRoutes(r.Group("/api"), h, func(c *gin.Context) { c.Set("userID", "u1"); c.Next() })
	w := httptest.NewRecorder()
	r.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/api/obs/alerts"+query, nil))
	return w
}

func TestReportHandler(t *testing.T) {
	ended := at(14, 18)
	hist := &fakeHistory{rows: []Incident{
		{ID: 2, RuleID: "host_cpu", Severity: "critico", StartedAt: at(15, 0), Text: "CPU em 97%"},
		{ID: 1, RuleID: "unit_failed", Severity: "aviso", StartedAt: at(14, 2), EndedAt: &ended},
	}}
	h := NewReportHandler(hist, fakeDevs{dev: true}, map[string]string{"host_cpu": "CPU da máquina"}, true)
	h.now = func() time.Time { return at(16, 0) }
	w := reportRequest(h, "?days=3")
	if w.Code != http.StatusOK {
		t.Fatalf("status = %d: %s", w.Code, w.Body)
	}
	var got Report
	if err := json.Unmarshal(w.Body.Bytes(), &got); err != nil {
		t.Fatal(err)
	}
	if !got.Enabled || len(got.Active) != 1 || got.Active[0].Title != "CPU da máquina" || len(got.History) != 2 {
		t.Fatalf("relatório = %+v", got)
	}
	if !hist.from.Equal(at(16, 0).Add(-72 * time.Hour)) {
		t.Errorf("desde = %v", hist.from)
	}
}

func TestReportHandlerErros(t *testing.T) {
	tests := []struct {
		name  string
		devs  fakeDevs
		hist  *fakeHistory
		query string
		want  int
	}{
		{"não é dev", fakeDevs{}, &fakeHistory{}, "", http.StatusForbidden},
		{"erro ao ver se é dev", fakeDevs{err: errors.New("x")}, &fakeHistory{}, "", http.StatusInternalServerError},
		{"dias inválidos", fakeDevs{dev: true}, &fakeHistory{}, "?days=30", http.StatusBadRequest},
		{"erro do banco", fakeDevs{dev: true}, &fakeHistory{err: errors.New("x")}, "", http.StatusInternalServerError},
		{"vazio e desligado", fakeDevs{dev: true}, &fakeHistory{}, "", http.StatusOK},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if w := reportRequest(NewReportHandler(tt.hist, tt.devs, nil, false), tt.query); w.Code != tt.want {
				t.Fatalf("status = %d, quer %d", w.Code, tt.want)
			}
		})
	}
}

func TestReportHandlerUltimoResumo(t *testing.T) {
	sent := at(8, 1)
	hist := &fakeHistory{summary: &sent}
	h := NewReportHandler(hist, fakeDevs{dev: true}, nil, true)
	var got Report
	if err := json.Unmarshal(reportRequest(h, "").Body.Bytes(), &got); err != nil {
		t.Fatal(err)
	}
	if got.LastSummaryAt == nil || !got.LastSummaryAt.Equal(sent) {
		t.Fatalf("último resumo = %v", got.LastSummaryAt)
	}
	hist.summary, hist.summaryErr = nil, errors.New("banco")
	w := reportRequest(h, "")
	if err := json.Unmarshal(w.Body.Bytes(), &got); err != nil || w.Code != http.StatusOK || got.LastSummaryAt != nil {
		t.Fatalf("erro no resumo derruba o painel: %d %s", w.Code, w.Body)
	}
}
