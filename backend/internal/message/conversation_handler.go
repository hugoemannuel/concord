package message

import (
	"errors"
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
		ViewOnce      bool         `json:"view_once"`
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

	if input.ViewOnce && !h.prepareViewOnce(c, conversationID, userID, input.AttachmentIDs, input.StickerID, input.GifURL) {
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

// SetViewOnce liga o envio de mídia de visualização única na DM.
func (h *Handler) SetViewOnce(v ViewOncePreparer) { h.viewOnce = v }

// prepareViewOnce marca o anexo antes de criar a mensagem; se não puder, já
// responde 400 (sem o recurso ligado, também recusa).
func (h *Handler) prepareViewOnce(c *gin.Context, conversationID, userID string, attachmentIDs []string, stickerID, gifURL *string) bool {
	if h.viewOnce == nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": ErrInvalidViewOnce.Error()})
		return false
	}
	if err := h.viewOnce.Prepare(c.Request.Context(), conversationID, userID, attachmentIDs, stickerID, gifURL); err != nil {
		status := http.StatusBadRequest
		if !errors.Is(err, ErrInvalidViewOnce) {
			status = http.StatusInternalServerError
		}
		c.JSON(status, gin.H{"error": err.Error()})
		return false
	}
	return true
}
