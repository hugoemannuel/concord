package message

import (
	"context"

	"gin-quickstart/backend/internal/audit"
	"gin-quickstart/backend/internal/permission"
)

// Fixar e desafixar mensagens do canal.

func (s *Service) ListChannelPins(ctx context.Context, channelID string, userID string) ([]PinnedMessage, error) {
	if s.perms != nil {
		perms, err := s.perms.ChannelPerms(ctx, channelID, userID)
		if err != nil || perms&permission.ViewChannel == 0 {
			return nil, ErrMessageNotFound
		}
	}
	return s.repository.ListPinnedMessages(ctx, channelID)
}

func (s *Service) PinChannelMessage(ctx context.Context, channelID string, messageID string, userID string) (*PinnedMessage, error) {
	msg, err := s.repository.FindByID(ctx, messageID)
	if err != nil {
		return nil, ErrMessageNotFound
	}
	if msg.ChannelID == nil || *msg.ChannelID != channelID {
		return nil, ErrMessageNotFound
	}
	if err := s.canManageChannelMessages(ctx, channelID, userID); err != nil {
		return nil, err
	}

	pinned, err := s.repository.PinMessage(ctx, channelID, messageID, userID)
	if err != nil {
		return nil, err
	}

	serverID := ""
	if s.channelResolver != nil {
		serverID, _ = s.channelResolver.ChannelServerID(ctx, channelID)
	}

	s.recordModeration(ctx, audit.MessagePin, serverID, channelID, msg.AuthorID, userID)
	if s.publisher != nil {
		s.publisher.PublishMessagePin(PinEvent{
			ChannelID: channelID,
			ServerID:  serverID,
			Message:   *pinned,
		})
	}

	return pinned, nil
}

func (s *Service) UnpinChannelMessage(ctx context.Context, channelID string, messageID string, userID string) error {
	msg, err := s.repository.FindByID(ctx, messageID)
	if err != nil {
		return ErrMessageNotFound
	}
	if msg.ChannelID == nil || *msg.ChannelID != channelID {
		return ErrMessageNotFound
	}
	if err := s.canManageChannelMessages(ctx, channelID, userID); err != nil {
		return err
	}

	if err := s.repository.UnpinMessage(ctx, channelID, messageID); err != nil {
		return err
	}

	serverID := ""
	if s.channelResolver != nil {
		serverID, _ = s.channelResolver.ChannelServerID(ctx, channelID)
	}

	s.recordModeration(ctx, audit.MessageUnpin, serverID, channelID, msg.AuthorID, userID)
	if s.publisher != nil {
		s.publisher.PublishMessageUnpin(UnpinEvent{
			ChannelID: channelID,
			ServerID:  serverID,
			MessageID: messageID,
		})
	}

	return nil
}
