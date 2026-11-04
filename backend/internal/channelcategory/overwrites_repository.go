package channelcategory

import (
	"context"
	"errors"

	"gin-quickstart/backend/internal/permission"
	"github.com/jackc/pgx/v5"
)

// As leituras e escritas de regras dentro de uma transação de categoria. Quem está
// vinculado tem as regras copiadas no próprio canal: é assim que o cálculo de
// permissões, os apps antigos e tudo que olha o canal continuam funcionando.

func readCategory(ctx context.Context, tx pgx.Tx, server, id string) (Category, error) {
	category := Category{ID: id}
	err := tx.QueryRow(ctx, `SELECT name, position FROM channel_categories WHERE server_id::text=$1 AND id::text=$2 FOR UPDATE`, server, id).Scan(&category.Name, &category.Position)
	if err != nil {
		return Category{}, err
	}
	rows, err := tx.Query(ctx, `SELECT target_type, target_id::text, allow, deny FROM category_overwrites WHERE category_id::text=$1`, id)
	if err != nil {
		return Category{}, err
	}
	category.Overwrites, err = pgx.CollectRows(rows, scanOverwrite)
	return category, err
}

func scanOverwrite(row pgx.CollectableRow) (permission.Overwrite, error) {
	var overwrite permission.Overwrite
	err := row.Scan(&overwrite.TargetType, &overwrite.TargetID, &overwrite.Allow, &overwrite.Deny)
	return overwrite, err
}

func writeCategoryOverwrites(ctx context.Context, tx pgx.Tx, category string, overwrites []permission.Overwrite) error {
	if _, err := tx.Exec(ctx, `DELETE FROM category_overwrites WHERE category_id::text=$1`, category); err != nil {
		return err
	}
	for _, overwrite := range overwrites {
		if _, err := tx.Exec(ctx, `INSERT INTO category_overwrites(category_id,target_type,target_id,allow,deny) VALUES($1,$2,$3,$4,$5)`,
			category, overwrite.TargetType, overwrite.TargetID, overwrite.Allow, overwrite.Deny); err != nil {
			return err
		}
	}
	return nil
}

func replaceChannelOverwrites(ctx context.Context, tx pgx.Tx, channel string, overwrites []permission.Overwrite) error {
	if _, err := tx.Exec(ctx, `DELETE FROM channel_overwrites WHERE channel_id::text=$1`, channel); err != nil {
		return err
	}
	for _, overwrite := range overwrites {
		if _, err := tx.Exec(ctx, `INSERT INTO channel_overwrites(channel_id,target_type,target_id,allow,deny) VALUES($1,$2,$3,$4,$5)`,
			channel, overwrite.TargetType, overwrite.TargetID, overwrite.Allow, overwrite.Deny); err != nil {
			return err
		}
	}
	return nil
}

func categoryChannels(ctx context.Context, tx pgx.Tx, category string) ([]Placement, error) {
	rows, err := tx.Query(ctx, `SELECT l.channel_id::text AS channel_id, l.category_id::text AS category_id, l.position, (c.is_system OR c.managed) AS fixed
 FROM channel_category_layout l JOIN channels c ON c.id=l.channel_id WHERE l.category_id::text=$1 ORDER BY l.position, c.created_at, c.id`, category)
	if err != nil {
		return nil, err
	}
	return pgx.CollectRows(rows, pgx.RowToStructByName[Placement])
}

func channelIDs(placements []Placement) []string {
	ids := make([]string, len(placements))
	for i, placement := range placements {
		ids[i] = placement.ChannelID
	}
	return ids
}

// channelOverwrites: as regras de cada canal pedido (canal sem regra não aparece).
func channelOverwrites(ctx context.Context, tx pgx.Tx, channels []string) (map[string][]permission.Overwrite, error) {
	rows, err := tx.Query(ctx, `SELECT channel_id::text, target_type, target_id::text, allow, deny FROM channel_overwrites WHERE channel_id::text = ANY($1)`, channels)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	own := make(map[string][]permission.Overwrite, len(channels))
	for rows.Next() {
		var channel string
		var overwrite permission.Overwrite
		if err := rows.Scan(&channel, &overwrite.TargetType, &overwrite.TargetID, &overwrite.Allow, &overwrite.Deny); err != nil {
			return nil, err
		}
		own[channel] = append(own[channel], overwrite)
	}
	return own, rows.Err()
}

// categoriesOverwrites: as regras de cada categoria do servidor.
func categoriesOverwrites(ctx context.Context, tx pgx.Tx, server string) (map[string][]permission.Overwrite, error) {
	rows, err := tx.Query(ctx, `SELECT o.category_id::text, o.target_type, o.target_id::text, o.allow, o.deny FROM category_overwrites o
 JOIN channel_categories c ON c.id=o.category_id WHERE c.server_id::text=$1`, server)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	categories := map[string][]permission.Overwrite{}
	for rows.Next() {
		var category string
		var overwrite permission.Overwrite
		if err := rows.Scan(&category, &overwrite.TargetType, &overwrite.TargetID, &overwrite.Allow, &overwrite.Deny); err != nil {
			return nil, err
		}
		categories[category] = append(categories[category], overwrite)
	}
	return categories, rows.Err()
}

// everyoneRole: o id do @everyone do servidor ("" se o servidor não tem cargos).
func everyoneRole(ctx context.Context, tx pgx.Tx, server string) (string, error) {
	var id string
	err := tx.QueryRow(ctx, `SELECT id::text FROM roles WHERE server_id::text=$1 AND is_default`, server).Scan(&id)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", nil
	}
	return id, err
}

// pendingMove: a troca de categoria que o canal está para fazer (nenhuma, se fica).
func pendingMove(ctx context.Context, tx pgx.Tx, channel string, to *string) ([]channelMove, error) {
	var from *string
	var fixed bool
	err := tx.QueryRow(ctx, `SELECT l.category_id::text, (c.is_system OR c.managed) FROM channels c
 LEFT JOIN channel_category_layout l ON l.channel_id=c.id WHERE c.id::text=$1`, channel).Scan(&from, &fixed)
	if err != nil {
		return nil, err
	}
	if categoryKey(from) == categoryKey(to) {
		return nil, nil
	}
	return []channelMove{{Channel: channel, From: from, To: to, Fixed: fixed}}, nil
}

// applyMoves grava as regras que cada canal movido passa a ter. Roda depois de a
// posição mudar, na mesma transação.
func applyMoves(ctx context.Context, tx pgx.Tx, server string, moves []channelMove) error {
	if len(moves) == 0 {
		return nil
	}
	everyone, err := everyoneRole(ctx, tx, server)
	if err != nil {
		return err
	}
	categories, err := categoriesOverwrites(ctx, tx, server)
	if err != nil {
		return err
	}
	ids := make([]string, len(moves))
	for i, move := range moves {
		ids[i] = move.Channel
	}
	own, err := channelOverwrites(ctx, tx, ids)
	if err != nil {
		return err
	}
	for _, move := range moves {
		if move.Fixed {
			continue
		}
		next := overwritesAfterMove(own[move.Channel], move, categories, everyone)
		if permission.SameOverwrites(next, own[move.Channel]) {
			continue
		}
		if err := replaceChannelOverwrites(ctx, tx, move.Channel, next); err != nil {
			return err
		}
	}
	return nil
}
