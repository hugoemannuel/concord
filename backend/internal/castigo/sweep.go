package castigo

import (
	"context"
	"log"
	"time"
)

// SweepEvery: de quanto em quanto tempo os castigos e as votações vencidos
// são encerrados. Para entrar e para o token da mídia o prazo vale na hora;
// a varredura só devolve a quem está na call o que o castigo tirava.
const SweepEvery = 5 * time.Second

// RunSweeper encerra os vencidos até ctx acabar.
func (s *Service) RunSweeper(ctx context.Context, every time.Duration) {
	t := time.NewTicker(every)
	defer t.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-t.C:
			s.Sweep(ctx)
		}
	}
}

// Sweep tira os efeitos que venceram e fecha as votações que passaram do prazo.
func (s *Service) Sweep(ctx context.Context) {
	now := s.now()
	for _, c := range s.active.all() {
		if p, ok := s.expire(ctx, c.ServerID, c.UserID, now); ok {
			s.changed(ctx, p)
		}
	}
	s.expireVotes(now)
}

// expire relê o castigo (sob s.mu: um castigo novo no meio não se perde) e
// grava o que sobrou, ou o apaga. ok=false se nada venceu.
func (s *Service) expire(ctx context.Context, serverID, userID string, now time.Time) (Castigo, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	c, found := s.active.get(serverID, userID)
	p := c.pruned(now)
	if !found || !c.changedBy(p) {
		return Castigo{}, false
	}
	if !p.active(now) {
		if err := s.store.Delete(ctx, serverID, userID); err != nil {
			log.Printf("[castigo] apagar %s em %s: %v", userID, serverID, err)
		}
		s.active.remove(serverID, userID)
		return p, true
	}
	if err := s.store.Save(ctx, p); err != nil {
		log.Printf("[castigo] gravar %s em %s: %v", userID, serverID, err)
	}
	s.active.put(p)
	return p, true
}
