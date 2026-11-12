package message

import (
	"context"

	"github.com/google/uuid"
)

// PostConversationNotice grava um aviso de sistema numa conversa e o publica
// aos participantes: o espelho de CreateSystemChannelMessage para DM e grupo.
func (s *Service) PostConversationNotice(ctx context.Context, conversationID, authorID, content, kind string) error {
	msg := &Message{
		ID:             uuid.New().String(),
		AuthorID:       authorID,
		ConversationID: &conversationID,
		Content:        content,
		SystemKind:     &kind,
	}
	_, err := postToConversation(ctx, s.repository, s.convResolver, s.publisher, msg)
	return err
}
