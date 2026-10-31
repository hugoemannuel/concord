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
// mesma finalidade (reset de senha, troca de e-mail: só o último link vale).
// Um comando só (atômico): o UPDATE do WITH não enxerga a linha nova.
func (r *Repository) CreateEmailToken(ctx context.Context, userID, purpose, tokenHash string, expiresAt time.Time) error {
	_, err := r.db.Exec(
		ctx,
		`WITH replaced AS (
			UPDATE email_tokens SET used_at = NOW() WHERE user_id = $2 AND purpose = $3 AND used_at IS NULL
		)
		INSERT INTO email_tokens (id, user_id, purpose, token_hash, expires_at) VALUES ($1, $2, $3, $4, $5)`,
		uuid.New().String(), userID, purpose, tokenHash, expiresAt,
	)
	return err
}

// AddEmailToken grava o hash de um token novo sem mexer nos outros: os links
// já enviados continuam valendo até vencer.
func (r *Repository) AddEmailToken(ctx context.Context, userID, purpose, tokenHash string, expiresAt time.Time) error {
	_, err := r.db.Exec(
		ctx,
		`INSERT INTO email_tokens (id, user_id, purpose, token_hash, expires_at) VALUES ($1, $2, $3, $4, $5)`,
		uuid.New().String(), userID, purpose, tokenHash, expiresAt,
	)
	return err
}

// InvalidateEmailTokens invalida os links pendentes da conta, de qualquer
// finalidade (trocou de e-mail: nada mandado ao endereço antigo vale mais).
func (r *Repository) InvalidateEmailTokens(ctx context.Context, userID string) error {
	_, err := r.db.Exec(ctx, `UPDATE email_tokens SET used_at = NOW() WHERE user_id = $1 AND used_at IS NULL`, userID)
	return err
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

// EmailTokenOwner devolve o dono do token em qualquer estado (já usado ou
// vencido); ErrInvalidEmailToken se ele nunca existiu. O "E-mail confirmado!"
// de quem abre o link de novo depende disso: uma limpeza de email_tokens que
// apague os usados faz esse link voltar a dizer "inválido".
func (r *Repository) EmailTokenOwner(ctx context.Context, purpose, tokenHash string) (string, error) {
	var userID string
	err := r.db.QueryRow(
		ctx,
		`SELECT user_id FROM email_tokens WHERE token_hash = $1 AND purpose = $2`,
		tokenHash, purpose,
	).Scan(&userID)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", ErrInvalidEmailToken
	}
	return userID, err
}
