package expression

import (
	"context"
	"errors"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Repository: consultas sobre emojis e figurinhas de qualquer servidor.
type Repository struct {
	db *pgxpool.Pool
}

func NewRepository(db *pgxpool.Pool) *Repository {
	return &Repository{db: db}
}

// validIDs tira o que não é UUID (viria de texto digitado por alguém).
func validIDs(ids []string) []string {
	valid := make([]string, 0, len(ids))
	for _, id := range ids {
		if uuid.Validate(id) == nil {
			valid = append(valid, id)
		}
	}
	return valid
}

func (r *Repository) EmojisByID(ctx context.Context, ids []string) (map[string]EmojiRef, error) {
	refs := map[string]EmojiRef{}
	valid := validIDs(ids)
	if len(valid) == 0 {
		return refs, nil
	}
	rows, err := r.db.Query(ctx, `SELECT id, name, server_id FROM server_emojis WHERE id = ANY($1::uuid[])`, valid)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var id string
		var ref EmojiRef
		if err := rows.Scan(&id, &ref.Name, &ref.ServerID); err != nil {
			return nil, err
		}
		refs[id] = ref
	}
	return refs, rows.Err()
}

func (r *Repository) StickerServer(ctx context.Context, id string) (string, error) {
	if uuid.Validate(id) != nil {
		return "", ErrUnknownSticker
	}
	var serverID string
	err := r.db.QueryRow(ctx, `SELECT server_id FROM server_stickers WHERE id = $1`, id).Scan(&serverID)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", ErrUnknownSticker
	}
	return serverID, err
}

func (r *Repository) PublishEmojis(ctx context.Context, ids []string) error {
	_, err := r.db.Exec(ctx,
		`UPDATE server_emojis SET published_at = NOW() WHERE id = ANY($1::uuid[]) AND published_at IS NULL`, ids)
	return err
}

func (r *Repository) PublishSticker(ctx context.Context, id string) error {
	_, err := r.db.Exec(ctx,
		`UPDATE server_stickers SET published_at = NOW() WHERE id = $1 AND published_at IS NULL`, id)
	return err
}

// OriginRow: um item que a pessoa pode conhecer e o servidor de origem dele.
type OriginRow struct {
	ID            string
	Name          string
	ServerID      string
	ServerName    string
	ServerIconURL *string
	Member        bool
}

// visibleQuery: as linhas que a pessoa pode conhecer (é membro da origem ou o
// item já foi publicado). `table` é sempre uma das constantes abaixo.
func visibleQuery(table string) string {
	return `
		SELECT x.id, x.name, s.id, s.name, s.icon_url, m.user_id IS NOT NULL
		FROM ` + table + ` x
		JOIN servers s ON s.id = x.server_id
		LEFT JOIN server_members m ON m.server_id = x.server_id AND m.user_id = $2
		WHERE x.id = ANY($1::uuid[]) AND (m.user_id IS NOT NULL OR x.published_at IS NOT NULL)`
}

const (
	emojisTable   = "server_emojis"
	stickersTable = "server_stickers"
)

func (r *Repository) visibleRows(ctx context.Context, table string, ids []string, viewerID string) ([]OriginRow, error) {
	valid := validIDs(ids)
	if len(valid) == 0 {
		return nil, nil
	}
	rows, err := r.db.Query(ctx, visibleQuery(table), valid, viewerID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []OriginRow
	for rows.Next() {
		var row OriginRow
		if err := rows.Scan(&row.ID, &row.Name, &row.ServerID, &row.ServerName, &row.ServerIconURL, &row.Member); err != nil {
			return nil, err
		}
		out = append(out, row)
	}
	return out, rows.Err()
}

func (r *Repository) VisibleEmojis(ctx context.Context, ids []string, viewerID string) ([]OriginRow, error) {
	return r.visibleRows(ctx, emojisTable, ids, viewerID)
}

func (r *Repository) VisibleStickers(ctx context.Context, ids []string, viewerID string) ([]OriginRow, error) {
	return r.visibleRows(ctx, stickersTable, ids, viewerID)
}

// DeletedEmojis: o nome dos emojis apagados (a reação guarda só o id).
func (r *Repository) DeletedEmojis(ctx context.Context, ids []string) (map[string]string, error) {
	names := map[string]string{}
	valid := validIDs(ids)
	if len(valid) == 0 {
		return names, nil
	}
	rows, err := r.db.Query(ctx, `SELECT id, name FROM deleted_emojis WHERE id = ANY($1::uuid[])`, valid)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var id, name string
		if err := rows.Scan(&id, &name); err != nil {
			return nil, err
		}
		names[id] = name
	}
	return names, rows.Err()
}

// PrivateServers: quais destes servidores têm o perfil privado (#528).
func (r *Repository) PrivateServers(ctx context.Context, ids []string) (map[string]bool, error) {
	private := map[string]bool{}
	if len(ids) == 0 {
		return private, nil
	}
	rows, err := r.db.Query(ctx, `SELECT server_id FROM server_profiles WHERE private AND server_id = ANY($1::uuid[])`, ids)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		private[id] = true
	}
	return private, rows.Err()
}
