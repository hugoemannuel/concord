package badge

import (
	"context"
	"log"
)

// flush grava os deltas de todos numa escrita só e devolve quem foi gravado.
// Se a escrita falhar, tudo volta para o tracker e vai no próximo.
func (s *Service) flush(ctx context.Context, deltas map[string]Delta) map[string]bool {
	written := make(map[string]bool, len(deltas))
	if len(deltas) == 0 {
		return written
	}
	if err := s.store.AddCallStats(ctx, deltas); err != nil {
		log.Printf("[badge] add call stats (%d pessoas): %v", len(deltas), err)
		s.mu.Lock()
		for userID, d := range deltas {
			s.tracker.restore(userID, d)
		}
		s.mu.Unlock()
		return written
	}
	for userID := range deltas {
		written[userID] = true
	}
	return written
}
