package call

import (
	"errors"
	"net/http"

	"gin-quickstart/backend/internal/platform/authctx"

	"github.com/gin-gonic/gin"
)

// Accept: POST /calls/:id/accept. O chamado atende a DM e a resposta só sai
// depois de o backend registrar a entrada: o token da mídia pedido em seguida
// já vale (pelo call:accept do WS, o token podia chegar antes e levar 403).
func (h *Handler) Accept(c *gin.Context) {
	userID, ok := authctx.UserID(c)
	if !ok {
		return
	}
	if err := h.service.Accept(c.Request.Context(), c.Param("id"), userID); err != nil {
		c.JSON(mapAcceptError(err), gin.H{"error": err.Error()})
		return
	}
	c.Status(http.StatusNoContent)
}

func mapAcceptError(err error) int {
	switch {
	case errors.Is(err, ErrNotFound):
		return http.StatusNotFound
	case errors.Is(err, ErrNotAllowed):
		return http.StatusForbidden
	case errors.Is(err, ErrBusy):
		return http.StatusConflict
	default:
		return http.StatusInternalServerError
	}
}
