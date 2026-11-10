package message

import (
	"errors"
	"net/http"

	"gin-quickstart/backend/internal/permission"

	"github.com/gin-gonic/gin"
)

// POST de mensagem no canal: comando, modo lento e a resposta de erro.

// tryCommand: comando reconhecido não é gravado como mensagem.
func (h *Handler) tryCommand(serverID, channelID, userID, content string, attachmentIDs []string) bool {
	if h.commands == nil || len(attachmentIDs) > 0 {
		return false
	}
	return h.commands.HandleCommand(serverID, channelID, userID, content)
}

// createMessageInput: o corpo do POST de mensagem no canal.
type createMessageInput struct {
	Content       string       `json:"content"`
	ReplyToID     *string      `json:"reply_to_id"`
	AttachmentIDs []string     `json:"attachment_ids"`
	StickerID     *string      `json:"sticker_id"`
	GifURL        *string      `json:"gif_url"`
	GifMetadata   *GifMetadata `json:"gif_metadata"`
}

// textOnly: só texto (sem anexo, figurinha nem GIF), o que pode ser comando.
func (in createMessageInput) textOnly() bool {
	return len(in.AttachmentIDs) == 0 && in.StickerID == nil && in.GifURL == nil
}

func (h *Handler) CreateChannelMessage(c *gin.Context) {
	channelID := c.Param("channelId")

	var input createMessageInput
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request"})
		return
	}

	userID, ok := h.getUserID(c)
	if !ok {
		return
	}

	want := permission.SendMessages
	if len(input.AttachmentIDs) > 0 {
		want |= permission.AttachFiles
	}
	if !h.requireChannel(c, channelID, userID, want) {
		return
	}

	if h.runChannelCommand(c, channelID, userID, input) {
		c.JSON(http.StatusAccepted, gin.H{"command": true})
		return
	}

	msg, err := h.service.CreateChannelMessage(c.Request.Context(), channelID, userID, input.Content, input.ReplyToID, input.AttachmentIDs, input.StickerID, input.GifURL, input.GifMetadata)
	if err != nil {
		respondCreateError(c, err)
		return
	}

	c.JSON(http.StatusCreated, msg)
}

// runChannelCommand: texto puro reconhecido como comando (ex.: Maestro) não
// vira mensagem nem conta para o modo lento.
func (h *Handler) runChannelCommand(c *gin.Context, channelID, userID string, input createMessageInput) bool {
	if h.commands == nil || !input.textOnly() {
		return false
	}
	ch, err := h.channelService.FindByID(c.Request.Context(), channelID)
	return err == nil && h.tryCommand(ch.ServerID, channelID, userID, input.Content, input.AttachmentIDs)
}

// respondCreateError: modo lento é 429 com retry_after (segundos, para cima);
// o resto é 400.
func respondCreateError(c *gin.Context, err error) {
	var slow *SlowmodeError
	if errors.As(err, &slow) {
		c.JSON(http.StatusTooManyRequests, gin.H{"error": err.Error(), "code": "slowmode", "retry_after": retryAfterSeconds(slow.RetryAfter)})
		return
	}
	c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
}
