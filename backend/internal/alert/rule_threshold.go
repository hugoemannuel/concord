package alert

import (
	"context"
	"fmt"
	"time"
)

// Peças comuns das regras que olham o livekit_metrics (uma linha por minuto).

// freshFor: minuto mais velho que isso não vale (o coletor parou: sem dado).
const freshFor = 3 * time.Minute

// minuteSource: as linhas recentes do livekit_metrics (Repository.RecentMinutes).
type minuteSource interface {
	RecentMinutes(ctx context.Context, since time.Time) ([]Minute, error)
}

// limits: aviso a partir de warn, crítico a partir de crit (crit 0 = sem crítico).
type limits struct {
	warn, crit float64
}

// latest: o minuto mais novo, se for recente.
func latest(ctx context.Context, src minuteSource, now time.Time) (*Minute, error) {
	rows, err := src.RecentMinutes(ctx, now.Add(-freshFor))
	if err != nil || len(rows) == 0 {
		return nil, err
	}
	return &rows[0], nil
}

// thresholdCheck: compara o número do minuto mais novo com os limites.
// format recebe o número e o limite ultrapassado ("CPU da máquina em %.0f%% (limite %.0f%%)").
func thresholdCheck(src minuteSource, pick func(Minute) *float64, lim limits, format string) func(context.Context, time.Time) (Reading, error) {
	return func(ctx context.Context, now time.Time) (Reading, error) {
		m, err := latest(ctx, src, now)
		if err != nil || m == nil || pick(*m) == nil {
			return Reading{Level: LevelUnknown}, err
		}
		return levelFor(*pick(*m), lim, format), nil
	}
}

func levelFor(v float64, lim limits, format string) Reading {
	switch {
	case lim.crit > 0 && v >= lim.crit:
		return Reading{Level: LevelCritical, Text: fmt.Sprintf(format, v, lim.crit)}
	case v >= lim.warn:
		return Reading{Level: LevelWarning, Text: fmt.Sprintf(format, v, lim.warn)}
	}
	return Reading{Level: LevelOK}
}
