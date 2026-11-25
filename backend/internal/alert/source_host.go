package alert

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
)

// Leituras das regras que não estão no serverobs: o backup anterior e o pico
// de saída da semana. Sempre por faixa da chave primária minute.

// backupLookback: até quanto antes do backup novo procurar o anterior (dois
// dias e pouco: o anterior é de ~24 h antes).
const backupLookback = 3 * 24 * time.Hour

// PreviousBackup: o backup que a coleta via antes do de before.
func (r *Repository) PreviousBackup(ctx context.Context, before time.Time) (*Backup, error) {
	var b Backup
	err := r.db.QueryRow(ctx, `SELECT backup_at, backup_bytes FROM host_metrics
		WHERE minute >= $2 AND backup_at < $1 AND backup_bytes IS NOT NULL
		ORDER BY minute DESC LIMIT 1`, before, before.Add(-backupLookback)).Scan(&b.At, &b.Bytes)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("ler backup anterior: %w", err)
	}
	return &b, nil
}

// Peak: o minuto de maior saída do LiveKit.
type Peak struct {
	Minute time.Time
	Mbps   float64
}

// PeakEgress: o minuto de maior saída do LiveKit desde since (nil = sem linhas).
func (r *Repository) PeakEgress(ctx context.Context, since time.Time) (*Peak, error) {
	var p Peak
	err := r.db.QueryRow(ctx, `SELECT minute, bytes_out * 8 / 1e6 / seconds FROM livekit_metrics
		WHERE minute >= $1 AND up AND seconds > 0 ORDER BY 2 DESC LIMIT 1`, since).Scan(&p.Minute, &p.Mbps)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("ler pico de saída: %w", err)
	}
	return &p, nil
}
