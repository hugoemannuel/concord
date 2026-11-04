package channel

import (
	"context"

	"gin-quickstart/backend/internal/permission"
	"github.com/jackc/pgx/v5"
)

func insertChannel(ctx context.Context, tx pgx.Tx, ch *Channel, overwrites []permission.Overwrite) error {
	if err := insertChannelRow(ctx, tx, ch); err != nil {
		return err
	}
	if err := insertChannelCategory(ctx, tx, ch, overwrites); err != nil {
		return err
	}
	return insertChannelOverwrites(ctx, tx, ch.ID, overwrites)
}

func insertChannelRow(ctx context.Context, tx pgx.Tx, ch *Channel) error {
	return tx.QueryRow(ctx, `
 INSERT INTO channels(id,server_id,name,type,created_by,is_system,managed,position)
 VALUES($1,$2,$3,$4::varchar,$5,$6,$7,
 (SELECT COALESCE(MAX(position)+1,0) FROM channels WHERE server_id=$2 AND type=$4::varchar))
 RETURNING id,server_id,name,type,position,is_system,managed,created_by,created_at,updated_at`,
		ch.ID, ch.ServerID, ch.Name, ch.Type, ch.CreatedBy, ch.IsSystem, ch.Managed).Scan(
		&ch.ID, &ch.ServerID, &ch.Name, &ch.Type, &ch.Position, &ch.IsSystem, &ch.Managed, &ch.CreatedBy, &ch.CreatedAt, &ch.UpdatedAt)
}

func insertChannelOverwrites(ctx context.Context, tx pgx.Tx, channelID string, overwrites []permission.Overwrite) error {
	for _, overwrite := range overwrites {
		if err := setOverwrite(ctx, tx, channelID, overwrite); err != nil {
			return err
		}
	}
	return nil
}
