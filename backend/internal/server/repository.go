package server

import (
	"context"
	"errors"
	"fmt"

	"gin-quickstart/backend/internal/audit"
	"gin-quickstart/backend/internal/permission"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Repository struct {
	db *pgxpool.Pool
}

func ServerRepository(db *pgxpool.Pool) *Repository {
	return &Repository{
		db: db,
	}
}

func (r *Repository) Create(
	ctx context.Context,
	server *Server,
) error {
	return r.db.QueryRow(
		ctx,
		`
		INSERT INTO servers (
			id,
			name,
			icon_url,
			owner_id
		)
		VALUES ($1, $2, $3, $4)
		RETURNING
			id,
			name,
			icon_url,
			owner_id,
			created_at,
			updated_at
		`,
		server.ID,
		server.Name,
		server.IconURL,
		server.OwnerID,
	).Scan(
		&server.ID,
		&server.Name,
		&server.IconURL,
		&server.OwnerID,
		&server.CreatedAt,
		&server.UpdatedAt,
	)
}

func (r *Repository) FindByID(ctx context.Context, id string) (*Server, error) {
	s := &Server{}
	err := r.db.QueryRow(
		ctx,
		`
		SELECT
			s.id,
			s.name,
			s.icon_url,
			s.owner_id,
			`+primaryChannelColumn+`,
			s.created_at,
			s.updated_at
		FROM servers s
		WHERE s.id = $1
		`,
		id,
	).Scan(
		&s.ID,
		&s.Name,
		&s.IconURL,
		&s.OwnerID,
		&s.PrimaryChannelID,
		&s.CreatedAt,
		&s.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}
	return s, nil
}

// memberRoleIDsColumn: ids dos cargos do membro (alias "sm" de server_members).
const memberRoleIDsColumn = `COALESCE(
			(SELECT array_agg(mr.role_id::text) FROM member_roles mr WHERE mr.server_id = sm.server_id AND mr.user_id = sm.user_id),
			'{}'
		)`

// legacyRoleColumn: o campo "role" que os apps antigos leem — "admin" para o
// dono e para quem tem MANAGE_CHANNELS ou ADMINISTRATOR (por um cargo ou pelo
// @everyone).
var legacyRoleColumn = fmt.Sprintf(`CASE WHEN EXISTS (
				SELECT 1 FROM servers so WHERE so.id = sm.server_id AND so.owner_id = sm.user_id
			) OR EXISTS (
				SELECT 1 FROM roles r
				WHERE r.server_id = sm.server_id AND (r.permissions & %d) <> 0
				AND (r.is_default OR r.id IN (
					SELECT mr.role_id FROM member_roles mr WHERE mr.server_id = sm.server_id AND mr.user_id = sm.user_id
				))
			) THEN 'admin' ELSE 'member' END`, permission.ManageChannels|permission.Administrator)

// primaryChannelColumn: o canal principal escolhido ou, sem escolha (ou se ele
// foi apagado), o canal de texto mais antigo do servidor. De propósito não
// segue a ordem da barra lateral (channels.position): reordenar canais não muda
// para onde vão os avisos. Precisa do alias "s".
const primaryChannelColumn = `COALESCE(
			s.primary_channel_id,
			(SELECT c.id FROM channels c WHERE c.server_id = s.id AND c.type = 'text' ORDER BY c.created_at, c.id LIMIT 1)
		)`

// SetPrimaryChannel escolhe o canal principal; o canal tem que ser de texto e
// deste servidor. Grava o registro com o nome do canal antes e depois.
func (r *Repository) SetPrimaryChannel(ctx context.Context, serverID string, channelID string, mark *audit.Mark) error {
	return audit.Tx(ctx, r.db, func(tx pgx.Tx) (*audit.Event, error) {
		var before string
		err := tx.QueryRow(
			ctx,
			`
			SELECT COALESCE(c.name, '')
			FROM servers s
			LEFT JOIN channels c ON c.id = `+primaryChannelColumn+`
			WHERE s.id = $1
			FOR UPDATE OF s
			`,
			serverID,
		).Scan(&before)
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrInvalidPrimaryChannel
		}
		if err != nil {
			return nil, err
		}

		tag, err := tx.Exec(
			ctx,
			`
			UPDATE servers
			SET primary_channel_id = $2, updated_at = NOW()
			WHERE id = $1
			AND EXISTS (
				SELECT 1 FROM channels WHERE id = $2 AND server_id = $1 AND type = 'text'
			)
			`,
			serverID,
			channelID,
		)
		if err != nil {
			return nil, err
		}
		if tag.RowsAffected() == 0 {
			return nil, ErrInvalidPrimaryChannel
		}

		var after string
		if err := tx.QueryRow(ctx, `SELECT name FROM channels WHERE id = $1`, channelID).Scan(&after); err != nil {
			return nil, err
		}
		changes := audit.Diff(nil, "primary_channel", before, after)
		if len(changes) == 0 {
			return nil, nil
		}
		return mark.Event(audit.TargetServer, serverID, "", changes), nil
	})
}

