package call

import (
	"context"
	"log"
)

// CloseChannelCall tira todo mundo da chamada de voz do canal (e da sala de
// mídia). Quem vai apagar o canal chama antes: apagar o canal sozinho não
// derruba a chamada. Sem chamada no canal, não faz nada.
func (s *Service) CloseChannelCall(ctx context.Context, serverID, channelID string) {
	for callID, vc := range s.voiceCallsOf(serverID) {
		if vc.channelID != channelID {
			continue
		}
		for userID := range vc.participants {
			if err := s.kick(ctx, callID, userID); err != nil {
				log.Printf("[call] close channel: remove %s from %s failed: %v", userID, callID, err)
			}
		}
	}
}
