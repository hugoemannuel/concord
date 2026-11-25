package message

import (
	"context"

	"github.com/google/uuid"
)

// SystemNotice: mensagem do próprio servidor num canal (aniversário, aviso de
// mensagens temporárias, alertas). Não conta para badges nem XP (system_kind).
type SystemNotice struct {
	ChannelID string
	// AuthorID: quem responde pelo servidor (o dono ou um bot).
	AuthorID string
	Content  string
	// Kind: o messages.system_kind.
	Kind string
}

// PostSystemNotice grava a mensagem e avisa quem está no canal.
func (s *Service) PostSystemNotice(ctx context.Context, n SystemNotice) (*Message, error) {
	msg := &Message{
		ID:         uuid.New().String(),
		AuthorID:   n.AuthorID,
		ChannelID:  &n.ChannelID,
		Content:    n.Content,
		SystemKind: &n.Kind,
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
		serverID, _ = s.channelResolver.ChannelServerID(ctx, n.ChannelID)
	}
	s.publisher.PublishMessageCreate(CreateEvent{ChannelID: full.ChannelID, ServerID: serverID, Message: *full})
	return full, nil
}
