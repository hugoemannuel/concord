package call

import (
	"context"
	"log"
	"time"
)

// Entrar e sair de uma chamada (participantes em memória, banco e avisos).
// Extraído do service.go.

// detachParticipant tira o usuário da chamada em memória (participantes,
// ocupado, transmissão). Se ele saiu transmitindo, avisa o servidor na hora
// para o selo LIVE sumir. removed = false se ele não estava na chamada.
func (s *Service) detachParticipant(callID, userID string) (remaining int, removed bool, err error) {
	s.mu.Lock()
	ac, ok := s.calls[callID]
	if !ok {
		s.mu.Unlock()
		return 0, false, ErrNotFound
	}
	if _, ok := ac.participants[userID]; !ok {
		s.mu.Unlock()
		return len(ac.participants), false, nil
	}
	delete(ac.participants, userID)
	delete(s.busy, userID)
	wasSharing := false
	if sharers, ok := s.screenSharers[callID]; ok {
		_, wasSharing = sharers[userID]
		delete(sharers, userID)
	}
	affectedSharers := dropScreenWatcherLocked(ac, userID)
	delete(ac.screenPreviews, userID)
	clearedSharer := false
	if wasSharing {
		clearedSharer = clearSharerWatchersLocked(ac, userID)
	}
	remaining = len(ac.participants)
	var serverID string
	if ac.info.ServerID != nil {
		serverID = *ac.info.ServerID
	}
	channelID := ac.info.ChannelID
	hooks := append([]func(string, string){}, s.onParticipantLeft...)
	// Quem abriu a atividade saiu: ela acaba; quem só jogava sai da lista.
	activityChange := s.dropActivityOfLocked(callID, userID)
	targets := participantIDsLocked(ac)
	s.mu.Unlock()
	for _, fn := range hooks {
		fn(callID, userID)
	}

	if activityChange != nil {
		s.sendToAll(targets, activityChange)
	}
	if wasSharing {
		s.publishLive(serverID, LiveEvent{CallID: callID, ChannelID: channelID, UserID: userID, Active: false})
	}
	for sharerID, watcherIDs := range affectedSharers {
		watchers := s.resolveWatchersInfo(context.Background(), watcherIDs)
		s.publisher.BroadcastToCall(callID, marshalEvent("call:screen_watchers", ScreenWatchersEvent{
			CallID:   callID,
			SharerID: sharerID,
			Watchers: watchers,
		}))
	}
	if clearedSharer {
		s.publisher.BroadcastToCall(callID, marshalEvent("call:screen_watchers", ScreenWatchersEvent{
			CallID:   callID,
			SharerID: userID,
			Watchers: []UserInfo{},
		}))
	}
	return remaining, true, nil
}

func (s *Service) joinLocked(ctx context.Context, ac *activeCall, userID string, role string) (*Call, error) {
	if ac.info.Status == StatusEnded {
		return nil, ErrNotFound
	}
	if _, ok := ac.participants[userID]; ok {
		return ac.info, nil
	}
	if otherID, ok := s.busy[userID]; ok && otherID != ac.info.ID {
		return nil, ErrBusy
	}

	userInfo, err := s.lookupUser(ctx, userID)
	if err != nil {
		return nil, err
	}

	now := time.Now()
	ac.participants[userID] = &participantState{
		userID:   userID,
		role:     role,
		joinedAt: now,
	}
	if ac.info.Status != StatusActive {
		ac.info.Status = StatusActive
		s.markCallActive(ac.info.ID)
	}
	s.busy[userID] = ac.info.ID
	s.consumeInviteLocked(ac, userID)

	if err := s.addParticipant(ctx, &CallParticipant{
		CallID: ac.info.ID,
		UserID: userID,
		Role:   role,
	}); err != nil {
		log.Printf("[call] persist participant %s failed: %v", userID, err)
	}

	s.publisher.BroadcastToCall(ac.info.ID, marshalEvent("call:joined", StateEvent{
		CallID: ac.info.ID,
		User:   userInfo,
	}))

	return ac.info, nil
}
