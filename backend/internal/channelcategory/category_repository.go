package channelcategory

import (
	"context"

	"gin-quickstart/backend/internal/permission"
	"github.com/jackc/pgx/v5"
)

// Create cria a categoria e as regras dela numa transação: uma categoria privada
// nunca existe, nem por um instante, aberta.
func (r *Repository) Create(ctx context.Context, server, name string, overwrites []permission.Overwrite) (Category, error) {
	tx, err := r.beginLocked(ctx, server)
	if err != nil {
		return Category{}, err
	}
	defer tx.Rollback(ctx)
	category, err := insertCategory(ctx, tx, server, name)
	if err != nil {
		return Category{}, err
	}
	if err := writeCategoryOverwrites(ctx, tx, category.ID, overwrites); err != nil {
		return Category{}, err
	}
	category.Overwrites = overwrites
	return category, tx.Commit(ctx)
}

func insertCategory(ctx context.Context, tx pgx.Tx, server, name string) (Category, error) {
	category := Category{Name: name}
	err := tx.QueryRow(ctx, `INSERT INTO channel_categories(server_id,name,position)
 SELECT id,$2,COALESCE((SELECT MAX(position)+1 FROM channel_categories WHERE server_id=servers.id),0) FROM servers WHERE id::text=$1
 RETURNING id::text, position`, server, name).Scan(&category.ID, &category.Position)
	return category, err
}

// Update renomeia e troca as regras da categoria de uma vez: os canais vinculados
// recebem as regras novas na mesma transação, e os de permissão própria ficam como estão.
func (r *Repository) Update(ctx context.Context, server, id string, update CategoryUpdate) (CategoryChange, error) {
	tx, err := r.beginLocked(ctx, server)
	if err != nil {
		return CategoryChange{}, err
	}
	defer tx.Rollback(ctx)
	change, err := updateInTx(ctx, tx, server, id, update)
	if err != nil {
		return CategoryChange{}, err
	}
	return change, tx.Commit(ctx)
}

func updateInTx(ctx context.Context, tx pgx.Tx, server, id string, update CategoryUpdate) (CategoryChange, error) {
	before, err := readCategory(ctx, tx, server, id)
	if err != nil {
		return CategoryChange{}, err
	}
	change := CategoryChange{Before: before, After: before}
	if update.Name != "" {
		if _, err := tx.Exec(ctx, `UPDATE channel_categories SET name=$2 WHERE id::text=$1`, id, update.Name); err != nil {
			return change, err
		}
		change.After.Name = update.Name
	}
	if update.Overwrites == nil {
		return change, nil
	}
	return changeOverwrites(ctx, tx, change, update.Overwrites)
}

func changeOverwrites(ctx context.Context, tx pgx.Tx, change CategoryChange, next OverwriteChange) (CategoryChange, error) {
	overwrites, err := next(change.Before.Overwrites)
	if err != nil {
		return change, err
	}
	change.After.Overwrites = overwrites
	if err := writeCategoryOverwrites(ctx, tx, change.Before.ID, overwrites); err != nil {
		return change, err
	}
	change.Synced, err = propagateToLinked(ctx, tx, change.Before, overwrites)
	return change, err
}

// propagateToLinked passa as regras novas para quem ainda seguia as antigas.
func propagateToLinked(ctx context.Context, tx pgx.Tx, before Category, overwrites []permission.Overwrite) (int, error) {
	channels, err := categoryChannels(ctx, tx, before.ID)
	if err != nil {
		return 0, err
	}
	own, err := channelOverwrites(ctx, tx, channelIDs(channels))
	if err != nil {
		return 0, err
	}
	synced := 0
	for _, channel := range channels {
		if channel.Fixed || !permission.SameOverwrites(own[channel.ChannelID], before.Overwrites) {
			continue
		}
		if err := replaceChannelOverwrites(ctx, tx, channel.ChannelID, overwrites); err != nil {
			return synced, err
		}
		synced++
	}
	return synced, nil
}

// Delete apaga a categoria e deixa os canais dela soltos, depois dos que já estavam
// soltos. Nenhum canal é apagado e nenhum abre: quem não via continua sem ver.
func (r *Repository) Delete(ctx context.Context, server, id string) (Category, error) {
	tx, err := r.beginLocked(ctx, server)
	if err != nil {
		return Category{}, err
	}
	defer tx.Rollback(ctx)
	category, err := deleteInTx(ctx, tx, server, id)
	if err != nil {
		return Category{}, err
	}
	return category, tx.Commit(ctx)
}

