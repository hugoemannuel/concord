package call

import (
	"context"
	"log"
)

// Queda do WebSocket x sala de mídia: o WS de chat é um sinal fraco de que a
// pessoa saiu. Uma troca de rede (Wi-Fi, IP novo) deixa o WS meio aberto sem
// o app perceber, enquanto o LiveKit reconecta sozinho e a pessoa segue
// falando. Quem decide é a sala de mídia (ADR 0018): a saída por queda do WS
// (e a da subida do servidor, que usa o mesmo caminho) não tira quem está nela.
// Quando a pessoa sair de verdade da mídia, a varredura (Sweep) tira da call.

type leaveFunc func(ctx context.Context, callID, userID string) error

// KeepWhoIsInMedia liga a guarda: a saída depois da queda do WS só acontece
// se a pessoa não estiver na sala de mídia da chamada. LiveKit sem resposta:
// sai como antes (sem saber, não segura ninguém na lista).
func (m *MediaPresence) KeepWhoIsInMedia() {
	m.calls.leaveAfterDisconnect = m.unlessInMedia(m.calls.leaveAfterDisconnect)
}

func (m *MediaPresence) unlessInMedia(leave leaveFunc) leaveFunc {
	return func(ctx context.Context, callID, userID string) error {
		if present, ok := m.identities(ctx, callID); ok && present[userID] {
			log.Printf("[call] %s sem WS, mas na mídia da chamada %s: segue na chamada", userID, callID)
			return nil
		}
		return leave(ctx, callID, userID)
	}
}
