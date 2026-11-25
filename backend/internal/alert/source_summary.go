package alert

import (
	"context"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
)

// As contas do resumo diário: um dia (de from a to) das tabelas da
// observabilidade, sempre por faixa de índice (minute, started_at, at). Só
// contagens: nenhum nome de pessoa.

// DayStats: o dia em números (nil = sem dado).
type DayStats struct {
	CallPeople                  int
	CallHours                   float64
	Lives, LivesBelow           int
	PeakMbps                    *float64
	ConnectFailed, FailedPeople int
	Reconnects, ReconnectPeople int
	Requests, Errors5xx, Panics int
	P95Typical, P95Worst        *float64
	CPUMax, CPUP95, MemMax      *float64
	DiskPct                     *float64
	// BackupAt e BackupBytes: o backup mais novo que a coleta viu até o fim do dia.
	BackupAt    *time.Time
	BackupBytes *int64
	Alerts      []RuleCount
	OpenAlerts  int
}

// RuleCount: quantas vezes uma regra disparou no dia.
type RuleCount struct {
	RuleID string
	Count  int
}

// DayStats lê o dia [from, to).
func (r *Repository) DayStats(ctx context.Context, from, to time.Time) (DayStats, error) {
	var s DayStats
	steps := []func(context.Context, *DayStats, time.Time, time.Time) error{
		r.dayCalls, r.dayLives, r.dayEvents, r.dayAPI, r.dayHost, r.dayAlerts,
	}
	for _, step := range steps {
		if err := step(ctx, &s, from, to); err != nil {
			return DayStats{}, fmt.Errorf("resumo do dia: %w", err)
		}
	}
	return s, nil
}

// dayCalls: pessoas diferentes em call e as horas de voz dentro do dia.
func (r *Repository) dayCalls(ctx context.Context, s *DayStats, from, to time.Time) error {
	return r.db.QueryRow(ctx, `SELECT count(DISTINCT user_id),
		COALESCE(sum(extract(epoch FROM least(COALESCE(ended_at, last_seen_at), $2) - greatest(started_at, $1))), 0) / 3600
		FROM live_sessions WHERE kind = 'call' AND started_at < $2 AND COALESCE(ended_at, last_seen_at) > $1`, from, to).
		Scan(&s.CallPeople, &s.CallHours)
}

// dayLives: lives começadas no dia, as que passaram metade do tempo abaixo do
// alvo (a mesma conta do painel: fps < 80% do escolhido ou degrau abaixo) e o
// pico de saída do LiveKit.
func (r *Repository) dayLives(ctx context.Context, s *DayStats, from, to time.Time) error {
	err := r.db.QueryRow(ctx, `SELECT count(*), count(*) FILTER (WHERE below >= 0.5) FROM (
		SELECT s.id, avg(CASE WHEN x.target_fps > 0 THEN
			CASE WHEN x.fps < 0.8 * x.target_fps OR x.step > 0 THEN 1.0 ELSE 0.0 END END) AS below
		FROM live_sessions s LEFT JOIN live_samples x ON x.session_id = s.id
		WHERE s.kind = 'transmite' AND s.started_at >= $1 AND s.started_at < $2 GROUP BY s.id) l`, from, to).
		Scan(&s.Lives, &s.LivesBelow)
	if err != nil {
		return err
	}
	return r.db.QueryRow(ctx, `SELECT max(bytes_out * 8 / 1e6 / seconds) FROM livekit_metrics
		WHERE minute >= $1 AND minute < $2 AND up AND seconds > 0`, from, to).Scan(&s.PeakMbps)
}

// dayEvents: falhas de conexão da voz e reconexões (vezes e pessoas).
func (r *Repository) dayEvents(ctx context.Context, s *DayStats, from, to time.Time) error {
	return r.db.QueryRow(ctx, `SELECT
		count(*) FILTER (WHERE e.type = 'conexao_falhou'), count(DISTINCT s.user_id) FILTER (WHERE e.type = 'conexao_falhou'),
		count(*) FILTER (WHERE e.type = 'reconectou'), count(DISTINCT s.user_id) FILTER (WHERE e.type = 'reconectou')
		FROM live_events e JOIN live_sessions s ON s.id = e.session_id
		WHERE e.at >= $1 AND e.at < $2 AND e.type IN ('conexao_falhou', 'reconectou')`, from, to).
		Scan(&s.ConnectFailed, &s.FailedPeople, &s.Reconnects, &s.ReconnectPeople)
}

