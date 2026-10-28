package server

import (
	"context"
	"time"

	"gin-quickstart/backend/internal/audit"

	"github.com/jackc/pgx/v5"
)

// Ban: alguém banido do servidor (não entra de novo por convite nem código).
type Ban struct {
	ServerID    string    `json:"server_id"`
	UserID      string    `json:"user_id"`
	Username    string    `json:"username"`
	DisplayName string    `json:"display_name"`
	AvatarURL   *string   `json:"avatar_url,omitempty"`
	BannedBy    *string   `json:"banned_by,omitempty"`
	Reason      *string   `json:"reason,omitempty"`
	CreatedAt   time.Time `json:"created_at"`
}

func (r *Repository) IsBanned(ctx context.Context, serverID, userID string) (bool, error) {
	var banned bool
	err := r.db.QueryRow(
		ctx,
		`SELECT EXISTS(SELECT 1 FROM server_bans WHERE server_id = $1 AND user_id = $2)`,
		serverID,
		userID,
	).Scan(&banned)
	return banned, err
}

// RemoveMember tira o membro (os cargos dele vão junto pelo cascade). Com mark
// nil (o Maestro saindo do servidor) não há registro.
func (r *Repository) RemoveMember(ctx context.Context, serverID, userID string, mark *audit.Mark) error {
	return audit.Tx(ctx, r.db, func(tx pgx.Tx) (*audit.Event, error) {
		tag, err := tx.Exec(ctx, `DELETE FROM server_members WHERE server_id = $1 AND user_id = $2`, serverID, userID)
		if err != nil {
			return nil, err
		}
		if tag.RowsAffected() == 0 {
			return nil, nil
		}
		return mark.Event(audit.TargetMember, userID, "", nil), nil
	})
}

// BanMember grava o banimento e tira o membro numa transação, junto com o registro.
func (r *Repository) BanMember(ctx context.Context, serverID, userID, bannedBy string, reason *string, mark *audit.Mark) error {
	return audit.Tx(ctx, r.db, func(tx pgx.Tx) (*audit.Event, error) {
		if _, err := tx.Exec(
			ctx,
			`
			INSERT INTO server_bans (server_id, user_id, banned_by, reason)
			VALUES ($1, $2, $3, $4)
			ON CONFLICT (server_id, user_id) DO UPDATE SET banned_by = EXCLUDED.banned_by, reason = EXCLUDED.reason
			`,
			serverID, userID, bannedBy, reason,
		); err != nil {
			return nil, err
		}
		if _, err := tx.Exec(ctx, `DELETE FROM server_members WHERE server_id = $1 AND user_id = $2`, serverID, userID); err != nil {
			return nil, err
		}
		// Convite pendente para quem foi banido não vale mais.
		if _, err := tx.Exec(
			ctx,
			`UPDATE server_invites SET status = 'declined', responded_at = NOW() WHERE server_id = $1 AND invitee_id = $2 AND status = 'pending'`,
			serverID, userID,
		); err != nil {
			return nil, err
		}
		return mark.Event(audit.TargetMember, userID, "", nil), nil
	})
}

func (r *Repository) Unban(ctx context.Context, serverID, userID string, mark *audit.Mark) (bool, error) {
	found := false
	err := audit.Tx(ctx, r.db, func(tx pgx.Tx) (*audit.Event, error) {
		tag, err := tx.Exec(ctx, `DELETE FROM server_bans WHERE server_id = $1 AND user_id = $2`, serverID, userID)
		if err != nil {
			return nil, err
		}
		found = tag.RowsAffected() > 0
		if !found {
			return nil, nil
		}
		return mark.Event(audit.TargetMember, userID, "", nil), nil
	})
	return found, err
}

func (r *Repository) ListBans(ctx context.Context, serverID string) ([]Ban, error) {
	rows, err := r.db.Query(
		ctx,
		`
		SELECT b.server_id, b.user_id, u.username, u.display_name, u.avatar_url,
			b.banned_by::text, b.reason, b.created_at
		FROM server_bans b
		JOIN users u ON u.id = b.user_id
		WHERE b.server_id = $1
		ORDER BY b.created_at DESC
		`,
		serverID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	bans := []Ban{}
	for rows.Next() {
		var b Ban
		if err := rows.Scan(&b.ServerID, &b.UserID, &b.Username, &b.DisplayName, &b.AvatarURL, &b.BannedBy, &b.Reason, &b.CreatedAt); err != nil {
			return nil, err
		}
		bans = append(bans, b)
	}
	return bans, rows.Err()
}
