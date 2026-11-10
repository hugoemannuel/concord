package castigo

import (
	"context"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Repository guarda os castigos no banco: o reinício (deploy) não solta
// ninguém antes da hora.
type Repository struct {
	db *pgxpool.Pool
}

func NewRepository(db *pgxpool.Pool) *Repository {
	return &Repository{db: db}
}

// Save grava o castigo da pessoa no servidor (substitui o anterior).
func (r *Repository) Save(ctx context.Context, c Castigo) error {
	_, err := r.db.Exec(ctx, `
		INSERT INTO castigos (server_id, user_id, speak_until, connect_until, listen_until)
		VALUES ($1, $2, $3, $4, $5)
		ON CONFLICT (server_id, user_id) DO UPDATE
		SET speak_until = EXCLUDED.speak_until, connect_until = EXCLUDED.connect_until, listen_until = EXCLUDED.listen_until`,
		c.ServerID, c.UserID, c.SpeakUntil, c.ConnectUntil, c.ListenUntil)
	return err
}

// Delete tira o castigo da pessoa no servidor.
func (r *Repository) Delete(ctx context.Context, serverID, userID string) error {
	_, err := r.db.Exec(ctx, `DELETE FROM castigos WHERE server_id = $1 AND user_id = $2`, serverID, userID)
	return err
}

// Active: os castigos com algum efeito valendo em now.
func (r *Repository) Active(ctx context.Context, now time.Time) ([]Castigo, error) {
	rows, err := r.db.Query(ctx, `
		SELECT server_id, user_id, speak_until, connect_until, listen_until
		FROM castigos
		WHERE speak_until > $1 OR connect_until > $1 OR listen_until > $1`, now)
	if err != nil {
		return nil, err
	}
	return pgx.CollectRows(rows, pgx.RowToStructByPos[Castigo])
}

// DeleteExpired apaga os castigos que já acabaram (os que venceram com o
// servidor fora do ar).
func (r *Repository) DeleteExpired(ctx context.Context, now time.Time) error {
	_, err := r.db.Exec(ctx, `
		DELETE FROM castigos
		WHERE COALESCE(speak_until, '-infinity') <= $1
		  AND COALESCE(connect_until, '-infinity') <= $1
		  AND COALESCE(listen_until, '-infinity') <= $1`, now)
	return err
}
