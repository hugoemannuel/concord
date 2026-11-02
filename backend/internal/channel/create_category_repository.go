package channel

import (
	"context"
	"errors"

	"github.com/jackc/pgx/v5"
)

// A categoria é validada e gravada junto com o canal: falha reverte a criação.
func insertChannelCategory(ctx context.Context, tx pgx.Tx, ch *Channel) error {
	if ch.CategoryID == nil {
		return nil
	}
	if _, err := tx.Exec(ctx, `SELECT pg_advisory_xact_lock(hashtextextended($1,187))`, ch.ServerID); err != nil {
		return err
	}
	tag, err := tx.Exec(ctx, `INSERT INTO channel_category_layout(channel_id,server_id,category_id,position)
 SELECT $1,c.server_id,c.id,COALESCE((SELECT MAX(position)+1 FROM channel_category_layout WHERE category_id=c.id),0)
 FROM channel_categories c WHERE c.server_id::text=$2 AND c.id::text=$3`, ch.ID, ch.ServerID, *ch.CategoryID)
	return categoryInsertResult(tag.RowsAffected(), err)
}

func categoryInsertResult(count int64, err error) error {
	if err != nil {
		return err
	}
	if count == 0 {
		return errors.New("categoria não encontrada neste servidor")
	}
	return nil
}
