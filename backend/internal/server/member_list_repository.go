package server

import (
	"context"
	"fmt"

	"gin-quickstart/backend/internal/cosmetics"
	"gin-quickstart/backend/internal/namestyle"
	"gin-quickstart/backend/internal/permission"
)

// Leitura dos membros de um servidor (a lista e um membro só), com o estilo do
// nome e os cargos. A entrada de membros fica em member_repository.go.

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

func (r *Repository) ListMembers(ctx context.Context, serverID string) ([]ServerMember, error) {
	rows, err := r.db.Query(
		ctx,
		`
		SELECT
			sm.server_id,
			sm.user_id,
			u.username,
			u.display_name,
			u.avatar_url,
			`+namestyle.Expr("u")+`,
			`+cosmetics.Expr("u")+`,
			u.is_bot,
			sm.nickname,
			`+legacyRoleColumn+`,
			`+memberRoleIDsColumn+`,
			sm.joined_at,
			sm.updated_at
		FROM server_members sm
		JOIN users u ON u.id = sm.user_id
		WHERE sm.server_id = $1
		ORDER BY sm.joined_at
		`,
		serverID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var members []ServerMember
	for rows.Next() {
		var m ServerMember
		if err := rows.Scan(
			&m.ServerID,
			&m.UserID,
			&m.Username,
			&m.DisplayName,
			&m.AvatarURL,
			&m.NameStyle,
			&m.Look,
			&m.IsBot,
			&m.Nickname,
			&m.Role,
			&m.RoleIDs,
			&m.JoinedAt,
			&m.UpdatedAt,
		); err != nil {
			return nil, err
		}
		members = append(members, m)
	}

	if members == nil {
		members = []ServerMember{}
	}

	return members, nil
}

func (r *Repository) IsMember(ctx context.Context, serverID string, userID string) (bool, error) {
	var exists bool
	err := r.db.QueryRow(
		ctx,
		`SELECT EXISTS(SELECT 1 FROM server_members WHERE server_id = $1 AND user_id = $2)`,
		serverID,
		userID,
	).Scan(&exists)
	return exists, err
}

func (r *Repository) FindMemberByUserID(ctx context.Context, serverID string, userID string) (*ServerMember, error) {
	m := &ServerMember{}
	err := r.db.QueryRow(
		ctx,
		`
		SELECT
			sm.server_id,
			sm.user_id,
			u.username,
			u.display_name,
			u.avatar_url,
			`+namestyle.Expr("u")+`,
			`+cosmetics.Expr("u")+`,
			u.is_bot,
			sm.nickname,
			`+legacyRoleColumn+`,
			`+memberRoleIDsColumn+`,
			sm.joined_at,
			sm.updated_at
		FROM server_members sm
		JOIN users u ON u.id = sm.user_id
		WHERE sm.server_id = $1 AND sm.user_id = $2
		`,
		serverID,
		userID,
	).Scan(
		&m.ServerID,
		&m.UserID,
		&m.Username,
		&m.DisplayName,
		&m.AvatarURL,
		&m.NameStyle,
		&m.Look,
		&m.IsBot,
		&m.Nickname,
		&m.Role,
		&m.RoleIDs,
		&m.JoinedAt,
		&m.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}
	return m, nil
}
