package apperrors

import (
	"context"
	"errors"
	"log"
	"net/http"
	"time"

	"gin-quickstart/backend/internal/platform/ratelimit"

	"github.com/gin-gonic/gin"
)

// Limites do POST /obs/errors (ADR 0068): o app manda a cada 30 s, até 10
// erros. Além dos tetos por hora, os erros são descartados em silêncio (204):
// um aparelho em laço não enche o banco.
const (
	maxBodyBytes      = 32 << 10
	requestsPerMinute = 6
	perUserPerHour    = 120
	globalPerHour     = 1200
	limiterKeys       = 10_000
	globalKey         = "*"
)

// errorSaver grava os erros já preparados de um pedido.
type errorSaver interface {
	SaveAll(ctx context.Context, userID string, cc ClientContext, errs []Captured, at time.Time) error
}

// IngestHandler recebe os erros do app (só conta com login).
type IngestHandler struct {
	store    errorSaver
	requests *ratelimit.Limiter
	perUser  *ratelimit.Limiter
	global   *ratelimit.Limiter
	now      func() time.Time
}

func NewIngestHandler(store errorSaver) *IngestHandler {
	return &IngestHandler{
		store:    store,
		requests: ratelimit.New(requestsPerMinute, time.Minute, limiterKeys),
		perUser:  ratelimit.New(perUserPerHour, time.Hour, limiterKeys),
		global:   ratelimit.New(globalPerHour, time.Hour, 1),
		now:      time.Now,
	}
}

// Ingest: POST /obs/errors. 204 = gravado (ou descartado pelos tetos).
func (h *IngestHandler) Ingest(c *gin.Context) {
	userID := c.GetString("userID")
	// O authMiddleware já recusa o visitante (403); a conferência aqui é defesa.
	if userID == "" || c.GetBool("guest") {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}
	if retry, ok := h.requests.Allow(userID); !ok {
		c.Header("Retry-After", ratelimit.RetryAfterSeconds(retry))
		c.JSON(http.StatusTooManyRequests, gin.H{"error": "too many reports"})
		return
	}
	batch, err := decodeBatch(c)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if err := h.save(c.Request.Context(), userID, batch); err != nil {
		log.Printf("[apperrors] erros de %s: %v", userID, err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to save"})
		return
	}
	c.Status(http.StatusNoContent)
}

func (h *IngestHandler) save(ctx context.Context, userID string, batch Batch) error {
	errs := h.admit(userID, batch.Errors)
	if len(errs) == 0 {
		return nil
	}
	return h.store.SaveAll(ctx, userID, batch.Context, errs, h.now())
}

// admit: os erros que cabem no teto da pessoa e no total; o resto sai.
// Barrado pelo total, a pessoa não perde a cota dela.
func (h *IngestHandler) admit(userID string, errs []Captured) []Captured {
	for i := range errs {
		if _, ok := h.perUser.Allow(userID); !ok {
			return errs[:i]
		}
		if _, ok := h.global.Allow(globalKey); !ok {
			h.perUser.Undo(userID)
			return errs[:i]
		}
	}
	return errs
}

func decodeBatch(c *gin.Context) (Batch, error) {
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, maxBodyBytes)
	var b Batch
	if err := c.ShouldBindJSON(&b); err != nil {
		return b, errors.New("invalid body")
	}
	return b, b.Validate()
}
