package message

import (
	"context"
	"errors"
	"gin-quickstart/backend/internal/audit"
	"gin-quickstart/backend/internal/bot"
	"gin-quickstart/backend/internal/permission"
	"log"
	"strings"
	"time"

	"github.com/google/uuid"
)

var (
	ErrContentRequired     = errors.New("content is required")
	ErrMessageNotFound     = errors.New("message not found")
	ErrNotAuthor           = errors.New("only the author can delete this message")
	ErrSystemChannelDelete = errors.New("messages in system channels cannot be deleted")
	ErrMessageHidden       = errors.New("message not found")
	ErrInvalidReply        = errors.New("invalid reply target")
	ErrInvalidSticker      = errors.New("invalid sticker or sticker does not belong to this server")
	ErrInvalidGifURL       = errors.New("invalid gif url")
)

type EventPublisher interface {
	PublishMessageCreate(event CreateEvent)
	PublishMessageDelete(event DeleteEvent)
	PublishMessageUpdate(event UpdateEvent)
	PublishPollUpdate(event PollUpdateEvent)
	PublishReactionAdd(event ReactionEvent)
	PublishReactionRemove(event ReactionEvent)
	PublishMessagePin(event PinEvent)
	PublishMessageUnpin(event UnpinEvent)
}

type ChannelResolver interface {
	ChannelServerID(ctx context.Context, channelID string) (string, error)
}

// SystemChannelChecker diz se o canal é um canal fixo de sistema ("musica" ou "avisos").
type SystemChannelChecker interface {
	IsSystemChannel(ctx context.Context, channelID string) (bool, error)
}

type ConversationResolver interface {
	ConversationParticipantIDs(ctx context.Context, conversationID string) ([]string, error)
	// RevealConversation reabre a DM para quem tinha fechado.
	RevealConversation(ctx context.Context, conversationID string) error
}

type StickerChecker interface {
	StickerServerID(ctx context.Context, stickerID string) (string, error)
}

// FileRemover apaga o arquivo de um anexo do disco (media.Store).
type FileRemover interface {
	Remove(name string) error
}

type Service struct {
	repository      *Repository
	edits           editStore
	publisher       EventPublisher
	channelResolver ChannelResolver
	convResolver    ConversationResolver
	files           FileRemover
	perms           PermissionChecker
	mentionLimiter  *mentionLimiter
	stickerChecker  StickerChecker
	audit           AuditRecorder
}

func MessageService(repository *Repository, publisher EventPublisher, channelResolver ChannelResolver, convResolver ConversationResolver, files FileRemover, perms PermissionChecker) *Service {
	return &Service{
		repository:      repository,
		edits:           repository,
		publisher:       publisher,
		channelResolver: channelResolver,
		convResolver:    convResolver,
		files:           files,
		perms:           perms,
		mentionLimiter:  newMentionLimiter(mentionEveryoneCooldown, time.Now),
	}
}

func (s *Service) SetStickerChecker(checker StickerChecker) {
	s.stickerChecker = checker
}

func SameRoomTarget(target *Message, channelID string, conversationID string) bool {
	if target == nil {
		return false
	}
	if channelID != "" {
		return target.ChannelID != nil && *target.ChannelID == channelID && target.ConversationID == nil
	}
	if conversationID != "" {
		return target.ConversationID != nil && *target.ConversationID == conversationID && target.ChannelID == nil
	}
	return false
}

func normalizeMediaPointers(stickerID *string, gifURL *string) (*string, *string, error) {
	if stickerID != nil {
		trimmed := strings.TrimSpace(*stickerID)
		if trimmed == "" {
			stickerID = nil
		} else {
			stickerID = &trimmed
		}
	}
	if gifURL != nil {
		trimmed := strings.TrimSpace(*gifURL)
		if trimmed == "" {
			gifURL = nil
		} else if len(trimmed) > 1024 || (!strings.HasPrefix(trimmed, "https://") && !strings.HasPrefix(trimmed, "http://")) {
			return nil, nil, ErrInvalidGifURL
		} else {
			gifURL = &trimmed
		}
	}
	return stickerID, gifURL, nil
}

