package serverlevel

import (
	"context"
	"log"
	"sync"
	"time"

	"gin-quickstart/backend/internal/call"
	"gin-quickstart/backend/internal/platform/wsevent"
)

const (
	// flushEvery: ticks entre gravações do tempo de call (1 min). O sync do
	// nível vem logo depois e pega também o que os triggers somaram.
	flushEvery = 6
	// membersEvery: ticks entre as contagens de membro novo (5 min).
	membersEvery = 30
	// flushTimeout: prazo da gravação final no desligamento.
	flushTimeout = 5 * time.Second
)

// CallSource são as fotos das calls sem quem está AFK (call.AFK).
type CallSource interface {
	CallSnapshots() []call.CallSnapshot
}

// RealAccounts diz quais destes usuários são contas reais
// (badge.RealAccountCache).
type RealAccounts interface {
	Lookup(ctx context.Context, ids []string, now time.Time) map[string]bool
}

// EventPublisher manda para quem está online no servidor (sala "server:").
type EventPublisher interface {
	BroadcastToRoom(room string, event []byte)
}

type store interface {
	Add(ctx context.Context, serverID, userID, source string, xp int64) error
	GrantNewMembers(ctx context.Context) error
	Recent(ctx context.Context) ([]levelRow, error)
	SetLevel(ctx context.Context, serverID string, level int) error
	Detail(ctx context.Context, serverID string) (int64, map[string]int64, error)
}

type Service struct {
	store     store
	calls     CallSource
	real      RealAccounts
	publisher EventPublisher

	mu      sync.Mutex
	tracker *tracker
	ticks   int
	// lastXP: o XP mandado por último de cada servidor (só avisa mudança).
	lastXP map[string]int64
}

func NewService(store store, calls CallSource, real RealAccounts, publisher EventPublisher) *Service {
	return &Service{
		store:     store,
		calls:     calls,
		real:      real,
		publisher: publisher,
		tracker:   newTracker(time.Now()),
		lastXP:    make(map[string]int64),
	}
}

// Run conta o tempo de call até ctx acabar; no fim grava o último minuto.
func (s *Service) Run(ctx context.Context) {
	ticker := time.NewTicker(tickInterval)
	defer ticker.Stop()
	s.mu.Lock()
	s.tracker.lastTick = time.Now()
	s.mu.Unlock()
	for {
		select {
		case <-ctx.Done():
			fctx, cancel := context.WithTimeout(context.WithoutCancel(ctx), flushTimeout)
			s.flush(fctx)
			cancel()
			return
		case now := <-ticker.C:
			s.tick(ctx, now)
		}
	}
}

func (s *Service) tick(ctx context.Context, now time.Time) {
	snaps := s.calls.CallSnapshots()
	real := s.real.Lookup(ctx, serverParticipants(snaps), now)
	s.mu.Lock()
	s.tracker.accrue(snaps, real, now)
	s.ticks++
	flush, members := s.ticks%flushEvery == 0, s.ticks%membersEvery == 0
	s.mu.Unlock()

	if members {
		if err := s.store.GrantNewMembers(ctx); err != nil {
			log.Printf("[serverlevel] %v", err)
		}
	}
	if flush {
		s.flush(ctx)
		s.sync(ctx)
	}
}

// serverParticipants: quem está em call de servidor (para o cache de contas
// reais).
func serverParticipants(snaps []call.CallSnapshot) []string {
	var ids []string
	for _, snap := range snaps {
		if snap.ServerID != nil {
			ids = append(ids, snap.Participants...)
		}
	}
	return ids
}

// flush grava os minutos fechados; o que falhar volta para o próximo.
func (s *Service) flush(ctx context.Context) {
	s.mu.Lock()
	grants := s.tracker.drain()
	s.mu.Unlock()
	var failed []grant
	for _, g := range grants {
		if err := s.store.Add(ctx, g.serverID, g.userID, g.source, g.xp); err != nil {
			log.Printf("[serverlevel] %v", err)
			failed = append(failed, g)
		}
	}
	if len(failed) == 0 {
		return
	}
	s.mu.Lock()
	for _, g := range failed {
		s.tracker.restore(g)
	}
	s.mu.Unlock()
}

// sync acerta o nível dos servidores que mudaram: avisa o progresso novo e,
// se subiu, a subida. O retroativo (nível nunca visto) é acertado sem aviso.
func (s *Service) sync(ctx context.Context) {
	rows, err := s.store.Recent(ctx)
	if err != nil {
		log.Printf("[serverlevel] %v", err)
		return
	}
	for _, row := range rows {
		s.syncRow(ctx, row)
	}
}

func (s *Service) syncRow(ctx context.Context, row levelRow) {
	progress := newProgress(row.serverID, row.xp)
	change := levelChange(row.level, progress.Level)
	if change.save {
		if err := s.store.SetLevel(ctx, row.serverID, progress.Level); err != nil {
			log.Printf("[serverlevel] %v", err)
			return
		}
	}
	room := "server:" + row.serverID
	if last, seen := s.lastXP[row.serverID]; !seen || last != row.xp {
		s.lastXP[row.serverID] = row.xp
		s.publisher.BroadcastToRoom(room, wsevent.Marshal("server:level:update", progress))
	}
	if change.announce {
		s.publisher.BroadcastToRoom(room, wsevent.Marshal("server:level:up", LevelUpEvent{
			ServerID:      row.serverID,
			Level:         progress.Level,
			PreviousLevel: *row.level,
		}))
	}
}

type change struct {
	save, announce bool
}

// levelChange: o que fazer com o nível visto (stored) e o da curva (level).
// Nunca visto (retroativo): grava sem aviso. Subiu: grava e avisa. Desceu
// (descontos): grava sem aviso.
func levelChange(stored *int, level int) change {
	if stored == nil {
		return change{save: true}
	}
	if level == *stored {
		return change{}
	}
	return change{save: true, announce: level > *stored}
}

// Detail é o nível do servidor com o XP de cada fonte nos últimos 7 dias.
func (s *Service) Detail(ctx context.Context, serverID string) (Detail, error) {
	xp, week, err := s.store.Detail(ctx, serverID)
	if err != nil {
		return Detail{}, err
	}
	d := Detail{Progress: newProgress(serverID, xp), Week: make([]SourceXP, 0, len(Sources))}
	for _, source := range Sources {
		d.Week = append(d.Week, SourceXP{Source: source, XP: week[source]})
	}
	return d, nil
}
