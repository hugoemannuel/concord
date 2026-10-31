package appsound

import (
	"context"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Repository struct {
	db *pgxpool.Pool
}

func NewRepository(db *pgxpool.Pool) *Repository {
	return &Repository{db: db}
}

// Settings devolve as escolhas da pessoa (o padrão, se ela nunca salvou).
func (r *Repository) Settings(ctx context.Context, userID string) (Settings, error) {
	s := DefaultSettings()
	err := r.db.QueryRow(ctx,
		`SELECT pack, volume, events FROM user_app_sound_settings WHERE user_id = $1`, userID,
	).Scan(&s.Pack, &s.Volume, &s.Events)
	if errors.Is(err, pgx.ErrNoRows) {
		return DefaultSettings(), nil
	}
	if err != nil {
		return s, fmt.Errorf("ler sons do app: %w", err)
	}
	return s, nil
}

func (r *Repository) SaveSettings(ctx context.Context, userID string, s Settings) error {
	_, err := r.db.Exec(ctx,
		`INSERT INTO user_app_sound_settings (user_id, pack, volume, events)
		 VALUES ($1, $2, $3, $4)
		 ON CONFLICT (user_id) DO UPDATE
		 SET pack = EXCLUDED.pack, volume = EXCLUDED.volume, events = EXCLUDED.events, updated_at = NOW()`,
		userID, s.Pack, s.Volume, s.Events)
	if err != nil {
		return fmt.Errorf("salvar sons do app: %w", err)
	}
	return nil
}

type fileRow struct {
	Event  string
	FileID string
}

// Files: evento → id do arquivo do áudio próprio.
func (r *Repository) Files(ctx context.Context, userID string) (map[string]string, error) {
	rows, _ := r.db.Query(ctx,
		`SELECT event, file_id::text FROM user_app_sound_files WHERE user_id = $1`, userID)
	list, err := pgx.CollectRows(rows, pgx.RowToStructByPos[fileRow])
	if err != nil {
		return nil, fmt.Errorf("ler áudios próprios: %w", err)
	}
	files := make(map[string]string, len(list))
	for _, f := range list {
		files[f.Event] = f.FileID
	}
	return files, nil
}

// SetFile grava o áudio do evento e devolve o id do anterior ("" se não havia),
// para quem chama apagar o arquivo velho.
func (r *Repository) SetFile(ctx context.Context, userID, event, fileID string, durationMs int) (string, error) {
	var old *string
	err := r.db.QueryRow(ctx,
		`WITH old AS (
		   SELECT file_id FROM user_app_sound_files WHERE user_id = $1 AND event = $2
		 )
		 INSERT INTO user_app_sound_files (user_id, event, file_id, duration_ms)
		 VALUES ($1, $2, $3, $4)
		 ON CONFLICT (user_id, event) DO UPDATE
		 SET file_id = EXCLUDED.file_id, duration_ms = EXCLUDED.duration_ms, created_at = NOW()
		 RETURNING (SELECT file_id::text FROM old)`,
		userID, event, fileID, durationMs,
	).Scan(&old)
	if err != nil {
		return "", fmt.Errorf("gravar áudio próprio: %w", err)
	}
	if old == nil {
		return "", nil
	}
	return *old, nil
}

// RemoveFile tira o áudio do evento e devolve o id dele ("" se não havia).
func (r *Repository) RemoveFile(ctx context.Context, userID, event string) (string, error) {
	var old string
	err := r.db.QueryRow(ctx,
		`DELETE FROM user_app_sound_files WHERE user_id = $1 AND event = $2 RETURNING file_id::text`,
		userID, event,
	).Scan(&old)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", nil
	}
	if err != nil {
		return "", fmt.Errorf("remover áudio próprio: %w", err)
	}
	return old, nil
}
