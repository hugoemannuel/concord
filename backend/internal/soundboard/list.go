package soundboard

import (
	"context"
	"net/http"

	"gin-quickstart/backend/internal/platform/authctx"

	"github.com/gin-gonic/gin"
)

// visitorChecker: quem está numa call do servidor como visitante (guest.Service).
type visitorChecker interface {
	HasGuestPass(serverID, userID string) bool
}

// SetVisitors deixa o visitante ver os sons do servidor da call em que está
// (a mesa de áudio da call; docs/adr/0017-visitante-na-call.md).
func (h *Handler) SetVisitors(v visitorChecker) { h.visitors = v }

// List: os sons do servidor, para membros e para quem é visitante lá.
func (h *Handler) List(c *gin.Context) {
	userID, ok := authctx.UserID(c)
	if !ok {
		return
	}
	serverID := c.Param("id")
	ctx := c.Request.Context()

	allowed, err := h.canListSounds(ctx, serverID, userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to check membership"})
		return
	}
	if !allowed {
		c.JSON(http.StatusForbidden, gin.H{"error": ErrNotServerMember.Error()})
		return
	}

	sounds, err := h.repo.ListByServer(ctx, serverID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to list sounds"})
		return
	}
	c.JSON(http.StatusOK, sounds)
}

func (h *Handler) canListSounds(ctx context.Context, serverID, userID string) (bool, error) {
	if h.visitors != nil && h.visitors.HasGuestPass(serverID, userID) {
		return true, nil
	}
	return h.servers.IsMember(ctx, serverID, userID)
}
