package message

import (
	"context"
	"errors"
	"log"
	"slices"
	"time"
)

// publishTimeout limita o aviso pós-abertura, que ignora o cancelamento do pedido.
const publishTimeout = 5 * time.Second

var (
	// ErrViewOnceForbidden: quem pede não pode abrir (é o autor ou não estava
	// na conversa no envio).
	ErrViewOnceForbidden = errors.New("view once not allowed")
	// ErrViewOnceGone: já viu, ou o arquivo já foi apagado.
	ErrViewOnceGone = errors.New("view once already viewed")
)

type viewOnceRepo interface {
	MarkViewOnce(ctx context.Context, attachmentID, uploaderID string, room Room, recipientIDs []string) error
	BotIDs(ctx context.Context, ids []string) ([]string, error)
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

// ViewOncePreparer é o que os handlers (DM e canal) usam para preparar o envio.
type ViewOncePreparer interface {
	Prepare(ctx context.Context, room Room, authorID string, attachmentIDs []string, stickerID, gifURL *string) error
}

// ViewOnceService cuida das mensagens de visualização única.
type ViewOnceService struct {
	repo         viewOnceRepo
	participants ExpiryParticipants
	channels     viewOnceChannelDeps
	open         ViewOnceOpenDeps
}

func NewViewOnceService(repo viewOnceRepo, participants ExpiryParticipants) *ViewOnceService {
	return &ViewOnceService{repo: repo, participants: participants}
}

// SetOpen liga a abertura das mídias.
func (s *ViewOnceService) SetOpen(d ViewOnceOpenDeps) { s.open = d }

// Prepare valida e marca o anexo (ainda pendente) como visualização única,
// ANTES de a mensagem ser criada. Quem pode abrir fica fixado no envio: na
// conversa, os participantes menos o autor; no canal, quem vê o canal agora
// (channelRecipients).
func (s *ViewOnceService) Prepare(ctx context.Context, room Room, authorID string, attachmentIDs []string, stickerID, gifURL *string) error {
	if err := validateViewOnce(attachmentIDs, stickerID, gifURL); err != nil {
		return err
	}
	recipients, err := s.recipients(ctx, room, authorID)
	if err != nil {
		return err
	}
	return s.repo.MarkViewOnce(ctx, attachmentIDs[0], authorID, room, recipients)
}

// recipients: quem poderá abrir a mídia enviada na sala.
func (s *ViewOnceService) recipients(ctx context.Context, room Room, authorID string) ([]string, error) {
	if room.ChannelID != "" {
		return s.channelRecipients(ctx, room.ChannelID, authorID)
	}
	ids, err := s.participants.ConversationParticipantIDs(ctx, room.ConversationID)
	if err != nil {
		return nil, err
	}
	return withoutIDs(ids, authorID), nil
}

// withoutIDs devolve ids sem os removidos, na mesma ordem.
func withoutIDs(ids []string, removed ...string) []string {
	out := make([]string, 0, len(ids))
	for _, id := range ids {
		if !slices.Contains(removed, id) {
			out = append(out, id)
		}
	}
	return out
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
	pubCtx, cancel := context.WithTimeout(context.WithoutCancel(ctx), publishTimeout)
	defer cancel()
	s.publishUpdate(pubCtx, *a.MessageID, *a.ConversationID)
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
