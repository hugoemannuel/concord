package apptheme

import (
	"context"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Repository struct {
	db *pgxpool.Pool
}

func NewRepository(db *pgxpool.Pool) *Repository {
	return &Repository{db: db}
}

// Themes devolve os temas da pessoa (lista vazia se ela nunca salvou).
func (r *Repository) Themes(ctx context.Context, userID string) ([]Theme, error) {
	themes := []Theme{}
	err := r.db.QueryRow(ctx, `SELECT themes FROM user_app_themes WHERE user_id = $1`, userID).Scan(&themes)
	if errors.Is(err, pgx.ErrNoRows) {
		return []Theme{}, nil
	}
	if err != nil {
		return nil, fmt.Errorf("ler temas do app: %w", err)
	}
	return themes, nil
}

func (r *Repository) SaveThemes(ctx context.Context, userID string, themes []Theme) error {
	_, err := r.db.Exec(ctx,
		`INSERT INTO user_app_themes (user_id, themes) VALUES ($1, $2)
		 ON CONFLICT (user_id) DO UPDATE SET themes = EXCLUDED.themes, updated_at = NOW()`,
		userID, themes)
	if err != nil {
		return fmt.Errorf("salvar temas do app: %w", err)
	}
	return nil
}
