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
	ConversationID string // vazio numa mensagem de canal
	ChannelID      string // vazio numa mensagem de conversa
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

// ExpiryChannels resolve o servidor de um canal (para avisar a sala do canal).
type ExpiryChannels interface {
	ChannelServerID(ctx context.Context, channelID string) (string, error)
}

// ExpirySweeper apaga as mensagens temporárias vencidas e as mídias de
// visualização única que todos viram (passada a janela do token) ou que
// ninguém terminou de abrir em ViewOnceTTL.
type ExpirySweeper struct {
	repo         expiryRepo
	participants ExpiryParticipants
	channels     ExpiryChannels
	files        FileRemover
	publisher    EventPublisher
}

func NewExpirySweeper(repo expiryRepo, participants ExpiryParticipants, channels ExpiryChannels, files FileRemover, publisher EventPublisher) *ExpirySweeper {
	return &ExpirySweeper{repo: repo, participants: participants, channels: channels, files: files, publisher: publisher}
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
	rooms := newExpiryRooms() // participantes por conversa e servidor por canal, nesta passada
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
func (s *ExpirySweeper) expireViewOnce(ctx context.Context, now time.Time, rooms *expiryRooms) error {
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
func (s *ExpirySweeper) publishViewOnceUpdates(ctx context.Context, gone []ExpiredViewOnce, rooms *expiryRooms) {
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
		ev := UpdateEvent{ConversationID: page[0].ConversationID, ChannelID: page[0].ChannelID, Message: page[0]}
		ev.ServerID, ev.UserIDs = s.audience(ctx, g.ChannelID, g.ConversationID, rooms)
		s.publisher.PublishMessageUpdate(ev)
	}
}

// expiryRooms guarda, durante uma passada, quem está em cada conversa e o
// servidor de cada canal, para consultar cada um uma vez só.
type expiryRooms struct {
	participants map[string][]string
	servers      map[string]string
}

func newExpiryRooms() *expiryRooms {
	return &expiryRooms{participants: map[string][]string{}, servers: map[string]string{}}
}

// publishDelete avisa a sala da mensagem: o canal (com o servidor) ou os
// participantes da conversa. Se não achar quem avisar, publica assim mesmo
// (a linha já sumiu), só para a sala.
func (s *ExpirySweeper) publishDelete(ctx context.Context, m ExpiredMessage, rooms *expiryRooms) {
	ev := DeleteEvent{MessageID: m.ID, Expired: true}
	if m.ChannelID != "" {
		ch := m.ChannelID
		ev.ChannelID = &ch
	} else {
		conv := m.ConversationID
		ev.ConversationID = &conv
	}
	ev.ServerID, ev.UserIDs = s.audience(ctx, m.ChannelID, m.ConversationID, rooms)
	s.publisher.PublishMessageDelete(ev)
}

// audience devolve o servidor (mensagem de canal) ou os participantes (conversa).
func (s *ExpirySweeper) audience(ctx context.Context, channelID, conversationID string, rooms *expiryRooms) (string, []string) {
	if channelID != "" {
		return s.serverOf(ctx, channelID, rooms), nil
	}
	return "", s.participantsOf(ctx, conversationID, rooms)
}

// serverOf consulta o servidor uma vez por canal na passada.
func (s *ExpirySweeper) serverOf(ctx context.Context, channelID string, rooms *expiryRooms) string {
	serverID, ok := rooms.servers[channelID]
	if !ok {
		id, err := s.channels.ChannelServerID(ctx, channelID)
		if err != nil {
			log.Printf("expiry sweeper: servidor do canal %s: %v", channelID, err)
		} else {
			serverID = id
		}
		rooms.servers[channelID] = serverID
	}
	return serverID
}

// participantsOf consulta os participantes uma vez por conversa na passada.
func (s *ExpirySweeper) participantsOf(ctx context.Context, conversationID string, rooms *expiryRooms) []string {
	userIDs, ok := rooms.participants[conversationID]
	if !ok {
		ids, err := s.participants.ConversationParticipantIDs(ctx, conversationID)
		if err != nil {
			log.Printf("expiry sweeper: participants of %s: %v", conversationID, err)
		} else {
			userIDs = ids
		}
		rooms.participants[conversationID] = userIDs
	}
	return userIDs
}
