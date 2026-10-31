package audit

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Repository é o único lugar com o SQL do registro (server_audit_log).
type Repository struct {
	db *pgxpool.Pool
}

func NewRepository(db *pgxpool.Pool) *Repository {
	return &Repository{db: db}
}

// Insert grava o evento. Sem nome, o alvo (membro, canal ou cargo) e o canal
// de onde aconteceu ganham o nome que têm agora: depois de apagados, o
// registro ainda diz qual era.
func (r *Repository) Insert(ctx context.Context, e Event) error {
	changes, err := json.Marshal(nonNil(e.Changes))
	if err != nil {
		return fmt.Errorf("auditoria: mudanças: %w", err)
	}
	_, err = r.db.Exec(ctx, `
		INSERT INTO server_audit_log
			(server_id, actor_id, action, target_type, target_id, target_name, channel_id, channel_name, changes, reason)
		VALUES (
			$1, NULLIF($2::text, '')::uuid, $3, $4::text, $5::text,
			COALESCE(NULLIF($6::text, ''), CASE $4::text
				WHEN 'member' THEN (SELECT display_name FROM users WHERE id::text = $5::text)
				WHEN 'channel' THEN (SELECT name FROM channels WHERE id::text = $5::text)
				WHEN 'role' THEN (SELECT name FROM roles WHERE id::text = $5::text)
			END, ''),
			$7::text,
			COALESCE((SELECT name FROM channels WHERE id::text = NULLIF($7::text, '')), ''),
			$8::jsonb, $9
		)`,
		e.ServerID, e.ActorID, string(e.Action), e.TargetType, e.TargetID, e.TargetName,
		e.ChannelID, string(changes), e.Reason,
	)
	if err != nil {
		return fmt.Errorf("auditoria: gravar: %w", err)
	}
	return nil
}

func nonNil(changes []Change) []Change {
	if changes == nil {
		return []Change{}
	}
	return changes
}

// List: do mais recente para o mais antigo. O nome (e o avatar) de quem fez e
// o nome de membro-alvo vêm de users na hora: ficam sempre atuais.
func (r *Repository) List(ctx context.Context, serverID string, f Filter) ([]Entry, error) {
	rows, err := r.db.Query(ctx, `
		SELECT l.id, l.action, l.created_at,
			COALESCE(l.actor_id::text, ''), COALESCE(a.display_name, ''), a.avatar_url,
			l.target_type, l.target_id,
			CASE WHEN l.target_type = 'member' THEN COALESCE(t.display_name, l.target_name) ELSE l.target_name END,
			l.channel_id, l.channel_name, l.changes, l.reason
		FROM server_audit_log l
		LEFT JOIN users a ON a.id = l.actor_id
		LEFT JOIN users t ON l.target_type = 'member' AND t.id::text = l.target_id
		WHERE l.server_id = $1
			AND ($2::text = '' OR l.actor_id = NULLIF($2::text, '')::uuid)
			AND ($3::text = '' OR l.action = $3::text)
			AND ($4::bigint = 0 OR l.id < $4::bigint)
		ORDER BY l.id DESC
		LIMIT $5`,
		serverID, f.ActorID, string(f.Action), f.Before, f.Limit,
	)
	if err != nil {
		return nil, fmt.Errorf("auditoria: listar: %w", err)
	}
	return pgx.CollectRows(rows, scanEntry)
}

func scanEntry(row pgx.CollectableRow) (Entry, error) {
	var e Entry
	var changes []byte
	err := row.Scan(&e.ID, &e.Action, &e.CreatedAt, &e.ActorID, &e.ActorName, &e.ActorAvatar,
		&e.TargetType, &e.TargetID, &e.TargetName, &e.ChannelID, &e.ChannelName, &changes, &e.Reason)
	if err != nil {
		return e, err
	}
	err = json.Unmarshal(changes, &e.Changes)
	e.Changes = nonNil(e.Changes)
	return e, err
}

// Prune apaga o que é anterior a before (retenção).
func (r *Repository) Prune(ctx context.Context, before time.Time) error {
	if _, err := r.db.Exec(ctx, `DELETE FROM server_audit_log WHERE created_at < $1`, before); err != nil {
		return fmt.Errorf("auditoria: retenção: %w", err)
	}
	return nil
}
