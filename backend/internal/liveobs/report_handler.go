package liveobs

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
	maxEventRows = 100
	// maxCallEventRows: teto das quedas e falhas da voz no período (poucas).
	maxCallEventRows = 300
)

var errDays = errors.New("days: de 1 a 14")

type reportSource interface {
	IsDev(ctx context.Context, userID string) (bool, error)
	Sessions(ctx context.Context, from time.Time) ([]SessionStats, error)
	Events(ctx context.Context, from time.Time, limit int) ([]EventRow, error)
	CallEvents(ctx context.Context, from time.Time, limit int) ([]EventRow, error)
}

type seriesSource interface {
	ServerSeries(ctx context.Context, from, to time.Time) ([]ServerMinute, error)
}

// ReportHandler: o painel das lives, só para os devs.
type ReportHandler struct {
	reports reportSource
	series  seriesSource
	now     func() time.Time
}

func NewReportHandler(reports reportSource, series seriesSource) *ReportHandler {
	return &ReportHandler{reports: reports, series: series, now: time.Now}
}

// Lives: GET /obs/lives?days=N (1–14, padrão 7).
func (h *ReportHandler) Lives(c *gin.Context) {
	ctx := c.Request.Context()
	dev, err := h.reports.IsDev(ctx, c.GetString("userID"))
	if err != nil || !dev {
		h.deny(c, err)
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
		log.Printf("[liveobs] painel: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load"})
		return
	}
	c.JSON(http.StatusOK, report)
}

func (h *ReportHandler) deny(c *gin.Context, err error) {
	if err != nil {
		log.Printf("[liveobs] painel: %v", err)
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

func (h *ReportHandler) load(ctx context.Context, from, to time.Time) (LiveReport, error) {
	sessions, err := h.reports.Sessions(ctx, from)
	if err != nil {
		return LiveReport{}, err
	}
	events, err := h.reports.Events(ctx, from, maxEventRows)
	if err != nil {
		return LiveReport{}, err
	}
	callEvents, err := h.reports.CallEvents(ctx, from, maxCallEventRows)
	if err != nil {
		return LiveReport{}, err
	}
	minutes, err := h.series.ServerSeries(ctx, from, to)
	if err != nil {
		return LiveReport{}, fmt.Errorf("série do LiveKit: %w", err)
	}
	report := buildReport(from, to, sessions, minutes, events)
	report.CallEvents = callEvents
	return report, nil
}
