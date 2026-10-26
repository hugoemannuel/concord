package friendship

import (
	"context"

	"gin-quickstart/backend/internal/user"

	"github.com/jackc/pgx/v5/pgxpool"
)

type Repository struct {
	db *pgxpool.Pool
}

func FriendshipRepository(db *pgxpool.Pool) *Repository {
	return &Repository{
		db: db,
	}
}

func (r *Repository) Create(ctx context.Context, requesterID string, addresseeID string) error {
	_, err := r.db.Exec(
		ctx,
		`
		INSERT INTO friendships (requester_id, addressee_id, status)
		VALUES ($1, $2, 'pending')
		`,
		requesterID,
		addresseeID,
	)
	return err
}

func (r *Repository) Find(ctx context.Context, requesterID string, addresseeID string) (*Friendship, error) {
	f := &Friendship{}
	err := r.db.QueryRow(
		ctx,
		`
		SELECT
			requester_id,
			addressee_id,
			status,
			created_at,
			updated_at
		FROM friendships
		WHERE (requester_id = $1 AND addressee_id = $2)
		   OR (requester_id = $2 AND addressee_id = $1)
		`,
		requesterID,
		addresseeID,
	).Scan(
		&f.RequesterID,
		&f.AddresseeID,
		&f.Status,
		&f.CreatedAt,
		&f.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}
	return f, nil
}

func (r *Repository) UpdateStatus(ctx context.Context, requesterID string, addresseeID string, status string) error {
	_, err := r.db.Exec(
		ctx,
		`
		UPDATE friendships
		SET status = $3, updated_at = NOW()
		WHERE requester_id = $1 AND addressee_id = $2
		`,
		requesterID,
		addresseeID,
		status,
	)
	return err
}

func (r *Repository) Delete(ctx context.Context, requesterID string, addresseeID string) error {
	_, err := r.db.Exec(
		ctx,
		`
		DELETE FROM friendships
		WHERE (requester_id = $1 AND addressee_id = $2)
		   OR (requester_id = $2 AND addressee_id = $1)
		`,
		requesterID,
		addresseeID,
	)
	return err
}

