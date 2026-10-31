package user

import (
	"context"

	"gin-quickstart/backend/internal/cosmetics"
)

// SetDecoration troca a URL da moldura e devolve a anterior.
func (r *Repository) SetDecoration(ctx context.Context, id string, url *string) (*User, *string, error) {
	return r.swapMedia(ctx, id, "avatar_decoration_url", url)
}

// SetNameplate troca a imagem própria da faixa, ajusta o modo
// (cosmetics.ModeAfterSet) e devolve a imagem anterior, numa transação.
func (r *Repository) SetNameplate(ctx context.Context, id string, url *string) (*User, *string, error) {
	tx, err := r.db.Begin(ctx)
	if err != nil {
		return nil, nil, err
	}
	defer tx.Rollback(ctx)

	var (
		old  *string
		mode string
	)
	if err := tx.QueryRow(ctx, `SELECT nameplate_url, nameplate_mode FROM users WHERE id = $1 FOR UPDATE`, id).Scan(&old, &mode); err != nil {
		return nil, nil, err
	}
	user, err := scanUser(tx.QueryRow(
		ctx,
		`UPDATE users SET nameplate_url = $2, nameplate_mode = $3, updated_at = NOW() WHERE id = $1 RETURNING `+userColumns,
		id, url, cosmetics.ModeAfterSet(mode, url),
	))
	if err != nil {
		return nil, nil, err
	}
	if err := tx.Commit(ctx); err != nil {
		return nil, nil, err
	}
	return user, old, nil
}

// SetNameplateMode grava o modo da faixa (o service já validou).
func (r *Repository) SetNameplateMode(ctx context.Context, id, mode string) (*User, error) {
	return scanUser(r.db.QueryRow(
		ctx,
		`UPDATE users SET nameplate_mode = $2, updated_at = NOW() WHERE id = $1 RETURNING `+userColumns,
		id, mode,
	))
}
