package call

import (
	"context"
	"log"
	"time"
)

// HandleDisconnect é chamado quando a última conexão WS do usuário fecha.
// Espera disconnectGrace e só então tira o usuário das chamadas, se ele não
// tiver reconectado nesse meio-tempo.
func (s *Service) HandleDisconnect(userID string) {
	time.AfterFunc(s.disconnectGrace, func() {
		if s.isOnline != nil && s.isOnline(userID) {
			return
		}
		s.cancelKnocksBy(userID)
		s.leaveAllCalls(userID)
	})
}

func (s *Service) leaveAllCalls(userID string) {
	ctx := context.Background()

	s.mu.Lock()
	callIDs := make([]string, 0)
	rejoinUntil := time.Now().Add(rejoinTTL)
	for id, ac := range s.calls {
		if _, ok := ac.participants[userID]; ok {
			callIDs = append(callIDs, id)
			// Caiu sem querer (rede, atualização do app): volta sem bater na
			// porta se a sala estiver trancada.
			admitLocked(ac, userID, rejoinUntil)
		}
	}
	s.mu.Unlock()

	for _, callID := range callIDs {
		if err := s.leaveAfterDisconnect(ctx, callID, userID); err != nil {
			log.Printf("[call] disconnect leave %s failed: %v", userID, err)
		}
	}
}
