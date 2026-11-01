package auth

import (
	"context"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"
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

// SaveRefreshToken grava só o hash (hashRefreshToken) do token.
func (r *Repository) SaveRefreshToken(ctx context.Context, id, tokenHash, userID string, expiresAt time.Time) error {
	_, err := r.db.Exec(ctx,
		`INSERT INTO refresh_tokens (id, token_hash, user_id, expires_at) VALUES ($1, $2, $3, $4)`,
		id, tokenHash, userID, expiresAt)
	return err
}

// ConsumeRefreshToken apaga o token e devolve o dono, numa instrução só (uso
// único mesmo com dois pedidos ao mesmo tempo). Vencido ou já usado:
// ErrInvalidRefresh.
func (r *Repository) ConsumeRefreshToken(ctx context.Context, tokenHash string) (string, error) {
	var userID string
	err := r.db.QueryRow(ctx,
		`DELETE FROM refresh_tokens WHERE token_hash = $1 AND expires_at > NOW() RETURNING user_id::text`,
		tokenHash).Scan(&userID)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", ErrInvalidRefresh
	}
	return userID, err
}

// DeleteRefreshToken: sair deste dispositivo (só o token dele, da própria conta).
func (r *Repository) DeleteRefreshToken(ctx context.Context, userID, tokenHash string) error {
	_, err := r.db.Exec(ctx, `DELETE FROM refresh_tokens WHERE user_id = $1 AND token_hash = $2`, userID, tokenHash)
	return err
}

func (r *Repository) DeleteAllUserRefreshTokens(ctx context.Context, userID string) error {
	_, err := r.db.Exec(ctx, `DELETE FROM refresh_tokens WHERE user_id = $1`, userID)
	return err
}

// DeleteExpiredRefreshTokens limpa os vencidos (RefreshCleanup).
func (r *Repository) DeleteExpiredRefreshTokens(ctx context.Context, now time.Time) (int64, error) {
	tag, err := r.db.Exec(ctx, `DELETE FROM refresh_tokens WHERE expires_at <= $1`, now)
	return tag.RowsAffected(), err
}

// TokenVersion: a versão atual da sessão; conta inexistente = ErrSessionRevoked.
func (r *Repository) TokenVersion(ctx context.Context, userID string) (int, error) {
	var version int
	err := r.db.QueryRow(ctx, `SELECT token_version FROM users WHERE id = $1`, userID).Scan(&version)
	if errors.Is(err, pgx.ErrNoRows) {
		return 0, ErrSessionRevoked
	}
	return version, err
}

// RevokeAll incrementa a versão e apaga os refresh tokens e os tokens de push
// (aparelho deslogado não recebe mais notificação da conta), numa transação.
func (r *Repository) RevokeAll(ctx context.Context, userID string) error {
	tx, err := r.db.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	if _, err := tx.Exec(ctx, `UPDATE users SET token_version = token_version + 1 WHERE id = $1`, userID); err != nil {
		return err
	}
	for _, sql := range []string{
		`DELETE FROM refresh_tokens WHERE user_id = $1`,
		`DELETE FROM push_tokens WHERE user_id = $1`,
	} {
		if _, err := tx.Exec(ctx, sql, userID); err != nil {
			return err
		}
	}
	return tx.Commit(ctx)
}
