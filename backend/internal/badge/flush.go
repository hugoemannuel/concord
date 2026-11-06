package badge

import (
	"context"
	"log"
)

// flush grava os deltas; o que falhar volta para o tracker e vai no próximo.
func (s *Service) flush(ctx context.Context, deltas map[string]Delta) map[string]bool {
	written := make(map[string]bool, len(deltas))
	for userID, d := range deltas {
		if err := s.store.AddCallStats(ctx, userID, d); err != nil {
			log.Printf("[badge] add call stats for %s: %v", userID, err)
			s.mu.Lock()
			s.tracker.restore(userID, d)
			s.mu.Unlock()
			continue
		}
		written[userID] = true
	}
	return written
}
