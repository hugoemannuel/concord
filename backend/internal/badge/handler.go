package badge

import (
	"context"
	"errors"
	"log"
	"net/http"

	"gin-quickstart/backend/internal/platform/authctx"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

type badgeSource interface {
	Badges(ctx context.Context, viewerID, userID string) (Response, error)
}

type Handler struct {
	service badgeSource
}

func BadgeHandler(service *Service) *Handler {
	return &Handler{service: service}
}

// Get devolve os badges de alguém: GET /users/:id/badges. Quem pode ver o
// perfil (qualquer pessoa logada, como em /users/:id/profile) vê os badges
// conquistados; números e progresso, só a própria pessoa. Badge sem o tier 1
// não sai para ninguém.
func (h *Handler) Get(c *gin.Context) {
	viewerID, ok := authctx.UserID(c)
	if !ok {
		return
	}
	id := c.Param("id")
	if _, err := uuid.Parse(id); err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "user not found"})
		return
	}
	res, err := h.service.Badges(c.Request.Context(), viewerID, id)
	if errors.Is(err, ErrUserNotFound) {
		c.JSON(http.StatusNotFound, gin.H{"error": "user not found"})
		return
	}
	if err != nil {
		log.Printf("[badge] load %s: %v", id, err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load badges"})
		return
	}
	c.JSON(http.StatusOK, res)
}