func (s *Service) CreateChannelMessage(ctx context.Context, channelID string, authorID string, content string, replyToID *string, attachmentIDs []string, stickerID *string, gifURL *string, gifMetadata *GifMetadata) (*Message, error) {
	var err error
	stickerID, gifURL, err = normalizeMediaPointers(stickerID, gifURL)
	if err != nil {
		return nil, err
	}
	hasMedia := len(attachmentIDs) > 0 || stickerID != nil || gifURL != nil
	if err := validateNewMessageWithMedia(content, attachmentIDs, hasMedia); err != nil {
		return nil, err
	}

	serverID := ""
	if s.channelResolver != nil {
		serverID, _ = s.channelResolver.ChannelServerID(ctx, channelID)
	}

	if stickerID != nil && s.stickerChecker != nil {
		stkServerID, err := s.stickerChecker.StickerServerID(ctx, *stickerID)
		if err != nil || stkServerID != serverID {
			return nil, ErrInvalidSticker
		}
	}

	mentionEveryone := s.resolveMentionEveryone(ctx, serverID, channelID, authorID, content)
	msg, err := s.create(ctx, channelID, "", authorID, content, replyToID, attachmentIDs, mentionEveryone, stickerID, gifURL, gifMetadata)
	if err != nil {
		// Mensagem que não saiu não gasta a vez do anti-spam.
		if mentionEveryone != nil {
			s.mentionLimiter.Release(authorID, channelID)
		}
		return nil, err
	}

	s.publisher.PublishMessageCreate(CreateEvent{
		ChannelID: msg.ChannelID,
		ServerID:  serverID,
		Message:   *msg,
	})

	return msg, nil
}

func (s *Service) CreateConversationMessage(ctx context.Context, conversationID string, authorID string, content string, replyToID *string, attachmentIDs []string, stickerID *string, gifURL *string, gifMetadata *GifMetadata) (*Message, error) {
	var err error
	stickerID, gifURL, err = normalizeMediaPointers(stickerID, gifURL)
	if err != nil {
		return nil, err
	}
	hasMedia := len(attachmentIDs) > 0 || stickerID != nil || gifURL != nil
	if err := validateNewMessageWithMedia(content, attachmentIDs, hasMedia); err != nil {
		return nil, err
	}
	if stickerID != nil {
		return nil, ErrInvalidSticker
	}
	// Em DM @all/@here é texto puro.
	msg, err := s.create(ctx, "", conversationID, authorID, content, replyToID, attachmentIDs, nil, nil, gifURL, gifMetadata)
	if err != nil {
		return nil, err
	}

	var userIDs []string
	if s.convResolver != nil {
		// Mensagem nova reabre a DM para quem tinha fechado (como no Discord).
		if err := s.convResolver.RevealConversation(ctx, conversationID); err != nil {
			log.Printf("[message] reveal conversation %s: %v", conversationID, err)
		}
		userIDs, _ = s.convResolver.ConversationParticipantIDs(ctx, conversationID)
	}

	s.publisher.PublishMessageCreate(CreateEvent{
		ConversationID: msg.ConversationID,
		UserIDs:        userIDs,
		Message:        *msg,
	})

	return msg, nil
}

func (s *Service) ListChannelMessages(ctx context.Context, channelID string, viewerID string, limit int, before string) ([]Message, error) {
	messages, err := s.repository.ListByChannel(ctx, channelID, limit, before)
	if err != nil {
		return nil, err
	}
	if err := s.repository.AttachPolls(ctx, messages, viewerID); err != nil {
		return nil, err
	}
	if err := s.repository.AttachAttachments(ctx, messages); err != nil {
		return nil, err
	}
	return messages, nil
}

func (s *Service) ListConversationMessages(ctx context.Context, conversationID string, viewerID string, limit int, before string) ([]Message, error) {
	messages, err := s.repository.ListByConversation(ctx, conversationID, limit, before)
	if err != nil {
		return nil, err
	}
	if err := s.repository.AttachPolls(ctx, messages, viewerID); err != nil {
		return nil, err
	}
	if err := s.repository.AttachAttachments(ctx, messages); err != nil {
		return nil, err
	}
	return messages, nil
}

