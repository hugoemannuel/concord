package giphy

import (
	"context"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// FavoriteRepository: os GIFs favoritos no Postgres (tabela gif_favorites).
type FavoriteRepository struct {
	db *pgxpool.Pool
}

func NewFavoriteRepository(db *pgxpool.Pool) *FavoriteRepository {
	return &FavoriteRepository{db: db}
}

// ListFavorites: os favoritos do usuário, o mais novo primeiro.
func (r *FavoriteRepository) ListFavorites(ctx context.Context, userID string) ([]GIFItem, error) {
	rows, err := r.db.Query(
		ctx,
		`SELECT gif_id, title, url, preview_url, width, height
		FROM gif_favorites
		WHERE user_id = $1
		ORDER BY created_at DESC, gif_id`,
		userID,
	)
	if err != nil {
		return nil, err
	}
	return pgx.CollectRows(rows, func(row pgx.CollectableRow) (GIFItem, error) {
		var g GIFItem
		err := row.Scan(&g.ID, &g.Title, &g.URL, &g.PreviewURL, &g.Width, &g.Height)
		return g, err
	})
}

// AddFavorite favorita o GIF (já favoritado atualiza os dados e não muda a
// ordem). Com max favoritos o próximo dá ErrFavoritesFull.
func (r *FavoriteRepository) AddFavorite(ctx context.Context, userID string, gif GIFItem, max int) error {
	tag, err := r.db.Exec(
		ctx,
		`INSERT INTO gif_favorites (user_id, gif_id, title, url, preview_url, width, height)
		SELECT $1::uuid, $2::varchar, $3::varchar, $4::varchar, $5::varchar, $6::int, $7::int
		WHERE (SELECT COUNT(*) FROM gif_favorites WHERE user_id = $1::uuid) < $8::int
			OR EXISTS (SELECT 1 FROM gif_favorites WHERE user_id = $1::uuid AND gif_id = $2::varchar)
		ON CONFLICT (user_id, gif_id) DO UPDATE
			SET title = EXCLUDED.title, url = EXCLUDED.url, preview_url = EXCLUDED.preview_url,
				width = EXCLUDED.width, height = EXCLUDED.height`,
		userID, gif.ID, gif.Title, gif.URL, gif.PreviewURL, gif.Width, gif.Height, max,
	)
	if err == nil && tag.RowsAffected() == 0 {
		return ErrFavoritesFull
	}
	return err
}

// RemoveFavorite tira o GIF dos favoritos (o que não estava não é erro).
func (r *FavoriteRepository) RemoveFavorite(ctx context.Context, userID, gifID string) error {
	_, err := r.db.Exec(ctx, `DELETE FROM gif_favorites WHERE user_id = $1 AND gif_id = $2`, userID, gifID)
	return err
}
