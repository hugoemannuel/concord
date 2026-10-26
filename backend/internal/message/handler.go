package message

import (
	"errors"
	"net/http"
	"strconv"

	"gin-quickstart/backend/internal/channel"
	"gin-quickstart/backend/internal/conversation"
	"gin-quickstart/backend/internal/friendship"
	"gin-quickstart/backend/internal/permission"

	"github.com/gin-gonic/gin"
)

type Handler struct {
	service             *Service
	channelService      *channel.Service
	conversationService *conversation.Service
	friendService       *friendship.Service
	perms               PermissionChecker
	access              RoomAccess
	commands            CommandHandler
}

func MessageHandler(service *Service, channelService *channel.Service, conversationService *conversation.Service, friendService *friendship.Service, perms PermissionChecker) *Handler {
	return &Handler{
		service:             service,
		channelService:      channelService,
		conversationService: conversationService,
		friendService:       friendService,
		perms:               perms,
		access:              NewServiceRoomAccess(channelService, perms, conversationService, friendService),
	}
}

// requireChannel confere se userID tem want no canal; se não tiver, já
// responde o erro (canal que a pessoa não vê é 404).
func (h *Handler) requireChannel(c *gin.Context, channelID string, userID string, want int64) bool {
	err := channelAccess(c.Request.Context(), h.perms, channelID, userID, permission.ViewChannel|want)
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

func (h *Handler) getUserID(c *gin.Context) (string, bool) {
	userID, exists := c.Get("userID")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return "", false
	}
	return userID.(string), true
}

func parseListParams(c *gin.Context) (limit int, before string) {
	limit = 50
	if raw := c.Query("limit"); raw != "" {
		if parsed, err := strconv.Atoi(raw); err == nil && parsed > 0 && parsed <= 100 {
			limit = parsed
		}
	}
	before = c.Query("before")
	return
}

// CommandHandler recebe comandos digitados no chat (ex.: /play do Maestro).
type CommandHandler interface {
	HandleCommand(serverID, channelID, userID, content string) bool
}

func (h *Handler) SetCommandHandler(c CommandHandler) { h.commands = c }

// tryCommand: comando reconhecido não é gravado como mensagem.
func (h *Handler) tryCommand(serverID, channelID, userID, content string, attachmentIDs []string) bool {
	if h.commands == nil || len(attachmentIDs) > 0 {
		return false
	}
	return h.commands.HandleCommand(serverID, channelID, userID, content)
}

func (h *Handler) CreateChannelMessage(c *gin.Context) {
	channelID := c.Param("channelId")

	var input struct {
		Content       string   `json:"content"`
		ReplyToID     *string  `json:"reply_to_id"`
		AttachmentIDs []string `json:"attachment_ids"`
	}

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

	if len(input.AttachmentIDs) == 0 && h.commands != nil {
		if ch, err := h.channelService.FindByID(c.Request.Context(), channelID); err == nil && h.tryCommand(ch.ServerID, channelID, userID, input.Content, input.AttachmentIDs) {
			c.JSON(http.StatusAccepted, gin.H{"command": true})
			return
		}
	}

	msg, err := h.service.CreateChannelMessage(c.Request.Context(), channelID, userID, input.Content, input.ReplyToID, input.AttachmentIDs)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusCreated, msg)
}

func (h *Handler) ListChannelMessages(c *gin.Context) {
	channelID := c.Param("channelId")

	userID, ok := h.getUserID(c)
	if !ok {
		return
	}

	if !h.requireChannel(c, channelID, userID, 0) {
		return
	}
	// Sem READ_MESSAGE_HISTORY o canal abre vazio: só vê o que chegar ao vivo.
	if perms, err := h.perms.ChannelPerms(c.Request.Context(), channelID, userID); err != nil || !permission.Has(perms, permission.ReadHistory) {
		c.JSON(http.StatusOK, []Message{})
		return
	}

	limit, before := parseListParams(c)

	messages, err := h.service.ListChannelMessages(c.Request.Context(), channelID, userID, limit, before)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to list messages"})
		return
	}

	c.JSON(http.StatusOK, messages)
}

func (h *Handler) DeleteChannelMessage(c *gin.Context) {
	channelID := c.Param("channelId")
	messageID := c.Param("messageId")

	userID, ok := h.getUserID(c)
	if !ok {
		return
	}

	if h.channelService != nil {
		if ch, err := h.channelService.FindByID(c.Request.Context(), channelID); err == nil && ch.IsSystem {
			c.JSON(http.StatusForbidden, gin.H{"error": ErrSystemChannelDelete.Error(), "code": "system_channel"})
			return
		}
	}

	if err := h.service.DeleteChannelMessage(c.Request.Context(), channelID, messageID, userID); err != nil {
		switch {
		case errors.Is(err, ErrSystemChannelDelete):
			c.JSON(http.StatusForbidden, gin.H{"error": err.Error(), "code": "system_channel"})
		case errors.Is(err, ErrNotAuthor):
			c.JSON(http.StatusForbidden, gin.H{"error": err.Error(), "code": "missing_permission"})
		case errors.Is(err, ErrMessageNotFound):
			c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
		default:
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		}
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "message deleted"})
}