func (r *Repository) ListFriends(ctx context.Context, userID string) ([]user.User, error) {
	rows, err := r.db.Query(
		ctx,
		`
		SELECT
			u.id,
			u.username,
			u.display_name,
			u.avatar_url,
			u.name_font,
			u.name_effect,
			u.name_colors,
			u.status_text,
			u.created_at,
			u.updated_at
		FROM friendships f
		JOIN users u ON (
			u.id = CASE
				WHEN f.requester_id = $1 THEN f.addressee_id
				ELSE f.requester_id
			END
		)
		WHERE (f.requester_id = $1 OR f.addressee_id = $1)
		AND f.status = 'accepted'
		ORDER BY u.username
		`,
		userID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var users []user.User
	for rows.Next() {
		var u user.User
		if err := rows.Scan(
			&u.ID,
			&u.Username,
			&u.DisplayName,
			&u.AvatarURL,
			&u.NameStyle.Font,
			&u.NameStyle.Effect,
			&u.NameStyle.Colors,
			&u.StatusText,
			&u.CreatedAt,
			&u.UpdatedAt,
		); err != nil {
			return nil, err
		}
		users = append(users, u)
	}

	if users == nil {
		users = []user.User{}
	}

	return users, nil
}

func (r *Repository) ListPending(ctx context.Context, userID string) ([]PendingRequest, error) {
	rows, err := r.db.Query(
		ctx,
		`
		SELECT
			f.requester_id,
			u.username,
			u.display_name,
			u.avatar_url,
			u.name_font,
			u.name_effect,
			u.name_colors,
			f.created_at
		FROM friendships f
		JOIN users u ON u.id = f.requester_id
		WHERE f.addressee_id = $1
		AND f.status = 'pending'
		ORDER BY f.created_at DESC
		`,
		userID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var requests []PendingRequest
	for rows.Next() {
		var r PendingRequest
		if err := rows.Scan(
			&r.UserID,
			&r.Username,
			&r.DisplayName,
			&r.AvatarURL,
			&r.NameStyle.Font,
			&r.NameStyle.Effect,
			&r.NameStyle.Colors,
			&r.CreatedAt,
		); err != nil {
			return nil, err
		}
		r.Direction = "incoming"
		requests = append(requests, r)
	}

	if requests == nil {
		requests = []PendingRequest{}
	}

	return requests, nil
}

func (r *Repository) ListSent(ctx context.Context, userID string) ([]PendingRequest, error) {
	rows, err := r.db.Query(
		ctx,
		`
		SELECT
			f.addressee_id,
			u.username,
			u.display_name,
			u.avatar_url,
			u.name_font,
			u.name_effect,
			u.name_colors,
			f.created_at
		FROM friendships f
		JOIN users u ON u.id = f.addressee_id
		WHERE f.requester_id = $1
		AND f.status = 'pending'
		ORDER BY f.created_at DESC
		`,
		userID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var requests []PendingRequest
	for rows.Next() {
		var r PendingRequest
		if err := rows.Scan(
			&r.UserID,
			&r.Username,
			&r.DisplayName,
			&r.AvatarURL,
			&r.NameStyle.Font,
			&r.NameStyle.Effect,
			&r.NameStyle.Colors,
			&r.CreatedAt,
		); err != nil {
			return nil, err
		}
		r.Direction = "outgoing"
		requests = append(requests, r)
	}

	if requests == nil {
		requests = []PendingRequest{}
	}

	return requests, nil
}

// Block apaga a amizade/pedido entre os dois e grava o bloqueio, junto.
func (r *Repository) Block(ctx context.Context, blockerID string, blockedID string) error {
	tx, err := r.db.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	if _, err := tx.Exec(
		ctx,
		`DELETE FROM friendships
		WHERE (requester_id = $1 AND addressee_id = $2)
		   OR (requester_id = $2 AND addressee_id = $1)`,
		blockerID,
		blockedID,
	); err != nil {
		return err
	}
	if _, err := tx.Exec(
		ctx,
		`INSERT INTO user_blocks (blocker_id, blocked_id) VALUES ($1, $2)
		ON CONFLICT DO NOTHING`,
		blockerID,
		blockedID,
	); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

// Unblock tira o bloqueio; false se não havia.
func (r *Repository) Unblock(ctx context.Context, blockerID string, blockedID string) (bool, error) {
	tag, err := r.db.Exec(
		ctx,
		`DELETE FROM user_blocks WHERE blocker_id = $1 AND blocked_id = $2`,
		blockerID,
		blockedID,
	)
	if err != nil {
		return false, err
	}
	return tag.RowsAffected() > 0, nil
}

// Blocks diz se a bloqueou b e se b bloqueou a.
func (r *Repository) Blocks(ctx context.Context, a string, b string) (aBlocksB bool, bBlocksA bool, err error) {
	err = r.db.QueryRow(
		ctx,
		`SELECT
			EXISTS (SELECT 1 FROM user_blocks WHERE blocker_id = $1 AND blocked_id = $2),
			EXISTS (SELECT 1 FROM user_blocks WHERE blocker_id = $2 AND blocked_id = $1)`,
		a,
		b,
	).Scan(&aBlocksB, &bBlocksA)
	return aBlocksB, bBlocksA, err
}

func (r *Repository) ListBlocked(ctx context.Context, userID string) ([]user.User, error) {
	return r.listUsers(
		ctx,
		`SELECT u.id, u.username, u.display_name, u.avatar_url, u.name_font, u.name_effect, u.name_colors, u.status_text, u.created_at, u.updated_at
		FROM user_blocks b
		JOIN users u ON u.id = b.blocked_id
		WHERE b.blocker_id = $1
		ORDER BY u.username`,
		userID,
	)
}

// MutualFriends: amigos aceitos dos dois.
func (r *Repository) MutualFriends(ctx context.Context, a string, b string) ([]user.User, error) {
	return r.listUsers(
		ctx,
		`WITH fa AS (
			SELECT CASE WHEN requester_id = $1 THEN addressee_id ELSE requester_id END AS id
			FROM friendships WHERE (requester_id = $1 OR addressee_id = $1) AND status = 'accepted'
		), fb AS (
			SELECT CASE WHEN requester_id = $2 THEN addressee_id ELSE requester_id END AS id
			FROM friendships WHERE (requester_id = $2 OR addressee_id = $2) AND status = 'accepted'
		)
		SELECT u.id, u.username, u.display_name, u.avatar_url, u.name_font, u.name_effect, u.name_colors, u.status_text, u.created_at, u.updated_at
		FROM users u
		WHERE u.id IN (SELECT id FROM fa) AND u.id IN (SELECT id FROM fb)
		ORDER BY u.username`,
		a,
		b,
	)
}

func (r *Repository) listUsers(ctx context.Context, query string, args ...any) ([]user.User, error) {
	rows, err := r.db.Query(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	users := []user.User{}
	for rows.Next() {
		var u user.User
		if err := rows.Scan(&u.ID, &u.Username, &u.DisplayName, &u.AvatarURL, &u.NameStyle.Font, &u.NameStyle.Effect, &u.NameStyle.Colors, &u.StatusText, &u.CreatedAt, &u.UpdatedAt); err != nil {
			return nil, err
		}
		users = append(users, u)
	}
	return users, rows.Err()
}
