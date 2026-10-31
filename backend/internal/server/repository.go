package server

import (
	"context"
	"fmt"

	"gin-quickstart/backend/internal/namestyle"
	"gin-quickstart/backend/internal/permission"

	"github.com/jackc/pgx/v5/pgxpool"
)

type Repository struct {
	db    *pgxpool.Pool
	perms PermissionCache
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

func (r *Repository) Update(ctx context.Context, id string, name string, iconURL string) error {
	_, err := r.db.Exec(
		ctx,
		`UPDATE servers SET name = $1, icon_url = $2, updated_at = NOW() WHERE id = $3`,
		name,
		iconURL,
		id,
	)
	return err
}

// SetIcon troca o ícone (nil tira) e devolve o antigo (para apagar o arquivo).
func (r *Repository) SetIcon(ctx context.Context, id string, url *string) (*string, error) {
	var old *string
	err := r.db.QueryRow(
		ctx,
		`
		UPDATE servers s SET icon_url = COALESCE($2, ''), updated_at = NOW()
		FROM (SELECT icon_url FROM servers WHERE id = $1 FOR UPDATE) prev
		WHERE s.id = $1
		RETURNING prev.icon_url
		`,
		id,
		url,
	).Scan(&old)
	return old, err
}

func (r *Repository) Delete(ctx context.Context, id string) error {
	_, err := r.db.Exec(ctx, `DELETE FROM servers WHERE id = $1`, id)
	r.invalidatePerms(id)
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

func (r *Repository) CreateInvite(ctx context.Context, invite *ServerInvite) error {
	return r.db.QueryRow(
		ctx,
		`
		INSERT INTO server_invites (id, server_id, inviter_id, invitee_id, status)
		VALUES ($1, $2, $3, $4, 'pending')
		RETURNING
			id,
			server_id,
			inviter_id,
			invitee_id,
			status,
			created_at,
			responded_at
		`,
		invite.ID,
		invite.ServerID,
		invite.InviterID,
		invite.InviteeID,
	).Scan(
		&invite.ID,
		&invite.ServerID,
		&invite.InviterID,
		&invite.InviteeID,
		&invite.Status,
		&invite.CreatedAt,
		&invite.RespondedAt,
	)
}

func (r *Repository) FindPendingInvite(ctx context.Context, serverID string, inviteeID string) (*ServerInvite, error) {
	invite := &ServerInvite{}
	err := r.db.QueryRow(
		ctx,
		`
		SELECT
			id,
			server_id,
			inviter_id,
			invitee_id,
			status,
			created_at,
			responded_at
		FROM server_invites
		WHERE server_id = $1 AND invitee_id = $2 AND status = 'pending'
		`,
		serverID,
		inviteeID,
	).Scan(
		&invite.ID,
		&invite.ServerID,
		&invite.InviterID,
		&invite.InviteeID,
		&invite.Status,
		&invite.CreatedAt,
		&invite.RespondedAt,
	)
	if err != nil {
		return nil, err
	}
	return invite, nil
}

func (r *Repository) FindInviteByID(ctx context.Context, id string) (*ServerInvite, error) {
	invite := &ServerInvite{}
	err := r.db.QueryRow(
		ctx,
		`
		SELECT
			id,
			server_id,
			inviter_id,
			invitee_id,
			status,
			created_at,
			responded_at
		FROM server_invites
		WHERE id = $1
		`,
		id,
	).Scan(
		&invite.ID,
		&invite.ServerID,
		&invite.InviterID,
		&invite.InviteeID,
		&invite.Status,
		&invite.CreatedAt,
		&invite.RespondedAt,
	)
	if err != nil {
		return nil, err
	}
	return invite, nil
}

func (r *Repository) ListInvitesByInvitee(ctx context.Context, inviteeID string) ([]ServerInvite, error) {
	rows, err := r.db.Query(
		ctx,
		`
		SELECT
			si.id,
			si.server_id,
			s.name,
			s.icon_url,
			si.inviter_id,
			u.username,
			si.invitee_id,
			si.status,
			si.created_at,
			si.responded_at
		FROM server_invites si
		JOIN servers s ON s.id = si.server_id
		JOIN users u ON u.id = si.inviter_id
		WHERE si.invitee_id = $1
		AND si.status = 'pending'
		ORDER BY si.created_at DESC
		`,
		inviteeID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var invites []ServerInvite
	for rows.Next() {
		var i ServerInvite
		if err := rows.Scan(
			&i.ID,
			&i.ServerID,
			&i.ServerName,
			&i.ServerIconURL,
			&i.InviterID,
			&i.InviterUsername,
			&i.InviteeID,
			&i.Status,
			&i.CreatedAt,
			&i.RespondedAt,
		); err != nil {
			return nil, err
		}
		invites = append(invites, i)
	}

	if invites == nil {
		invites = []ServerInvite{}
	}

	return invites, nil
}

func (r *Repository) ListInvitesByServer(ctx context.Context, serverID string) ([]ServerInvite, error) {
	rows, err := r.db.Query(
		ctx,
		`
		SELECT
			si.id,
			si.server_id,
			s.name,
			s.icon_url,
			si.inviter_id,
			u_inviter.username,
			si.invitee_id,
			u_invitee.username,
			si.status,
			si.created_at,
			si.responded_at
		FROM server_invites si
		JOIN servers s ON s.id = si.server_id
		JOIN users u_inviter ON u_inviter.id = si.inviter_id
		JOIN users u_invitee ON u_invitee.id = si.invitee_id
		WHERE si.server_id = $1
		AND si.status = 'pending'
		ORDER BY si.created_at DESC
		`,
		serverID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var invites []ServerInvite
	for rows.Next() {
		var i ServerInvite
		if err := rows.Scan(
			&i.ID,
			&i.ServerID,
			&i.ServerName,
			&i.ServerIconURL,
			&i.InviterID,
			&i.InviterUsername,
			&i.InviteeID,
			&i.InviteeUsername,
			&i.Status,
			&i.CreatedAt,
			&i.RespondedAt,
		); err != nil {
			return nil, err
		}
		invites = append(invites, i)
	}

	if invites == nil {
		invites = []ServerInvite{}
	}

	return invites, nil
}

func (r *Repository) UpdateInviteStatus(ctx context.Context, id string, status string) error {
	_, err := r.db.Exec(
		ctx,
		`
		UPDATE server_invites
		SET status = $2, responded_at = NOW()
		WHERE id = $1
		`,
		id,
		status,
	)
	return err
}

// InviteCode devolve o código de convite do servidor ("" se ainda não tem).
func (r *Repository) InviteCode(ctx context.Context, serverID string) (string, error) {
	var code *string
	err := r.db.QueryRow(ctx, `SELECT invite_code FROM servers WHERE id = $1`, serverID).Scan(&code)
	if err != nil || code == nil {
		return "", err
	}
	return *code, nil
}

// SetInviteCodeIfMissing grava o código só se o servidor ainda não tem um
// (duas pessoas abrindo "Convidar" ao mesmo tempo recebem o mesmo código).
func (r *Repository) SetInviteCodeIfMissing(ctx context.Context, serverID string, code string) error {
	_, err := r.db.Exec(
		ctx,
		`UPDATE servers SET invite_code = $2 WHERE id = $1 AND invite_code IS NULL`,
		serverID,
		code,
	)
	return err
}

// SetInviteCode troca o código do servidor ("Gerar novo link").
func (r *Repository) SetInviteCode(ctx context.Context, serverID string, code string) error {
	_, err := r.db.Exec(ctx, `UPDATE servers SET invite_code = $2 WHERE id = $1`, serverID, code)
	return err
}

func (r *Repository) FindIDByInviteCode(ctx context.Context, code string) (string, error) {
	var id string
	err := r.db.QueryRow(ctx, `SELECT id FROM servers WHERE invite_code = $1`, code).Scan(&id)
	return id, err
}

// InvitePreview: servidor do código e os ids dos membros (para contar e ver
// quem está online). Sem servidor com esse código, pgx.ErrNoRows.
func (r *Repository) InvitePreview(ctx context.Context, code string) (*InvitePreview, []string, error) {
	p := &InvitePreview{}
	var iconURL *string
	var memberIDs []string
	err := r.db.QueryRow(
		ctx,
		`SELECT
			s.id,
			s.name,
			NULLIF(s.icon_url, ''),
			COALESCE((SELECT array_agg(sm.user_id::text) FROM server_members sm WHERE sm.server_id = s.id), '{}')
		FROM servers s
		WHERE s.invite_code = $1`,
		code,
	).Scan(&p.ServerID, &p.Name, &iconURL, &memberIDs)
	if err != nil {
		return nil, nil, err
	}
	p.IconURL = iconURL
	return p, memberIDs, nil
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
