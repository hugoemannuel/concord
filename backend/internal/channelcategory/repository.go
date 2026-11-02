package channelcategory

import (
	"context"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Repository struct{ db *pgxpool.Pool }

func NewRepository(db *pgxpool.Pool) *Repository { return &Repository{db: db} }

func (r *Repository) List(ctx context.Context, server string) (Layout, error) {
	categories, err := r.listCategories(ctx, server)
	if err != nil {
		return Layout{}, err
	}
	channels, err := r.listChannels(ctx, server)
	return Layout{Categories: categories, Channels: channels}, err
}

func (r *Repository) listCategories(ctx context.Context, server string) ([]Category, error) {
	rows, err := r.db.Query(ctx, `SELECT id::text, name, position FROM channel_categories WHERE server_id::text=$1 ORDER BY position, id`, server)
	if err != nil {
		return nil, err
	}
	return pgx.CollectRows(rows, pgx.RowToStructByName[Category])
}

func (r *Repository) listChannels(ctx context.Context, server string) ([]Placement, error) {
	rows, err := r.db.Query(ctx, `SELECT c.id::text AS channel_id, l.category_id::text AS category_id, COALESCE(l.position,c.position) AS position
 FROM channels c LEFT JOIN channel_category_layout l ON l.channel_id=c.id WHERE c.server_id::text=$1 ORDER BY COALESCE(l.position,c.position), c.created_at, c.id`, server)
	if err != nil {
		return nil, err
	}
	return pgx.CollectRows(rows, pgx.RowToStructByName[Placement])
}

func (r *Repository) Create(ctx context.Context, server, name string) error {
	_, err := r.db.Exec(ctx, `INSERT INTO channel_categories(server_id,name,position) SELECT id,$2,COALESCE((SELECT MAX(position)+1 FROM channel_categories WHERE server_id=servers.id),0) FROM servers WHERE id::text=$1`, server, name)
	return err
}

func affected(tagRows int64, err error) error {
	if err != nil {
		return err
	}
	if tagRows == 0 {
		return pgx.ErrNoRows
	}
	return nil
}

func (r *Repository) Rename(ctx context.Context, server, id, name string) error {
	tag, err := r.db.Exec(ctx, `UPDATE channel_categories SET name=$3 WHERE server_id::text=$1 AND id::text=$2`, server, id, name)
	return affected(tag.RowsAffected(), err)
}
func (r *Repository) Delete(ctx context.Context, server, id string) error {
	tag, err := r.db.Exec(ctx, `DELETE FROM channel_categories WHERE server_id::text=$1 AND id::text=$2`, server, id)
	return affected(tag.RowsAffected(), err)
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
	_, err = tx.Exec(ctx, `UPDATE channel_categories c SET position=o.n-1 FROM unnest($1::text[]) WITH ORDINALITY o(id,n) WHERE c.id::text=o.id AND c.server_id::text=$2`, ids, server)
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
