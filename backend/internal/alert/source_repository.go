package alert

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
)

// O que as regras leem das tabelas da observabilidade (só leitura, sempre as
// últimas linhas pelos índices: livekit_metrics pela chave minute,
// live_events por at).

// Minute: o que as regras usam de uma linha de livekit_metrics.
type Minute struct {
	Minute time.Time
	// Up: o LiveKit respondeu.
	Up bool
	// HostCPU e HostMem: % da máquina inteira; LiveKitCPU: % de uma vCPU.
	HostCPU, HostMem, LiveKitCPU *float64
}

// RecentMinutes: os minutos desde since, do mais novo ao mais antigo.
func (r *Repository) RecentMinutes(ctx context.Context, since time.Time) ([]Minute, error) {
	rows, err := r.db.Query(ctx, `SELECT minute, up, host_cpu_pct, host_mem_pct, livekit_cpu_pct
		FROM livekit_metrics WHERE minute >= $1 ORDER BY minute DESC`, since)
	if err != nil {
		return nil, fmt.Errorf("ler livekit_metrics: %w", err)
	}
	return pgx.CollectRows(rows, func(row pgx.CollectableRow) (Minute, error) {
		var m Minute
		return m, row.Scan(&m.Minute, &m.Up, &m.HostCPU, &m.HostMem, &m.LiveKitCPU)
	})
}

// LastMinute: o minuto mais novo de livekit_metrics (nil = tabela vazia).
func (r *Repository) LastMinute(ctx context.Context) (*time.Time, error) {
	var at time.Time
	err := r.db.QueryRow(ctx, `SELECT minute FROM livekit_metrics ORDER BY minute DESC LIMIT 1`).Scan(&at)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("ler último minuto: %w", err)
	}
	return &at, nil
}

// PeopleWithEvent: quantas pessoas diferentes tiveram o evento (com o detalhe
// começando por detailPrefix; "" = qualquer) desde since.
func (r *Repository) PeopleWithEvent(ctx context.Context, eventType, detailPrefix string, since time.Time) (int, error) {
	var n int
	err := r.db.QueryRow(ctx, `SELECT count(DISTINCT s.user_id) FROM live_events e
		JOIN live_sessions s ON s.id = e.session_id
		WHERE e.at >= $1 AND e.type = $2 AND starts_with(e.detail, $3)`, since, eventType, detailPrefix).Scan(&n)
	if err != nil {
		return 0, fmt.Errorf("contar %s: %w", eventType, err)
	}
	return n, nil
}
