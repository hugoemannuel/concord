package soundboard

import (
	"context"
	"errors"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// soundColumns: as colunas de um Sound (s = soundboard_sounds, u = users do
// autor), na ordem de soundFields.
const soundColumns = `s.id, s.server_id, s.uploader_id, COALESCE(u.display_name, u.username, ''),
	s.name, s.emoji, s.content_type, s.size_bytes, s.duration_ms, s.created_at`

func soundFields(s *Sound) []any {
	return []any{
		&s.ID, &s.ServerID, &s.UploaderID, &s.UploaderName, &s.Name,
		&s.Emoji, &s.ContentType, &s.SizeBytes, &s.DurationMs, &s.CreatedAt,
	}
}

type Repository struct {
	db *pgxpool.Pool
}

func NewRepository(db *pgxpool.Pool) *Repository {
	return &Repository{db: db}
}

func (r *Repository) Create(ctx context.Context, s *Sound) error {
	return r.db.QueryRow(
		ctx,
		`
		WITH inserted AS (
			INSERT INTO soundboard_sounds
				(id, server_id, uploader_id, name, emoji, content_type, size_bytes, duration_ms)
			VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
			RETURNING id, server_id, uploader_id, name, emoji, content_type, size_bytes, duration_ms, created_at
		)
		SELECT
			i.created_at,
			COALESCE(u.display_name, u.username, '')
		FROM inserted i
		LEFT JOIN users u ON u.id = i.uploader_id
		`,
		s.ID,
		s.ServerID,
		s.UploaderID,
		s.Name,
		s.Emoji,
		s.ContentType,
		s.SizeBytes,
		s.DurationMs,
	).Scan(&s.CreatedAt, &s.UploaderName)
}

func (r *Repository) ListByServer(ctx context.Context, serverID string) ([]Sound, error) {
	if _, err := uuid.Parse(serverID); err != nil {
		return []Sound{}, nil
	}
	rows, err := r.db.Query(
		ctx,
		`SELECT `+soundColumns+`
		FROM soundboard_sounds s
		LEFT JOIN users u ON u.id = s.uploader_id
		WHERE s.server_id = $1
		ORDER BY s.created_at DESC`,
		serverID,
	)
	if err != nil {
		return nil, err
	}
	return pgx.CollectRows(rows, func(row pgx.CollectableRow) (Sound, error) {
		var s Sound
		err := row.Scan(soundFields(&s)...)
		return s, err
	})
}

func (r *Repository) FindByID(ctx context.Context, id string) (*Sound, error) {
	if _, err := uuid.Parse(id); err != nil {
		return nil, ErrSoundNotFound
	}
	var s Sound
	err := r.db.QueryRow(
		ctx,
		`SELECT `+soundColumns+`
		FROM soundboard_sounds s
		LEFT JOIN users u ON u.id = s.uploader_id
		WHERE s.id = $1`,
		id,
	).Scan(soundFields(&s)...)
	if err != nil {
		return nil, notFoundOr(err)
	}
	return &s, nil
}

// notFoundOr: nenhuma linha vira ErrSoundNotFound; o resto passa.
func notFoundOr(err error) error {
	if errors.Is(err, pgx.ErrNoRows) {
		return ErrSoundNotFound
	}
	return err
}

func (r *Repository) CountByServer(ctx context.Context, serverID string) (int, error) {
	var count int
	err := r.db.QueryRow(
		ctx,
		`SELECT COUNT(*) FROM soundboard_sounds WHERE server_id = $1`,
		serverID,
	).Scan(&count)
	return count, err
}

func (r *Repository) Delete(ctx context.Context, id string) error {
	tag, err := r.db.Exec(ctx, `DELETE FROM soundboard_sounds WHERE id = $1`, id)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrSoundNotFound
	}
	return nil
}

// Update devolve os metadados persistidos; o arquivo e sua identidade permanecem iguais.
func (r *Repository) Update(ctx context.Context, serverID, id, name string, emoji *string) (*Sound, error) {
	if uuid.Validate(id) != nil {
		return nil, ErrSoundNotFound
	}
	var s Sound
	err := r.db.QueryRow(ctx, `WITH updated AS (
 UPDATE soundboard_sounds SET name=$3,emoji=$4 WHERE server_id=$1 AND id=$2 RETURNING *
 ) SELECT `+soundColumns+` FROM updated s LEFT JOIN users u ON u.id=s.uploader_id`, serverID, id, name, emoji).Scan(soundFields(&s)...)
	if err != nil {
		return nil, notFoundOr(err)
	}
	return &s, nil
}
