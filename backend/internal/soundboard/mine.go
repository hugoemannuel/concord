package soundboard

import (
	"net/http"

	"gin-quickstart/backend/internal/platform/authctx"

	"github.com/gin-gonic/gin"
)

// ListMine: os sons de todos os servidores de quem pede, agrupados por
// servidor (uma consulta), para a mesa mostrar todos, como as figurinhas.
func (h *Handler) ListMine(c *gin.Context) {
	userID, ok := authctx.UserID(c)
	if !ok {
		return
	}
	groups, err := h.repo.ListForUser(c.Request.Context(), userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to list sounds"})
		return
	}
	c.JSON(http.StatusOK, groups)
}
