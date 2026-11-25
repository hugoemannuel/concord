package deviceobs

import (
	"context"
	"errors"
	"log"
	"net/http"
	"time"

	"gin-quickstart/backend/internal/platform/ratelimit"

	"github.com/gin-gonic/gin"
)

// Limites do POST /obs/device: o app manda um lote a cada 5 linhas ou 5
// minutos (o que vier antes) e quando a call acaba.
const (
	maxBodyBytes = 16 << 10
	perWindow    = 3
	rateWindow   = 5 * time.Minute
	limiterKeys  = 10_000
)

// batchSaver grava um pedido de uma vez; sessão de outra pessoa é pulada.
type batchSaver interface {
	Save(ctx context.Context, userID string, b Batch) error
}

// Handler recebe as métricas do aparelho.
type Handler struct {
	store   batchSaver
	limiter *ratelimit.Limiter
}

func NewHandler(store batchSaver) *Handler {
	return &Handler{store: store, limiter: ratelimit.New(perWindow, rateWindow, limiterKeys)}
}

// Ingest: POST /obs/device. 204 = gravado (sessão de outra pessoa é pulada).
func (h *Handler) Ingest(c *gin.Context) {
	userID := c.GetString("userID")
	if userID == "" {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}
	if retry, ok := h.limiter.Allow(userID); !ok {
		c.Header("Retry-After", ratelimit.RetryAfterSeconds(retry))
		c.JSON(http.StatusTooManyRequests, gin.H{"error": "too many reports"})
		return
	}
	batch, err := decodeBatch(c)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if err := h.store.Save(c.Request.Context(), userID, batch); err != nil {
		log.Printf("[deviceobs] métricas de %s: %v", userID, err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to save"})
		return
	}
	c.Status(http.StatusNoContent)
}

func decodeBatch(c *gin.Context) (Batch, error) {
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, maxBodyBytes)
	var b Batch
	if err := c.ShouldBindJSON(&b); err != nil {
		return b, errors.New("invalid body")
	}
	return b, b.Validate()
}
