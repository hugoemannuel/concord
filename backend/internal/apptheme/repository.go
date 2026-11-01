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

// ThemesWithImages devolve, de todas as pessoas, os temas que têm imagem de
// fundo (para a faxina das imagens não apagar as que estão em uso).
func (r *Repository) ThemesWithImages(ctx context.Context) ([]Theme, error) {
	rows, err := r.db.Query(ctx,
		`SELECT t FROM user_app_themes u, jsonb_array_elements(u.themes) t WHERE COALESCE(t->>'image', '') <> ''`)
	if err != nil {
		return nil, fmt.Errorf("listar imagens dos temas: %w", err)
	}
	themes, err := pgx.CollectRows(rows, pgx.RowTo[Theme])
	if err != nil {
		return nil, fmt.Errorf("listar imagens dos temas: %w", err)
	}
	return themes, nil
}
