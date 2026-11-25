package alert

import (
	"context"
	"errors"
	"fmt"
	"time"

	"gin-quickstart/backend/internal/apperrors"
)

// Resumo diário (#resumo-diario): o dia anterior em números, uma mensagem por
// dia, a partir das 8h de Brasília (a primeira avaliação depois disso; com o
// backend fora às 8h, sai quando ele voltar, no mesmo dia). A marca no banco
// (alert_daily_summaries) é gravada antes de postar: reiniciar não repete; se
// o post falha, a marca sai e a próxima avaliação tenta de novo. Silenciar:
// ALERTS_MUTED=daily_summary.
const (
	summaryRuleID   = "daily_summary"
	summaryHour     = 8
	summaryEvery    = time.Minute
	summaryTopErrs  = 3
	summaryDayHours = 24 * time.Hour
)

type summaryStore interface {
	DayStats(ctx context.Context, from, to time.Time) (DayStats, error)
	ClaimDailySummary(ctx context.Context, day, at time.Time) (bool, error)
	ReleaseDailySummary(ctx context.Context, day time.Time) error
}

type impactReader interface {
	AffectedByGroup(ctx context.Context, from, to time.Time) ([]apperrors.GroupImpact, error)
}

// DailySummary: a tarefa do resumo.
type DailySummary struct {
	store    summaryStore
	errors   impactReader
	announce func(ctx context.Context, ruleID string, ch ChannelKind, text string) error
	titles   map[string]string
	texts    texts
	now      func() time.Time

	// done: o último dia já resolvido neste processo (evita ir ao banco a cada minuto).
	done time.Time
}

func NewDailySummary(store summaryStore, errs impactReader, announce func(ctx context.Context, ruleID string, ch ChannelKind, text string) error, titles map[string]string, appURL string) *DailySummary {
	return &DailySummary{store: store, errors: errs, announce: announce, titles: titles, texts: texts{appURL: appURL}, now: time.Now}
}

func (d *DailySummary) Run(ctx context.Context) {
	every(ctx, summaryEvery, "resumo diário", d.Tick)
}

// Tick: depois das 8h, manda o resumo de ontem se ainda não saiu.
func (d *DailySummary) Tick(ctx context.Context) error {
	now := d.now().In(zone)
	if now.Hour() < summaryHour {
		return nil
	}
	today := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, zone)
	day := today.AddDate(0, 0, -1)
	if d.done.Equal(day) {
		return nil
	}
	claimed, err := d.store.ClaimDailySummary(ctx, day, now)
	if err != nil {
		return err
	}
	if claimed {
		if err := d.send(ctx, day); err != nil {
			return errors.Join(err, d.store.ReleaseDailySummary(ctx, day))
		}
	}
	d.done = day
	return nil
}

func (d *DailySummary) send(ctx context.Context, day time.Time) error {
	end := day.Add(summaryDayHours)
	stats, err := d.store.DayStats(ctx, day, end)
	if err != nil {
		return err
	}
	top, err := d.errors.AffectedByGroup(ctx, day, end)
	if err != nil {
		return fmt.Errorf("erros do dia: %w", err)
	}
	text := summaryText(day, stats, top[:min(summaryTopErrs, len(top))], d.titles, d.texts.link(Rule{Tab: "alertas"}))
	return d.announce(ctx, summaryRuleID, ChannelDaily, text)
}
