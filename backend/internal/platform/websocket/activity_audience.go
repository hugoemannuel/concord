package websocket

import (
	"context"
	"time"

	"github.com/jackc/pgx/v5"
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
	return pgx.CollectRows(rows, pgx.RowTo[string])
}

const (
	// audienceTTL: quanto o público consultado vale. Curto: amizade desfeita,
	// bloqueio ou saída do servidor valem em segundos; a troca de música ou de
	// jogo seguida (e a busca ao abrir servidores) não repete a consulta.
	audienceTTL      = 5 * time.Second
	audienceCacheMax = 4096
)

// cachedAudience guarda por pouco tempo o público de cada usuário. Erro não
// fica guardado: a próxima chamada consulta de novo.
type cachedAudience struct {
	inner AudienceProvider
	cache *ttlCache[string, []string]
}

// NewCachedAudience põe o cache curto na frente de inner.
func NewCachedAudience(inner AudienceProvider) AudienceProvider {
	return newCachedAudience(inner, time.Now)
}

func newCachedAudience(inner AudienceProvider, now func() time.Time) *cachedAudience {
	return &cachedAudience{inner: inner, cache: newTTLCache[string, []string](audienceCacheMax, now)}
}

func (c *cachedAudience) Audience(ctx context.Context, userID string) ([]string, error) {
	if ids, ok := c.cache.Get(userID); ok {
		return ids, nil
	}
	ids, err := c.inner.Audience(ctx, userID)
	if err != nil {
		return nil, err
	}
	c.cache.Set(userID, ids, audienceTTL)
	return ids, nil
}

// userRooms: as salas pessoais de ids, sem repetir.
func userRooms(ids []string) []string {
	seen := make(map[string]struct{}, len(ids))
	rooms := make([]string, 0, len(ids))
	for _, id := range ids {
		if _, ok := seen[id]; ok {
			continue
		}
		seen[id] = struct{}{}
		rooms = append(rooms, "user:"+id)
	}
	return rooms
}
