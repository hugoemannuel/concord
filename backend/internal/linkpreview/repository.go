package linkpreview

import (
	"context"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Repository é o cache da prévia (tabela link_previews).
type Repository struct {
	db *pgxpool.Pool
}

func NewRepository(db *pgxpool.Pool) *Repository { return &Repository{db: db} }

func (r *Repository) Find(ctx context.Context, url string) (Entry, bool, error) {
	var e Entry
	var imageID *string
	err := r.db.QueryRow(ctx, `
		SELECT url, site_name, title, description, image_id::text, color, youtube_id, failed, fetched_at
		FROM link_previews WHERE url = $1`, url,
	).Scan(&e.URL, &e.SiteName, &e.Title, &e.Description, &imageID, &e.Color, &e.YouTubeID, &e.Failed, &e.FetchedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return Entry{}, false, nil
	}
	if err != nil {
		return Entry{}, false, err
	}
	if imageID != nil {
		e.ImageID = *imageID
	}
	return e, true, nil
}

// Save grava ou troca a linha da URL.
func (r *Repository) Save(ctx context.Context, e Entry) error {
	var imageID *string
	if e.ImageID != "" {
		imageID = &e.ImageID
	}
	_, err := r.db.Exec(ctx, `
		INSERT INTO link_previews (url, site_name, title, description, image_id, color, youtube_id, failed, fetched_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
		ON CONFLICT (url) DO UPDATE SET
			site_name = EXCLUDED.site_name, title = EXCLUDED.title, description = EXCLUDED.description,
			image_id = EXCLUDED.image_id, color = EXCLUDED.color, youtube_id = EXCLUDED.youtube_id,
			failed = EXCLUDED.failed, fetched_at = EXCLUDED.fetched_at`,
		e.URL, e.SiteName, e.Title, e.Description, imageID, e.Color, e.YouTubeID, e.Failed, e.FetchedAt)
	return err
}

// DeleteExpired apaga as linhas buscadas antes de before.
func (r *Repository) DeleteExpired(ctx context.Context, before time.Time) (int64, error) {
	tag, err := r.db.Exec(ctx, `DELETE FROM link_previews WHERE fetched_at < $1`, before)
	if err != nil {
		return 0, err
	}
	return tag.RowsAffected(), nil
}

// ImageIDs: as imagens que alguma linha ainda usa.
func (r *Repository) ImageIDs(ctx context.Context) (map[string]bool, error) {
	rows, err := r.db.Query(ctx, `SELECT image_id::text FROM link_previews WHERE image_id IS NOT NULL`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	used := map[string]bool{}
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		used[id] = true
	}
	return used, rows.Err()
}