// canModerate: no canal, apaga (ou encerra enquete) quem vê o canal e é o
// autor, ou tem MANAGE_MESSAGES.
func (s *Service) canModerate(ctx context.Context, channelID string, authorID string, userID string) error {
	if s.perms == nil {
		if authorID != userID {
			return ErrNotAuthor
		}
		return nil
	}
	perms, err := s.perms.ChannelPerms(ctx, channelID, userID)
	if err != nil || perms&permission.ViewChannel == 0 {
		return ErrMessageNotFound
	}
	if authorID != userID && !permission.Has(perms, permission.ManageMessages) {
		return ErrNotAuthor
	}
	return nil
}

func (s *Service) isSystemChannel(ctx context.Context, channelID string) bool {
	if checker, ok := s.channelResolver.(SystemChannelChecker); ok {
		isSys, err := checker.IsSystemChannel(ctx, channelID)
		return err == nil && isSys
	}
	return false
}

func (s *Service) DeleteChannelMessage(ctx context.Context, channelID string, messageID string, userID string) error {
	if s.isSystemChannel(ctx, channelID) {
		return ErrSystemChannelDelete
	}

	msg, err := s.repository.FindByID(ctx, messageID)
	if err != nil {
		return ErrMessageNotFound
	}

	if msg.ChannelID == nil || *msg.ChannelID != channelID {
		return ErrMessageNotFound
	}

	if err := s.canModerate(ctx, channelID, msg.AuthorID, userID); err != nil {
		return err
	}

	if err := s.deleteWithFiles(ctx, messageID); err != nil {
		return err
	}

	serverID := ""
	if s.channelResolver != nil {
		serverID, _ = s.channelResolver.ChannelServerID(ctx, channelID)
	}

	s.publisher.PublishMessageDelete(DeleteEvent{
		ChannelID: msg.ChannelID,
		ServerID:  serverID,
		MessageID: messageID,
	})
	s.recordModeration(ctx, audit.MessageDelete, serverID, channelID, msg.AuthorID, userID)

	return nil
}

func (s *Service) DeleteConversationMessage(ctx context.Context, conversationID string, messageID string, userID string) error {
	msg, err := s.repository.FindByID(ctx, messageID)
	if err != nil {
		return ErrMessageNotFound
	}

	if msg.ConversationID == nil || *msg.ConversationID != conversationID {
		return ErrMessageNotFound
	}

	if msg.AuthorID != userID {
		return ErrNotAuthor
	}

	if err := s.deleteWithFiles(ctx, messageID); err != nil {
		return err
	}

	var userIDs []string
	if s.convResolver != nil {
		userIDs, _ = s.convResolver.ConversationParticipantIDs(ctx, conversationID)
	}

	s.publisher.PublishMessageDelete(DeleteEvent{
		ConversationID: msg.ConversationID,
		UserIDs:        userIDs,
		MessageID:      messageID,
	})

	return nil
}

// deleteWithFiles apaga a mensagem (a cascata leva as linhas dos anexos) e
// depois os arquivos dela no disco.
func (s *Service) deleteWithFiles(ctx context.Context, messageID string) error {
	ids, err := s.repository.MessageAttachmentIDs(ctx, messageID)
	if err != nil {
		return err
	}

	if err := s.repository.Delete(ctx, messageID); err != nil {
		return err
	}

	if s.files != nil {
		for _, id := range ids {
			if err := s.files.Remove(id); err != nil {
				log.Printf("failed to remove attachment file %s: %v", id, err)
			}
		}
	}
	return nil
}

func (s *Service) AddChannelReaction(ctx context.Context, channelID string, messageID string, userID string, emoji string) error {
	if err := ValidateEmoji(emoji); err != nil {
		return err
	}

	msg, err := s.repository.FindByID(ctx, messageID)
	if err != nil || !SameRoomTarget(msg, channelID, "") {
		return ErrMessageNotFound
	}

	added, err := s.repository.AddReaction(ctx, messageID, userID, emoji)
	if err != nil {
		return err
	}
	if added {
		s.publisher.PublishReactionAdd(ReactionEvent{
			ChannelID: msg.ChannelID,
			MessageID: msg.ID,
			UserID:    userID,
			Emoji:     emoji,
		})
	}
	return nil
}

