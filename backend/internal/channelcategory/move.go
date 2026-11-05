package channelcategory

import (
	"context"

	"github.com/jackc/pgx/v5"
)

// MoveChannel usa um alvo, não a lista fornecida pelo cliente: canais ocultos
// mantêm sua posição relativa e nunca precisam ser enviados ao navegador.
func (r *Repository) MoveChannel(ctx context.Context, server, channel string, category, before *string) error {
	tx, err := r.beginLocked(ctx, server)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	if err = moveChannelInTx(ctx, tx, server, channel, category, before); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

func moveChannelInTx(ctx context.Context, tx pgx.Tx, server, channel string, category, before *string) error {
	if err := prepareLayout(ctx, tx, server); err != nil {
		return err
	}
	if err := validateDestination(ctx, tx, server, channel, category); err != nil {
		return err
	}
	move, err := pendingMove(ctx, tx, channel, category)
	if err != nil {
		return err
	}
	if err := writeChannelOrder(ctx, tx, server, channel, category, before); err != nil {
		return err
	}
	return applyMoves(ctx, tx, server, move)
}

func insertChannel(ids []string, channel string, before *string) ([]string, error) {
	index := len(ids)
	if before != nil {
		index = indexOf(ids, *before)
		if index < 0 {
			return nil, pgx.ErrNoRows
		}
	}
	ids = append(ids, "")
	copy(ids[index+1:], ids[index:])
	ids[index] = channel
	return ids, nil
}

func writeChannelOrder(ctx context.Context, tx pgx.Tx, server, channel string, category, before *string) error {
	ids, err := destinationIDs(ctx, tx, server, channel, category)
	if err != nil {
		return err
	}
	ids, err = insertChannel(ids, channel, before)
	if err != nil {
		return err
	}
	_, err = tx.Exec(ctx, `UPDATE channel_category_layout l SET category_id=(SELECT id FROM channel_categories WHERE server_id::text=$2 AND id::text=$3), position=o.n-1
 FROM unnest($1::text[]) WITH ORDINALITY o(id,n) WHERE l.channel_id::text=o.id AND l.server_id::text=$2`, ids, server, category)
	return err
}

func prepareLayout(ctx context.Context, tx pgx.Tx, server string) error {
	_, err := tx.Exec(ctx, `INSERT INTO channel_category_layout(channel_id,server_id,position) SELECT id,server_id,position FROM channels WHERE server_id::text=$1 ON CONFLICT(channel_id) DO NOTHING`, server)
	return err
}

func validateDestination(ctx context.Context, tx pgx.Tx, server, channel string, category *string) error {
	var exists bool
	err := tx.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM channels WHERE server_id::text=$1 AND id::text=$2) AND ($3::text IS NULL OR EXISTS(SELECT 1 FROM channel_categories WHERE server_id::text=$1 AND id::text=$3))`, server, channel, category).Scan(&exists)
	if err != nil {
		return err
	}
	if !exists {
		return pgx.ErrNoRows
	}
	return nil
}

func destinationIDs(ctx context.Context, tx pgx.Tx, server, channel string, category *string) ([]string, error) {
	rows, err := tx.Query(ctx, `SELECT l.channel_id::text FROM channel_category_layout l JOIN channels c ON c.id=l.channel_id WHERE l.server_id::text=$1 AND l.channel_id::text<>$2 AND l.category_id::text IS NOT DISTINCT FROM $3::text ORDER BY l.position,c.created_at,c.id`, server, channel, category)
	if err != nil {
		return nil, err
	}
	return pgx.CollectRows(rows, pgx.RowTo[string])
}
