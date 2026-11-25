package serverobs

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

type fakeReport struct {
	dev            bool
	devErr, apiErr error
	hostErr        error
	from, to       time.Time
	bucket         time.Duration
}

func (f *fakeReport) IsDev(context.Context, string) (bool, error) { return f.dev, f.devErr }

func (f *fakeReport) LatestAPI(context.Context) (*APIMinute, error) {
	return &APIMinute{Minute: t0, Requests: 7}, f.apiErr
}

func (f *fakeReport) APISeries(_ context.Context, from, to time.Time, bucket time.Duration) ([]APIPoint, error) {
	f.from, f.to, f.bucket = from, to, bucket
	return []APIPoint{{At: from, Requests: 7}}, nil
}

func (f *fakeReport) Routes(context.Context, time.Time, time.Time, int) ([]RouteRow, error) {
	return []RouteRow{{Route: "GET /api/a"}}, nil
}

func (f *fakeReport) LatestHost(context.Context) (*HostMinute, error) { return nil, f.hostErr }

func (f *fakeReport) HostSeries(context.Context, time.Time, time.Time, time.Duration) ([]HostPoint, error) {
	return []HostPoint{}, nil
}

func (f *fakeReport) LatestTables(context.Context) ([]TableSize, error) {
	return []TableSize{{Name: "messages", Bytes: 1}}, nil
}

func getServer(t *testing.T, f *fakeReport, query string) *httptest.ResponseRecorder {
	t.Helper()
	gin.SetMode(gin.TestMode)
	r := gin.New()
	h := NewReportHandler(f, f, f)
	h.now = func() time.Time { return t0 }
	ReportRoutes(r.Group("/api"), h, func(c *gin.Context) { c.Set("userID", "u1") })
	w := httptest.NewRecorder()
	r.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/api/obs/server"+query, nil))
	return w
}

func TestReportHandlerStatus(t *testing.T) {
	boom := errors.New("banco fora")
	tests := []struct {
		name  string
		f     fakeReport
		query string
		want  int
	}{
		{"dev vê", fakeReport{dev: true}, "", http.StatusOK},
		{"quem não é dev não vê", fakeReport{}, "", http.StatusForbidden},
		{"erro ao conferir dev", fakeReport{devErr: boom}, "", http.StatusInternalServerError},
		{"dias inválidos", fakeReport{dev: true}, "?days=abc", http.StatusBadRequest},
		{"dias demais", fakeReport{dev: true}, "?days=15", http.StatusBadRequest},
		{"erro na API", fakeReport{dev: true, apiErr: boom}, "", http.StatusInternalServerError},
		{"erro na VPS", fakeReport{dev: true, hostErr: boom}, "", http.StatusInternalServerError},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if w := getServer(t, &tt.f, tt.query); w.Code != tt.want {
				t.Errorf("status = %d, quer %d (%s)", w.Code, tt.want, w.Body.String())
			}
		})
	}
}

func TestReportHandlerMontaOPainel(t *testing.T) {
	f := &fakeReport{dev: true}
	w := getServer(t, f, "?days=1")
	var got ServerReport
	if err := json.Unmarshal(w.Body.Bytes(), &got); err != nil {
		t.Fatal(err)
	}
	if !f.from.Equal(t0.Add(-24*time.Hour)) || !f.to.Equal(t0) || f.bucket != 5*time.Minute || got.BucketMinutes != 5 {
		t.Errorf("janela = %v–%v, balde %v (%d min)", f.from, f.to, f.bucket, got.BucketMinutes)
	}
	if got.API.Latest == nil || got.API.Latest.Requests != 7 || len(got.API.Routes) != 1 || got.Host.Latest != nil || len(got.Host.Tables) != 1 {
		t.Errorf("painel = %+v", got)
	}
}

func TestBucketFor(t *testing.T) {
	tests := []struct {
		span time.Duration
		want time.Duration
	}{
		{time.Hour, time.Minute},
		{24 * time.Hour, 5 * time.Minute},
		{7 * 24 * time.Hour, time.Hour},
		{14 * 24 * time.Hour, 2 * time.Hour},
		{90 * 24 * time.Hour, 4 * time.Hour},
	}
	for _, tt := range tests {
		if got := bucketFor(tt.span); got != tt.want {
			t.Errorf("bucketFor(%v) = %v, quer %v", tt.span, got, tt.want)
		}
	}
}
