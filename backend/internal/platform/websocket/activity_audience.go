package websocket

import (
	"context"

	"github.com/jackc/pgx/v5/pgxpool"
)

// Público da atividade (jogo e música): quem pode vê-la.

// AudienceProvider diz quem pode ver a atividade de userID: amigos e quem
// divide servidor com ele (relações simétricas).
type AudienceProvider interface {
	Audience(ctx context.Context, userID string) ([]string, error)
}

func (h *Hub) SetAudience(a AudienceProvider) {
	h.mu.Lock()
	h.audience = a
	h.mu.Unlock()
}

// SQLAudience calcula o público direto no Postgres.
type SQLAudience struct {
	db *pgxpool.Pool
}

func NewSQLAudience(db *pgxpool.Pool) *SQLAudience {
	return &SQLAudience{db: db}
}

// Audience: amigos aceitos e membros de servidores em comum, sem quem bloqueou
// ou foi bloqueado.
func (a *SQLAudience) Audience(ctx context.Context, userID string) ([]string, error) {
	rows, err := a.db.Query(ctx, `
		SELECT id FROM (
			SELECT CASE WHEN requester_id = $1 THEN addressee_id ELSE requester_id END AS id
			FROM friendships
			WHERE status = 'accepted' AND (requester_id = $1 OR addressee_id = $1)
			UNION
			SELECT m2.user_id AS id
			FROM server_members m1
			JOIN server_members m2 ON m2.server_id = m1.server_id
			WHERE m1.user_id = $1 AND m2.user_id <> $1
		) audience
		WHERE NOT EXISTS (
			SELECT 1 FROM user_blocks b
			WHERE (b.blocker_id = $1 AND b.blocked_id = audience.id)
			   OR (b.blocker_id = audience.id AND b.blocked_id = $1)
		)`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var ids []string
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		ids = append(ids, id)
	}
	return ids, rows.Err()
}
