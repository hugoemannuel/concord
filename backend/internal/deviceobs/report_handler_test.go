package deviceobs

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

var t0 = time.Date(2026, 11, 25, 12, 0, 0, 0, time.UTC)

type fakeReports struct {
	dev                                bool
	devErr, peopleErr, baseErr, verErr error
	from                               time.Time
}

func (f *fakeReports) IsDev(context.Context, string) (bool, error) { return f.dev, f.devErr }

func (f *fakeReports) People(_ context.Context, from time.Time) ([]PersonStats, error) {
	f.from = from
	return []PersonStats{{Username: "ana", Samples: 3, Hangs: 1}}, f.peopleErr
}

func (f *fakeReports) Baseline(context.Context, time.Time) ([]BaselineRow, error) {
	return []BaselineRow{{State: StateCall}}, f.baseErr
}

func (f *fakeReports) Versions(context.Context, time.Time) ([]VersionRow, error) {
	return nil, f.verErr
}

func getDevices(t *testing.T, f *fakeReports, query string) *httptest.ResponseRecorder {
	t.Helper()
	gin.SetMode(gin.TestMode)
	r := gin.New()
	h := NewReportHandler(f)
	h.now = func() time.Time { return t0 }
	ReportRoutes(r.Group("/api"), h, func(c *gin.Context) { c.Set("userID", userAna) })
	w := httptest.NewRecorder()
	r.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/api/obs/devices"+query, nil))
	return w
}

func TestReportHandler(t *testing.T) {
	boom := errors.New("banco fora")
	tests := []struct {
		name  string
		f     fakeReports
		query string
		want  int
	}{
		{"dev vê", fakeReports{dev: true}, "", http.StatusOK},
		{"quem não é dev não vê", fakeReports{}, "", http.StatusForbidden},
		{"erro ao conferir dev", fakeReports{devErr: boom}, "", http.StatusInternalServerError},
		{"dias inválidos", fakeReports{dev: true}, "?days=abc", http.StatusBadRequest},
		{"dias acima do limite", fakeReports{dev: true}, "?days=15", http.StatusBadRequest},
		{"dias abaixo do limite", fakeReports{dev: true}, "?days=0", http.StatusBadRequest},
		{"pessoas falham", fakeReports{dev: true, peopleErr: boom}, "", http.StatusInternalServerError},
		{"linha de base falha", fakeReports{dev: true, baseErr: boom}, "", http.StatusInternalServerError},
		{"versões falham", fakeReports{dev: true, verErr: boom}, "", http.StatusInternalServerError},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			f := tt.f
			if w := getDevices(t, &f, tt.query); w.Code != tt.want {
				t.Fatalf("status = %d, quer %d (%s)", w.Code, tt.want, w.Body)
			}
		})
	}
}

func TestReportHandlerPeriodoERelatorio(t *testing.T) {
	f := &fakeReports{dev: true}
	w := getDevices(t, f, "?days=14")
	if !f.from.Equal(t0.Add(-14 * 24 * time.Hour)) {
		t.Errorf("desde = %v, quer 14 dias antes", f.from)
	}
	var got map[string]any
	if err := json.Unmarshal(w.Body.Bytes(), &got); err != nil {
		t.Fatal(err)
	}
	worst, _ := got["worst"].([]any)
	versions, _ := got["versions"].([]any)
	if got["people"] != 1.0 || got["samples"] != 3.0 || len(worst) != 1 || versions == nil {
		t.Errorf("relatório = %s", w.Body)
	}
	g := &fakeReports{dev: true}
	getDevices(t, g, "")
	if !g.from.Equal(t0.Add(-7 * 24 * time.Hour)) {
		t.Errorf("padrão = %v, quer 7 dias", g.from)
	}
}
