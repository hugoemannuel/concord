package channel

import (
	"context"
	"errors"

	"gin-quickstart/backend/internal/permission"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Repository struct {
	db *pgxpool.Pool
}

func ChannelRepository(db *pgxpool.Pool) *Repository {
	return &Repository{
		db: db,
	}
}

// Create insere o canal e as sobrescritas dele numa transação: um canal
// privado nunca existe, nem por um instante, sem o deny do @everyone.
func (r *Repository) Create(ctx context.Context, ch *Channel, overwrites []permission.Overwrite) error {
	tx, err := r.db.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	err = insertChannel(ctx, tx, ch, overwrites)
	if err != nil {
		return err
	}
	return tx.Commit(ctx)
}

type execer interface {
	Exec(ctx context.Context, sql string, args ...any) (pgconn.CommandTag, error)
}

func setOverwrite(ctx context.Context, db execer, channelID string, o permission.Overwrite) error {
	_, err := db.Exec(
		ctx,
		`
		INSERT INTO channel_overwrites (channel_id, target_type, target_id, allow, deny)
		VALUES ($1, $2, $3, $4, $5)
		ON CONFLICT (channel_id, target_type, target_id) DO UPDATE SET allow = EXCLUDED.allow, deny = EXCLUDED.deny
		`,
		channelID, o.TargetType, o.TargetID, o.Allow, o.Deny,
	)
	return err
}

// SetOverwrite cria ou troca a sobrescrita de um cargo/membro no canal.
func (r *Repository) SetOverwrite(ctx context.Context, channelID string, o permission.Overwrite) error {
	return setOverwrite(ctx, r.db, channelID, o)
}

func (r *Repository) DeleteOverwrite(ctx context.Context, channelID, targetType, targetID string) error {
	_, err := r.db.Exec(
		ctx,
		`DELETE FROM channel_overwrites WHERE channel_id = $1 AND target_type = $2 AND target_id = $3`,
		channelID, targetType, targetID,
	)
	return err
}

func (r *Repository) FindByID(ctx context.Context, id string) (*Channel, error) {
	ch := &Channel{}
	err := r.db.QueryRow(
		ctx,
		`
		SELECT
			id,
			server_id,
			name,
			type,
			position,
			is_system,
			system_kind,
			managed,
			created_by,
			created_at,
			updated_at
		FROM channels
		WHERE id = $1
		`,
		id,
	).Scan(
		&ch.ID,
		&ch.ServerID,
		&ch.Name,
		&ch.Type,
		&ch.Position,
		&ch.IsSystem,
		&ch.SystemKind,
		&ch.Managed,
		&ch.CreatedBy,
		&ch.CreatedAt,
		&ch.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}
	return ch, nil
}

// FindSystemByKind: canal de sistema do servidor pelo tipo ("maestro" ou "notices").
func (r *Repository) FindSystemByKind(ctx context.Context, serverID, kind string) (*Channel, error) {
	var id string
	err := r.db.QueryRow(
		ctx,
		`SELECT id FROM channels WHERE server_id = $1 AND system_kind = $2 LIMIT 1`,
		serverID,
		kind,
	).Scan(&id)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrChannelNotFound
	}
	if err != nil {
		return nil, err
	}
	return r.FindByID(ctx, id)
}

// FindSystemByServerID: o canal de sistema ("musica") do servidor; ErrChannelNotFound se não tem.
func (r *Repository) FindSystemByServerID(ctx context.Context, serverID string) (*Channel, error) {
	return r.FindSystemByKind(ctx, serverID, SystemKindMaestro)
}

// FindNoticesByServerID: o canal de sistema ("avisos") do servidor; ErrChannelNotFound se não tem.
func (r *Repository) FindNoticesByServerID(ctx context.Context, serverID string) (*Channel, error) {
	return r.FindSystemByKind(ctx, serverID, SystemKindNotices)
}

// IsSystemChannel diz se o canal é de sistema ("musica" ou "avisos").
func (r *Repository) IsSystemChannel(ctx context.Context, channelID string) (bool, error) {
	var isSystem bool
	err := r.db.QueryRow(ctx, `SELECT is_system FROM channels WHERE id = $1`, channelID).Scan(&isSystem)
	if err != nil {
		return false, err
	}
	return isSystem, nil
}

