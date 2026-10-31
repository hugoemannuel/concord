package auth

import (
	"context"

	"github.com/jackc/pgx/v5/pgxpool"
)

type Repository struct {
	db *pgxpool.Pool
}

func AuthRepository(db *pgxpool.Pool) *Repository {
	return &Repository{
		db: db,
	}
}

func (r *Repository) SaveRefreshToken(ctx context.Context, id string, token string, userID string, expiresAt interface{}) error {
	_, err := r.db.Exec(
		ctx,
		`
		INSERT INTO refresh_tokens (id, token, user_id, expires_at)
		VALUES ($1, $2, $3, $4)
		`,
		id,
		token,
		userID,
		expiresAt,
	)
	return err
}

func (r *Repository) FindRefreshToken(ctx context.Context, token string) (bool, error) {
	var exists bool
	err := r.db.QueryRow(
		ctx,
		`SELECT EXISTS(SELECT 1 FROM refresh_tokens WHERE token = $1)`,
		token,
	).Scan(&exists)
	return exists, err
}

func (r *Repository) DeleteRefreshToken(ctx context.Context, token string) error {
	_, err := r.db.Exec(
		ctx,
		`DELETE FROM refresh_tokens WHERE token = $1`,
		token,
	)
	return err
}

func (r *Repository) DeleteAllUserRefreshTokens(ctx context.Context, userID string) error {
	_, err := r.db.Exec(
		ctx,
		`DELETE FROM refresh_tokens WHERE user_id = $1`,
		userID,
	)
	return err
}
