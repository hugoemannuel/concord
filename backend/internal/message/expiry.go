package message

import (
	"context"
	"log"
	"time"
)

const (
	// ViewOnceTTL é quanto uma mídia de visualização única espera ser aberta
	// por todos antes de ser apagada, contado do envio.
	ViewOnceTTL = 14 * 24 * time.Hour
	// ViewOnceOpenWindow é quanto o arquivo continua no disco depois da última
	// abertura. Precisa ser igual ao TTL do token view_once (auth.ViewOnceTokenTTL).
	ViewOnceOpenWindow = 5 * time.Minute
	// expiryBatch é o tamanho do lote de mensagens vencidas por passada.
	expiryBatch = 500
)

// ExpiredMessage é uma mensagem apagada por vencimento, com os anexos que
// ficaram sem linha e agora precisam sair do disco.
type ExpiredMessage struct {
	ID             string
	ConversationID string
	AttachmentIDs  []string
}

type expiryRepo interface {
	DeleteExpired(ctx context.Context, now time.Time, limit int) ([]ExpiredMessage, error)
	ExpireViewOnce(ctx context.Context, sentBefore, viewedBefore time.Time) ([]ExpiredViewOnce, error)
	PendingViewOnceFiles(ctx context.Context, limit int) ([]string, error)
	MarkViewOnceFilesRemoved(ctx context.Context, ids []string) error
	FindByID(ctx context.Context, id string) (*Message, error)
	AttachAttachments(ctx context.Context, messages []Message) error
}

// ExpiryParticipants diz quem está numa conversa (para avisar o apagamento).
type ExpiryParticipants interface {
	ConversationParticipantIDs(ctx context.Context, conversationID string) ([]string, error)
}

// ExpirySweeper apaga as mensagens temporárias vencidas e as mídias de
// visualização única que todos viram (passada a janela do token) ou que
// ninguém terminou de abrir em ViewOnceTTL.
type ExpirySweeper struct {
	repo         expiryRepo
	participants ExpiryParticipants
	files        FileRemover
	publisher    EventPublisher
}

func NewExpirySweeper(repo expiryRepo, participants ExpiryParticipants, files FileRemover, publisher EventPublisher) *ExpirySweeper {
	return &ExpirySweeper{repo: repo, participants: participants, files: files, publisher: publisher}
}

// Run varre agora e depois a cada every, até ctx acabar.
func (s *ExpirySweeper) Run(ctx context.Context, every time.Duration) {
	ticker := time.NewTicker(every)
	defer ticker.Stop()
	for {
		if err := s.RunOnce(ctx, time.Now()); err != nil {
			log.Printf("expiry sweeper: %v", err)
		}
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
		}
	}
}

// RunOnce apaga as vencidas em lotes (até vir um lote incompleto) e expira as
// mídias de visualização única antigas.
func (s *ExpirySweeper) RunOnce(ctx context.Context, now time.Time) error {
	rooms := map[string][]string{} // participantes por conversa, nesta passada
	for {
		if err := ctx.Err(); err != nil {
			return err
		}
		batch, err := s.repo.DeleteExpired(ctx, now, expiryBatch)
		if err != nil {
			return err
		}
		for _, m := range batch {
			s.removeFiles(m.AttachmentIDs)
			s.publishDelete(ctx, m, rooms)
		}
		if len(batch) < expiryBatch {
			break
		}
	}

	return s.expireViewOnce(ctx, now, rooms)
}

// expireViewOnce marca as mídias vencidas, reavisa as conversas e remove os
// arquivos pendentes (os recém-marcados e os de uma passada interrompida).
func (s *ExpirySweeper) expireViewOnce(ctx context.Context, now time.Time, rooms map[string][]string) error {
	gone, err := s.repo.ExpireViewOnce(ctx, now.Add(-ViewOnceTTL), now.Add(-ViewOnceOpenWindow))
	if err != nil {
		return err
	}
	s.publishViewOnceUpdates(ctx, gone, rooms)
	if s.files == nil {
		return nil
	}
	pending, err := s.repo.PendingViewOnceFiles(ctx, expiryBatch)
	if err != nil {
		return err
	}
	return s.repo.MarkViewOnceFilesRemoved(ctx, s.removeFiles(pending))
}

// removeFiles apaga os arquivos e devolve os ids que saíram (apagar um arquivo
// que já não existe não é erro).
func (s *ExpirySweeper) removeFiles(ids []string) []string {
	if s.files == nil {
		return nil
	}
	removed := make([]string, 0, len(ids))
	for _, id := range ids {
		if err := s.files.Remove(id); err != nil {
			log.Printf("expiry sweeper: failed to remove attachment file %s: %v", id, err)
			continue
		}
		removed = append(removed, id)
	}
	return removed
}

// publishViewOnceUpdates publica um message:update por mensagem afetada, para
// o cartão mostrar "Expirou" sem recarregar.
func (s *ExpirySweeper) publishViewOnceUpdates(ctx context.Context, gone []ExpiredViewOnce, rooms map[string][]string) {
	seen := map[string]bool{}
	for _, g := range gone {
		if seen[g.MessageID] {
			continue
		}
		seen[g.MessageID] = true
		msg, err := s.repo.FindByID(ctx, g.MessageID)
		if err != nil {
			log.Printf("expiry sweeper: reler mensagem %s: %v", g.MessageID, err)
			continue
		}
		page := []Message{*msg}
		if err := s.repo.AttachAttachments(ctx, page); err != nil {
			log.Printf("expiry sweeper: anexos da mensagem %s: %v", g.MessageID, err)
			continue
		}
		s.publisher.PublishMessageUpdate(UpdateEvent{
			ConversationID: page[0].ConversationID,
			UserIDs:        s.participantsOf(ctx, g.ConversationID, rooms),
			Message:        page[0],
		})
	}
}

// publishDelete avisa a conversa. Se não achar os participantes, publica
// assim mesmo (a linha já sumiu), só para a sala da conversa.
func (s *ExpirySweeper) publishDelete(ctx context.Context, m ExpiredMessage, rooms map[string][]string) {
	conv := m.ConversationID
	s.publisher.PublishMessageDelete(DeleteEvent{ConversationID: &conv, UserIDs: s.participantsOf(ctx, conv, rooms), MessageID: m.ID, Expired: true})
}

// participantsOf consulta os participantes uma vez por conversa na passada.
func (s *ExpirySweeper) participantsOf(ctx context.Context, conversationID string, rooms map[string][]string) []string {
	userIDs, ok := rooms[conversationID]
	if !ok {
		ids, err := s.participants.ConversationParticipantIDs(ctx, conversationID)
		if err != nil {
			log.Printf("expiry sweeper: participants of %s: %v", conversationID, err)
		} else {
			userIDs = ids
		}
		rooms[conversationID] = userIDs
	}
	return userIDs
}
