package message

import "context"

type viewOnceRepo interface {
	MarkViewOnce(ctx context.Context, attachmentID, uploaderID, conversationID string, recipientIDs []string) error
}

// ViewOncePreparer é o que o handler da DM usa para preparar o envio.
type ViewOncePreparer interface {
	Prepare(ctx context.Context, conversationID, authorID string, attachmentIDs []string, stickerID, gifURL *string) error
}

// ViewOnceService cuida das mensagens de visualização única.
type ViewOnceService struct {
	repo         viewOnceRepo
	participants ExpiryParticipants
}

func NewViewOnceService(repo viewOnceRepo, participants ExpiryParticipants) *ViewOnceService {
	return &ViewOnceService{repo: repo, participants: participants}
}

// Prepare valida e marca o anexo (ainda pendente) como visualização única,
// ANTES de a mensagem ser criada: quem pode abrir são os participantes da
// conversa menos o autor, fixados no envio.
func (s *ViewOnceService) Prepare(ctx context.Context, conversationID, authorID string, attachmentIDs []string, stickerID, gifURL *string) error {
	if err := validateViewOnce(attachmentIDs, stickerID, gifURL); err != nil {
		return err
	}
	ids, err := s.participants.ConversationParticipantIDs(ctx, conversationID)
	if err != nil {
		return err
	}
	recipients := make([]string, 0, len(ids))
	for _, id := range ids {
		if id != authorID {
			recipients = append(recipients, id)
		}
	}
	return s.repo.MarkViewOnce(ctx, attachmentIDs[0], authorID, conversationID, recipients)
}
