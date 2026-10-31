package server

import "context"

// Ganchos do Service (registrados só no boot). Extraído do service.go sem
// mudar o comportamento.

// OnMusicBotDisabled registra um hook para a remoção do Maestro (só no boot).
func (s *Service) OnMusicBotDisabled(fn func(serverID string)) {
	s.onMusicBotDisabled = append(s.onMusicBotDisabled, fn)
}

func (s *Service) notifyMusicBotDisabled(serverID string) {
	for _, fn := range s.onMusicBotDisabled {
		fn(serverID)
	}
}

// OnMemberJoined registra um hook para quando um usuário novo entra no servidor.
func (s *Service) OnMemberJoined(fn func(ctx context.Context, serverID string, member ServerMember)) {
	s.onMemberJoined = append(s.onMemberJoined, fn)
}

func (s *Service) notifyMemberJoined(ctx context.Context, serverID string, member ServerMember) {
	for _, fn := range s.onMemberJoined {
		fn(ctx, serverID, member)
	}
}
