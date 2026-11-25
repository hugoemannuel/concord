package serverobs

import (
	"context"
	"errors"
	"time"
)

// Retenção: as quatro tabelas ficam 14 dias, apagadas de hora em hora.
const (
	retentionWindow   = 14 * 24 * time.Hour
	retentionInterval = time.Hour
)

type pruner interface {
	Prune(ctx context.Context, before time.Time) error
}

type Retention struct {
	pruners []pruner
	now     func() time.Time
}

func NewRetention(pruners ...pruner) *Retention {
	return &Retention{pruners: pruners, now: time.Now}
}

// Run apaga já no boot e depois a cada hora, até ctx acabar.
func (r *Retention) Run(ctx context.Context) {
	run(ctx, "retenção", r.Prune)
	every(ctx, retentionInterval, "retenção", r.Prune)
}

// Prune roda todos (um erro não impede os outros).
func (r *Retention) Prune(ctx context.Context) error {
	before := r.now().Add(-retentionWindow)
	var errs []error
	for _, p := range r.pruners {
		errs = append(errs, p.Prune(ctx, before))
	}
	return errors.Join(errs...)
}
