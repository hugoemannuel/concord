package server

import (
	"errors"
	"net/http"

	"gin-quickstart/backend/internal/permission"
	"gin-quickstart/backend/internal/platform/authctx"

	"github.com/gin-gonic/gin"
)

func (h *Handler) InviteMember(c *gin.Context) {
	serverID := c.Param("id")

	var input struct {
		UserID string `json:"user_id"`
	}

	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request"})
		return
	}

	userID, exists := c.Get("userID")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}

	// Quem tem CREATE_INVITE (por padrão, todo membro) convida.
	if err := h.perms.Require(c.Request.Context(), serverID, userID.(string), permission.CreateInvite); err != nil {
		if !respondPermission(c, err) {
			c.JSON(http.StatusNotFound, gin.H{"error": "server not found"})
		}
		return
	}

	areFriends, err := h.friendService.AreFriends(c.Request.Context(), userID.(string), input.UserID)
	if err != nil || !areFriends {
		c.JSON(http.StatusBadRequest, gin.H{"error": "you can only invite friends"})
		return
	}

	alreadyMember, err := h.service.IsMember(c.Request.Context(), serverID, input.UserID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to check membership"})
		return
	}

	if alreadyMember {
		c.JSON(http.StatusBadRequest, gin.H{"error": "user is already a member"})
		return
	}

	existingInvite, _ := h.service.FindPendingInvite(c.Request.Context(), serverID, input.UserID)
	if existingInvite != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invite already sent"})
		return
	}

	if err := h.service.InviteUser(c.Request.Context(), serverID, userID.(string), input.UserID); err != nil {
		if errors.Is(err, ErrBanned) {
			c.JSON(http.StatusForbidden, gin.H{"error": "esse usuário está banido do servidor", "code": "banned"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to invite user"})
		return
	}

	c.JSON(http.StatusCreated, gin.H{"message": "invite sent"})
}

func (h *Handler) ListInvites(c *gin.Context) {
	userID, ok := authctx.UserID(c)
	if !ok {
		return
	}

	invites, err := h.service.ListInvitesByInvitee(c.Request.Context(), userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to list invites"})
		return
	}

	c.JSON(http.StatusOK, invites)
}

func (h *Handler) ListServerInvites(c *gin.Context) {
	serverID := c.Param("id")

	userID, exists := c.Get("userID")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}

	isMember, err := h.service.IsMember(c.Request.Context(), serverID, userID.(string))
	if err != nil || !isMember {
		c.JSON(http.StatusForbidden, gin.H{"error": "you are not a member of this server"})
		return
	}

	invites, err := h.service.ListInvitesByServer(c.Request.Context(), serverID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to list invites"})
		return
	}

	c.JSON(http.StatusOK, invites)
}

func (h *Handler) AcceptInvite(c *gin.Context) {
	inviteID := c.Param("id")

	userID, exists := c.Get("userID")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}

	if err := h.service.AcceptInvite(c.Request.Context(), inviteID, userID.(string)); err != nil {
		if errors.Is(err, ErrBanned) {
			c.JSON(http.StatusForbidden, gin.H{"error": err.Error(), "code": "banned"})
			return
		}
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "joined server"})
}

func (h *Handler) DeclineInvite(c *gin.Context) {
	inviteID := c.Param("id")

	userID, ok := authctx.UserID(c)
	if !ok {
		return
	}

	if err := h.service.DeclineInvite(c.Request.Context(), inviteID, userID); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "invite declined"})
}

func (h *Handler) InviteCode(c *gin.Context) {
	userID, exists := c.Get("userID")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}

	if err := h.perms.Require(c.Request.Context(), c.Param("id"), userID.(string), permission.CreateInvite); err != nil {
		if !respondPermission(c, err) {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to get invite code"})
		}
		return
	}

	code, err := h.service.InviteCode(c.Request.Context(), c.Param("id"), userID.(string))
	if errors.Is(err, ErrNotServerMember) {
		c.JSON(http.StatusForbidden, gin.H{"error": err.Error()})
		return
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to get invite code"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"code": code})
}

func (h *Handler) JoinByCode(c *gin.Context) {
	var input struct {
		Code string `json:"code"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request"})
		return
	}

	userID, exists := c.Get("userID")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}

	server, err := h.service.JoinByCode(c.Request.Context(), input.Code, userID.(string))
	if errors.Is(err, ErrBanned) {
		c.JSON(http.StatusForbidden, gin.H{"error": err.Error(), "code": "banned"})
		return
	}
	if errors.Is(err, ErrInvalidCode) {
		c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
		return
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to join server"})
		return
	}

	c.JSON(http.StatusOK, server)
}
