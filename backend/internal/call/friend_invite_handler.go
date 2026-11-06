package call

import (
	"errors"
	"net/http"

	"gin-quickstart/backend/internal/platform/authctx"

	"github.com/gin-gonic/gin"
)

// InviteFriends: POST /calls/:id/invites {"user_ids": [...]}.
func (h *Handler) InviteFriends(c *gin.Context) {
	var input struct {
		UserIDs []string `json:"user_ids"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request"})
		return
	}
	userID, ok := authctx.UserID(c)
	if !ok {
		return
	}
	results, err := h.service.InviteFriends(c.Request.Context(), c.Param("id"), userID, input.UserIDs)
	if err != nil {
		c.JSON(mapInviteError(err), gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"results": results})
}

// InviteStatus: GET /calls/:id/invite -> {"valid": bool}. O cartão de convite
// na DM pergunta se a chamada ainda existe (mensagem antiga = inválido).
func (h *Handler) InviteStatus(c *gin.Context) {
	userID, ok := authctx.UserID(c)
	if !ok {
		return
	}
	asInviter := c.Query("as") == "inviter"
	c.JSON(http.StatusOK, gin.H{"valid": h.service.InviteValid(c.Param("id"), userID, asInviter)})
}

// OpenFriendInvite: POST /calls/:id/invites/open (feito pelo convidado, no "Abrir").
func (h *Handler) OpenFriendInvite(c *gin.Context) {
	userID, ok := authctx.UserID(c)
	if !ok {
		return
	}
	admitted, err := h.service.OpenFriendInvite(c.Param("id"), userID)
	if err != nil {
		c.JSON(mapInviteError(err), gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"admitted": admitted})
}

func mapInviteError(err error) int {
	switch {
	case errors.Is(err, ErrNotFound), errors.Is(err, ErrInviteInvalid):
		return http.StatusNotFound
	case errors.Is(err, ErrInviteNotAllowed):
		return http.StatusForbidden
	case errors.Is(err, ErrNoInvitees), errors.Is(err, ErrTooManyInvitees), errors.Is(err, ErrNotChannelCall):
		return http.StatusBadRequest
	default:
		return http.StatusInternalServerError
	}
}
