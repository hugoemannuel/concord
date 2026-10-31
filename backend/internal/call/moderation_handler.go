package call

import (
	"context"
	"errors"
	"net/http"

	"gin-quickstart/backend/internal/audit"

	"github.com/gin-gonic/gin"
)

// Moderação de voz: mover, silenciar, ensurdecer e desconectar.

// Move: um moderador tira alguém do canal de voz em que está e o põe em
// outro canal de voz do mesmo servidor.
func (h *Handler) Move(c *gin.Context) {
	var input struct {
		UserID    string `json:"user_id"`
		ChannelID string `json:"channel_id"`
	}
	if err := c.ShouldBindJSON(&input); err != nil || input.UserID == "" || input.ChannelID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "user_id and channel_id are required"})
		return
	}

	userID, exists := c.Get("userID")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}

	from, _ := h.moderator.VoiceLocationOf(input.UserID)
	call, err := h.moderator.MoveToChannel(c.Request.Context(), userID.(string), input.UserID, input.ChannelID)
	if err != nil {
		c.JSON(mapMoveError(err), gin.H{"error": err.Error()})
		return
	}
	h.recordMove(c.Request.Context(), userID.(string), input.UserID, from, call)

	c.JSON(http.StatusOK, call)
}

func mapMoveError(err error) int {
	switch {
	case errors.Is(err, ErrNotModerator), errors.Is(err, ErrCannotMoveOwner), errors.Is(err, ErrCannotActOnMember), errors.Is(err, ErrTargetCannotJoin):
		return http.StatusForbidden
	case errors.Is(err, ErrNotInVoice), errors.Is(err, ErrSameChannel), errors.Is(err, ErrNotVoiceChannel):
		return http.StatusBadRequest
	default:
		return mapStartError(err)
	}
}

// respondModeration traduz os erros das ações de moderação de voz.
func respondModeration(c *gin.Context, err error) {
	status, code := http.StatusInternalServerError, "internal"
	switch {
	case errors.Is(err, ErrMissingPermission):
		status, code = http.StatusForbidden, "missing_permission"
	case errors.Is(err, ErrCannotActOnMember):
		status, code = http.StatusForbidden, "role_hierarchy"
	case errors.Is(err, ErrNotMember):
		status, code = http.StatusForbidden, "not_member"
	case errors.Is(err, ErrNotFound), errors.Is(err, ErrTargetNotInCall):
		status, code = http.StatusNotFound, "not_found"
	case errors.Is(err, ErrNotChannelCall):
		status, code = http.StatusBadRequest, "invalid"
	}
	msg := err.Error()
	if status == http.StatusInternalServerError {
		msg = "internal error"
	}
	c.JSON(status, gin.H{"error": msg, "code": code})
}

// ServerMute: POST /calls/:id/participants/:userId/server-mute {muted}.
func (h *Handler) ServerMute(c *gin.Context) {
	h.serverVoice(c, audit.VoiceMute, "mute", h.moderator.SetServerMute)
}

// ServerDeafen: POST /calls/:id/participants/:userId/server-deafen {deafened}.
func (h *Handler) ServerDeafen(c *gin.Context) {
	h.serverVoice(c, audit.VoiceDeafen, "deaf", h.moderator.SetServerDeafen)
}

type voiceToggle func(ctx context.Context, callID, actorID, targetID string, on bool) error

func (h *Handler) serverVoice(c *gin.Context, action audit.Action, field string, apply voiceToggle) {
	var input struct {
		Muted    *bool `json:"muted"`
		Deafened *bool `json:"deafened"`
	}
	if err := c.ShouldBindJSON(&input); err != nil || (input.Muted == nil && input.Deafened == nil) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request"})
		return
	}
	on := false
	if input.Muted != nil {
		on = *input.Muted
	} else {
		on = *input.Deafened
	}
	userID, exists := c.Get("userID")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}
	callID, targetID := c.Param("id"), c.Param("userId")
	if err := apply(c.Request.Context(), callID, userID.(string), targetID, on); err != nil {
		respondModeration(c, err)
		return
	}
	h.recordVoice(c.Request.Context(), userID.(string), callID, targetID, action, audit.Change{Field: field, After: on})
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

// Disconnect: DELETE /calls/:id/participants/:userId (MOVE_MEMBERS).
func (h *Handler) Disconnect(c *gin.Context) {
	userID, exists := c.Get("userID")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}
	callID, targetID := c.Param("id"), c.Param("userId")
	// O lugar sai antes: depois de desconectar, a pessoa não está mais na call.
	loc, inCall := h.callLocation(callID, targetID)
	if err := h.moderator.DisconnectParticipant(c.Request.Context(), callID, userID.(string), targetID); err != nil {
		respondModeration(c, err)
		return
	}
	h.recordAt(c.Request.Context(), userID.(string), targetID, audit.VoiceDisconnect, loc, inCall)
	c.JSON(http.StatusOK, gin.H{"ok": true})
}
