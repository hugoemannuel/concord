package level

import (
	"context"
	"log"
	"sync"
	"time"

	"gin-quickstart/backend/internal/call"
	"gin-quickstart/backend/internal/platform/wsevent"
)

// De quanto em quanto tempo o serviço olha quem está em call. O XP só é dado
// por minuto completo sem mute: mutar ou sair antes de fechar o minuto perde
// os segundos acumulados.
const tickInterval = 10 * time.Second

type EventPublisher interface {
	SendToUser(userID string, event []byte)
	BroadcastToCall(callID string, event []byte)
	BroadcastToRoom(room string, event []byte)
}

// VoiceSource diz quem está participando das chamadas agora (call.Service).
type VoiceSource interface {
	ActiveVoiceUsers() []call.VoiceActivity
}

type xpStore interface {
	AddVoiceXP(ctx context.Context, userID string, xp int64, seconds int64) (int64, int64, error)
}

// grant é XP pronto para ser gravado.
type grant struct {
	activity call.VoiceActivity
	minutes  int64
	// xp já inclui o buff e o resto fracionário carregado do minuto anterior.
	xp int64
}

type Service struct {
	repository *Repository
	store      xpStore
	publisher  EventPublisher
	voice      VoiceSource

	mu sync.Mutex
	// pending: tempo elegível de cada usuário que ainda não fechou um minuto.
	pending map[string]time.Duration
	// remainder: centésimos de XP que o buff gerou e ainda não foram pagos
	// (10 XP/min a 125% = 12,5), para a média paga bater com o multiplicador.
	remainder map[string]int64
	lastTick  time.Time
	// lastBoost: calls com buff ativo (percentual enviado por último).
	lastBoost map[string]int
}

func LevelService(repository *Repository, publisher EventPublisher, voice VoiceSource) *Service {
	return &Service{
		repository: repository,
		store:      repository,
		publisher:  publisher,
		voice:      voice,
		pending:    make(map[string]time.Duration),
		remainder:  make(map[string]int64),
		lastBoost:  make(map[string]int),
	}
}

// Run conta o tempo de voz até ctx acabar.
func (s *Service) Run(ctx context.Context) {
	ticker := time.NewTicker(tickInterval)
	defer ticker.Stop()

	s.mu.Lock()
	s.lastTick = time.Now()
	s.mu.Unlock()
	for {
		select {
		case <-ctx.Done():
			return
		case now := <-ticker.C:
			s.tick(ctx, now)
		}
	}
}

func (s *Service) tick(ctx context.Context, now time.Time) {
	active := s.voice.ActiveVoiceUsers()
	boosts := callBoosts(active)
	// O aviso do buff vai antes das gravações: ele é o batimento que mantém o
	// buff vivo no cliente e não pode atrasar junto com o banco.
	s.publishBoosts(boosts)
	for _, g := range s.accrue(active, boosts, now) {
		s.give(ctx, g)
	}
}

// accrue soma o tempo desde o último tick para quem está elegível agora e
// devolve os minutos completos. Quem não está mais elegível perde o que tinha
// acumulado.
func (s *Service) accrue(active []call.VoiceActivity, boosts map[string]callBoost, now time.Time) []grant {
	s.mu.Lock()
	defer s.mu.Unlock()

	elapsed := now.Sub(s.lastTick)
	s.lastTick = now
	// Servidor travado/suspenso: não dá de uma vez o tempo que ninguém viu.
	if elapsed > 2*tickInterval || elapsed < 0 {
		elapsed = tickInterval
	}

	stillActive := make(map[string]bool, len(active))
	var grants []grant
	for _, a := range active {
		if stillActive[a.UserID] {
			continue
		}
		stillActive[a.UserID] = true

		total := s.pending[a.UserID] + elapsed
		minutes := int64(total / time.Minute)
		s.pending[a.UserID] = total - time.Duration(minutes)*time.Minute
		if minutes > 0 {
			percent := 100
			if b, ok := boosts[a.CallID]; ok {
				percent = b.percent
			}
			// Em centésimos de XP; o resto (< 100) fica para o próximo minuto.
			centi := minutes*XPPerMinute*int64(percent) + s.remainder[a.UserID]
			s.remainder[a.UserID] = centi % 100
			grants = append(grants, grant{activity: a, minutes: minutes, xp: centi / 100})
		}
	}
	for userID := range s.pending {
		if !stillActive[userID] {
			delete(s.pending, userID)
		}
	}
	for userID := range s.remainder {
		if !stillActive[userID] {
			delete(s.remainder, userID)
		}
	}
	return grants
}

func (s *Service) give(ctx context.Context, g grant) {
	userID := g.activity.UserID
	xp := g.xp
	if xp == 0 {
		return
	}
	totalXP, totalSeconds, err := s.store.AddVoiceXP(ctx, userID, xp, g.minutes*60)
	if err != nil {
		log.Printf("[level] add xp for %s: %v", userID, err)
		return
	}

	progress := newProgress(userID, totalXP, totalSeconds)
	s.publisher.SendToUser(userID, wsevent.Marshal("level:update", progress))

	previous, _, _ := FromXP(totalXP - xp)
	if progress.Level == previous {
		return
	}
	event := wsevent.Marshal("level:up", LevelUpEvent{
		UserID:        userID,
		Level:         progress.Level,
		PreviousLevel: previous,
		CallID:        g.activity.CallID,
		ServerID:      g.activity.ServerID,
	})
	s.publisher.BroadcastToCall(g.activity.CallID, event)
	if g.activity.ServerID != nil {
		s.publisher.BroadcastToRoom("server:"+*g.activity.ServerID, event)
	}
	s.publisher.SendToUser(userID, event)
}

// publishBoosts avisa cada call com buff (a cada tick) e, uma única vez, as que
// perderam o buff ou sumiram. Calls que nunca tiveram buff não recebem nada.
func (s *Service) publishBoosts(boosts map[string]callBoost) {
	s.mu.Lock()
	var events []BoostEvent
	for callID, b := range boosts {
		_, wasBoosted := s.lastBoost[callID]
		switch {
		case b.percent > 100:
			s.lastBoost[callID] = b.percent
			events = append(events, BoostEvent{CallID: callID, Percent: b.percent, Eligible: b.eligible})
		case wasBoosted:
			delete(s.lastBoost, callID)
			events = append(events, BoostEvent{CallID: callID, Percent: 100, Eligible: b.eligible})
		}
	}
	for callID := range s.lastBoost {
		if _, stillThere := boosts[callID]; !stillThere {
			delete(s.lastBoost, callID)
			events = append(events, BoostEvent{CallID: callID, Percent: 100})
		}
	}
	s.mu.Unlock()

	for _, e := range events {
		s.publisher.BroadcastToCall(e.CallID, wsevent.Marshal("voice:boost", e))
	}
}

func (s *Service) FindByUserIDs(ctx context.Context, userIDs []string) (map[string]Progress, error) {
	return s.repository.FindByUserIDs(ctx, userIDs)
}
