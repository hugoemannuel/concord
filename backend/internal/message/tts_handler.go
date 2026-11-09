package message

import (
	"context"
	"errors"
	"log"
	"net/http"

	"gin-quickstart/backend/internal/permission"
	"gin-quickstart/backend/internal/platform/authctx"

	"github.com/gin-gonic/gin"
)

// ttsSender: o que o handler usa do TTSService.
type ttsSender interface {
	SendToChannel(ctx context.Context, channelID, authorID, content string) (*Message, error)
	SendToConversation(ctx context.Context, conversationID, authorID, content string) (*Message, error)
}

// TTSHandler: POST /channels/:channelId/tts e /conversations/:id/tts.
type TTSHandler struct {
	tts    ttsSender
	perms  PermissionChecker
	access RoomAccess
}

func NewTTSHandler(tts ttsSender, perms PermissionChecker, access RoomAccess) *TTSHandler {
	return &TTSHandler{tts: tts, perms: perms, access: access}
}

func TTSRoutes(router *gin.RouterGroup, h *TTSHandler, authMiddleware gin.HandlerFunc) {
	router.POST("/channels/:channelId/tts", authMiddleware, h.SendToChannel)
	router.POST("/conversations/:id/tts", authMiddleware, h.SendToConversation)
}

type ttsInput struct {
	Content string `json:"content"`
}

// SendToChannel: no canal precisa de Enviar mensagens TTS (que cai junto sem
// Enviar mensagens).
func (h *TTSHandler) SendToChannel(c *gin.Context) {
	var input ttsInput
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request"})
		return
	}
	userID, ok := authctx.UserID(c)
	if !ok {
		return
	}
	channelID := c.Param("channelId")
	if !requireChannelAccess(c, h.perms, channelID, userID, permission.SendMessages|permission.SendTTSMessages) {
		return
	}
	msg, err := h.tts.SendToChannel(c.Request.Context(), channelID, userID, input.Content)
	respondTTS(c, msg, err)
}

// SendToConversation: na DM vale quem pode escrever nela.
func (h *TTSHandler) SendToConversation(c *gin.Context) {
	var input ttsInput
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request"})
		return
	}
	userID, ok := authctx.UserID(c)
	if !ok {
		return
	}
	conversationID := c.Param("id")
	if !requireConversationWrite(c, h.access, conversationID, userID) {
		return
	}
	msg, err := h.tts.SendToConversation(c.Request.Context(), conversationID, userID, input.Content)
	respondTTS(c, msg, err)
}

// respondTTS traduz o resultado: 201, 400 (texto), 429 (cooldown do TTS ou
// modo lento do canal, com retry_after em segundos) ou 500.
func respondTTS(c *gin.Context, msg *Message, err error) {
	var cooldown *TTSCooldownError
	switch {
	case err == nil:
		c.JSON(http.StatusCreated, msg)
	case errors.Is(err, ErrContentRequired):
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error(), "code": "content_required"})
	case errors.Is(err, ErrTTSTooLong):
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error(), "code": "tts_too_long", "max_length": TTSMaxLength})
	case errors.As(err, &cooldown):
		c.JSON(http.StatusTooManyRequests, gin.H{"error": err.Error(), "code": "tts_cooldown", "retry_after": retryAfterSeconds(cooldown.RetryAfter)})
	case errors.As(err, new(*SlowmodeError)):
		respondCreateError(c, err)
	default:
		log.Printf("[message] tts: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to send tts message"})
	}
}
