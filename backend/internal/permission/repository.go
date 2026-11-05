package permission

import (
	"context"
	"errors"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Repository struct {
	db *pgxpool.Pool
}

func PermissionRepository(db *pgxpool.Pool) *Repository {
	return &Repository{db: db}
}

const roleColumns = `id, server_id, name, color, position, permissions, hoist, is_default, is_system, created_at, updated_at`

func scanRole(row pgx.Row, r *Role) error {
	return row.Scan(&r.ID, &r.ServerID, &r.Name, &r.Color, &r.Position, &r.Permissions, &r.Hoist, &r.IsDefault, &r.IsSystem, &r.CreatedAt, &r.UpdatedAt)
}

// LoadSnapshot lê tudo que o cálculo de permissões do servidor precisa.
func (r *Repository) LoadSnapshot(ctx context.Context, serverID string) (*Snapshot, error) {
	snap := &Snapshot{
		ServerID:    serverID,
		Roles:       map[string]Role{},
		MemberRoles: map[string][]string{},
		Channels:    map[string]ChannelInfo{},
		Categories:  map[string]CategoryInfo{},
	}

	if err := r.db.QueryRow(ctx, `SELECT owner_id FROM servers WHERE id = $1`, serverID).Scan(&snap.OwnerID); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrNotMember
		}
		return nil, err
	}

	for _, load := range []func(context.Context, *Snapshot) error{r.loadRoles, r.loadMembers, r.loadCategories, r.loadChannels} {
		if err := load(ctx, snap); err != nil {
			return nil, err
		}
	}
	return snap, nil
}

func (r *Repository) loadRoles(ctx context.Context, snap *Snapshot) error {
	rows, err := r.db.Query(ctx, `SELECT `+roleColumns+` FROM roles WHERE server_id = $1`, snap.ServerID)
	if err != nil {
		return err
	}
	defer rows.Close()
	for rows.Next() {
		var role Role
		if err := scanRole(rows, &role); err != nil {
			return err
		}
		snap.Roles[role.ID] = role
		if role.IsDefault {
			snap.Everyone = role
		}
	}
	return rows.Err()
}

func (r *Repository) loadMembers(ctx context.Context, snap *Snapshot) error {
	rows, err := r.db.Query(
		ctx,
		`
		SELECT sm.user_id, COALESCE(array_agg(mr.role_id::text) FILTER (WHERE mr.role_id IS NOT NULL), '{}')
		FROM server_members sm
		LEFT JOIN member_roles mr ON mr.server_id = sm.server_id AND mr.user_id = sm.user_id
		WHERE sm.server_id = $1
		GROUP BY sm.user_id
		`,
		snap.ServerID,
	)
	if err != nil {
		return err
	}
	defer rows.Close()
	for rows.Next() {
		var userID string
		var roleIDs []string
		if err := rows.Scan(&userID, &roleIDs); err != nil {
			return err
		}
		snap.MemberRoles[userID] = roleIDs
	}
	return rows.Err()
}

func (r *Repository) loadCategories(ctx context.Context, snap *Snapshot) error {
	rows, err := r.db.Query(
		ctx,
		`
		SELECT c.id::text, o.target_type, o.target_id::text, o.allow, o.deny
		FROM channel_categories c
		LEFT JOIN category_overwrites o ON o.category_id = c.id
		WHERE c.server_id = $1
		`,
		snap.ServerID,
	)
	if err != nil {
		return err
	}
	defer rows.Close()
	for rows.Next() {
		var id string
		var targetType, targetID *string
		var allow, deny *int64
		if err := rows.Scan(&id, &targetType, &targetID, &allow, &deny); err != nil {
			return err
		}
		info := snap.Categories[id]
		info.ID = id
		if targetType != nil {
			info.Overwrites = append(info.Overwrites, Overwrite{TargetType: *targetType, TargetID: *targetID, Allow: *allow, Deny: *deny})
		}
		snap.Categories[id] = info
	}
	return rows.Err()
}

func (r *Repository) loadChannels(ctx context.Context, snap *Snapshot) error {
	rows, err := r.db.Query(
		ctx,
		`
		SELECT c.id, c.type, COALESCE(l.category_id::text, ''), o.target_type, o.target_id::text, o.allow, o.deny
		FROM channels c
		LEFT JOIN channel_overwrites o ON o.channel_id = c.id
		LEFT JOIN channel_category_layout l ON l.channel_id = c.id
		WHERE c.server_id = $1
		`,
		snap.ServerID,
	)
	if err != nil {
		return err
	}
	defer rows.Close()
	for rows.Next() {
		var chID, chType, categoryID string
		var targetType, targetID *string
		var allow, deny *int64
		if err := rows.Scan(&chID, &chType, &categoryID, &targetType, &targetID, &allow, &deny); err != nil {
			return err
		}
		info := snap.Channels[chID]
		info.ID, info.Type, info.CategoryID = chID, chType, categoryID
		if targetType != nil {
			info.Overwrites = append(info.Overwrites, Overwrite{
				ChannelID:  chID,
				TargetType: *targetType,
				TargetID:   *targetID,
				Allow:      *allow,
				Deny:       *deny,
			})
		}
		snap.Channels[chID] = info
	}
	return rows.Err()
}

// ChannelServerID: servidor dono do canal ("" + ErrChannelNotFound se não existe).
func (r *Repository) ChannelServerID(ctx context.Context, channelID string) (string, error) {
	var serverID string
	err := r.db.QueryRow(ctx, `SELECT server_id FROM channels WHERE id = $1`, channelID).Scan(&serverID)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", ErrChannelNotFound
	}
	return serverID, err
}
