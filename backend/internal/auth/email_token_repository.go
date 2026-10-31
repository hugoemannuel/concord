package auth

import (
	"context"
	"errors"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

// Tokens dos links enviados por e-mail (tabela email_tokens): só o sha256 fica
// no banco.

// CreateEmailToken grava o hash de um token novo e invalida os pendentes da
// mesma finalidade (só o último e-mail enviado vale).
func (r *Repository) CreateEmailToken(ctx context.Context, userID, purpose, tokenHash string, expiresAt time.Time) error {
	tx, err := r.db.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	if _, err := tx.Exec(
		ctx,
		`UPDATE email_tokens SET used_at = NOW() WHERE user_id = $1 AND purpose = $2 AND used_at IS NULL`,
		userID, purpose,
	); err != nil {
		return err
	}
	if _, err := tx.Exec(
		ctx,
		`INSERT INTO email_tokens (id, user_id, purpose, token_hash, expires_at) VALUES ($1, $2, $3, $4, $5)`,
		uuid.New().String(), userID, purpose, tokenHash, expiresAt,
	); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

// ConsumeEmailToken usa o token de uma vez só (UPDATE atômico): dois pedidos
// com o mesmo link não passam os dois.
func (r *Repository) ConsumeEmailToken(ctx context.Context, purpose, tokenHash string) (string, error) {
	var userID string
	err := r.db.QueryRow(
		ctx,
		`UPDATE email_tokens SET used_at = NOW()
		WHERE token_hash = $1 AND purpose = $2 AND used_at IS NULL AND expires_at > NOW()
		RETURNING user_id`,
		tokenHash, purpose,
	).Scan(&userID)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", ErrInvalidEmailToken
	}
	return userID, err
}
