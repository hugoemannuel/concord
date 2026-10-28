package channel

import (
	"context"

	"gin-quickstart/backend/internal/audit"

	"github.com/jackc/pgx/v5"
)

type sectionChannel struct {
	ID   string
	Name string
}

// Reorder grava a nova ordem dos canais de um tipo do servidor numa transação:
// trava os canais da seção, confere que ids é exatamente eles (ValidateOrder)
// e grava position = índice em ids.
func (r *Repository) Reorder(ctx context.Context, serverID string, chType string, ids []string, mark *audit.Mark) error {
	return audit.Tx(ctx, r.db, func(tx pgx.Tx) (*audit.Event, error) {
		current, err := lockSection(ctx, tx, serverID, chType)
		if err != nil {
			return nil, err
		}
		currentIDs := make([]string, 0, len(current))
		names := make(map[string]string, len(current))
		beforeNames := make([]string, 0, len(current))
		for _, c := range current {
			currentIDs = append(currentIDs, c.ID)
			names[c.ID] = c.Name
			beforeNames = append(beforeNames, c.Name)
		}

		if err := ValidateOrder(currentIDs, ids); err != nil {
			return nil, err
		}

		if _, err := tx.Exec(
			ctx,
			`
			UPDATE channels AS c
			SET position = o.ord - 1
			FROM unnest($1::text[]) WITH ORDINALITY AS o(id, ord)
			WHERE c.id = o.id::uuid
			`,
			ids,
		); err != nil {
			return nil, err
		}

		afterNames := make([]string, 0, len(ids))
		for _, id := range ids {
			afterNames = append(afterNames, names[id])
		}
		changes := audit.Diff(nil, "order", beforeNames, afterNames)
		if len(changes) == 0 {
			return nil, nil
		}
		return mark.Event(audit.TargetSection, "", chType, changes), nil
	})
}

// lockSection trava os canais do tipo no servidor e devolve-os na ordem atual.
func lockSection(ctx context.Context, tx pgx.Tx, serverID, chType string) ([]sectionChannel, error) {
	rows, err := tx.Query(
		ctx,
		`SELECT id, name FROM channels WHERE server_id = $1 AND type = $2 ORDER BY position, created_at, name FOR UPDATE`,
		serverID,
		chType,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var section []sectionChannel
	for rows.Next() {
		var c sectionChannel
		if err := rows.Scan(&c.ID, &c.Name); err != nil {
			return nil, err
		}
		section = append(section, c)
	}
	return section, rows.Err()
}
