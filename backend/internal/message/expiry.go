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
	ExpireViewOnce(ctx context.Context, sentBefore, viewedBefore time.Time) ([]string, error)
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

	gone, err := s.repo.ExpireViewOnce(ctx, now.Add(-ViewOnceTTL), now.Add(-ViewOnceOpenWindow))
	if err != nil {
		return err
	}
	s.removeFiles(gone)
	return nil
}

func (s *ExpirySweeper) removeFiles(ids []string) {
	if s.files == nil {
		return
	}
	for _, id := range ids {
		if err := s.files.Remove(id); err != nil {
			log.Printf("expiry sweeper: failed to remove attachment file %s: %v", id, err)
		}
	}
}

// publishDelete avisa a conversa. Se não achar os participantes, publica
// assim mesmo (a linha já sumiu), só para a sala da conversa.
func (s *ExpirySweeper) publishDelete(ctx context.Context, m ExpiredMessage, rooms map[string][]string) {
	userIDs, ok := rooms[m.ConversationID]
	if !ok {
		ids, err := s.participants.ConversationParticipantIDs(ctx, m.ConversationID)
		if err != nil {
			log.Printf("expiry sweeper: participants of %s: %v", m.ConversationID, err)
		} else {
			userIDs = ids
		}
		rooms[m.ConversationID] = userIDs
	}
	conv := m.ConversationID
	s.publisher.PublishMessageDelete(DeleteEvent{ConversationID: &conv, UserIDs: userIDs, MessageID: m.ID})
}