// Update grava nome e ícone; o registro guarda o nome antes e depois e se o
// servidor tem ícone (não a URL).
func (r *Repository) Update(ctx context.Context, id string, name string, iconURL string, mark *audit.Mark) error {
	return audit.Tx(ctx, r.db, func(tx pgx.Tx) (*audit.Event, error) {
		var before string
		var beforeIcon *string
		if err := tx.QueryRow(ctx, `SELECT name, icon_url FROM servers WHERE id = $1 FOR UPDATE`, id).Scan(&before, &beforeIcon); err != nil {
			return nil, err
		}
		if _, err := tx.Exec(
			ctx,
			`UPDATE servers SET name = $1, icon_url = $2, updated_at = NOW() WHERE id = $3`,
			name,
			iconURL,
			id,
		); err != nil {
			return nil, err
		}
		changes := audit.Diff(nil, "name", before, name)
		changes = audit.Diff(changes, "icon", hasIcon(beforeIcon), iconURL != "")
		if len(changes) == 0 {
			return nil, nil
		}
		return mark.Event(audit.TargetServer, id, name, changes), nil
	})
}

func hasIcon(icon *string) bool {
	return icon != nil && *icon != ""
}

// SetIcon troca o ícone (nil tira) e devolve o antigo (para apagar o arquivo).
func (r *Repository) SetIcon(ctx context.Context, id string, url *string, mark *audit.Mark) (*string, error) {
	var old *string
	err := audit.Tx(ctx, r.db, func(tx pgx.Tx) (*audit.Event, error) {
		if err := tx.QueryRow(
			ctx,
			`
			UPDATE servers s SET icon_url = COALESCE($2, ''), updated_at = NOW()
			FROM (SELECT icon_url FROM servers WHERE id = $1 FOR UPDATE) prev
			WHERE s.id = $1
			RETURNING prev.icon_url
			`,
			id,
			url,
		).Scan(&old); err != nil {
			return nil, err
		}
		oldURL := ""
		if old != nil {
			oldURL = *old
		}
		newURL := ""
		if url != nil {
			newURL = *url
		}
		if oldURL == newURL {
			return nil, nil
		}
		changes := []audit.Change{{Field: "icon", Before: hasIcon(old), After: hasIcon(url)}}
		return mark.Event(audit.TargetServer, id, "", changes), nil
	})
	return old, err
}

func (r *Repository) Delete(ctx context.Context, id string) error {
	_, err := r.db.Exec(ctx, `DELETE FROM servers WHERE id = $1`, id)
	return err
}

func (r *Repository) ListByUserID(ctx context.Context, userID string) ([]Server, error) {
	rows, err := r.db.Query(
		ctx,
		`
		SELECT
			s.id,
			s.name,
			s.icon_url,
			s.owner_id,
			`+primaryChannelColumn+`,
			s.created_at,
			s.updated_at
		FROM servers s
		JOIN server_members sm ON sm.server_id = s.id
		WHERE sm.user_id = $1
		ORDER BY s.name
		`,
		userID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var servers []Server
	for rows.Next() {
		var s Server
		if err := rows.Scan(
			&s.ID,
			&s.Name,
			&s.IconURL,
			&s.OwnerID,
			&s.PrimaryChannelID,
			&s.CreatedAt,
			&s.UpdatedAt,
		); err != nil {
			return nil, err
		}
		servers = append(servers, s)
	}

	if servers == nil {
		servers = []Server{}
	}

	return servers, nil
}
