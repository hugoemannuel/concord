package serverobs

import (
	"context"
	"errors"
	"fmt"
	"log"
	"net/http"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
)

const (
	defaultDays  = 7
	maxDays      = 14
	maxRouteRows = 20
	maxPoints    = 300
)

var errDays = errors.New("days: de 1 a 14")

var bucketSteps = []time.Duration{
	time.Minute, 5 * time.Minute, 15 * time.Minute, 30 * time.Minute,
	time.Hour, 2 * time.Hour, 4 * time.Hour,
}

// devChecker: quem está em dev_badge_users (liveobs.ReportRepository).
type devChecker interface {
	IsDev(ctx context.Context, userID string) (bool, error)
}

type apiReportSource interface {
	LatestAPI(ctx context.Context) (*APIMinute, error)
	APISeries(ctx context.Context, from, to time.Time, bucket time.Duration) ([]APIPoint, error)
	Routes(ctx context.Context, from, to time.Time, limit int) ([]RouteRow, error)
}

type hostReportSource interface {
	LatestHost(ctx context.Context) (*HostMinute, error)
	HostSeries(ctx context.Context, from, to time.Time, bucket time.Duration) ([]HostPoint, error)
	LatestTables(ctx context.Context) ([]TableSize, error)
}

// ReportHandler: o painel do servidor, só para os devs.
type ReportHandler struct {
	devs devChecker
	api  apiReportSource
	host hostReportSource
	now  func() time.Time
}

func NewReportHandler(devs devChecker, api apiReportSource, host hostReportSource) *ReportHandler {
	return &ReportHandler{devs: devs, api: api, host: host, now: time.Now}
}

// Server: GET /obs/server?days=N (1–14, padrão 7).
func (h *ReportHandler) Server(c *gin.Context) {
	ctx := c.Request.Context()
	dev, err := h.devs.IsDev(ctx, c.GetString("userID"))
	if err != nil || !dev {
		deny(c, err)
		return
	}
	days, err := parseDays(c.Query("days"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	to := h.now()
	report, err := h.load(ctx, to.Add(-time.Duration(days)*24*time.Hour), to)
	if err != nil {
		log.Printf("[serverobs] painel: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load"})
		return
	}
	c.JSON(http.StatusOK, report)
}

func deny(c *gin.Context, err error) {
	if err != nil {
		log.Printf("[serverobs] painel: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load"})
		return
	}
	c.JSON(http.StatusForbidden, gin.H{"error": "devs only"})
}

func parseDays(raw string) (int, error) {
	if raw == "" {
		return defaultDays, nil
	}
	days, err := strconv.Atoi(raw)
	if err != nil || days < 1 || days > maxDays {
		return 0, errDays
	}
	return days, nil
}

// bucketFor: o menor balde que deixa a série com até maxPoints pontos.
func bucketFor(span time.Duration) time.Duration {
	for _, step := range bucketSteps {
		if span/step <= maxPoints {
			return step
		}
	}
	return bucketSteps[len(bucketSteps)-1]
}

func (h *ReportHandler) load(ctx context.Context, from, to time.Time) (ServerReport, error) {
	bucket := bucketFor(to.Sub(from))
	report := ServerReport{From: from, To: to, BucketMinutes: int(bucket / time.Minute)}
	api, err := h.loadAPI(ctx, from, to, bucket)
	if err != nil {
		return ServerReport{}, fmt.Errorf("API: %w", err)
	}
	host, err := h.loadHost(ctx, from, to, bucket)
	if err != nil {
		return ServerReport{}, fmt.Errorf("VPS: %w", err)
	}
	report.API, report.Host = api, host
	return report, nil
}

func (h *ReportHandler) loadAPI(ctx context.Context, from, to time.Time, bucket time.Duration) (APIReport, error) {
	var r APIReport
	var err1, err2, err3 error
	r.Latest, err1 = h.api.LatestAPI(ctx)
	r.Series, err2 = h.api.APISeries(ctx, from, to, bucket)
	r.Routes, err3 = h.api.Routes(ctx, from, to, maxRouteRows)
	return r, errors.Join(err1, err2, err3)
}

func (h *ReportHandler) loadHost(ctx context.Context, from, to time.Time, bucket time.Duration) (HostReport, error) {
	var r HostReport
	var err1, err2, err3 error
	r.Latest, err1 = h.host.LatestHost(ctx)
	r.Series, err2 = h.host.HostSeries(ctx, from, to, bucket)
	r.Tables, err3 = h.host.LatestTables(ctx)
	return r, errors.Join(err1, err2, err3)
}
