package call

import (
	"context"
	"log"
)

// Fim da chamada: tira da memória, grava no banco e avisa. Extraído do
// service.go.

func (s *Service) End(ctx context.Context, callID string) error {
	if err := s.closeCall(callID); err != nil {
		return err
	}

	if s.repository != nil {
		if err := s.repository.EndCall(ctx, callID); err != nil {
			log.Printf("[call] persist end %s failed: %v", callID, err)
		}
	}

	s.publisher.BroadcastToCall(callID, marshalEvent("call:ended", EndedEvent{
		CallID: callID,
	}))

	return nil
}

// closeCall tira a chamada da memória. Quem ainda transmitia sai do ar no
// servidor na hora (o selo LIVE não espera o próximo polling).
func (s *Service) closeCall(callID string) error {
	s.mu.Lock()
	ac, ok := s.calls[callID]
	if !ok {
		s.mu.Unlock()
		return ErrNotFound
	}
	for pid := range ac.participants {
		delete(s.busy, pid)
	}
	sharers := s.screenSharers[callID]
	var serverID string
	if ac.info.ServerID != nil {
		serverID = *ac.info.ServerID
	}
	channelID := ac.info.ChannelID
	srvID := ac.info.ServerID
	knockers := pendingRequestersLocked(ac)
	invited := cancelInvitesLocked(ac)
	delete(s.calls, callID)
	delete(s.screenSharers, callID)
	endHooks := append([]func(string){}, s.onCallEnded...)
	delete(s.activities, callID)
	s.mu.Unlock()
	for _, fn := range endHooks {
		fn(callID)
	}

	for userID := range sharers {
		s.publishLive(serverID, LiveEvent{CallID: callID, ChannelID: channelID, UserID: userID, Active: false})
	}
	s.notifyCancelledInvites(callID, invited)
	// Sala esvaziou: quem esperava na porta já pode entrar (a próxima chamada
	// nasce destrancada).
	for _, uid := range knockers {
		s.publisher.SendToUser(uid, marshalEvent("call:knock_declined", KnockAnswerEvent{
			CallID: callID, ChannelID: channelID, ServerID: srvID, Reason: KnockEnded,
		}))
	}
	return nil
}