func deleteInTx(ctx context.Context, tx pgx.Tx, server, id string) (Category, error) {
	if err := prepareLayout(ctx, tx, server); err != nil {
		return Category{}, err
	}
	category, err := readCategory(ctx, tx, server, id)
	if err != nil {
		return Category{}, err
	}
	if err := sealChannels(ctx, tx, server, category); err != nil {
		return Category{}, err
	}
	if _, err := tx.Exec(ctx, `WITH inicio AS (SELECT COALESCE(MAX(position)+1,0) AS n FROM channel_category_layout WHERE server_id::text=$1 AND category_id IS NULL),
 ordem AS (SELECT l.channel_id, ROW_NUMBER() OVER (ORDER BY l.position, c.created_at, c.id) - 1 AS n
   FROM channel_category_layout l JOIN channels c ON c.id=l.channel_id WHERE l.category_id::text=$2)
 UPDATE channel_category_layout l SET category_id=NULL, position=inicio.n+ordem.n FROM ordem, inicio WHERE l.channel_id=ordem.channel_id`, server, id); err != nil {
		return Category{}, err
	}
	_, err = tx.Exec(ctx, `DELETE FROM channel_categories WHERE id::text=$1`, id)
	return category, err
}

// sealChannels: quem tinha permissão própria não pode abrir quando a categoria sumir.
func sealChannels(ctx context.Context, tx pgx.Tx, server string, category Category) error {
	everyone, err := everyoneRole(ctx, tx, server)
	if err != nil {
		return err
	}
	channels, err := categoryChannels(ctx, tx, category.ID)
	if err != nil {
		return err
	}
	own, err := channelOverwrites(ctx, tx, channelIDs(channels))
	if err != nil {
		return err
	}
	for _, channel := range channels {
		rows := own[channel.ChannelID]
		if channel.Fixed || permission.SameOverwrites(rows, category.Overwrites) {
			continue
		}
		sealed := permission.SealOverwrites(rows, category.Overwrites, everyone)
		if err := replaceChannelOverwrites(ctx, tx, channel.ChannelID, sealed); err != nil {
			return err
		}
	}
	return nil
}

// SyncChannel faz o canal seguir de novo as permissões da categoria dele.
func (r *Repository) SyncChannel(ctx context.Context, server, channel string) (Category, error) {
	tx, err := r.beginLocked(ctx, server)
	if err != nil {
		return Category{}, err
	}
	defer tx.Rollback(ctx)
	category, err := syncInTx(ctx, tx, server, channel)
	if err != nil {
		return Category{}, err
	}
	return category, tx.Commit(ctx)
}

func syncInTx(ctx context.Context, tx pgx.Tx, server, channel string) (Category, error) {
	var categoryID *string
	var fixed bool
	err := tx.QueryRow(ctx, `SELECT l.category_id::text, (c.is_system OR c.managed) FROM channels c
 LEFT JOIN channel_category_layout l ON l.channel_id=c.id WHERE c.server_id::text=$1 AND c.id::text=$2`, server, channel).Scan(&categoryID, &fixed)
	if err != nil {
		return Category{}, err
	}
	if fixed {
		return Category{}, ErrFixedChannel
	}
	if categoryID == nil {
		return Category{}, ErrNoCategory
	}
	category, err := readCategory(ctx, tx, server, *categoryID)
	if err != nil {
		return Category{}, err
	}
	return category, replaceChannelOverwrites(ctx, tx, channel, category.Overwrites)
}

// CreateDefaults: as duas categorias de um servidor novo, com os canais dele dentro.
func (r *Repository) CreateDefaults(ctx context.Context, server string) error {
	tx, err := r.beginLocked(ctx, server)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	if err := prepareLayout(ctx, tx, server); err != nil {
		return err
	}
	for _, standard := range []struct{ kind, name string }{{"text", DefaultTextCategory}, {"voice", DefaultVoiceCategory}} {
		category, err := insertCategory(ctx, tx, server, standard.name)
		if err != nil {
			return err
		}
		if _, err := tx.Exec(ctx, `WITH ordem AS (SELECT l.channel_id, ROW_NUMBER() OVER (ORDER BY l.position, c.created_at, c.id) - 1 AS n
   FROM channel_category_layout l JOIN channels c ON c.id=l.channel_id WHERE l.server_id::text=$1 AND l.category_id IS NULL AND c.type=$2)
 UPDATE channel_category_layout l SET category_id=$3::uuid, position=ordem.n FROM ordem WHERE l.channel_id=ordem.channel_id`, server, standard.kind, category.ID); err != nil {
			return err
		}
	}
	return tx.Commit(ctx)
}
