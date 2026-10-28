package channel

import (
	"context"
	"errors"

	"gin-quickstart/backend/internal/audit"
	"gin-quickstart/backend/internal/permission"

	"github.com/jackc/pgx/v5"
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
// privado nunca existe, nem por um instante, sem o deny do @everyone. mark nil
// (canais de sistema) não gera registro de auditoria.
func (r *Repository) Create(ctx context.Context, ch *Channel, overwrites []permission.Overwrite, mark *audit.Mark) error {
	return audit.Tx(ctx, r.db, func(tx pgx.Tx) (*audit.Event, error) {
		if err := insertChannel(ctx, tx, ch); err != nil {
			return nil, err
		}
		for _, o := range overwrites {
			if err := setOverwrite(ctx, tx, ch.ID, o); err != nil {
				return nil, err
			}
		}
		return mark.Event(audit.TargetChannel, ch.ID, ch.Name, []audit.Change{{Field: "type", After: ch.Type}}), nil
	})
}

func insertChannel(ctx context.Context, tx pgx.Tx, ch *Channel) error {
	return tx.QueryRow(
		ctx,
		`
		INSERT INTO channels (id, server_id, name, type, created_by, is_system, position)
		VALUES (
			$1, $2, $3, $4::varchar, $5, $6,
			-- Canal novo vai para o fim da seção dele.
			(SELECT COALESCE(MAX(position) + 1, 0) FROM channels WHERE server_id = $2 AND type = $4::varchar)
		)
		RETURNING
			id,
			server_id,
			name,
			type,
			position,
			is_system,
			created_by,
			created_at,
			updated_at
		`,
		ch.ID,
		ch.ServerID,
		ch.Name,
		ch.Type,
		ch.CreatedBy,
		ch.IsSystem,
	).Scan(
		&ch.ID,
		&ch.ServerID,
		&ch.Name,
		&ch.Type,
		&ch.Position,
		&ch.IsSystem,
		&ch.CreatedBy,
		&ch.CreatedAt,
		&ch.UpdatedAt,
	)
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
		&ch.CreatedBy,
		&ch.CreatedAt,
		&ch.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}
	return ch, nil
}

// FindSystemByName: canal de sistema do servidor pelo nome ("bot" ou "avisos").
func (r *Repository) FindSystemByName(ctx context.Context, serverID string, names ...string) (*Channel, error) {
	var id string
	err := r.db.QueryRow(
		ctx,
		`SELECT id FROM channels WHERE server_id = $1 AND is_system AND name = ANY($2) LIMIT 1`,
		serverID,
		names,
	).Scan(&id)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrChannelNotFound
	}
	if err != nil {
		return nil, err
	}
	return r.FindByID(ctx, id)
}

// FindSystemByServerID: o canal de sistema ("bot") do servidor; ErrChannelNotFound se não tem.
func (r *Repository) FindSystemByServerID(ctx context.Context, serverID string) (*Channel, error) {
	return r.FindSystemByName(ctx, serverID, SystemChannelName, "bot-maestro")
}

// FindNoticesByServerID: o canal de sistema ("avisos") do servidor; ErrChannelNotFound se não tem.
func (r *Repository) FindNoticesByServerID(ctx context.Context, serverID string) (*Channel, error) {
	return r.FindSystemByName(ctx, serverID, NoticesChannelName, "avisos-sistema")
}

// IsSystemChannel diz se o canal é de sistema ("bot" ou "avisos").
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

func (r *Repository) Update(ctx context.Context, id string, name string, mark *audit.Mark) error {
	return audit.Tx(ctx, r.db, func(tx pgx.Tx) (*audit.Event, error) {
		before, err := lockName(ctx, tx, id)
		if err != nil {
			return nil, err
		}
		if _, err := tx.Exec(ctx, `UPDATE channels SET name = $1, updated_at = NOW() WHERE id = $2`, name, id); err != nil {
			return nil, err
		}
		changes := audit.Diff(nil, "name", before, name)
		if len(changes) == 0 {
			return nil, nil
		}
		return mark.Event(audit.TargetChannel, id, name, changes), nil
	})
}

// lockName trava o canal e devolve o nome que ele tinha antes da mudança.
func lockName(ctx context.Context, tx pgx.Tx, id string) (string, error) {
	var name string
	err := tx.QueryRow(ctx, `SELECT name FROM channels WHERE id = $1 FOR UPDATE`, id).Scan(&name)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", ErrChannelNotFound
	}
	return name, err
}

func (r *Repository) Delete(ctx context.Context, id string, mark *audit.Mark) error {
	return audit.Tx(ctx, r.db, func(tx pgx.Tx) (*audit.Event, error) {
		name, err := lockName(ctx, tx, id)
		if err != nil {
			return nil, err
		}
		if _, err := tx.Exec(ctx, `DELETE FROM channels WHERE id = $1`, id); err != nil {
			return nil, err
		}
		return mark.Event(audit.TargetChannel, id, name, nil), nil
	})
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
