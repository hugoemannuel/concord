package accountdeletion

import (
	"context"
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

// mediaID tira o UUID do fim de uma URL guardada ("/api/profile-media/a_<id>").
const mediaID = `substring(%s from '([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$')`

func idOf(column string) string { return fmt.Sprintf(mediaID, column) }

// filesSQL lista os arquivos que a exclusão deixa sem dono: os do perfil, os
// que a pessoa enviou a servidores (as linhas somem pela cascata do
// uploader_id) e os dos servidores em que ela é o único membro.
var filesSQL = `
	WITH me AS (SELECT * FROM users WHERE id = $1),
	     mine AS (SELECT id, icon_url FROM servers WHERE owner_id = $1),
	     props AS (SELECT id FROM proposals WHERE author_id = $1)
	SELECT kind, id FROM (
		SELECT 'profile' AS kind, ` + idOf("avatar_url") + ` AS id FROM me
		UNION ALL SELECT 'profile', ` + idOf("banner_url") + ` FROM me
		UNION ALL SELECT 'profile', ` + idOf("nameplate_url") + ` FROM me
		UNION ALL SELECT 'profile', ` + idOf("avatar_url") + ` FROM saved_profiles WHERE user_id = $1
		UNION ALL SELECT 'profile', ` + idOf("banner_url") + ` FROM saved_profiles WHERE user_id = $1
		UNION ALL SELECT 'profile', ` + idOf("icon_url") + ` FROM mine
		UNION ALL SELECT 'entrance', ` + idOf("entrance_sound_url") + ` FROM me
		UNION ALL SELECT 'appsound', file_id::text FROM user_app_sound_files WHERE user_id = $1
		UNION ALL SELECT 'soundboard', id::text FROM soundboard_sounds WHERE uploader_id = $1 OR server_id IN (SELECT id FROM mine)
		UNION ALL SELECT 'sticker', id::text FROM server_stickers WHERE uploader_id = $1 OR server_id IN (SELECT id FROM mine)
		UNION ALL SELECT 'emoji', id::text FROM server_emojis WHERE uploader_id = $1 OR server_id IN (SELECT id FROM mine)
		UNION ALL SELECT 'proposal', id::text FROM proposal_images WHERE uploader_id = $1 OR proposal_id IN (SELECT id FROM props)
		UNION ALL SELECT 'proposal', a.id::text FROM proposal_comment_attachments a
			LEFT JOIN proposal_comments c ON c.id = a.comment_id
			WHERE a.uploader_id = $1 OR c.author_id = $1 OR c.proposal_id IN (SELECT id FROM props)
	) f WHERE id IS NOT NULL`

// Erase apaga a conta numa transação: confere os servidores, junta os
// arquivos, passa o que fica para "Usuário removido" e apaga o resto (as FKs
// com ON DELETE CASCADE levam perfil, amizades, sessões, push, etc.).
func (r *Repository) Erase(ctx context.Context, userID string) (*Erasure, error) {
	if userID == DeletedUserID {
		return nil, ErrNotFound
	}
	tx, err := r.db.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)

	if err := lockUser(ctx, tx, userID); err != nil {
		return nil, err
	}
	if err := refuseOwnedServers(ctx, tx, userID); err != nil {
		return nil, err
	}
	erasure, err := collectFiles(ctx, tx, userID)
	if err != nil {
		return nil, err
	}
	if erasure.LeftServers, err = memberOf(ctx, tx, userID); err != nil {
		return nil, err
	}
	if erasure.DeletedServers, err = deleteSoleServers(ctx, tx, userID); err != nil {
		return nil, err
	}
	if err := reassignAndDelete(ctx, tx, userID); err != nil {
		return nil, err
	}
	return erasure, tx.Commit(ctx)
}

