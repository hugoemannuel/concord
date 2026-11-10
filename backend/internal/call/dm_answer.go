package call

import (
	"context"
	"log"
	"time"
)

// Atender e recusar a chamada de DM que está tocando. Extraído do service.go.

// Accept: o chamado atende. Em outra call, sai dela antes (estilo Discord: uma
// conexão de voz só), mas só depois de conferir que a chamada nova ainda vale.
func (s *Service) Accept(ctx context.Context, callID string, userID string) error {
	s.mu.RLock()
	_, fromCallID, done, err := s.acceptCheckLocked(callID, userID)
	s.mu.RUnlock()
	if err != nil || done {
		return err
	}
	if fromCallID != "" {
		if err := s.leaveForSwitch(ctx, userID, fromCallID); err != nil {
			return err
		}
	}
	return s.joinAccepted(ctx, callID, userID)
}

// acceptCheckLocked (com s.mu travado) confere se userID pode atender: a
// chamada existe e não terminou, ele é o convidado da DM. done = já está nela;
// fromCallID = a outra call em que ele está (vazio se livre).
func (s *Service) acceptCheckLocked(callID, userID string) (ac *activeCall, fromCallID string, done bool, err error) {
	ac, ok := s.calls[callID]
	if !ok || ac.info.Status == StatusEnded {
		return nil, "", false, ErrNotFound
	}
	if ac.info.Type == TypeDM && ac.inviteeID != userID {
		return nil, "", false, ErrNotAllowed
	}
	if _, ok := ac.participants[userID]; ok {
		return ac, "", true, nil
	}
	if otherID, ok := s.busy[userID]; ok && otherID != callID {
		return ac, otherID, false, nil
	}
	return ac, "", false, nil
}

// joinAccepted põe quem atendeu na chamada. Revalida: a chamada pode ter
// terminado durante a troca, e ainda preso a outra call (estado velho) é
// ErrBusy, sem tentar sair de novo.
func (s *Service) joinAccepted(ctx context.Context, callID string, userID string) error {
	s.mu.Lock()
	ac, fromCallID, done, err := s.acceptCheckLocked(callID, userID)
	if err == nil && fromCallID != "" {
		err = ErrBusy
	}
	if err != nil || done {
		s.mu.Unlock()
		return err
	}

	userInfo, err := s.lookupUser(ctx, userID)
	if err != nil {
		s.mu.Unlock()
		return err
	}

	now := time.Now()
	ac.participants[userID] = &participantState{
		userID:   userID,
		role:     RoleMember,
		joinedAt: now,
	}
	wasRinging := ac.info.Status != StatusActive
	ac.info.Status = StatusActive
	s.busy[userID] = callID
	callIDCopy := ac.info.ID
	s.mu.Unlock()

	// Primeiro quem entrou, depois o status: se o backend cair entre os dois,
	// a DM fica "ringing" com os dois dentro e a subida a cura (restore). Na
	// ordem inversa ficaria "active" só com quem ligou.
	if err := s.addParticipant(ctx, &CallParticipant{
		CallID: callID,
		UserID: userID,
		Role:   RoleMember,
	}); err != nil {
		log.Printf("[call] persist participant %s failed: %v", userID, err)
	}

	if wasRinging {
		s.markCallActive(callID)
	}

	s.publisher.BroadcastToCall(callIDCopy, marshalEvent("call:accept", ResponseEvent{
		CallID: callIDCopy,
		User:   userInfo,
	}))

	return nil
}

func (s *Service) Decline(ctx context.Context, callID string, userID string) error {
	s.mu.Lock()
	ac, ok := s.calls[callID]
	if !ok || ac.info.Status == StatusEnded {
		s.mu.Unlock()
		return ErrNotFound
	}
	if ac.info.Type == TypeDM && ac.inviteeID != userID {
		s.mu.Unlock()
		return ErrNotAllowed
	}

	userInfo, err := s.lookupUser(ctx, userID)
	if err != nil {
		s.mu.Unlock()
		return err
	}
	initiatorID := ac.info.InitiatorID
	s.mu.Unlock()

	s.publisher.SendToUser(initiatorID, marshalEvent("call:decline", ResponseEvent{
		CallID: callID,
		User:   userInfo,
	}))

	return s.End(ctx, callID)
}
