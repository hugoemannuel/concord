package event

import (
	"context"
	"time"

	"github.com/jackc/pgx/v5"
)

// SetRoom guarda no evento os canais da sala que acabou de abrir.
func (r *Repository) SetRoom(ctx context.Context, eventID, voiceID, textID string) error {
	_, err := r.db.Exec(ctx, `
		UPDATE server_events SET voice_channel_id = $2, text_channel_id = $3, updated_at = NOW()
		WHERE id = $1`, eventID, voiceID, textID)
	return err
}

// RoomsToOpen: eventos vivos cuja ocorrência está no ar (começou e ainda não
// acabou) e que ainda não têm sala.
func (r *Repository) RoomsToOpen(ctx context.Context, now time.Time, limit int) ([]RoomRequest, error) {
	rows, err := r.db.Query(ctx, `
		SELECT id, server_id, title, next_start_at, created_by
		FROM server_events
		WHERE canceled_at IS NULL AND finished_at IS NULL
		  AND voice_channel_id IS NULL AND text_channel_id IS NULL
		  AND next_start_at <= $1
		  AND $1 < next_start_at + duration_minutes * INTERVAL '1 minute'
		ORDER BY next_start_at LIMIT $2`, now, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanRows(rows, func(rows pgx.Rows) (RoomRequest, error) {
		var q RoomRequest
		err := rows.Scan(&q.EventID, &q.ServerID, &q.Title, &q.Occurrence, &q.CreatedBy)
		return q, err
	})
}

// RoomsToClose: eventos com sala aberta cuja ocorrência acabou ou que foram
// cancelados (a sala de um evento cancelado também fecha).
func (r *Repository) RoomsToClose(ctx context.Context, now time.Time, limit int) ([]RoomRef, error) {
	rows, err := r.db.Query(ctx, `
		SELECT id, server_id, voice_channel_id, text_channel_id
		FROM server_events
		WHERE (voice_channel_id IS NOT NULL OR text_channel_id IS NOT NULL)
		  AND (canceled_at IS NOT NULL OR finished_at IS NOT NULL
		       OR next_start_at + duration_minutes * INTERVAL '1 minute' <= $1)
		ORDER BY next_start_at LIMIT $2`, now, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanRows(rows, func(rows pgx.Rows) (RoomRef, error) {
		var ref RoomRef
		err := rows.Scan(&ref.EventID, &ref.ServerID, &ref.VoiceID, &ref.TextID)
		return ref, err
	})
}

// scanRows lê todas as linhas com a função de leitura dada.
func scanRows[T any](rows pgx.Rows, scan func(pgx.Rows) (T, error)) ([]T, error) {
	out := make([]T, 0)
	for rows.Next() {
		item, err := scan(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, item)
	}
	return out, rows.Err()
}
