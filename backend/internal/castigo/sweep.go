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
		if p := c.pruned(now); c.changedBy(p) {
			s.expire(ctx, p, now)
		}
	}
	s.expireVotes(now)
}

// expire grava o que sobrou do castigo (ou o apaga) e avisa.
func (s *Service) expire(ctx context.Context, c Castigo, now time.Time) {
	if c.active(now) {
		if err := s.store.Save(ctx, c); err != nil {
			log.Printf("[castigo] gravar %s em %s: %v", c.UserID, c.ServerID, err)
		}
		s.active.put(c)
	} else {
		if err := s.store.Delete(ctx, c.ServerID, c.UserID); err != nil {
			log.Printf("[castigo] apagar %s em %s: %v", c.UserID, c.ServerID, err)
		}
		s.active.remove(c.ServerID, c.UserID)
	}
	s.changed(ctx, c)
}
