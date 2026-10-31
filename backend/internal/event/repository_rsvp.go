package event

import (
	"context"
	"time"
)

// SetRSVP grava (ou troca) a resposta da pessoa na ocorrência.
func (r *Repository) SetRSVP(ctx context.Context, eventID, userID string, occurrence time.Time, going bool) error {
	_, err := r.db.Exec(ctx, `
		INSERT INTO event_rsvps (event_id, user_id, occurrence_start, going)
		VALUES ($1, $2, $3, $4)
		ON CONFLICT (event_id, user_id, occurrence_start)
		DO UPDATE SET going = EXCLUDED.going, updated_at = NOW()`,
		eventID, userID, occurrence, going)
	return err
}

// ClearRSVP tira a resposta (volta a "sem resposta", sem aviso).
func (r *Repository) ClearRSVP(ctx context.Context, eventID, userID string, occurrence time.Time) error {
	_, err := r.db.Exec(ctx, `
		DELETE FROM event_rsvps WHERE event_id = $1 AND user_id = $2 AND occurrence_start = $3`,
		eventID, userID, occurrence)
	return err
}

// ListGoing: quem disse "vou" na ocorrência, em ordem de nome.
func (r *Repository) ListGoing(ctx context.Context, eventID string, occurrence time.Time) ([]Going, error) {
	rows, err := r.db.Query(ctx, `
		SELECT u.id, u.username, u.display_name
		FROM event_rsvps r JOIN users u ON u.id = r.user_id
		WHERE r.event_id = $1 AND r.occurrence_start = $2 AND r.going
		ORDER BY lower(u.display_name), u.id`, eventID, occurrence)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := make([]Going, 0)
	for rows.Next() {
		var g Going
		if err := rows.Scan(&g.UserID, &g.Username, &g.DisplayName); err != nil {
			return nil, err
		}
		out = append(out, g)
	}
	return out, rows.Err()
}
