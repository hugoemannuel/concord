package message

import (
	"context"
	"errors"
	"log"
	"time"
)

var (
	// ErrViewOnceForbidden: quem pede não pode abrir (é o autor ou não estava
	// na conversa no envio).
	ErrViewOnceForbidden = errors.New("view once not allowed")
	// ErrViewOnceGone: já viu, ou o arquivo já foi apagado.
	ErrViewOnceGone = errors.New("view once already viewed")
)

type viewOnceRepo interface {
	MarkViewOnce(ctx context.Context, attachmentID, uploaderID, conversationID string, recipientIDs []string) error
}

// viewOnceOpenRepo é o que a abertura usa do banco.
type viewOnceOpenRepo interface {
	FindAttachment(ctx context.Context, id string) (*storedAttachment, error)
	IsViewOnceRecipient(ctx context.Context, attachmentID, userID string) (bool, error)
	GrantView(ctx context.Context, attachmentID, userID string) (bool, error)
	FindByID(ctx context.Context, id string) (*Message, error)
	AttachAttachments(ctx context.Context, messages []Message) error
}

// ViewOnceTokens gera o token curto que abre um anexo de visualização única.
type ViewOnceTokens interface {
	GenerateViewOnceToken(userID, attachmentID string) (string, time.Time, error)
}

// ViewOnceOpenDeps liga a abertura (POST /attachments/:id/open).
type ViewOnceOpenDeps struct {
	Repo      viewOnceOpenRepo
	Access    RoomAccess
	Tokens    ViewOnceTokens
	Publisher EventPublisher
}

// ViewOncePreparer é o que o handler da DM usa para preparar o envio.
type ViewOncePreparer interface {
	Prepare(ctx context.Context, conversationID, authorID string, attachmentIDs []string, stickerID, gifURL *string) error
}

// ViewOnceService cuida das mensagens de visualização única.
type ViewOnceService struct {
	repo         viewOnceRepo
	participants ExpiryParticipants
	open         ViewOnceOpenDeps
}

func NewViewOnceService(repo viewOnceRepo, participants ExpiryParticipants) *ViewOnceService {
	return &ViewOnceService{repo: repo, participants: participants}
}

// SetOpen liga a abertura das mídias.
func (s *ViewOnceService) SetOpen(d ViewOnceOpenDeps) { s.open = d }

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

// Open libera a mídia para userID uma única vez: devolve o token view_once do
// anexo. A visualização só é gravada depois de todas as conferências e do
// token pronto; de duas aberturas ao mesmo tempo, só uma ganha.
func (s *ViewOnceService) Open(ctx context.Context, attachmentID, userID string) (string, time.Time, error) {
	a, err := s.openable(ctx, attachmentID, userID)
	if err != nil {
		return "", time.Time{}, err
	}
	token, expiresAt, err := s.open.Tokens.GenerateViewOnceToken(userID, a.ID)
	if err != nil {
		return "", time.Time{}, err
	}
	granted, err := s.open.Repo.GrantView(ctx, a.ID, userID)
	if err != nil {
		return "", time.Time{}, err
	}
	if !granted {
		return "", time.Time{}, ErrViewOnceGone
	}
	// A visualização já está gravada: o aviso sai mesmo se o pedido cair. O
	// arquivo fica até a limpeza periódica (ViewOnceOpenWindow depois da
	// última abertura), para o token valer os 5 min.
	s.publishUpdate(context.WithoutCancel(ctx), *a.MessageID, *a.ConversationID)
	return token, expiresAt, nil
}

// openable confere se userID pode abrir agora: anexo de visualização única já
// enviado, sala que ele lê, ele entre os destinatários e ainda não apagado.
func (s *ViewOnceService) openable(ctx context.Context, attachmentID, userID string) (*storedAttachment, error) {
	a, err := s.open.Repo.FindAttachment(ctx, attachmentID)
	if err != nil {
		return nil, err
	}
	if !a.ViewOnce || a.MessageID == nil || a.ConversationID == nil {
		return nil, ErrAttachmentNotFound
	}
	if err := s.open.Access.CanRead(ctx, Room{ConversationID: *a.ConversationID}, userID); err != nil {
		return nil, err
	}
	if err := s.checkRecipient(ctx, a, userID); err != nil {
		return nil, err
	}
	if a.ViewOnceGone {
		return nil, ErrViewOnceGone
	}
	return a, nil
}

func (s *ViewOnceService) checkRecipient(ctx context.Context, a *storedAttachment, userID string) error {
	if a.UploaderID == userID {
		return ErrViewOnceForbidden
	}
	ok, err := s.open.Repo.IsViewOnceRecipient(ctx, a.ID, userID)
	if err != nil {
		return err
	}
	if !ok {
		return ErrViewOnceForbidden
	}
	return nil
}

// publishUpdate relê a mensagem (com o view_once novo) e publica o
// message:update para os participantes, como a edição na DM (o autor vê
// "Vista por").
func (s *ViewOnceService) publishUpdate(ctx context.Context, messageID, conversationID string) {
	msg, err := s.open.Repo.FindByID(ctx, messageID)
	if err != nil {
		log.Printf("view_once: reler mensagem %s: %v", messageID, err)
		return
	}
	page := []Message{*msg}
	if err := s.open.Repo.AttachAttachments(ctx, page); err != nil {
		log.Printf("view_once: anexos da mensagem %s: %v", messageID, err)
		return
	}
	userIDs, err := s.participants.ConversationParticipantIDs(ctx, conversationID)
	if err != nil {
		log.Printf("view_once: participantes de %s: %v", conversationID, err)
	}
	s.open.Publisher.PublishMessageUpdate(UpdateEvent{
		ConversationID: page[0].ConversationID,
		UserIDs:        userIDs,
		Message:        page[0],
	})
}
