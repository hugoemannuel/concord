package audit

import (
	"context"
	"encoding/json"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// Entry é uma linha do registro como a API devolve.
type Entry struct {
	ID         int64     `json:"id"`
	Action     Action    `json:"action"`
	CreatedAt  time.Time `json:"created_at"`
	ActorID    *string   `json:"actor_id"`
	ActorName  *string   `json:"actor_name"`
	TargetType string    `json:"target_type"`
	TargetID   string    `json:"target_id"`
	TargetName string    `json:"target_name"`
	Changes    []Change  `json:"changes"`
	Result     string    `json:"result"`
	Reason     string    `json:"reason,omitempty"`
}

// Filter: ActorID e Action vazios não filtram; Before 0 começa pelo mais recente.
type Filter struct {
	ActorID string
	Action  Action
	Before  int64
	Limit   int
}

type Repository struct {
	db *pgxpool.Pool
}

func AuditRepository(db *pgxpool.Pool) *Repository {
	return &Repository{db: db}
}

// List: registros do servidor do mais recente para o mais antigo. O nome de
// quem age e o de membro-alvo vêm de users na hora (nome atual); quem saiu da
// conta mantém o id e fica sem nome.
func (r *Repository) List(ctx context.Context, serverID string, f Filter) ([]Entry, error) {
	rows, err := r.db.Query(
		ctx,
		`
		SELECT
			l.id,
			l.action,
			l.created_at,
			l.actor_id::text,
			a.display_name,
			l.target_type,
			l.target_id,
			CASE WHEN l.target_type = 'member' THEN COALESCE(t.display_name, l.target_name) ELSE l.target_name END,
			l.changes,
			l.result,
			COALESCE(l.reason, '')
		FROM server_audit_logs l
		LEFT JOIN users a ON a.id = l.actor_id
		LEFT JOIN users t ON l.target_type = 'member' AND t.id::text = l.target_id
		WHERE l.server_id = $1
			AND ($2::text = '' OR l.actor_id::text = $2::text)
			AND ($3::text = '' OR l.action = $3::text)
			AND ($4::bigint = 0 OR (l.created_at, l.id) < (
				SELECT cursor.created_at, cursor.id FROM server_audit_logs cursor
				WHERE cursor.server_id = $1 AND cursor.id = $4::bigint
			))
		ORDER BY l.created_at DESC, l.id DESC
		LIMIT $5::bigint
		`,
		serverID, f.ActorID, string(f.Action), f.Before, f.Limit,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	entries := []Entry{}
	for rows.Next() {
		var e Entry
		var action string
		var changes []byte
		if err := rows.Scan(
			&e.ID, &action, &e.CreatedAt, &e.ActorID, &e.ActorName,
			&e.TargetType, &e.TargetID, &e.TargetName, &changes, &e.Result, &e.Reason,
		); err != nil {
			return nil, err
		}
		e.Action = Action(action)
		if len(changes) > 0 {
			if err := json.Unmarshal(changes, &e.Changes); err != nil {
				return nil, err
			}
		}
		if e.Changes == nil {
			e.Changes = []Change{}
		}
		entries = append(entries, e)
	}
	return entries, rows.Err()
}
