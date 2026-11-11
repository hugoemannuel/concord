package message

import (
	"context"

	"github.com/jackc/pgx/v5"
)

// PollImageURLs: as image_url das respostas que apontam para cópias guardadas
// (a faxina das imagens de enquete apaga o resto).
func (r *Repository) PollImageURLs(ctx context.Context) ([]string, error) {
	rows, err := r.db.Query(ctx, `SELECT image_url FROM poll_answers WHERE image_url LIKE $1`, PollImagePath+"%")
	if err != nil {
		return nil, err
	}
	return pgx.CollectRows(rows, pgx.RowTo[string])
}
