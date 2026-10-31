package event

import (
	"context"
	"log"
)

// liveEvent: o evento, se quem pede é membro e ele ainda não terminou.
func (s *Service) liveEvent(ctx context.Context, serverID, eventID, userID string) (*Event, error) {
	if err := s.requireMember(ctx, serverID, userID); err != nil {
		return nil, err
	}
	e, err := s.store.Find(ctx, serverID, eventID)
	if err != nil {
		return nil, err
	}
	if e.CanceledAt != nil {
		return nil, ErrEventNotFound
	}
	if e.FinishedAt != nil {
		return nil, ErrEventEnded
	}
	return e, nil
}

// SetRSVP registra "vou" ou "não vou" para a ocorrência atual.
func (s *Service) SetRSVP(ctx context.Context, serverID, eventID, userID string, going bool) error {
	e, err := s.liveEvent(ctx, serverID, eventID, userID)
	if err != nil {
		return err
	}
	if err := s.store.SetRSVP(ctx, e.ID, userID, e.NextStartAt, going); err != nil {
		return err
	}
	s.allowInRoom(ctx, e, userID, going)
	s.publishGoingCount(ctx, e)
	return nil
}

// ClearRSVP tira a resposta da ocorrência atual (sem resposta = sem aviso).
func (s *Service) ClearRSVP(ctx context.Context, serverID, eventID, userID string) error {
	e, err := s.liveEvent(ctx, serverID, eventID, userID)
	if err != nil {
		return err
	}
	if err := s.store.ClearRSVP(ctx, e.ID, userID, e.NextStartAt); err != nil {
		return err
	}
	s.allowInRoom(ctx, e, userID, false)
	s.publishGoingCount(ctx, e)
	return nil
}

// publishGoingCount avisa o servidor inteiro de quantos vão agora, para a
// contagem dos cartões mudar sem recarregar. Falhar aqui não desfaz a resposta.
func (s *Service) publishGoingCount(ctx context.Context, e *Event) {
	going, err := s.store.ListGoing(ctx, e.ID, e.NextStartAt)
	if err != nil {
		log.Printf("[eventos] contar quem vai no evento %s: %v", e.ID, err)
		return
	}
	s.broadcast(e.ServerID, "event:rsvp", map[string]any{
		"server_id":   e.ServerID,
		"event_id":    e.ID,
		"going_count": len(going),
	})
}

// ListGoing: quem vai na ocorrência atual.
func (s *Service) ListGoing(ctx context.Context, serverID, eventID, userID string) ([]Going, error) {
	e, err := s.liveEvent(ctx, serverID, eventID, userID)
	if err != nil {
		return nil, err
	}
	return s.store.ListGoing(ctx, e.ID, e.NextStartAt)
}

// allowInRoom libera (Vou) ou tira (Não vou, sem resposta) o acesso da pessoa à
// sala do evento, se ela já estiver aberta.
func (s *Service) allowInRoom(ctx context.Context, e *Event, userID string, allowed bool) {
	if s.rooms != nil {
		s.rooms.Allow(ctx, e, userID, allowed)
	}
}