func (h *Handler) ListChannelPins(c *gin.Context) {
	channelID := c.Param("channelId")
	userID, ok := h.getUserID(c)
	if !ok {
		return
	}

	if !h.requireChannel(c, channelID, userID, 0) {
		return
	}
	if perms, err := h.perms.ChannelPerms(c.Request.Context(), channelID, userID); err != nil || !permission.Has(perms, permission.ReadHistory) {
		c.JSON(http.StatusOK, []PinnedMessage{})
		return
	}

	pins, err := h.service.ListChannelPins(c.Request.Context(), channelID, userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to list pinned messages"})
		return
	}

	c.JSON(http.StatusOK, pins)
}

func (h *Handler) PinChannelMessage(c *gin.Context) {
	channelID := c.Param("channelId")
	messageID := c.Param("messageId")
	userID, ok := h.getUserID(c)
	if !ok {
		return
	}

	if !h.requireChannel(c, channelID, userID, permission.ManageMessages) {
		return
	}

	pinned, err := h.service.PinChannelMessage(c.Request.Context(), channelID, messageID, userID)
	if err != nil {
		switch {
		case errors.Is(err, ErrPinLimitReached):
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error(), "code": "pin_limit_reached"})
		case errors.Is(err, ErrMessageNotFound):
			c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
		case errors.Is(err, permission.ErrMissingPermission):
			c.JSON(http.StatusForbidden, gin.H{"error": err.Error(), "code": "missing_permission"})
		default:
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		}
		return
	}

	c.JSON(http.StatusOK, pinned)
}

func (h *Handler) UnpinChannelMessage(c *gin.Context) {
	channelID := c.Param("channelId")
	messageID := c.Param("messageId")
	userID, ok := h.getUserID(c)
	if !ok {
		return
	}

	if !h.requireChannel(c, channelID, userID, permission.ManageMessages) {
		return
	}

	if err := h.service.UnpinChannelMessage(c.Request.Context(), channelID, messageID, userID); err != nil {
		switch {
		case errors.Is(err, ErrMessageNotFound):
			c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
		case errors.Is(err, permission.ErrMissingPermission):
			c.JSON(http.StatusForbidden, gin.H{"error": err.Error(), "code": "missing_permission"})
		default:
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		}
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "message unpinned"})
}

type editInput struct {
	Content *string `json:"content"`
}

// bindEdit lê o corpo do PATCH; content é obrigatório (pode vir vazio).
func bindEdit(c *gin.Context) (string, bool) {
	var input editInput
	if err := c.ShouldBindJSON(&input); err != nil || input.Content == nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request"})
		return "", false
	}
	return *input.Content, true
}

func respondEditError(c *gin.Context, err error) {
	switch {
	case errors.Is(err, ErrNotEditAuthor):
		c.JSON(http.StatusForbidden, gin.H{"error": err.Error(), "code": "not_author"})
	case errors.Is(err, ErrMessageNotFound):
		c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
	case errors.Is(err, ErrContentRequired), errors.Is(err, ErrContentTooLong), errors.Is(err, ErrNotEditable):
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
	default:
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to edit message"})
	}
}

// EditChannelMessage: PATCH /channels/:channelId/messages/:messageId {content}.
// Só o autor, e só se ainda pode escrever no canal.
func (h *Handler) EditChannelMessage(c *gin.Context) {
	channelID := c.Param("channelId")
	messageID := c.Param("messageId")

	content, ok := bindEdit(c)
	if !ok {
		return
	}

	userID, ok := h.getUserID(c)
	if !ok {
		return
	}

	if !h.requireChannel(c, channelID, userID, permission.SendMessages) {
		return
	}

	msg, err := h.service.EditChannelMessage(c.Request.Context(), channelID, messageID, userID, content)
	if err != nil {
		respondEditError(c, err)
		return
	}

	c.JSON(http.StatusOK, msg)
}

func (h *Handler) CreateConversationMessage(c *gin.Context) {
	conversationID := c.Param("id")

	var input struct {
		Content       string   `json:"content"`
		ReplyToID     *string  `json:"reply_to_id"`
		AttachmentIDs []string `json:"attachment_ids"`
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

	msg, err := h.service.CreateConversationMessage(c.Request.Context(), conversationID, userID, input.Content, input.ReplyToID, input.AttachmentIDs)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusCreated, msg)
}

