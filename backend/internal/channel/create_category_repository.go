package channel

import (
	"context"
	"errors"

	"gin-quickstart/backend/internal/permission"
	"github.com/jackc/pgx/v5"
)

// insertChannelCategory coloca o canal na organização, junto com a criação: falha
// reverte tudo. Sem categoria, ele entra no fim da lista dos soltos, que é uma só
// para texto e voz.
func insertChannelCategory(ctx context.Context, tx pgx.Tx, ch *Channel, overwrites []permission.Overwrite) error {
	if _, err := tx.Exec(ctx, `SELECT pg_advisory_xact_lock(hashtextextended($1,187))`, ch.ServerID); err != nil {
		return err
	}
	if ch.CategoryID == nil {
		return insertLooseChannel(ctx, tx, ch)
	}
	return insertInCategory(ctx, tx, ch, overwrites)
}

func insertLooseChannel(ctx context.Context, tx pgx.Tx, ch *Channel) error {
	_, err := tx.Exec(ctx, `INSERT INTO channel_category_layout(channel_id,server_id,position)
 SELECT $1,$2,COALESCE((SELECT MAX(position)+1 FROM channel_category_layout WHERE server_id=$2 AND category_id IS NULL),0)`, ch.ID, ch.ServerID)
	return err
}

func insertInCategory(ctx context.Context, tx pgx.Tx, ch *Channel, overwrites []permission.Overwrite) error {
	tag, err := tx.Exec(ctx, `INSERT INTO channel_category_layout(channel_id,server_id,category_id,position)
 SELECT $1,c.server_id,c.id,COALESCE((SELECT MAX(position)+1 FROM channel_category_layout WHERE category_id=c.id),0)
 FROM channel_categories c WHERE c.server_id::text=$2 AND c.id::text=$3`, ch.ID, ch.ServerID, *ch.CategoryID)
	if err := categoryInsertResult(tag.RowsAffected(), err); err != nil {
		return err
	}
	if len(overwrites) > 0 || ch.IsSystem || ch.Managed {
		return nil
	}
	return inheritCategoryOverwrites(ctx, tx, ch)
}

// inheritCategoryOverwrites: canal novo sem regras próprias nasce vinculado: o canal
// de categoria privada nunca existe, nem por um instante, aberto.
func inheritCategoryOverwrites(ctx context.Context, tx pgx.Tx, ch *Channel) error {
	rows, err := tx.Query(ctx, `INSERT INTO channel_overwrites(channel_id,target_type,target_id,allow,deny)
 SELECT $1,target_type,target_id,allow,deny FROM category_overwrites WHERE category_id::text=$2
 RETURNING target_type,target_id::text,allow,deny`, ch.ID, *ch.CategoryID)
	if err != nil {
		return err
	}
	ch.Overwrites, err = pgx.CollectRows(rows, func(row pgx.CollectableRow) (permission.Overwrite, error) {
		overwrite := permission.Overwrite{ChannelID: ch.ID}
		err := row.Scan(&overwrite.TargetType, &overwrite.TargetID, &overwrite.Allow, &overwrite.Deny)
		return overwrite, err
	})
	return err
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
