package audit

import (
	"context"
	"log"
	"time"
)

// Retenção: o registro guarda 90 dias (o Discord guarda 45; ver ADR 0036). A
// limpeza roda no boot e uma vez por dia.
const (
	retentionDays     = 90
	retentionInterval = 24 * time.Hour
)

// Pruner apaga o que é anterior a before.
type Pruner interface {
	Prune(ctx context.Context, before time.Time) error
}

type Retention struct {
	store Pruner
	now   func() time.Time
}

func NewRetention(store Pruner) *Retention {
	return &Retention{store: store, now: time.Now}
}

func (r *Retention) Prune(ctx context.Context) error {
	return r.store.Prune(ctx, r.now().AddDate(0, 0, -retentionDays))
}

// Run apaga já no boot e depois a cada dia, até ctx acabar.
func (r *Retention) Run(ctx context.Context) {
	ticker := time.NewTicker(retentionInterval)
	defer ticker.Stop()
	for {
		if err := r.Prune(ctx); err != nil {
			log.Printf("[auditoria] retenção: %v", err)
		}
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
		}
	}
}
