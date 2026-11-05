package message

import (
	"context"
	"errors"
	"net/http"

	"gin-quickstart/backend/internal/permission"

	"github.com/gin-gonic/gin"
)

// reactionErrorResponse traduz o erro de reagir em status HTTP e corpo.
func reactionErrorResponse(err error, fallback string) (int, gin.H) {
	switch {
	case errors.Is(err, ErrInvalidEmoji):
		return http.StatusBadRequest, gin.H{"error": err.Error()}
	case errors.Is(err, ErrExternalExpression):
		return http.StatusForbidden, gin.H{"error": err.Error(), "code": "external_expression"}
	case errors.Is(err, ErrBotConversation):
		return http.StatusForbidden, gin.H{"error": err.Error(), "code": "bot_conversation"}
	case errors.Is(err, ErrMessageNotFound):
		return http.StatusNotFound, gin.H{"error": err.Error()}
	case errors.Is(err, ErrTooManyReactions):
		return http.StatusConflict, gin.H{
			"error": err.Error(),
			"code":  "too_many_reactions",
			"max":   MaxDistinctReactions,
		}
	default:
		return http.StatusInternalServerError, gin.H{"error": fallback}
	}
}

// addReaction é o corpo comum de pôr reação: quem reage, o acesso à sala
// (allowed já responde quando nega) e o {emoji}; add grava na sala certa.
func (h *Handler) addReaction(
	c *gin.Context,
	allowed func(userID string) bool,
	add func(ctx context.Context, userID string, emoji string) error,
) {
	userID, ok := h.getUserID(c)
	if !ok || !allowed(userID) {
		return
	}

	var input struct {
		Emoji string `json:"emoji"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request"})
		return
	}

	if err := add(c.Request.Context(), userID, input.Emoji); err != nil {
		c.JSON(reactionErrorResponse(err, "failed to add reaction"))
		return
	}

	c.JSON(http.StatusOK, gin.H{"ok": true})
}

func (h *Handler) AddChannelReaction(c *gin.Context) {
	channelID := c.Param("channelId")
	messageID := c.Param("messageId")
	h.addReaction(c,
		func(userID string) bool {
			return h.requireChannel(c, channelID, userID, permission.AddReactions)
		},
		func(ctx context.Context, userID string, emoji string) error {
			return h.service.AddChannelReaction(ctx, channelID, messageID, userID, emoji)
		},
	)
}

func (h *Handler) AddConversationReaction(c *gin.Context) {
	conversationID := c.Param("id")
	messageID := c.Param("messageId")
	h.addReaction(c,
		func(userID string) bool {
			return h.isConversationParticipant(c, conversationID, userID)
		},
		func(ctx context.Context, userID string, emoji string) error {
			return h.service.AddConversationReaction(ctx, conversationID, messageID, userID, emoji)
		},
	)
}
