package message

import (
	"net/http"

	"github.com/gin-gonic/gin"
)

func (h *Handler) CreateConversationMessage(c *gin.Context) {
	conversationID := c.Param("id")

	var input struct {
		Content       string       `json:"content"`
		ReplyToID     *string      `json:"reply_to_id"`
		AttachmentIDs []string     `json:"attachment_ids"`
		StickerID     *string      `json:"sticker_id"`
		GifURL        *string      `json:"gif_url"`
		GifMetadata   *GifMetadata `json:"gif_metadata"`
	}

	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request"})
		return
	}

	userID, ok := h.getUserID(c)
	if !ok {
		return
	}

	if !h.canSendToConversation(c, conversationID, userID) {
		return
	}

	msg, err := h.service.CreateConversationMessage(c.Request.Context(), conversationID, userID, input.Content, input.ReplyToID, input.AttachmentIDs, input.StickerID, input.GifURL, input.GifMetadata)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusCreated, msg)
}

// canSendToConversation confere se userID pode escrever na DM; se não puder,
// já responde o erro.
func (h *Handler) canSendToConversation(c *gin.Context, conversationID string, userID string) bool {
	return requireConversationWrite(c, h.access, conversationID, userID)
}
