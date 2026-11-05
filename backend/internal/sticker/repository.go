package sticker

import (
	"context"
	"errors"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Repository struct {
	db *pgxpool.Pool
}

func NewRepository(db *pgxpool.Pool) *Repository {
	return &Repository{db: db}
}

func (r *Repository) Create(ctx context.Context, s *Sticker) error {
	return r.db.QueryRow(
		ctx,
		`
		WITH inserted AS (
			INSERT INTO server_stickers
				(id, server_id, uploader_id, name, file_id, content_type, size_bytes)
			VALUES ($1, $2, $3, $4, $5, $6, $7)
			RETURNING id, server_id, uploader_id, name, file_id, content_type, size_bytes, created_at
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
		s.ID,
		s.ContentType,
		s.SizeBytes,
	).Scan(&s.CreatedAt, &s.UploaderName)
}

func (r *Repository) ListByServer(ctx context.Context, serverID string) ([]Sticker, error) {
	if _, err := uuid.Parse(serverID); err != nil {
		return []Sticker{}, nil
	}
	rows, err := r.db.Query(
		ctx,
		`
		SELECT
			s.id,
			s.server_id,
			s.uploader_id,
			COALESCE(u.display_name, u.username, ''),
			s.name,
			s.content_type,
			s.size_bytes,
			s.created_at
		FROM server_stickers s
		LEFT JOIN users u ON u.id = s.uploader_id
		WHERE s.server_id = $1
		ORDER BY s.created_at DESC
		`,
		serverID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	stickers := make([]Sticker, 0)
	for rows.Next() {
		var s Sticker
		if err := rows.Scan(
			&s.ID,
			&s.ServerID,
			&s.UploaderID,
			&s.UploaderName,
			&s.Name,
			&s.ContentType,
			&s.SizeBytes,
			&s.CreatedAt,
		); err != nil {
			return nil, err
		}
		stickers = append(stickers, s)
	}
	return stickers, rows.Err()
}

func (r *Repository) FindByID(ctx context.Context, id string) (*Sticker, error) {
	if _, err := uuid.Parse(id); err != nil {
		return nil, ErrStickerNotFound
	}
	var s Sticker
	err := r.db.QueryRow(
		ctx,
		`
		SELECT
			s.id,
			s.server_id,
			s.uploader_id,
			COALESCE(u.display_name, u.username, ''),
			s.name,
			s.content_type,
			s.size_bytes,
			s.created_at,
			s.published_at
		FROM server_stickers s
		LEFT JOIN users u ON u.id = s.uploader_id
		WHERE s.id = $1
		`,
		id,
	).Scan(
		&s.ID,
		&s.ServerID,
		&s.UploaderID,
		&s.UploaderName,
		&s.Name,
		&s.ContentType,
		&s.SizeBytes,
		&s.CreatedAt,
		&s.PublishedAt,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrStickerNotFound
	}
	if err != nil {
		return nil, err
	}
	return &s, nil
}

func (r *Repository) CountByServer(ctx context.Context, serverID string) (int, error) {
	if _, err := uuid.Parse(serverID); err != nil {
		return 0, nil
	}
	var count int
	err := r.db.QueryRow(
		ctx,
		`SELECT COUNT(*) FROM server_stickers WHERE server_id = $1`,
		serverID,
	).Scan(&count)
	return count, err
}

func (r *Repository) Delete(ctx context.Context, id string) error {
	if _, err := uuid.Parse(id); err != nil {
		return ErrStickerNotFound
	}
	tag, err := r.db.Exec(ctx, `DELETE FROM server_stickers WHERE id = $1`, id)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrStickerNotFound
	}
	return nil
}

// ListForUser: numa consulta só, as figurinhas de todos os servidores de que a
// pessoa é membro, agrupadas por servidor (servidor sem figurinha fica de fora).
func (r *Repository) ListForUser(ctx context.Context, userID string) ([]ServerStickers, error) {
	if _, err := uuid.Parse(userID); err != nil {
		return []ServerStickers{}, nil
	}
	rows, err := r.db.Query(ctx, `
		SELECT srv.id, srv.name, srv.icon_url,
		       s.id, s.uploader_id, COALESCE(u.display_name, u.username, ''),
		       s.name, s.content_type, s.size_bytes, s.created_at
		FROM server_members m
		JOIN servers srv ON srv.id = m.server_id
		JOIN server_stickers s ON s.server_id = m.server_id
		LEFT JOIN users u ON u.id = s.uploader_id
		WHERE m.user_id = $1
		ORDER BY lower(srv.name), srv.id, s.created_at DESC`,
		userID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanGroups(rows)
}

// scanGroups: as linhas vêm ordenadas por servidor; cada uma vai para o grupo dele.
func scanGroups(rows pgx.Rows) ([]ServerStickers, error) {
	groups := make([]ServerStickers, 0)
	for rows.Next() {
		var g ServerStickers
		var s Sticker
		if err := rows.Scan(&g.ServerID, &g.ServerName, &g.ServerIconURL, &s.ID, &s.UploaderID, &s.UploaderName,
			&s.Name, &s.ContentType, &s.SizeBytes, &s.CreatedAt); err != nil {
			return nil, err
		}
		s.ServerID = g.ServerID
		if n := len(groups); n > 0 && groups[n-1].ServerID == g.ServerID {
			groups[n-1].Stickers = append(groups[n-1].Stickers, s)
			continue
		}
		g.Stickers = []Sticker{s}
		groups = append(groups, g)
	}
	return groups, rows.Err()
}

func updateNotFound(err error) error {
	if errors.Is(err, pgx.ErrNoRows) {
		return ErrStickerNotFound
	}
	return err
}

// Update devolve os metadados persistidos; o arquivo e sua identidade permanecem iguais.
func (r *Repository) Update(ctx context.Context, serverID, id, name string) (*Sticker, error) {
	if uuid.Validate(id) != nil {
		return nil, ErrStickerNotFound
	}
	var s Sticker
	err := r.db.QueryRow(ctx, `WITH updated AS (
 UPDATE server_stickers SET name=$3 WHERE server_id=$1 AND id=$2 RETURNING *
 )
 SELECT s.id,s.server_id,s.uploader_id,COALESCE(u.display_name,u.username,''),
 s.name,s.content_type,s.size_bytes,s.created_at,s.published_at
 FROM updated s LEFT JOIN users u ON u.id=s.uploader_id`, serverID, id, name).Scan(&s.ID, &s.ServerID, &s.UploaderID, &s.UploaderName, &s.Name, &s.ContentType, &s.SizeBytes, &s.CreatedAt, &s.PublishedAt)
	if err != nil {
		return nil, updateNotFound(err)
	}
	return &s, nil
}
