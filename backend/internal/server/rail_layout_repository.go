package server

import (
	"context"
	"encoding/json"
	"errors"

	"github.com/jackc/pgx/v5"
)

func parseRailLayoutRow(raw []byte, err error) ([]RailLayoutItem, error) {
	if errors.Is(err, pgx.ErrNoRows) {
		return []RailLayoutItem{}, nil
	}
	if err != nil {
		return nil, err
	}
	var items []RailLayoutItem
	if err := json.Unmarshal(raw, &items); err != nil {
		return []RailLayoutItem{}, nil
	}
	return items, nil
}

func encodeRailLayoutItems(items []RailLayoutItem) ([]byte, error) {
	if items == nil {
		items = []RailLayoutItem{}
	}
	return json.Marshal(items)
}

// GetRailLayout lê o layout salvo da barra lateral da pessoa (sem linha = lista vazia).
func (r *Repository) GetRailLayout(ctx context.Context, userID string) ([]RailLayoutItem, error) {
	var raw []byte
	err := r.db.QueryRow(
		ctx,
		`SELECT items FROM user_server_layouts WHERE user_id = $1`,
		userID,
	).Scan(&raw)
	return parseRailLayoutRow(raw, err)
}

// SetRailLayout grava o layout da barra lateral da pessoa.
func (r *Repository) SetRailLayout(ctx context.Context, userID string, items []RailLayoutItem) error {
	raw, err := encodeRailLayoutItems(items)
	if err != nil {
		return err
	}
	_, err = r.db.Exec(
		ctx,
		`INSERT INTO user_server_layouts (user_id, items, updated_at)
		 VALUES ($1, $2, NOW())
		 ON CONFLICT (user_id) DO UPDATE
		 SET items = EXCLUDED.items, updated_at = NOW()`,
		userID,
		raw,
	)
	return err
}
