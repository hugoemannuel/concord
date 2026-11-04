package message

import (
	"context"

	"gin-quickstart/backend/internal/bot"
	"gin-quickstart/backend/internal/expression"
)

// Pôr e tirar reações, no canal e na DM.

func (s *Service) AddChannelReaction(ctx context.Context, channelID string, messageID string, userID string, emoji string) error {
	if err := ValidateEmoji(emoji); err != nil {
		return err
	}

	msg, err := s.repository.FindByID(ctx, messageID)
	if err != nil || !SameRoomTarget(msg, channelID, "") {
		return ErrMessageNotFound
	}
	if err := s.expressions.reaction(ctx, s.channelDestination(ctx, channelID), messageID, userID, emoji); err != nil {
		return err
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
	if err := s.expressions.reaction(ctx, expression.Destination{}, messageID, userID, emoji); err != nil {
		return err
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
