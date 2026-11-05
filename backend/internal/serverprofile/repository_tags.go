package serverprofile

import (
	"context"
	"errors"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
)

// foreignKeyViolation: a pessoa saiu do servidor no meio da troca.
const foreignKeyViolation = "23503"

// ApplyTag troca a tag da pessoa. A linha do perfil fica travada em modo
// compartilhado: se o nome da tag está sendo trocado, espera e vê o novo.
func (r *Repository) ApplyTag(ctx context.Context, userID, serverID string) (*Tag, error) {
	tag := Tag{ServerID: serverID}
	err := pgx.BeginFunc(ctx, r.db, func(tx pgx.Tx) error {
		var member bool
		if err := tx.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM server_members WHERE server_id = $1 AND user_id = $2)`, serverID, userID).Scan(&member); err != nil {
			return err
		}
		if !member {
			return ErrNotMember
		}
		err := tx.QueryRow(ctx, `SELECT tag_name, tag_badge, tag_color FROM server_profiles WHERE server_id = $1 AND tag_name <> '' FOR SHARE`, serverID).
			Scan(&tag.Name, &tag.Badge, &tag.Color)
		if errors.Is(err, pgx.ErrNoRows) {
			return ErrNoTag
		}
		if err != nil {
			return err
		}
		_, err = tx.Exec(ctx, `
			INSERT INTO user_server_tags (user_id, server_id) VALUES ($1, $2)
			ON CONFLICT (user_id) DO UPDATE SET server_id = EXCLUDED.server_id, applied_at = NOW()`, userID, serverID)
		return err
	})
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) && pgErr.Code == foreignKeyViolation {
		return nil, ErrNotMember
	}
	if err != nil {
		return nil, err
	}
	return &tag, nil
}

func (r *Repository) ClearTag(ctx context.Context, userID string) error {
	_, err := r.db.Exec(ctx, `DELETE FROM user_server_tags WHERE user_id = $1`, userID)
	return err
}

// LookupTags: a tag de cada id que usa uma.
func (r *Repository) LookupTags(ctx context.Context, userIDs []string) (map[string]Tag, error) {
	rows, err := r.db.Query(ctx, `
		SELECT t.user_id::text, p.server_id::text, p.tag_name, p.tag_badge, p.tag_color
		FROM user_server_tags t
		JOIN server_profiles p ON p.server_id = t.server_id AND p.tag_name <> ''
		WHERE t.user_id = ANY($1::uuid[])`, userIDs)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := map[string]Tag{}
	for rows.Next() {
		var userID string
		var tag Tag
		if err := rows.Scan(&userID, &tag.ServerID, &tag.Name, &tag.Badge, &tag.Color); err != nil {
			return nil, err
		}
		out[userID] = tag
	}
	return out, rows.Err()
}

// TagOptions: as tags dos servidores em que a pessoa está.
func (r *Repository) TagOptions(ctx context.Context, userID string) ([]TagOption, error) {
	rows, err := r.db.Query(ctx, `
		SELECT p.server_id::text, p.tag_name, p.tag_badge, p.tag_color, s.name, NULLIF(s.icon_url, '')
		FROM server_members m
		JOIN server_profiles p ON p.server_id = m.server_id AND p.tag_name <> ''
		JOIN servers s ON s.id = m.server_id
		WHERE m.user_id = $1
		ORDER BY s.name`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []TagOption{}
	for rows.Next() {
		var o TagOption
		if err := rows.Scan(&o.ServerID, &o.Name, &o.Badge, &o.Color, &o.ServerName, &o.ServerIconURL); err != nil {
			return nil, err
		}
		out = append(out, o)
	}
	return out, rows.Err()
}
