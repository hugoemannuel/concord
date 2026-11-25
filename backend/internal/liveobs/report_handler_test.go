package liveobs

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

type fakeReports struct {
	dev                  bool
	devErr, sessionsErr  error
	eventsErr, seriesErr error
	callEventsErr        error
	from                 time.Time
}

func (f *fakeReports) IsDev(context.Context, string) (bool, error) { return f.dev, f.devErr }

func (f *fakeReports) Sessions(_ context.Context, from time.Time) ([]SessionStats, error) {
	f.from = from
	return []SessionStats{{ID: "s", Kind: KindShare, StartedAt: from, EndedAt: from.Add(time.Minute)}}, f.sessionsErr
}

func (f *fakeReports) Events(context.Context, time.Time, int) ([]EventRow, error) {
	return []EventRow{}, f.eventsErr
}

func (f *fakeReports) CallEvents(context.Context, time.Time, int) ([]EventRow, error) {
	return []EventRow{{Type: EventReconnected, Detail: "16 s"}}, f.callEventsErr
}

func (f *fakeReports) ServerSeries(context.Context, time.Time, time.Time) ([]ServerMinute, error) {
	return nil, f.seriesErr
}

func getReport(t *testing.T, f *fakeReports, query string) *httptest.ResponseRecorder {
	t.Helper()
	gin.SetMode(gin.TestMode)
	r := gin.New()
	h := NewReportHandler(f, f)
	h.now = func() time.Time { return t0 }
	ReportRoutes(r.Group("/api"), h, func(c *gin.Context) { c.Set("userID", userAna) })
	w := httptest.NewRecorder()
	r.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/api/obs/lives"+query, nil))
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
		{"dias fora do limite", fakeReports{dev: true}, "?days=30", http.StatusBadRequest},
		{"sessões falham", fakeReports{dev: true, sessionsErr: boom}, "", http.StatusInternalServerError},
		{"eventos falham", fakeReports{dev: true, eventsErr: boom}, "", http.StatusInternalServerError},
		{"eventos da voz falham", fakeReports{dev: true, callEventsErr: boom}, "", http.StatusInternalServerError},
		{"série falha", fakeReports{dev: true, seriesErr: boom}, "", http.StatusInternalServerError},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			f := tt.f
			if w := getReport(t, &f, tt.query); w.Code != tt.want {
				t.Fatalf("status = %d, quer %d (%s)", w.Code, tt.want, w.Body)
			}
		})
	}
}

func TestReportHandlerPeriodo(t *testing.T) {
	f := &fakeReports{dev: true}
	w := getReport(t, f, "?days=2")
	if !f.from.Equal(t0.Add(-48 * time.Hour)) {
		t.Errorf("desde = %v, quer 2 dias antes", f.from)
	}
	var got LiveReport
	if err := json.Unmarshal(w.Body.Bytes(), &got); err != nil {
		t.Fatal(err)
	}
	if len(got.CallEvents) != 1 || got.CallEvents[0].Detail != "16 s" {
		t.Errorf("eventos da voz = %+v", got.CallEvents)
	}
	if len(got.Lives) != 1 || got.BucketMin != 15 || got.Server == nil {
		t.Errorf("relatório = %+v", got)
	}
	g := &fakeReports{dev: true}
	getReport(t, g, "")
	if !g.from.Equal(t0.Add(-7 * 24 * time.Hour)) {
		t.Errorf("padrão = %v, quer 7 dias", g.from)
	}
}
