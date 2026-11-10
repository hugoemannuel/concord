package call

import "context"

// Tela compartilhada: quem está transmitindo na chamada. Extraído do service.go.

// SetScreenShare marca/desmarca um participante como compartilhando tela,
// publica call:screen para os demais participantes da chamada e call:live
// para o servidor (selo LIVE na lista do canal de voz).
func (s *Service) SetScreenShare(ctx context.Context, callID string, userID string, active bool) error {
	s.mu.Lock()
	ac, ok := s.calls[callID]
	if !ok || ac.info.Status == StatusEnded {
		s.mu.Unlock()
		return ErrNotFound
	}
	if _, ok := ac.participants[userID]; !ok {
		s.mu.Unlock()
		return ErrNotAllowed
	}

	sharers, ok := s.screenSharers[callID]
	if !ok {
		sharers = make(map[string]struct{})
		s.screenSharers[callID] = sharers
	}
	// O app reenvia o estado ao reconectar: sem mudança, ninguém é avisado
	// (o selo LIVE não pisca).
	if _, sharing := sharers[userID]; sharing == active {
		s.mu.Unlock()
		return nil
	}
	clearedWatchers := false
	if active {
		sharers[userID] = struct{}{}
	} else {
		delete(sharers, userID)
		delete(ac.screenPreviews, userID)
		clearedWatchers = clearSharerWatchersLocked(ac, userID)
	}

	targets := make([]string, 0, len(ac.participants))
	for pid := range ac.participants {
		if pid != userID {
			targets = append(targets, pid)
		}
	}
	var serverID string
	if ac.info.ServerID != nil {
		serverID = *ac.info.ServerID
	}
	channelID := ac.info.ChannelID
	s.mu.Unlock()

	if clearedWatchers {
		s.publisher.BroadcastToCall(callID, marshalEvent("call:screen_watchers", ScreenWatchersEvent{
			CallID:   callID,
			SharerID: userID,
			Watchers: []UserInfo{},
		}))
	}

	s.saveScreenSharing(callID, userID, active)
	s.publishLive(serverID, LiveEvent{CallID: callID, ChannelID: channelID, UserID: userID, Active: active})

	userInfo, err := s.lookupUser(ctx, userID)
	if err != nil {
		return err
	}

	for _, pid := range targets {
		s.publisher.SendToUser(pid, marshalEvent("call:screen", ScreenEvent{
			CallID: callID,
			User:   userInfo,
			Active: active,
		}))
	}
	return nil
}
