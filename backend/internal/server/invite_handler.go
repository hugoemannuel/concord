package server

import (
	"context"
	"errors"
	"net/http"

	"gin-quickstart/backend/internal/permission"
	"gin-quickstart/backend/internal/platform/authctx"

	"github.com/gin-gonic/gin"
)

// inviteDesk: o que os handlers de convite usam do Service.
type inviteDesk interface {
	IsMember(ctx context.Context, serverID, userID string) (bool, error)
	FindPendingInvite(ctx context.Context, serverID, inviteeID string) (*ServerInvite, error)
	InviteUser(ctx context.Context, serverID, inviterID, inviteeID string) error
	ListInvitesByInvitee(ctx context.Context, inviteeID string) ([]ServerInvite, error)
	ListInvitesByServer(ctx context.Context, serverID string) ([]ServerInvite, error)
	AcceptInvite(ctx context.Context, inviteID, userID string) error
	DeclineInvite(ctx context.Context, inviteID, userID string) error
	InviteCode(ctx context.Context, serverID, userID string) (string, error)
	JoinByCode(ctx context.Context, rawCode, userID string) (*Server, error)
}

// FriendChecker: só se convida amigo (friendship.Service).
type FriendChecker interface {
	AreFriends(ctx context.Context, userID1, userID2 string) (bool, error)
}

// requireCreateInvite confere CREATE_INVITE. Se falta, responde o erro de
// permissão ou, para outro erro, fallbackStatus com fallbackMsg.
func (h *Handler) requireCreateInvite(c *gin.Context, serverID, userID string, fallbackStatus int, fallbackMsg string) bool {
	err := h.perms.Require(c.Request.Context(), serverID, userID, permission.CreateInvite)
	if err == nil {
		return true
	}
	if !respondPermission(c, err) {
		c.JSON(fallbackStatus, gin.H{"error": fallbackMsg})
	}
	return false
}

// respondBanned responde 403 a quem está banido do servidor (true se respondeu).
func respondBanned(c *gin.Context, err error, msg string) bool {
	if !errors.Is(err, ErrBanned) {
		return false
	}
	c.JSON(http.StatusForbidden, gin.H{"error": msg, "code": "banned"})
	return true
}

func (h *Handler) InviteMember(c *gin.Context) {
	var input struct {
		UserID string `json:"user_id"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request"})
		return
	}
	userID, ok := authctx.UserID(c)
	if !ok {
		return
	}
	serverID := c.Param("id")
	// Quem tem CREATE_INVITE (por padrão, todo membro) convida.
	if !h.requireCreateInvite(c, serverID, userID, http.StatusNotFound, "server not found") {
		return
	}
	ctx := c.Request.Context()
	if status, msg := h.inviteRefusal(ctx, serverID, userID, input.UserID); msg != "" {
		c.JSON(status, gin.H{"error": msg})
		return
	}
	if err := h.invites.InviteUser(ctx, serverID, userID, input.UserID); err != nil {
		if !respondBanned(c, err, "esse usuário está banido do servidor") {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to invite user"})
		}
		return
	}
	c.JSON(http.StatusCreated, gin.H{"message": "invite sent"})
}

// inviteRefusal diz por que inviterID não pode convidar inviteeID (status e
// mensagem), ou "" se pode.
func (h *Handler) inviteRefusal(ctx context.Context, serverID, inviterID, inviteeID string) (int, string) {
	areFriends, err := h.friends.AreFriends(ctx, inviterID, inviteeID)
	if err != nil || !areFriends {
		return http.StatusBadRequest, "you can only invite friends"
	}
	alreadyMember, err := h.invites.IsMember(ctx, serverID, inviteeID)
	if err != nil {
		return http.StatusInternalServerError, "failed to check membership"
	}
	if alreadyMember {
		return http.StatusBadRequest, "user is already a member"
	}
	if existing, _ := h.invites.FindPendingInvite(ctx, serverID, inviteeID); existing != nil {
		return http.StatusBadRequest, "invite already sent"
	}
	return 0, ""
}

func (h *Handler) ListInvites(c *gin.Context) {
	userID, ok := authctx.UserID(c)
	if !ok {
		return
	}
	invites, err := h.invites.ListInvitesByInvitee(c.Request.Context(), userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to list invites"})
		return
	}
	c.JSON(http.StatusOK, invites)
}

func (h *Handler) ListServerInvites(c *gin.Context) {
	userID, ok := authctx.UserID(c)
	if !ok {
		return
	}
	serverID := c.Param("id")
	if !h.requireMember(c, serverID, userID) {
		return
	}
	invites, err := h.invites.ListInvitesByServer(c.Request.Context(), serverID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to list invites"})
		return
	}
	c.JSON(http.StatusOK, invites)
}

func (h *Handler) AcceptInvite(c *gin.Context) {
	userID, ok := authctx.UserID(c)
	if !ok {
		return
	}
	if err := h.invites.AcceptInvite(c.Request.Context(), c.Param("id"), userID); err != nil {
		if !respondBanned(c, err, err.Error()) {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		}
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "joined server"})
}

func (h *Handler) DeclineInvite(c *gin.Context) {
	userID, ok := authctx.UserID(c)
	if !ok {
		return
	}
	if err := h.invites.DeclineInvite(c.Request.Context(), c.Param("id"), userID); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "invite declined"})
}

func (h *Handler) InviteCode(c *gin.Context) {
	userID, ok := authctx.UserID(c)
	if !ok {
		return
	}
	serverID := c.Param("id")
	if !h.requireCreateInvite(c, serverID, userID, http.StatusInternalServerError, "failed to get invite code") {
		return
	}
	code, err := h.invites.InviteCode(c.Request.Context(), serverID, userID)
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
	userID, ok := authctx.UserID(c)
	if !ok {
		return
	}
	server, err := h.invites.JoinByCode(c.Request.Context(), input.Code, userID)
	if err != nil {
		respondJoinByCode(c, err)
		return
	}
	c.JSON(http.StatusOK, server)
}

func respondJoinByCode(c *gin.Context, err error) {
	switch {
	case respondBanned(c, err, err.Error()):
	case errors.Is(err, ErrInvalidCode):
		c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
	default:
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to join server"})
	}
}