func (r *Repository) ChannelServerID(ctx context.Context, channelID string) (string, error) {
	var serverID string
	err := r.db.QueryRow(ctx, `SELECT server_id FROM channels WHERE id = $1`, channelID).Scan(&serverID)
	if err != nil {
		return "", err
	}
	return serverID, nil
}

func (r *Repository) Update(ctx context.Context, id string, name string) error {
	tag, err := r.db.Exec(
		ctx,
		`UPDATE channels SET name = $1, updated_at = NOW() WHERE id = $2`,
		name,
		id,
	)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrChannelNotFound
	}
	return nil
}

func (r *Repository) Delete(ctx context.Context, id string) error {
	tag, err := r.db.Exec(ctx, `DELETE FROM channels WHERE id = $1`, id)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrChannelNotFound
	}
	return nil
}

func (r *Repository) ListByServerID(ctx context.Context, serverID string) ([]Channel, error) {
	rows, err := r.db.Query(
		ctx,
		`
		SELECT
			id,
			server_id,
			name,
			type,
			position,
			is_system,
			system_kind,
			managed,
			created_by,
			created_at,
			updated_at
		FROM channels
		WHERE server_id = $1
		ORDER BY position, created_at, name
		`,
		serverID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var channels []Channel
	for rows.Next() {
		var ch Channel
		if err := rows.Scan(
			&ch.ID,
			&ch.ServerID,
			&ch.Name,
			&ch.Type,
			&ch.Position,
			&ch.IsSystem,
			&ch.SystemKind,
			&ch.Managed,
			&ch.CreatedBy,
			&ch.CreatedAt,
			&ch.UpdatedAt,
		); err != nil {
			return nil, err
		}
		channels = append(channels, ch)
	}

	if channels == nil {
		channels = []Channel{}
	}

	return channels, nil
}

// Reorder grava a nova ordem dos canais de um tipo do servidor numa transação:
// trava os canais da seção, confere que ids é exatamente eles (ValidateOrder)
// e grava position = índice em ids.
func (r *Repository) Reorder(ctx context.Context, serverID string, chType string, ids []string) error {
	tx, err := r.db.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	rows, err := tx.Query(
		ctx,
		`SELECT id FROM channels WHERE server_id = $1 AND type = $2 FOR UPDATE`,
		serverID,
		chType,
	)
	if err != nil {
		return err
	}
	current, err := pgx.CollectRows(rows, pgx.RowTo[string])
	if err != nil {
		return err
	}

	if err := ValidateOrder(current, ids); err != nil {
		return err
	}

	if _, err := tx.Exec(
		ctx,
		`
		UPDATE channels AS c
		SET position = o.ord - 1
		FROM unnest($1::text[]) WITH ORDINALITY AS o(id, ord)
		WHERE c.id = o.id::uuid
		`,
		ids,
	); err != nil {
		return err
	}
	if err := keepLooseOrder(ctx, tx, serverID, chType); err != nil {
		return err
	}

	return tx.Commit(ctx)
}

// keepLooseOrder leva a ordem nova (dos apps antigos, por tipo) para a lista de soltos,
// que é uma só: os canais do tipo trocam de lugar entre si, sem invadir os do outro tipo.
func keepLooseOrder(ctx context.Context, tx pgx.Tx, serverID, chType string) error {
	_, err := tx.Exec(ctx, `
		WITH soltos AS (
			SELECT l.channel_id, l.position, c.position AS channel_position, c.created_at, c.id
			FROM channel_category_layout l JOIN channels c ON c.id = l.channel_id
			WHERE l.server_id = $1 AND l.category_id IS NULL AND c.type = $2
		), vagas AS (
			SELECT position, ROW_NUMBER() OVER (ORDER BY position) AS n FROM soltos
		), ordem AS (
			SELECT channel_id, ROW_NUMBER() OVER (ORDER BY channel_position, created_at, id) AS n FROM soltos
		)
		UPDATE channel_category_layout l SET position = vagas.position
		FROM ordem JOIN vagas ON vagas.n = ordem.n
		WHERE l.channel_id = ordem.channel_id`,
		serverID, chType,
	)
	return err
}
