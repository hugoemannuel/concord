package channelcategory

import (
	"context"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Repository struct{ db *pgxpool.Pool }

func NewRepository(db *pgxpool.Pool) *Repository { return &Repository{db: db} }

// querier: o pool ou uma transação (a gravação lê dentro da trava).
type querier interface {
	Query(ctx context.Context, sql string, args ...any) (pgx.Rows, error)
}

func (r *Repository) List(ctx context.Context, server string) (Layout, error) {
	return readLayout(ctx, r.db, server)
}

func readLayout(ctx context.Context, db querier, server string) (Layout, error) {
	categories, err := listCategories(ctx, db, server)
	if err != nil {
		return Layout{}, err
	}
	channels, err := listChannels(ctx, db, server)
	return Layout{Categories: categories, Channels: channels}, err
}

func listCategories(ctx context.Context, db querier, server string) ([]Category, error) {
	rows, err := db.Query(ctx, `SELECT id::text, name, position FROM channel_categories WHERE server_id::text=$1 ORDER BY position, id`, server)
	if err != nil {
		return nil, err
	}
	return pgx.CollectRows(rows, pgx.RowToStructByName[Category])
}

func listChannels(ctx context.Context, db querier, server string) ([]Placement, error) {
	rows, err := db.Query(ctx, `SELECT c.id::text AS channel_id, l.category_id::text AS category_id, COALESCE(l.position,c.position) AS position, (c.is_system OR c.managed) AS fixed
 FROM channels c LEFT JOIN channel_category_layout l ON l.channel_id=c.id WHERE c.server_id::text=$1 ORDER BY COALESCE(l.position,c.position), c.created_at, c.id`, server)
	if err != nil {
		return nil, err
	}
	return pgx.CollectRows(rows, pgx.RowToStructByName[Placement])
}

func (r *Repository) MoveCategory(ctx context.Context, server, id, direction string) error {
	tx, err := r.beginLocked(ctx, server)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	if err = reorderCategories(ctx, tx, server, id, direction); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

func reorderCategories(ctx context.Context, tx pgx.Tx, server, id, direction string) error {
	ids, err := categoryIDs(ctx, tx, server)
	if err != nil {
		return err
	}
	if err = swapCategory(ids, id, direction); err != nil {
		return err
	}
	return writeCategoryOrder(ctx, tx, server, ids)
}

func writeCategoryOrder(ctx context.Context, tx pgx.Tx, server string, ids []string) error {
	_, err := tx.Exec(ctx, `UPDATE channel_categories c SET position=o.n-1 FROM unnest($1::text[]) WITH ORDINALITY o(id,n) WHERE c.id::text=o.id AND c.server_id::text=$2`, ids, server)
	return err
}

func categoryIDs(ctx context.Context, tx pgx.Tx, server string) ([]string, error) {
	rows, err := tx.Query(ctx, `SELECT id::text FROM channel_categories WHERE server_id::text=$1 ORDER BY position,id FOR UPDATE`, server)
	if err != nil {
		return nil, err
	}
	return pgx.CollectRows(rows, pgx.RowTo[string])
}

func swapCategory(ids []string, id, direction string) error {
	index := indexOf(ids, id)
	if index < 0 {
		return pgx.ErrNoRows
	}
	other := index - 1
	if direction == "down" {
		other = index + 1
	}
	if other < 0 || other >= len(ids) {
		return nil
	}
	ids[index], ids[other] = ids[other], ids[index]
	return nil
}

func indexOf(ids []string, id string) int {
	for i, v := range ids {
		if v == id {
			return i
		}
	}
	return -1
}

func lockServer(ctx context.Context, tx pgx.Tx, server string) error {
	_, err := tx.Exec(ctx, `SELECT pg_advisory_xact_lock(hashtextextended($1, 187))`, server)
	return err
}

func (r *Repository) beginLocked(ctx context.Context, server string) (pgx.Tx, error) {
	tx, err := r.db.Begin(ctx)
	if err != nil {
		return nil, err
	}
	if err = lockServer(ctx, tx, server); err != nil {
		tx.Rollback(ctx)
		return nil, err
	}
	return tx, nil
}
