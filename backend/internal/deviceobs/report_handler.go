package deviceobs

import (
	"context"
	"errors"
	"log"
	"net/http"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
)

const (
	defaultDays = 7
	maxDays     = 14
)

var errDays = errors.New("days: de 1 a 14")

type reportSource interface {
	IsDev(ctx context.Context, userID string) (bool, error)
	People(ctx context.Context, from time.Time) ([]PersonStats, error)
	Baseline(ctx context.Context, from time.Time) ([]BaselineRow, error)
	Versions(ctx context.Context, from time.Time) ([]VersionRow, error)
}

// ReportHandler: o painel do aparelho, só para os devs.
type ReportHandler struct {
	reports reportSource
	now     func() time.Time
}

func NewReportHandler(reports reportSource) *ReportHandler {
	return &ReportHandler{reports: reports, now: time.Now}
}

// Devices: GET /obs/devices?days=N (1–14, padrão 7).
func (h *ReportHandler) Devices(c *gin.Context) {
	ctx := c.Request.Context()
	dev, err := h.reports.IsDev(ctx, c.GetString("userID"))
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
		log.Printf("[deviceobs] painel: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load"})
		return
	}
	c.JSON(http.StatusOK, report)
}

func deny(c *gin.Context, err error) {
	if err != nil {
		log.Printf("[deviceobs] painel: %v", err)
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

func (h *ReportHandler) load(ctx context.Context, from, to time.Time) (DeviceReport, error) {
	people, err := h.reports.People(ctx, from)
	if err != nil {
		return DeviceReport{}, err
	}
	baseline, err := h.reports.Baseline(ctx, from)
	if err != nil {
		return DeviceReport{}, err
	}
	versions, err := h.reports.Versions(ctx, from)
	if err != nil {
		return DeviceReport{}, err
	}
	return buildReport(from, to, people, baseline, versions), nil
}
