package channelcategory

import (
	"context"
	"errors"

	"github.com/jackc/pgx/v5"
)

// FindByName: o id da primeira categoria com esse nome no servidor ("" = não
// há). Os alertas usam para reaproveitar a categoria Monitoramento (ADR 0071).
func (r *Repository) FindByName(ctx context.Context, server, name string) (string, error) {
	var id string
	err := r.db.QueryRow(ctx, `SELECT id::text FROM channel_categories WHERE server_id::text = $1 AND name = $2 ORDER BY position LIMIT 1`, server, name).Scan(&id)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", nil
	}
	return id, err
}
