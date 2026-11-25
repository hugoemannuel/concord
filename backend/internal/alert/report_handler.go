package alert

import (
	"context"
	"errors"
	"log"
	"net/http"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
)

// Painel: GET /api/obs/alerts?days=N (1–14, padrão 14), só para os devs
// (dev_badge_users). O que está disparado agora e o histórico do período.

const maxReportDays = 14

var errReportDays = errors.New("days: de 1 a 14")

type historySource interface {
	History(ctx context.Context, from time.Time) ([]Incident, error)
	// LastDailySummary: quando saiu o último resumo diário (nil = nenhum).
	LastDailySummary(ctx context.Context) (*time.Time, error)
}

type devCheck interface {
	IsDev(ctx context.Context, userID string) (bool, error)
}

// ReportRow: um incidente com o nome da regra.
type ReportRow struct {
	Incident
	Title string `json:"title"`
}

// Report: a resposta do painel. Enabled = ALERTS_SERVER_ID ligado.
type Report struct {
	Enabled bool        `json:"enabled"`
	Active  []ReportRow `json:"active"`
	History []ReportRow `json:"history"`
	// LastSummaryAt: quando saiu o último resumo diário (nil = nenhum).
	LastSummaryAt *time.Time `json:"last_summary_at"`
}

type ReportHandler struct {
	history historySource
	devs    devCheck
	titles  map[string]string
	enabled bool
	now     func() time.Time
}

func NewReportHandler(history historySource, devs devCheck, titles map[string]string, enabled bool) *ReportHandler {
	return &ReportHandler{history: history, devs: devs, titles: titles, enabled: enabled, now: time.Now}
}

// ReportRoutes: dentro de /api, com a sessão.
func ReportRoutes(api *gin.RouterGroup, h *ReportHandler, auth gin.HandlerFunc) {
	api.GET("/obs/alerts", auth, h.Alerts)
}

func (h *ReportHandler) Alerts(c *gin.Context) {
	ctx := c.Request.Context()
	dev, err := h.devs.IsDev(ctx, c.GetString("userID"))
	if err != nil || !dev {
		deny(c, err)
		return
	}
	days, err := reportDays(c.Query("days"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	rows, err := h.history.History(ctx, h.now().Add(-time.Duration(days)*24*time.Hour))
	if err != nil {
		log.Printf("[alert] painel: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load"})
		return
	}
	out := h.report(rows)
	out.LastSummaryAt = h.lastSummary(ctx)
	c.JSON(http.StatusOK, out)
}

// lastSummary: o último resumo diário; erro só vai para o log (o resto do painel vale).
func (h *ReportHandler) lastSummary(ctx context.Context) *time.Time {
	at, err := h.history.LastDailySummary(ctx)
	if err != nil {
		log.Printf("[alert] painel, último resumo: %v", err)
	}
	return at
}

func (h *ReportHandler) report(rows []Incident) Report {
	out := Report{Enabled: h.enabled, Active: []ReportRow{}, History: []ReportRow{}}
	for _, inc := range rows {
		row := ReportRow{Incident: inc, Title: h.titles[inc.RuleID]}
		if inc.EndedAt == nil {
			out.Active = append(out.Active, row)
		}
		out.History = append(out.History, row)
	}
	return out
}

func deny(c *gin.Context, err error) {
	if err != nil {
		log.Printf("[alert] painel: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load"})
		return
	}
	c.JSON(http.StatusForbidden, gin.H{"error": "devs only"})
}

func reportDays(raw string) (int, error) {
	if raw == "" {
		return maxReportDays, nil
	}
	days, err := strconv.Atoi(raw)
	if err != nil || days < 1 || days > maxReportDays {
		return 0, errReportDays
	}
	return days, nil
}
