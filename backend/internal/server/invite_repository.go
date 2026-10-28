package server

import (
	"context"

	"gin-quickstart/backend/internal/audit"

	"github.com/jackc/pgx/v5"
)

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

// SetInviteCode troca o código do servidor ("Gerar novo link"). O registro
// guarda a ação, nunca o código.
func (r *Repository) SetInviteCode(ctx context.Context, serverID string, code string, mark *audit.Mark) error {
	return audit.Tx(ctx, r.db, func(tx pgx.Tx) (*audit.Event, error) {
		if _, err := tx.Exec(ctx, `UPDATE servers SET invite_code = $2 WHERE id = $1`, serverID, code); err != nil {
			return nil, err
		}
		return mark.Event(audit.TargetServer, serverID, "", nil), nil
	})
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
