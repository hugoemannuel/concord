package server

import (
	"errors"
	"net/http"

	"gin-quickstart/backend/internal/platform/authctx"

	"github.com/gin-gonic/gin"
)

func respondModeration(c *gin.Context, err error) {
	if respondPermission(c, err) {
		return
	}
	status, code := http.StatusBadRequest, "invalid"
	switch {
	case errors.Is(err, ErrCannotActOn):
		status, code = http.StatusForbidden, "role_hierarchy"
	case errors.Is(err, ErrCannotTargetSelf):
		code = "self"
	case errors.Is(err, ErrOwnerCannotLeave):
		code = "owner_cannot_leave"
	case errors.Is(err, ErrMemberNotFound):
		status, code = http.StatusNotFound, "member_not_found"
	case errors.Is(err, ErrBanNotFound):
		status, code = http.StatusNotFound, "ban_not_found"
	case errors.Is(err, ErrReasonTooLong):
		code = "invalid"
	case errors.Is(err, ErrInvalidNickname):
		code = "invalid_nickname"
	default:
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal error", "code": "internal"})
		return
	}
	c.JSON(status, gin.H{"error": err.Error(), "code": code})
}

// Kick: DELETE /servers/:id/members/:userId (KICK_MEMBERS + hierarquia).
func (h *Handler) Kick(c *gin.Context) {
	userID, ok := authctx.UserID(c)
	if !ok {
		return
	}
	if err := h.moderation.Kick(c.Request.Context(), c.Param("id"), userID, c.Param("userId")); err != nil {
		respondModeration(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "member kicked"})
}

// Leave: POST /servers/:id/leave.
func (h *Handler) Leave(c *gin.Context) {
	userID, ok := authctx.UserID(c)
	if !ok {
		return
	}
	if err := h.moderation.Leave(c.Request.Context(), c.Param("id"), userID); err != nil {
		respondModeration(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "left server"})
}

// Ban: POST /servers/:id/bans {user_id, reason} (BAN_MEMBERS + hierarquia).
func (h *Handler) Ban(c *gin.Context) {
	var input struct {
		UserID string `json:"user_id"`
		Reason string `json:"reason"`
	}
	if err := c.ShouldBindJSON(&input); err != nil || input.UserID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "user_id is required"})
		return
	}
	userID, exists := c.Get("userID")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}
	if err := h.moderation.Ban(c.Request.Context(), c.Param("id"), userID.(string), input.UserID, input.Reason); err != nil {
		respondModeration(c, err)
		return
	}
	c.JSON(http.StatusCreated, gin.H{"message": "user banned"})
}

func (h *Handler) Unban(c *gin.Context) {
	userID, ok := authctx.UserID(c)
	if !ok {
		return
	}
	if err := h.moderation.Unban(c.Request.Context(), c.Param("id"), userID, c.Param("userId")); err != nil {
		respondModeration(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "user unbanned"})
}

func (h *Handler) ListBans(c *gin.Context) {
	userID, ok := authctx.UserID(c)
	if !ok {
		return
	}
	bans, err := h.moderation.ListBans(c.Request.Context(), c.Param("id"), userID)
	if err != nil {
		respondModeration(c, err)
		return
	}
	c.JSON(http.StatusOK, bans)
}

// SetNickname: PUT /servers/:id/members/:userId/nickname {nickname}. O próprio
// apelido pede CHANGE_NICKNAME; o dos outros, MANAGE_NICKNAMES + hierarquia.
// Vazio tira o apelido.
func (h *Handler) SetNickname(c *gin.Context) {
	var input struct {
		Nickname *string `json:"nickname"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request", "code": "invalid"})
		return
	}
	userID, ok := authctx.UserID(c)
	if !ok {
		return
	}
	raw := ""
	if input.Nickname != nil {
		raw = *input.Nickname
	}
	serverID, targetID := c.Param("id"), c.Param("userId")
	nick, err := h.nicknames.Set(c.Request.Context(), serverID, userID, targetID, raw)
	if err != nil {
		respondModeration(c, err)
		return
	}
	c.JSON(http.StatusOK, NicknameEvent{ServerID: serverID, UserID: targetID, Nickname: nick})
}
