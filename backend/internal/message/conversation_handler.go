package message

import (
	"errors"
	"log"
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

	if input.ViewOnce && !h.prepareViewOnce(c, Room{ConversationID: conversationID}, userID, input.AttachmentIDs, input.StickerID, input.GifURL) {
		return
	}
	if !input.ViewOnce && !h.clearViewOnce(c, Room{ConversationID: conversationID}, userID, input.AttachmentIDs) {
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

// SetViewOnce liga o envio de mídia de visualização única (DM e canal).
func (h *Handler) SetViewOnce(v ViewOncePreparer) { h.viewOnce = v }

// clearViewOnce tira a marca de uma tentativa anterior quando o envio é comum
// e tem anexos; se não puder, já responde 500.
func (h *Handler) clearViewOnce(c *gin.Context, room Room, userID string, attachmentIDs []string) bool {
	if h.viewOnce == nil || len(attachmentIDs) == 0 {
		return true
	}
	if err := h.viewOnce.Clear(c.Request.Context(), room, userID, attachmentIDs); err != nil {
		log.Printf("view_once: limpar marca na sala %+v: %v", room, err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal error"})
		return false
	}
	return true
}

// prepareViewOnce marca o anexo antes de criar a mensagem; se não puder, já
// responde 400 (sem o recurso ligado, também recusa).
func (h *Handler) prepareViewOnce(c *gin.Context, room Room, userID string, attachmentIDs []string, stickerID, gifURL *string) bool {
	if h.viewOnce == nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": ErrInvalidViewOnce.Error()})
		return false
	}
	if err := h.viewOnce.Prepare(c.Request.Context(), room, userID, attachmentIDs, stickerID, gifURL); err != nil {
		if errors.Is(err, ErrInvalidViewOnce) {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return false
		}
		log.Printf("view_once: preparar envio na sala %+v: %v", room, err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal error"})
		return false
	}
	return true
}