// dayAPI: pedidos, 5xx, panics e o p95 (o típico é a mediana dos minutos com
// 20 pedidos ou mais; o pior, o maior deles).
func (r *Repository) dayAPI(ctx context.Context, s *DayStats, from, to time.Time) error {
	return r.db.QueryRow(ctx, `SELECT COALESCE(sum(requests), 0), COALESCE(sum(status_5xx), 0), COALESCE(sum(panics), 0),
		percentile_cont(0.5) WITHIN GROUP (ORDER BY p95_ms) FILTER (WHERE requests >= 20),
		max(p95_ms) FILTER (WHERE requests >= 20)
		FROM api_metrics WHERE minute >= $1 AND minute < $2`, from, to).
		Scan(&s.Requests, &s.Errors5xx, &s.Panics, &s.P95Typical, &s.P95Worst)
}

// dayHost: CPU (pico e p95) e memória (pico) da máquina, e o disco e o backup
// da última linha do dia.
func (r *Repository) dayHost(ctx context.Context, s *DayStats, from, to time.Time) error {
	return r.db.QueryRow(ctx, `SELECT max(cpu_pct), percentile_cont(0.95) WITHIN GROUP (ORDER BY cpu_pct), max(mem_used_pct),
		(array_agg(disk_used_pct ORDER BY minute DESC) FILTER (WHERE disk_used_pct IS NOT NULL))[1],
		(array_agg(backup_at ORDER BY minute DESC) FILTER (WHERE backup_at IS NOT NULL))[1],
		(array_agg(backup_bytes ORDER BY minute DESC) FILTER (WHERE backup_bytes IS NOT NULL))[1]
		FROM host_metrics WHERE minute >= $1 AND minute < $2`, from, to).
		Scan(&s.CPUMax, &s.CPUP95, &s.MemMax, &s.DiskPct, &s.BackupAt, &s.BackupBytes)
}

// dayAlerts: os disparos que começaram no dia, por regra, e quantos estão abertos.
func (r *Repository) dayAlerts(ctx context.Context, s *DayStats, from, to time.Time) error {
	rows, err := r.db.Query(ctx, `SELECT rule_id, count(*)::int FROM alert_incidents
		WHERE started_at >= $1 AND started_at < $2 GROUP BY 1 ORDER BY 2 DESC, 1`, from, to)
	if err != nil {
		return err
	}
	s.Alerts, err = pgx.CollectRows(rows, func(row pgx.CollectableRow) (RuleCount, error) {
		var c RuleCount
		return c, row.Scan(&c.RuleID, &c.Count)
	})
	if err != nil {
		return err
	}
	return r.db.QueryRow(ctx, `SELECT count(*) FROM alert_incidents WHERE ended_at IS NULL`).Scan(&s.OpenAlerts)
}

// ClaimDailySummary marca o resumo do dia como enviado; false = já estava.
func (r *Repository) ClaimDailySummary(ctx context.Context, day time.Time, at time.Time) (bool, error) {
	tag, err := r.db.Exec(ctx, `INSERT INTO alert_daily_summaries (day, sent_at) VALUES ($1::date, $2) ON CONFLICT (day) DO NOTHING`,
		day.Format(time.DateOnly), at)
	if err != nil {
		return false, fmt.Errorf("marcar resumo: %w", err)
	}
	return tag.RowsAffected() == 1, nil
}

// ReleaseDailySummary desfaz a marca (o post falhou: tenta de novo).
func (r *Repository) ReleaseDailySummary(ctx context.Context, day time.Time) error {
	if _, err := r.db.Exec(ctx, `DELETE FROM alert_daily_summaries WHERE day = $1::date`, day.Format(time.DateOnly)); err != nil {
		return fmt.Errorf("desmarcar resumo: %w", err)
	}
	return nil
}

// LastDailySummary: quando saiu o último resumo (nil = nenhum).
func (r *Repository) LastDailySummary(ctx context.Context) (*time.Time, error) {
	var at *time.Time
	if err := r.db.QueryRow(ctx, `SELECT max(sent_at) FROM alert_daily_summaries`).Scan(&at); err != nil {
		return nil, fmt.Errorf("último resumo: %w", err)
	}
	return at, nil
}