// lockUser trava a linha (dois pedidos de exclusão ao mesmo tempo: um espera).
func lockUser(ctx context.Context, tx pgx.Tx, userID string) error {
	var found bool
	err := tx.QueryRow(ctx, `SELECT TRUE FROM users WHERE id = $1 AND NOT is_guest FOR UPDATE`, userID).Scan(&found)
	if err == pgx.ErrNoRows {
		return ErrNotFound
	}
	return err
}

func refuseOwnedServers(ctx context.Context, tx pgx.Tx, userID string) error {
	rows, err := tx.Query(ctx, `
		SELECT s.id::text, s.name FROM servers s
		WHERE s.owner_id = $1
		AND EXISTS (SELECT 1 FROM server_members m WHERE m.server_id = s.id AND m.user_id <> $1)
		ORDER BY s.name`, userID)
	if err != nil {
		return err
	}
	servers, err := pgx.CollectRows(rows, pgx.RowToStructByPos[OwnedServer])
	if err != nil {
		return err
	}
	if len(servers) > 0 {
		return &OwnsServersError{Servers: servers}
	}
	return nil
}

func collectFiles(ctx context.Context, tx pgx.Tx, userID string) (*Erasure, error) {
	rows, err := tx.Query(ctx, filesSQL, userID)
	if err != nil {
		return nil, fmt.Errorf("arquivos da conta: %w", err)
	}
	files, err := pgx.CollectRows(rows, func(row pgx.CollectableRow) (File, error) {
		var f File
		err := row.Scan(&f.Kind, &f.ID)
		return f, err
	})
	if err != nil {
		return nil, fmt.Errorf("arquivos da conta: %w", err)
	}
	return &Erasure{Files: files}, nil
}

// memberOf: servidores de outras pessoas em que a conta é membro.
func memberOf(ctx context.Context, tx pgx.Tx, userID string) ([]string, error) {
	rows, err := tx.Query(ctx, `
		SELECT m.server_id::text FROM server_members m JOIN servers s ON s.id = m.server_id
		WHERE m.user_id = $1 AND s.owner_id <> $1`, userID)
	if err != nil {
		return nil, fmt.Errorf("servidores da conta: %w", err)
	}
	return pgx.CollectRows(rows, pgx.RowTo[string])
}

// deleteSoleServers apaga os servidores de que a pessoa é dona (a esta altura,
// só sobram os em que ela é o único membro), antes de passar as mensagens.
func deleteSoleServers(ctx context.Context, tx pgx.Tx, userID string) ([]string, error) {
	rows, err := tx.Query(ctx, `DELETE FROM servers WHERE owner_id = $1 RETURNING id::text`, userID)
	if err != nil {
		return nil, fmt.Errorf("servidores da conta: %w", err)
	}
	return pgx.CollectRows(rows, pgx.RowTo[string])
}

// reassignSQL roda em ordem: conversas a dois saem antes (com as mensagens
// das duas pessoas); o que fica em servidores e grupos passa para
// "Usuário removido"; por último, a conta.
var reassignSQL = []string{
	`DELETE FROM conversations WHERE type = 'dm' AND (user_a_id = $1 OR user_b_id = $1)`,
	`DELETE FROM message_attachments WHERE uploader_id = $1 AND message_id IS NULL`,
	`UPDATE messages SET author_id = '` + DeletedUserID + `' WHERE author_id = $1`,
	`UPDATE message_attachments SET uploader_id = '` + DeletedUserID + `' WHERE uploader_id = $1`,
	`UPDATE channels SET created_by = '` + DeletedUserID + `' WHERE created_by = $1`,
	`DELETE FROM channel_overwrites WHERE target_type = 'member' AND target_id = $1`,
	`DELETE FROM users WHERE id = $1`,
}

func reassignAndDelete(ctx context.Context, tx pgx.Tx, userID string) error {
	for _, sql := range reassignSQL {
		if _, err := tx.Exec(ctx, sql, userID); err != nil {
			return fmt.Errorf("excluir conta (%.40s…): %w", sql, err)
		}
	}
	return nil
}
