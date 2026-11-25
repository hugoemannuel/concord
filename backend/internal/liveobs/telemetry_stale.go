package liveobs

import (
	"context"
	"fmt"
	"time"
)

// CloseStale fecha as sessões abertas sem notícia desde before (app fechado,
// travado, sem rede): o fim fica no último sinal, com o evento `fim` na mesma
// hora. A retenção chama de hora em hora (ADR 0032, emenda de 2026-11-25).
func (r *TelemetryRepository) CloseStale(ctx context.Context, before time.Time) error {
	_, err := r.db.Exec(ctx, `WITH closed AS (
			UPDATE live_sessions SET ended_at = last_seen_at
			WHERE ended_at IS NULL AND last_seen_at < $1
			RETURNING id, last_seen_at
		)
		INSERT INTO live_events (session_id, type, at) SELECT id, 'fim', last_seen_at FROM closed`, before)
	if err != nil {
		return fmt.Errorf("fechar live_sessions sem notícia: %w", err)
	}
	return nil
}
