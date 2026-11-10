package call

import "context"

// Troca de chamada estilo Discord: uma pessoa tem uma conexão de voz só, então
// ligar ou atender uma DM estando em outra call tira ela da call antiga antes.

// leaveForSwitch tira userID da chamada fromCallID para ele entrar em outra.
// Sai da sala WS antes (como no move.go): o call:left/call:ended da call
// antiga não chega ao próprio cliente, que já trocou de chamada sozinho.
func (s *Service) leaveForSwitch(ctx context.Context, userID, fromCallID string) error {
	s.leaveCallRoom(userID, fromCallID)
	return s.leaveCall(ctx, fromCallID, userID)
}

// ringingForLocked (com s.mu travado): userID é o chamado de uma DM que ainda
// toca em outra conversa (ligar de novo na mesma conversa não conta).
func (s *Service) ringingForLocked(userID, conversationID string) bool {
	for _, ac := range s.calls {
		if ac.info.Status == StatusRinging && ac.inviteeID == userID && !isDMOf(ac, conversationID) {
			return true
		}
	}
	return false
}

// switchCallerForDM prepara quem liga: o chamado já tocando para outra DM é
// ErrBusy (duas chamadas tocando ao mesmo tempo, não); quem liga em outra call
// (que não é a DM desta conversa) sai dela.
func (s *Service) switchCallerForDM(ctx context.Context, initiatorID, calleeID, conversationID string) error {
	s.mu.RLock()
	if s.ringingForLocked(calleeID, conversationID) {
		s.mu.RUnlock()
		return ErrBusy
	}
	fromCallID := s.otherCallLocked(initiatorID, conversationID)
	s.mu.RUnlock()
	if fromCallID == "" {
		return nil
	}
	return s.leaveForSwitch(ctx, initiatorID, fromCallID)
}

// otherCallLocked: a call em que userID está, se não for a DM da conversa (vazio se livre).
func (s *Service) otherCallLocked(userID, conversationID string) string {
	callID, ok := s.busy[userID]
	if !ok {
		return ""
	}
	if ac := s.calls[callID]; ac != nil && isDMOf(ac, conversationID) {
		return ""
	}
	return callID
}

// isDMOf: a chamada é a DM da conversa.
func isDMOf(ac *activeCall, conversationID string) bool {
	return ac.info.ConversationID != nil && *ac.info.ConversationID == conversationID
}
