package level

import (
	"net/http"
	"strings"

	"gin-quickstart/backend/internal/platform/authctx"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

const maxUserIDs = 200

type Handler struct {
	service *Service
}

func LevelHandler(service *Service) *Handler {
	return &Handler{
		service: service,
	}
}

// GetMe devolve o nível de quem está logado.
func (h *Handler) GetMe(c *gin.Context) {
	userID, ok := authctx.UserID(c)
	if !ok {
		return
	}

	id := userID
	levels, err := h.service.FindByUserIDs(c.Request.Context(), []string{id})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load level"})
		return
	}

	c.JSON(http.StatusOK, levels[id])
}

// List devolve o nível de vários usuários: GET /levels?user_ids=a,b,c.
func (h *Handler) List(c *gin.Context) {
	var ids []string
	seen := map[string]bool{}
	for _, raw := range strings.Split(c.Query("user_ids"), ",") {
		id := strings.TrimSpace(raw)
		if id == "" || seen[id] {
			continue
		}
		if _, err := uuid.Parse(id); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid user id"})
			return
		}
		seen[id] = true
		ids = append(ids, id)
	}
	if len(ids) == 0 {
		c.JSON(http.StatusOK, gin.H{})
		return
	}
	if len(ids) > maxUserIDs {
		c.JSON(http.StatusBadRequest, gin.H{"error": "too many user ids"})
		return
	}

	levels, err := h.service.FindByUserIDs(c.Request.Context(), ids)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load levels"})
		return
	}

	c.JSON(http.StatusOK, levels)
}
