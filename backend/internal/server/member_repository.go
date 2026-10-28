package server

import (
	"context"
	"errors"

	"gin-quickstart/backend/internal/audit"
	"gin-quickstart/backend/internal/namestyle"

	"github.com/jackc/pgx/v5"
)

// AddingUserServer põe o usuário no servidor e registra a entrada na mesma transação.
func (r *Repository) AddingUserServer(
	ctx context.Context,
	server *Server,
	serverMember *ServerMember,
	userID string,
	role string,
	mark *audit.Mark,
) error {
	return audit.Tx(ctx, r.db, func(tx pgx.Tx) (*audit.Event, error) {
		err := tx.QueryRow(
			ctx,
			`
			INSERT INTO server_members (
				server_id,
				user_id,
				role
			)
			VALUES ($1, $2, $3)
			RETURNING
				server_id,
				user_id,
				role,
				joined_at,
				updated_at
			`,
			server.ID,
			userID,
			role,
		).Scan(
			&serverMember.ServerID,
			&serverMember.UserID,
			&serverMember.Role,
			&serverMember.JoinedAt,
			&serverMember.UpdatedAt,
		)
		if err != nil {
			return nil, err
		}
		return mark.Event(audit.TargetMember, userID, "", nil), nil
	})
}

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
			` + namestyle.Expr("u") + `,
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

// SetNickname grava (ou tira, com nil) o apelido do membro no servidor. Devolve
// false se a pessoa não é membro.
func (r *Repository) SetNickname(ctx context.Context, serverID, userID string, nickname *string, mark *audit.Mark) (bool, error) {
	found := false
	err := audit.Tx(ctx, r.db, func(tx pgx.Tx) (*audit.Event, error) {
		var before *string
		err := tx.QueryRow(
			ctx,
			`SELECT nickname FROM server_members WHERE server_id = $1 AND user_id = $2 FOR UPDATE`,
			serverID, userID,
		).Scan(&before)
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, nil
		}
		if err != nil {
			return nil, err
		}
		found = true
		if _, err := tx.Exec(
			ctx,
			`UPDATE server_members SET nickname = $3, updated_at = NOW() WHERE server_id = $1 AND user_id = $2`,
			serverID, userID, nickname,
		); err != nil {
			return nil, err
		}
		changes := audit.Diff(nil, "nickname", before, nickname)
		if len(changes) == 0 {
			return nil, nil
		}
		return mark.Event(audit.TargetMember, userID, "", changes), nil
	})
	if err != nil {
		return false, err
	}
	return found, nil
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
			` + namestyle.Expr("u") + `,
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

// SharesServer: os dois estão em pelo menos um servidor em comum.
func (r *Repository) SharesServer(ctx context.Context, userA string, userB string) (bool, error) {
	var shares bool
	err := r.db.QueryRow(
		ctx,
		`SELECT EXISTS (
			SELECT 1 FROM server_members a
			JOIN server_members b ON a.server_id = b.server_id
			WHERE a.user_id = $1 AND b.user_id = $2
		)`,
		userA,
		userB,
	).Scan(&shares)
	return shares, err
}

// MutualServers: servidores em que os dois estão (cartão de perfil).
func (r *Repository) MutualServers(ctx context.Context, userA string, userB string) ([]MutualServer, error) {
	rows, err := r.db.Query(
		ctx,
		`SELECT s.id, s.name, s.icon_url
		FROM servers s
		JOIN server_members a ON a.server_id = s.id AND a.user_id = $1
		JOIN server_members b ON b.server_id = s.id AND b.user_id = $2
		ORDER BY s.name`,
		userA,
		userB,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	servers := []MutualServer{}
	for rows.Next() {
		var s MutualServer
		if err := rows.Scan(&s.ID, &s.Name, &s.IconURL); err != nil {
			return nil, err
		}
		servers = append(servers, s)
	}
	return servers, rows.Err()
}

// AddMemberIfMissing põe alguém no servidor sem falhar se já estiver lá.
// Se o usuário for um bot (is_bot = TRUE), vincula também o cargo de sistema (Bots).
func (r *Repository) AddMemberIfMissing(ctx context.Context, serverID string, userID string, role string) error {
	if _, err := r.db.Exec(ctx,
		`INSERT INTO server_members (server_id, user_id, role) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
		serverID, userID, role); err != nil {
		return err
	}
	_, err := r.db.Exec(ctx,
		`INSERT INTO member_roles (server_id, user_id, role_id)
		 SELECT $1, $2, r.id
		 FROM roles r
		 JOIN users u ON u.id = $2
		 WHERE r.server_id = $1 AND r.is_system = TRUE AND u.is_bot = TRUE
		 ON CONFLICT DO NOTHING`,
		serverID, userID)
	return err
}
