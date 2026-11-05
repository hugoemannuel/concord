package channelcategory

import (
	"context"

	"github.com/jackc/pgx/v5"
)

// SaveLayout grava a ordem das categorias e dos canais de uma vez: tudo numa
// transação, com o servidor travado (as outras rotas de categoria usam a mesma
// trava) e a revisão conferida depois de travar. De dois pedidos que leram a
// mesma lista, o segundo recebe ErrLayoutConflict em vez de desfazer o primeiro.
func (r *Repository) SaveLayout(ctx context.Context, server string, write LayoutWrite, viewer Viewer) (SaveResult, error) {
	tx, err := r.beginLocked(ctx, server)
	if err != nil {
		return SaveResult{}, err
	}
	defer tx.Rollback(ctx)
	result, err := saveLayoutInTx(ctx, tx, server, write, viewer)
	if err != nil {
		return SaveResult{}, err
	}
	return result, tx.Commit(ctx)
}

func saveLayoutInTx(ctx context.Context, tx pgx.Tx, server string, write LayoutWrite, viewer Viewer) (SaveResult, error) {
	current, err := lockedLayout(ctx, tx, server)
	if err != nil {
		return SaveResult{}, err
	}
	plan, err := planSave(current, viewer, write)
	if err != nil {
		return SaveResult{}, err
	}
	return applyPlan(ctx, tx, server, plan, viewer)
}

// lockedLayout lê a organização depois de garantir que todo canal tem linha e
// de segurar as categorias: excluir uma delas espera esta gravação terminar.
func lockedLayout(ctx context.Context, tx pgx.Tx, server string) (Layout, error) {
	if err := prepareLayout(ctx, tx, server); err != nil {
		return Layout{}, err
	}
	if _, err := categoryIDs(ctx, tx, server); err != nil {
		return Layout{}, err
	}
	return readLayout(ctx, tx, server)
}

func applyPlan(ctx context.Context, tx pgx.Tx, server string, plan layoutPlan, viewer Viewer) (SaveResult, error) {
	if err := writeLayout(ctx, tx, server, plan.categories, plan.placements); err != nil {
		return SaveResult{}, err
	}
	if err := applyMoves(ctx, tx, server, plan.moves); err != nil {
		return SaveResult{}, err
	}
	saved, err := readLayout(ctx, tx, server)
	if err != nil {
		return SaveResult{}, err
	}
	revision := layoutRevision(visibleLayout(saved, viewer))
	return SaveResult{Revision: revision, Changed: revision != plan.seen, Moved: len(plan.moves) > 0}, nil
}

func writeLayout(ctx context.Context, tx pgx.Tx, server string, categories []string, placements []Placement) error {
	if err := writeCategoryOrder(ctx, tx, server, categories); err != nil {
		return err
	}
	channels := make([]string, len(placements))
	groups := make([]*string, len(placements))
	positions := make([]int32, len(placements))
	for i, placement := range placements {
		channels[i], groups[i], positions[i] = placement.ChannelID, placement.CategoryID, int32(placement.Position)
	}
	_, err := tx.Exec(ctx, `UPDATE channel_category_layout l SET category_id=o.category::uuid, position=o.pos
 FROM unnest($1::text[],$2::text[],$3::int[]) AS o(channel,category,pos) WHERE l.channel_id::text=o.channel AND l.server_id::text=$4`, channels, groups, positions, server)
	return err
}
