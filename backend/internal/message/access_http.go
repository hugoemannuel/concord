package message

import (
	"errors"
	"net/http"

	"gin-quickstart/backend/internal/permission"
	"gin-quickstart/backend/internal/platform/authctx"

	"github.com/gin-gonic/gin"
)

// Respostas HTTP das regras de acesso (access.go), usadas por todos os
// handlers que gravam numa sala.

// requestUserID: o usuário autenticado (platform/authctx); sem ele, já responde 401.
var requestUserID = authctx.UserID

// requireChannelAccess confere se userID tem want no canal; se não tiver, já
// responde o erro (canal que a pessoa não vê é 404).
func requireChannelAccess(c *gin.Context, perms PermissionChecker, channelID string, userID string, want int64) bool {
	err := channelAccess(c.Request.Context(), perms, channelID, userID, permission.ViewChannel|want)
	switch {
	case err == nil:
		return true
	case errors.Is(err, ErrRoomNotFound):
		c.JSON(http.StatusNotFound, gin.H{"error": "channel not found", "code": "channel_not_found"})
	default:
		c.JSON(http.StatusForbidden, gin.H{"error": permission.ErrMissingPermission.Error(), "code": "missing_permission"})
	}
	return false
}

// requireConversationWrite confere se userID pode escrever na DM; se não
// puder, já responde o erro.
func requireConversationWrite(c *gin.Context, access RoomAccess, conversationID string, userID string) bool {
	err := access.CanWrite(c.Request.Context(), Room{ConversationID: conversationID}, userID)
	switch {
	case err == nil:
		return true
	case errors.Is(err, ErrRoomNotFound):
		c.JSON(http.StatusNotFound, gin.H{"error": "conversation not found"})
	case errors.Is(err, ErrNoRoomAccess):
		c.JSON(http.StatusForbidden, gin.H{"error": "you are not a participant of this conversation"})
	case errors.Is(err, ErrBlocked):
		c.JSON(http.StatusForbidden, gin.H{"error": err.Error(), "code": "blocked"})
	case errors.Is(err, ErrBotConversation):
		c.JSON(http.StatusForbidden, gin.H{"error": err.Error(), "code": "bot_conversation"})
	case errors.Is(err, ErrCannotMessage):
		c.JSON(http.StatusForbidden, gin.H{"error": "you can only message friends or people from your servers"})
	default:
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to check access"})
	}
	return false
}
