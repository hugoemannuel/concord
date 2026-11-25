package deviceobs

import (
	"context"
	"log"
	"time"
)

// Retenção: as métricas do aparelho ficam 14 dias.
const (
	retentionWindow   = 14 * 24 * time.Hour
	retentionInterval = time.Hour
)

// Pruner apaga o que é anterior a before.
type Pruner interface {
	Prune(ctx context.Context, before time.Time) error
}

// Retention apaga, de hora em hora, o que passou da janela.
type Retention struct {
	pruner Pruner
	now    func() time.Time
}

func NewRetention(pruner Pruner) *Retention {
	return &Retention{pruner: pruner, now: time.Now}
}

// Run apaga já no boot e depois a cada hora, até ctx acabar; erros só vão
// para o log.
func (r *Retention) Run(ctx context.Context) {
	ticker := time.NewTicker(retentionInterval)
	defer ticker.Stop()
	for {
		r.prune(ctx)
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
		}
	}
}

func (r *Retention) prune(ctx context.Context) {
	if err := r.pruner.Prune(ctx, r.now().Add(-retentionWindow)); err != nil {
		log.Printf("[deviceobs] retenção: %v", err)
	}
}
