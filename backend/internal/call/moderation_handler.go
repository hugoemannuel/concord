package call

import (
	"context"
	"errors"
	"net/http"

	"gin-quickstart/backend/internal/audit"

	"github.com/gin-gonic/gin"
)

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

	ctx := c.Request.Context()
	actorID := userID.(string)
	from, wasInVoice := h.service.VoiceLocationOf(input.UserID)
	call, err := h.service.MoveToChannel(ctx, actorID, input.UserID, input.ChannelID)
	if err != nil {
		h.recordFailedMove(ctx, actorID, input.UserID, from, wasInVoice)
		c.JSON(mapMoveError(err), gin.H{"error": err.Error()})
		return
	}
	if wasInVoice {
		h.recordMove(ctx, actorID, input.UserID, from, input.ChannelID)
	}

	c.JSON(http.StatusOK, call)
}

// recordMove registra a mudança de canal (de onde saiu e para onde foi).
func (h *Handler) recordMove(ctx context.Context, actorID, targetID string, from VoiceLocation, toChannelID string) {
	toChannel, err := h.service.ChannelByID(ctx, toChannelID)
	if err != nil {
		return
	}
	h.recordVoice(ctx, audit.Event{
		ServerID:   toChannel.ServerID,
		ActorID:    actorID,
		Action:     audit.VoiceMove,
		TargetType: audit.TargetMember,
		TargetID:   targetID,
		Changes: []audit.Change{{
			Field:  "channel",
			Before: h.voiceChannelName(ctx, from.ChannelID),
			After:  toChannel.Name,
		}},
		Result: audit.ResultOK,
	})
}

// recordFailedMove: se a pessoa saiu do canal de origem e não entrou no
// destino, a movimentação ficou pela metade e vai no registro como parcial.
// Falha antes de sair (permissão, hierarquia) não deixa rastro.
func (h *Handler) recordFailedMove(ctx context.Context, actorID, targetID string, from VoiceLocation, wasInVoice bool) {
	if !wasInVoice {
		return
	}
	if _, stillIn := h.service.VoiceLocationOf(targetID); stillIn {
		return
	}
	h.recordVoice(ctx, audit.Event{
		ServerID:   from.ServerID,
		ActorID:    actorID,
		Action:     audit.VoiceMove,
		TargetType: audit.TargetMember,
		TargetID:   targetID,
		Changes:    []audit.Change{{Field: "channel", Before: h.voiceChannelName(ctx, from.ChannelID)}},
		Result:     audit.ResultPartial,
	})
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
	h.serverVoice(c, audit.VoiceServerMute, "muted", func(ctx *gin.Context, actor string, on bool) error {
		return h.service.SetServerMute(ctx.Request.Context(), ctx.Param("id"), actor, ctx.Param("userId"), on)
	})
}

// ServerDeafen: POST /calls/:id/participants/:userId/server-deafen {deafened}.
func (h *Handler) ServerDeafen(c *gin.Context) {
	h.serverVoice(c, audit.VoiceServerDeafen, "deafened", func(ctx *gin.Context, actor string, on bool) error {
		return h.service.SetServerDeafen(ctx.Request.Context(), ctx.Param("id"), actor, ctx.Param("userId"), on)
	})
}

func (h *Handler) serverVoice(c *gin.Context, action audit.Action, field string, apply func(*gin.Context, string, bool) error) {
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
	ctx := c.Request.Context()
	_, serverID, err := h.service.CallScope(c.Param("id"))
	if err != nil {
		respondModeration(c, err)
		return
	}
	if err := apply(c, userID.(string), on); err != nil {
		respondModeration(c, err)
		return
	}
	h.recordVoice(ctx, audit.Event{
		ServerID:   serverID,
		ActorID:    userID.(string),
		Action:     action,
		TargetType: audit.TargetMember,
		TargetID:   c.Param("userId"),
		Changes:    []audit.Change{{Field: field, After: on}},
		Result:     audit.ResultOK,
	})
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

// Disconnect: DELETE /calls/:id/participants/:userId (MOVE_MEMBERS).
func (h *Handler) Disconnect(c *gin.Context) {
	userID, exists := c.Get("userID")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}
	ctx := c.Request.Context()
	callID, targetID := c.Param("id"), c.Param("userId")
	channelID, serverID, err := h.service.CallScope(callID)
	if err != nil {
		respondModeration(c, err)
		return
	}
	if err := h.service.DisconnectParticipant(ctx, callID, userID.(string), targetID); err != nil {
		respondModeration(c, err)
		return
	}
	h.recordVoice(ctx, audit.Event{
		ServerID:   serverID,
		ActorID:    userID.(string),
		Action:     audit.VoiceDisconnect,
		TargetType: audit.TargetMember,
		TargetID:   targetID,
		Changes:    []audit.Change{{Field: "channel", Before: h.voiceChannelName(ctx, channelID)}},
		Result:     audit.ResultOK,
	})
	c.JSON(http.StatusOK, gin.H{"ok": true})
}
