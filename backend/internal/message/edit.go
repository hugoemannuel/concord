package message

import (
	"context"
	"errors"

	"gin-quickstart/backend/internal/expression"
)

var (
	ErrNotEditAuthor = errors.New("only the author can edit this message")
	// Mensagem do sistema (aniversário) e enquete não têm texto para editar.
	ErrNotEditable = errors.New("this message cannot be edited")
)

// editStore é o que a edição usa do repositório (no teste, um falso em memória).
type editStore interface {
	FindByID(ctx context.Context, id string) (*Message, error)
	MessageAttachmentIDs(ctx context.Context, messageID string) ([]string, error)
	HasPoll(ctx context.Context, messageID string) (bool, error)
	UpdateContent(ctx context.Context, id string, authorID string, content string, mentionEveryone *string) error
	AttachAttachments(ctx context.Context, messages []Message) error
}

// editedMentionEveryone decide o mention_everyone depois de uma edição. Editar
// nunca pinga ninguém de novo (o aviso já saiu, ou não saiu, quando a mensagem
// foi criada): sem ping antes, continua sem (@all incluído na edição é texto
// puro); com ping antes, fica o mesmo enquanto o texto ainda marcar aquele
// mesmo @all/@here e vira nil se ele sumiu (o destaque some junto). Nunca
// troca @here por @all, e não passa pelo anti-spam porque não avisa ninguém.
func editedMentionEveryone(original *string, content string) *string {
	if original == nil || !containsEveryone(content, *original) {
		return nil
	}
	kept := *original
	return &kept
}

// editMessage edita o texto de uma mensagem que está em room. Mensagem de
// outra sala é ErrMessageNotFound; de outra pessoa, ErrNotEditAuthor.
// Devolve changed=false (sem gravar) quando o texto é o mesmo.
func (s *Service) editMessage(ctx context.Context, channelID string, conversationID string, messageID string, userID string, content string) (msg *Message, changed bool, err error) {
	current, err := s.editTarget(ctx, channelID, conversationID, messageID, userID)
	if err != nil {
		return nil, false, err
	}
	content, err = s.editedContent(ctx, current, channelID, userID, content)
	if err != nil {
		return nil, false, err
	}

	if content != current.Content {
		mentionEveryone := editedMentionEveryone(current.MentionEveryone, content)
		if err := s.edits.UpdateContent(ctx, messageID, userID, content, mentionEveryone); err != nil {
			return nil, false, err
		}
		changed = true
	}

	full, err := s.edits.FindByID(ctx, messageID)
	if err != nil {
		return nil, false, err
	}
	page := []Message{*full}
	if err := s.edits.AttachAttachments(ctx, page); err != nil {
		return nil, false, err
	}
	return &page[0], changed, nil
}

// editTarget: a mensagem que está na sala, é da pessoa e pode ser editada.
func (s *Service) editTarget(ctx context.Context, channelID, conversationID, messageID, userID string) (*Message, error) {
	current, err := s.edits.FindByID(ctx, messageID)
	if err != nil || !SameRoomTarget(current, channelID, conversationID) {
		return nil, ErrMessageNotFound
	}
	if current.AuthorID != userID {
		return nil, ErrNotEditAuthor
	}
	if err := s.checkEditable(ctx, current); err != nil {
		return nil, err
	}
	return current, nil
}

// editedContent confere o texto novo e o devolve como pode sair: editar passa
// pela mesma regra de emojis de enviar.
func (s *Service) editedContent(ctx context.Context, current *Message, channelID, userID, content string) (string, error) {
	attachmentIDs, err := s.edits.MessageAttachmentIDs(ctx, current.ID)
	if err != nil {
		return "", err
	}
	hasMedia := len(attachmentIDs) > 0 || current.StickerID != nil || current.GifURL != nil
	if err := validateContent(content, hasMedia); err != nil {
		return "", err
	}
	return s.expressions.message(ctx, s.editDestination(ctx, channelID), userID, content, nil)
}

// editDestination: o destino da mensagem editada (sem canal, é DM ou grupo).
func (s *Service) editDestination(ctx context.Context, channelID string) expression.Destination {
	if channelID == "" {
		return expression.Destination{}
	}
	return s.channelDestination(ctx, channelID)
}

// checkEditable: só texto comum (nada de mensagem do sistema, convite para a
// call nem enquete).
func (s *Service) checkEditable(ctx context.Context, current *Message) error {
	if current.SystemKind != nil || current.CallInvite != nil {
		return ErrNotEditable
	}
	hasPoll, err := s.edits.HasPoll(ctx, current.ID)
	if err != nil {
		return err
	}
	if hasPoll {
		return ErrNotEditable
	}
	return nil
}

// EditChannelMessage troca o texto de uma mensagem do autor no canal e avisa
// as mesmas salas do message:create.
func (s *Service) EditChannelMessage(ctx context.Context, channelID string, messageID string, userID string, content string) (*Message, error) {
	msg, changed, err := s.editMessage(ctx, channelID, "", messageID, userID, content)
	if err != nil || !changed {
		return msg, err
	}

	serverID := ""
	if s.channelResolver != nil {
		serverID, _ = s.channelResolver.ChannelServerID(ctx, channelID)
	}
	s.publisher.PublishMessageUpdate(UpdateEvent{
		ChannelID: msg.ChannelID,
		ServerID:  serverID,
		Message:   *msg,
	})
	return msg, nil
}

// EditConversationMessage troca o texto de uma mensagem do autor na DM.
// Diferente da mensagem nova, não reabre a DM para quem fechou.
func (s *Service) EditConversationMessage(ctx context.Context, conversationID string, messageID string, userID string, content string) (*Message, error) {
	msg, changed, err := s.editMessage(ctx, "", conversationID, messageID, userID, content)
	if err != nil || !changed {
		return msg, err
	}

	var userIDs []string
	if s.convResolver != nil {
		userIDs, _ = s.convResolver.ConversationParticipantIDs(ctx, conversationID)
	}
	s.publisher.PublishMessageUpdate(UpdateEvent{
		ConversationID: msg.ConversationID,
		UserIDs:        userIDs,
		Message:        *msg,
	})
	return msg, nil
}