// canSendToConversation confere se userID pode escrever na DM; se não puder,
// já responde o erro.
func (h *Handler) canSendToConversation(c *gin.Context, conversationID string, userID string) bool {
	err := h.access.CanWrite(c.Request.Context(), Room{ConversationID: conversationID}, userID)
	switch {
	case err == nil:
		return true
	case errors.Is(err, ErrRoomNotFound):
		c.JSON(http.StatusNotFound, gin.H{"error": "conversation not found"})
	case errors.Is(err, ErrNoRoomAccess):
		c.JSON(http.StatusForbidden, gin.H{"error": "you are not a participant of this conversation"})
	case errors.Is(err, ErrBlocked):
		c.JSON(http.StatusForbidden, gin.H{"error": err.Error(), "code": "blocked"})
	case errors.Is(err, ErrCannotMessage):
		c.JSON(http.StatusForbidden, gin.H{"error": "you can only message friends or people from your servers"})
	default:
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to check access"})
	}
	return false
}

func (h *Handler) ListConversationMessages(c *gin.Context) {
	conversationID := c.Param("id")

	userID, ok := h.getUserID(c)
	if !ok {
		return
	}

	isParticipant, err := h.conversationService.IsParticipant(c.Request.Context(), conversationID, userID)
	if err != nil || !isParticipant {
		c.JSON(http.StatusForbidden, gin.H{"error": "you are not a participant of this conversation"})
		return
	}

	limit, before := parseListParams(c)

	messages, err := h.service.ListConversationMessages(c.Request.Context(), conversationID, userID, limit, before)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to list messages"})
		return
	}

	c.JSON(http.StatusOK, messages)
}

// EditConversationMessage: PATCH /conversations/:id/messages/:messageId
// {content}. Só o autor, e só se ainda pode escrever na DM.
func (h *Handler) EditConversationMessage(c *gin.Context) {
	conversationID := c.Param("id")
	messageID := c.Param("messageId")

	content, ok := bindEdit(c)
	if !ok {
		return
	}

	userID, ok := h.getUserID(c)
	if !ok {
		return
	}

	if !h.canSendToConversation(c, conversationID, userID) {
		return
	}

	msg, err := h.service.EditConversationMessage(c.Request.Context(), conversationID, messageID, userID, content)
	if err != nil {
		respondEditError(c, err)
		return
	}

	c.JSON(http.StatusOK, msg)
}

func (h *Handler) DeleteConversationMessage(c *gin.Context) {
	conversationID := c.Param("id")
	messageID := c.Param("messageId")

	userID, ok := h.getUserID(c)
	if !ok {
		return
	}

	if err := h.service.DeleteConversationMessage(c.Request.Context(), conversationID, messageID, userID); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "message deleted"})
}

func (h *Handler) AddChannelReaction(c *gin.Context) {
	channelID := c.Param("channelId")
	messageID := c.Param("messageId")

	userID, ok := h.getUserID(c)
	if !ok {
		return
	}

	if !h.requireChannel(c, channelID, userID, permission.AddReactions) {
		return
	}

	var input struct {
		Emoji string `json:"emoji"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request"})
		return
	}

	if err := h.service.AddChannelReaction(c.Request.Context(), channelID, messageID, userID, input.Emoji); err != nil {
		if errors.Is(err, ErrInvalidEmoji) {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		if errors.Is(err, ErrMessageNotFound) {
			c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to add reaction"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"ok": true})
}

func (h *Handler) RemoveChannelReaction(c *gin.Context) {
	channelID := c.Param("channelId")
	messageID := c.Param("messageId")

	userID, ok := h.getUserID(c)
	if !ok {
		return
	}

	if !h.requireChannel(c, channelID, userID, 0) {
		return
	}

	emoji := c.Query("emoji")
	if err := h.service.RemoveChannelReaction(c.Request.Context(), channelID, messageID, userID, emoji); err != nil {
		if errors.Is(err, ErrInvalidEmoji) {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		if errors.Is(err, ErrMessageNotFound) {
			c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to remove reaction"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"ok": true})
}

func (h *Handler) AddConversationReaction(c *gin.Context) {
	conversationID := c.Param("id")
	messageID := c.Param("messageId")

	userID, ok := h.getUserID(c)
	if !ok {
		return
	}

	if !h.isConversationParticipant(c, conversationID, userID) {
		return
	}

	var input struct {
		Emoji string `json:"emoji"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request"})
		return
	}

	if err := h.service.AddConversationReaction(c.Request.Context(), conversationID, messageID, userID, input.Emoji); err != nil {
		if errors.Is(err, ErrInvalidEmoji) {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		if errors.Is(err, ErrMessageNotFound) {
			c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to add reaction"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"ok": true})
}

func (h *Handler) RemoveConversationReaction(c *gin.Context) {
	conversationID := c.Param("id")
	messageID := c.Param("messageId")

	userID, ok := h.getUserID(c)
	if !ok {
		return
	}

	if !h.isConversationParticipant(c, conversationID, userID) {
		return
	}

	emoji := c.Query("emoji")
	if err := h.service.RemoveConversationReaction(c.Request.Context(), conversationID, messageID, userID, emoji); err != nil {
		if errors.Is(err, ErrInvalidEmoji) {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		if errors.Is(err, ErrMessageNotFound) {
			c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to remove reaction"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"ok": true})
}
