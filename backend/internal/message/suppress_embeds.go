package message

import (
	"context"
	"errors"
	"net/http"

	"gin-quickstart/backend/internal/permission"
	"gin-quickstart/backend/internal/platform/authctx"

	"github.com/gin-gonic/gin"
)

// O X do cartão de prévia (como no Discord): o autor tira as prévias de link
// da mensagem para todo mundo. Fica fora do handler.go (god file) e avisa a
// sala pelo mesmo message:update da edição.

var ErrNotSuppressAuthor = errors.New("only the author can remove the embeds")

// suppressStore é o que a supressão usa do repositório.
type suppressStore interface {
	FindByID(ctx context.Context, id string) (*Message, error)
	SuppressEmbeds(ctx context.Context, id, authorID string) error
	AttachAttachments(ctx context.Context, messages []Message) error
}

type EmbedSuppressor struct {
	store     suppressStore
	publisher EventPublisher
	channels  ChannelResolver
	convs     ConversationResolver
}

func NewEmbedSuppressor(store suppressStore, publisher EventPublisher, channels ChannelResolver, convs ConversationResolver) *EmbedSuppressor {
	return &EmbedSuppressor{store: store, publisher: publisher, channels: channels, convs: convs}
}

// Suppress marca embeds_suppressed na mensagem do autor que está em room e
// publica a mensagem atualizada. Já suprimida: devolve sem gravar nem avisar.
func (s *EmbedSuppressor) Suppress(ctx context.Context, room Room, messageID, userID string) (*Message, error) {
	current, err := s.store.FindByID(ctx, messageID)
	if err != nil || !SameRoomTarget(current, room.ChannelID, room.ConversationID) {
		return nil, ErrMessageNotFound
	}
	if current.AuthorID != userID {
		return nil, ErrNotSuppressAuthor
	}
	if current.EmbedsSuppressed {
		return current, nil
	}
	if err := s.store.SuppressEmbeds(ctx, messageID, userID); err != nil {
		return nil, err
	}
	msg, err := s.reload(ctx, messageID)
	if err != nil {
		return nil, err
	}
	s.publisher.PublishMessageUpdate(s.updateEvent(ctx, room, msg))
	return msg, nil
}

func (s *EmbedSuppressor) reload(ctx context.Context, messageID string) (*Message, error) {
	full, err := s.store.FindByID(ctx, messageID)
	if err != nil {
		return nil, err
	}
	page := []Message{*full}
	if err := s.store.AttachAttachments(ctx, page); err != nil {
		return nil, err
	}
	return &page[0], nil
}

// updateEvent: as mesmas salas da edição (o canal e o servidor, ou os participantes da DM).
func (s *EmbedSuppressor) updateEvent(ctx context.Context, room Room, msg *Message) UpdateEvent {
	event := UpdateEvent{ChannelID: msg.ChannelID, ConversationID: msg.ConversationID, Message: *msg}
	if room.ChannelID != "" {
		event.ServerID, _ = s.channels.ChannelServerID(ctx, room.ChannelID)
	} else {
		event.UserIDs, _ = s.convs.ConversationParticipantIDs(ctx, room.ConversationID)
	}
	return event
}

type SuppressEmbedsHandler struct {
	s      *EmbedSuppressor
	perms  PermissionChecker
	access RoomAccess
}

func NewSuppressEmbedsHandler(s *EmbedSuppressor, perms PermissionChecker, access RoomAccess) *SuppressEmbedsHandler {
	return &SuppressEmbedsHandler{s: s, perms: perms, access: access}
}

// Channel: POST /channels/:channelId/messages/:messageId/suppress-embeds.
// Mesma regra da edição: só o autor, e só se ainda pode escrever no canal.
func (h *SuppressEmbedsHandler) Channel(c *gin.Context) {
	channelID := c.Param("channelId")
	userID, ok := authctx.UserID(c)
	if !ok || !requireChannelAccess(c, h.perms, channelID, userID, permission.SendMessages) {
		return
	}
	h.suppress(c, Room{ChannelID: channelID}, userID)
}

// Conversation: POST /conversations/:id/messages/:messageId/suppress-embeds.
func (h *SuppressEmbedsHandler) Conversation(c *gin.Context) {
	conversationID := c.Param("id")
	userID, ok := authctx.UserID(c)
	if !ok || !requireConversationWrite(c, h.access, conversationID, userID) {
		return
	}
	h.suppress(c, Room{ConversationID: conversationID}, userID)
}

func (h *SuppressEmbedsHandler) suppress(c *gin.Context, room Room, userID string) {
	msg, err := h.s.Suppress(c.Request.Context(), room, c.Param("messageId"), userID)
	switch {
	case err == nil:
		c.JSON(http.StatusOK, msg)
	case errors.Is(err, ErrNotSuppressAuthor):
		c.JSON(http.StatusForbidden, gin.H{"error": err.Error(), "code": "not_author"})
	case errors.Is(err, ErrMessageNotFound):
		c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
	default:
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to remove embeds"})
	}
}

func SuppressEmbedsRoutes(router *gin.RouterGroup, h *SuppressEmbedsHandler, authMiddleware gin.HandlerFunc) {
	router.POST("/channels/:channelId/messages/:messageId/suppress-embeds", authMiddleware, h.Channel)
	router.POST("/conversations/:id/messages/:messageId/suppress-embeds", authMiddleware, h.Conversation)
}
