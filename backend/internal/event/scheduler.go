package event

import (
	"context"
	"log"
	"time"
	_ "time/tzdata" // fuso de Brasília também no Windows e em contêineres sem tzdata
)

const (
	tickEvery  = 30 * time.Second
	batchLimit = 50
)

// Notifier manda uma DM do Salinha Bot (cmd/wire_engagement.go).
type Notifier interface {
	Notify(ctx context.Context, userID, text string) error
}

// schedulerStore é o que o ticker usa do repositório.
type schedulerStore interface {
	ClaimDue(ctx context.Context, now time.Time, limit int) ([]DueReminder, error)
	Going(ctx context.Context, eventID string, occurrence time.Time) ([]string, error)
	RoomsToOpen(ctx context.Context, now time.Time, limit int) ([]RoomRequest, error)
	RoomsToClose(ctx context.Context, now time.Time, limit int) ([]RoomRef, error)
	AdvanceDue(ctx context.Context, now time.Time, loc *time.Location, limit int) (int, error)
}

// schedulerRooms abre e fecha as salas dos eventos (Rooms).
type schedulerRooms interface {
	Open(ctx context.Context, req RoomRequest, going []string) error
	Close(ctx context.Context, ref RoomRef) error
}

// DueReminder é um aviso que já venceu, com o que a DM precisa dizer.
type DueReminder struct {
	ID            int64
	EventID       string
	ServerID      string
	ServerName    string
	ChannelName   string
	Title         string
	Occurrence    time.Time
	DueAt         time.Time
	OffsetMinutes int
}

// Scheduler manda os avisos dos eventos e avança as ocorrências que acabaram.
type Scheduler struct {
	store    schedulerStore
	notifier Notifier
	rooms    schedulerRooms // nil = sem salas próprias
	pub      publisher      // avisa o app que a sala abriu ou fechou (pode ser nil)
	loc      *time.Location
	now      func() time.Time
	// every: de quanto em quanto tempo o ticker confere (tickEvery; os testes encurtam).
	every time.Duration
}

func NewScheduler(store schedulerStore, notifier Notifier, rooms schedulerRooms, pub publisher) *Scheduler {
	loc, err := time.LoadLocation("America/Sao_Paulo")
	if err != nil {
		log.Printf("[eventos] fuso America/Sao_Paulo indisponível, usando UTC-3: %v", err)
		loc = time.FixedZone("BRT", -3*60*60)
	}
	return &Scheduler{store: store, notifier: notifier, rooms: rooms, pub: pub, loc: loc, now: time.Now, every: tickEvery}
}

// Run confere os avisos a cada 30 s até o contexto acabar.
func (s *Scheduler) Run(ctx context.Context) {
	ticker := time.NewTicker(s.every)
	defer ticker.Stop()

	s.tick(ctx)
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			s.tick(ctx)
		}
	}
}

// tick faz uma rodada, nesta ordem: fecha as salas que acabaram, abre as que
// chegaram na hora, manda os avisos devidos (o "começou" já encontra a sala
// aberta) e, por último, avança as ocorrências que acabaram e já fecharam a sala.
func (s *Scheduler) tick(ctx context.Context) {
	now := s.now()
	s.closeRooms(ctx, now)
	s.openRooms(ctx, now)
	due, err := s.store.ClaimDue(ctx, now, batchLimit)
	if err != nil {
		log.Printf("[eventos] buscar avisos devidos: %v", err)
	}
	for _, d := range due {
		s.deliver(ctx, d, now)
	}
	if _, err := s.store.AdvanceDue(ctx, now, s.loc, batchLimit); err != nil {
		log.Printf("[eventos] avançar ocorrências: %v", err)
	}
}

// deliver manda a DM a quem confirmou; falha com uma pessoa não barra as outras.
func (s *Scheduler) deliver(ctx context.Context, d DueReminder, now time.Time) {
	if stale(d, now) {
		return
	}
	ids, err := s.store.Going(ctx, d.EventID, d.Occurrence)
	if err != nil {
		log.Printf("[eventos] quem vai no evento %s: %v", d.EventID, err)
		return
	}
	text := reminderText(d)
	for _, id := range ids {
		if err := s.notifier.Notify(ctx, id, text); err != nil {
			log.Printf("[eventos] DM do evento %s para %s: %v", d.EventID, id, err)
		}
	}
}

// closeRooms fecha a sala dos eventos que acabaram ou foram cancelados. Falha
// em uma sala não pára as outras; a próxima rodada tenta de novo.
func (s *Scheduler) closeRooms(ctx context.Context, now time.Time) {
	if s.rooms == nil {
		return
	}
	refs, err := s.store.RoomsToClose(ctx, now, batchLimit)
	if err != nil {
		log.Printf("[eventos] buscar salas para fechar: %v", err)
	}
	for _, ref := range refs {
		if err := s.rooms.Close(ctx, ref); err != nil {
			log.Printf("[eventos] fechar a sala do evento %s: %v", ref.EventID, err)
			continue
		}
		s.announce(ref.ServerID, ref.EventID)
	}
}

// openRooms abre a sala dos eventos que acabaram de começar, liberada a quem
// já confirmou presença.
func (s *Scheduler) openRooms(ctx context.Context, now time.Time) {
	if s.rooms == nil {
		return
	}
	requests, err := s.store.RoomsToOpen(ctx, now, batchLimit)
	if err != nil {
		log.Printf("[eventos] buscar salas para abrir: %v", err)
	}
	for _, req := range requests {
		going, err := s.store.Going(ctx, req.EventID, req.Occurrence)
		if err != nil {
			log.Printf("[eventos] quem vai no evento %s: %v", req.EventID, err)
			continue
		}
		if err := s.rooms.Open(ctx, req, going); err != nil {
			log.Printf("[eventos] abrir a sala do evento %s: %v", req.EventID, err)
			continue
		}
		s.announce(req.ServerID, req.EventID)
	}
}

// announce avisa o app do servidor que o evento mudou (a sala abriu ou fechou);
// o app recarrega a lista.
func (s *Scheduler) announce(serverID, eventID string) {
	if s.pub == nil {
		return
	}
	s.pub.BroadcastToRoom("server:"+serverID, marshalEvent("event:update", map[string]string{
		"server_id": serverID,
		"event_id":  eventID,
	}))
}