func (s *Service) RemoveChannelReaction(ctx context.Context, channelID string, messageID string, userID string, emoji string) error {
	if err := ValidateEmoji(emoji); err != nil {
		return err
	}

	msg, err := s.repository.FindByID(ctx, messageID)
	if err != nil || !SameRoomTarget(msg, channelID, "") {
		return ErrMessageNotFound
	}

	removed, err := s.repository.RemoveReaction(ctx, messageID, userID, emoji)
	if err != nil {
		return err
	}
	if removed {
		s.publisher.PublishReactionRemove(ReactionEvent{
			ChannelID: msg.ChannelID,
			MessageID: msg.ID,
			UserID:    userID,
			Emoji:     emoji,
		})
	}
	return nil
}

// botConversation: a conversa é com um bot e quem age não é ele (só leitura).
func (s *Service) botConversation(ctx context.Context, conversationID string, userID string) bool {
	if s.convResolver == nil {
		return false
	}
	ids, err := s.convResolver.ConversationParticipantIDs(ctx, conversationID)
	if err != nil {
		return false
	}
	for _, id := range ids {
		if id != userID && bot.IsBot(id) {
			return true
		}
	}
	return false
}

func (s *Service) AddConversationReaction(ctx context.Context, conversationID string, messageID string, userID string, emoji string) error {
	if err := ValidateEmoji(emoji); err != nil {
		return err
	}
	if s.botConversation(ctx, conversationID, userID) {
		return ErrBotConversation
	}

	msg, err := s.repository.FindByID(ctx, messageID)
	if err != nil || !SameRoomTarget(msg, "", conversationID) {
		return ErrMessageNotFound
	}

	added, err := s.repository.AddReaction(ctx, messageID, userID, emoji)
	if err != nil {
		return err
	}
	if added {
		s.publisher.PublishReactionAdd(ReactionEvent{
			ConversationID: msg.ConversationID,
			MessageID:      msg.ID,
			UserID:         userID,
			Emoji:          emoji,
		})
	}
	return nil
}

func (s *Service) RemoveConversationReaction(ctx context.Context, conversationID string, messageID string, userID string, emoji string) error {
	if err := ValidateEmoji(emoji); err != nil {
		return err
	}

	msg, err := s.repository.FindByID(ctx, messageID)
	if err != nil || !SameRoomTarget(msg, "", conversationID) {
		return ErrMessageNotFound
	}

	removed, err := s.repository.RemoveReaction(ctx, messageID, userID, emoji)
	if err != nil {
		return err
	}
	if removed {
		s.publisher.PublishReactionRemove(ReactionEvent{
			ConversationID: msg.ConversationID,
			MessageID:      msg.ID,
			UserID:         userID,
			Emoji:          emoji,
		})
	}
	return nil
}

// CreateSystemChannelMessage grava uma mensagem do próprio servidor (ex.: o
// aviso de aniversário) no canal e avisa quem está nele. authorID é quem
// responde pelo servidor (o dono); o app mostra a mensagem como do servidor.
func (s *Service) CreateSystemChannelMessage(ctx context.Context, channelID string, authorID string, content string, kind string) (*Message, error) {
	msg := &Message{
		ID:         uuid.New().String(),
		AuthorID:   authorID,
		ChannelID:  &channelID,
		Content:    content,
		SystemKind: &kind,
	}
	if err := s.repository.Create(ctx, msg); err != nil {
		return nil, err
	}

	full, err := s.repository.FindByID(ctx, msg.ID)
	if err != nil {
		return nil, err
	}

	serverID := ""
	if s.channelResolver != nil {
		serverID, _ = s.channelResolver.ChannelServerID(ctx, channelID)
	}
	s.publisher.PublishMessageCreate(CreateEvent{
		ChannelID: full.ChannelID,
		ServerID:  serverID,
		Message:   *full,
	})

	return full, nil
}

// canManageChannelMessages verifica se o usuário pode gerenciar mensagens no canal (permissão MANAGE_MESSAGES ou dono).
func (s *Service) canManageChannelMessages(ctx context.Context, channelID string, userID string) error {
	if s.perms == nil {
		return nil
	}
	perms, err := s.perms.ChannelPerms(ctx, channelID, userID)
	if err != nil || perms&permission.ViewChannel == 0 {
		return ErrMessageNotFound
	}
	if !permission.Has(perms, permission.ManageMessages) {
		return permission.ErrMissingPermission
	}
	return nil
}
