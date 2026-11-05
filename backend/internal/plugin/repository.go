package plugin

import (
	"context"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Repository é o único lugar com o SQL dos plugins.
type Repository struct {
	db *pgxpool.Pool
}

func NewRepository(db *pgxpool.Pool) *Repository {
	return &Repository{db: db}
}

// pluginCols lista as colunas de plugins (alias p) mais o nome do autor (alias u).
const pluginCols = `p.id, p.name, p.description, p.panel_url, p.icon, p.author_id, u.username,
	p.status, p.review_note, p.reviewed_by::text, p.created_at, p.updated_at`

func scanPlugin(row pgx.Row) (Plugin, error) {
	var p Plugin
	err := row.Scan(&p.ID, &p.Name, &p.Description, &p.PanelURL, &p.Icon, &p.AuthorID, &p.AuthorUsername,
		&p.Status, &p.ReviewNote, &p.ReviewedBy, &p.CreatedAt, &p.UpdatedAt)
	return p, err
}

func scanOne(row pgx.Row) (Plugin, error) {
	p, err := scanPlugin(row)
	if errors.Is(err, pgx.ErrNoRows) {
		return Plugin{}, ErrNotFound
	}
	if err != nil {
		return Plugin{}, fmt.Errorf("plugin: ler: %w", err)
	}
	return p, nil
}

// Create grava a ficha como pendente.
func (r *Repository) Create(ctx context.Context, authorID string, d Draft) (Plugin, error) {
	return scanOne(r.db.QueryRow(ctx, `
		WITH p AS (
			INSERT INTO plugins (name, description, panel_url, icon, author_id)
			VALUES ($1, $2, $3, COALESCE(NULLIF($4, ''), 'quebra-cabeca'), $5) RETURNING *
		)
		SELECT `+pluginCols+` FROM p JOIN users u ON u.id = p.author_id`,
		d.Name, d.Description, d.PanelURL, d.Icon, authorID))
}

func (r *Repository) Get(ctx context.Context, id string) (Plugin, error) {
	return scanOne(r.db.QueryRow(ctx, `
		SELECT `+pluginCols+` FROM plugins p JOIN users u ON u.id = p.author_id WHERE p.id = $1`, id))
}

// List: só as aprovadas, a menos que includeAll. Ordem por nome.
func (r *Repository) List(ctx context.Context, includeAll bool) ([]Plugin, error) {
	rows, err := r.db.Query(ctx, `
		SELECT `+pluginCols+` FROM plugins p JOIN users u ON u.id = p.author_id
		WHERE $1 OR p.status = 'approved'
		ORDER BY p.name, p.created_at`, includeAll)
	if err != nil {
		return nil, fmt.Errorf("plugin: listar: %w", err)
	}
	return pgx.CollectRows(rows, func(row pgx.CollectableRow) (Plugin, error) { return scanPlugin(row) })
}

// SetReview registra a decisão do time (a validação da transição é do service).
func (r *Repository) SetReview(ctx context.Context, id string, status Status, note *string, reviewerID string) (Plugin, error) {
	return scanOne(r.db.QueryRow(ctx, `
		WITH p AS (
			UPDATE plugins SET status = $2, review_note = $3, reviewed_by = $4, updated_at = NOW()
			WHERE id = $1 RETURNING *
		)
		SELECT `+pluginCols+` FROM p JOIN users u ON u.id = p.author_id`,
		id, string(status), note, reviewerID))
}

// Install é idempotente.
func (r *Repository) Install(ctx context.Context, serverID, pluginID, userID string) error {
	_, err := r.db.Exec(ctx, `
		INSERT INTO server_plugins (server_id, plugin_id, installed_by) VALUES ($1, $2, $3)
		ON CONFLICT DO NOTHING`, serverID, pluginID, userID)
	if err != nil {
		return fmt.Errorf("plugin: instalar: %w", err)
	}
	return nil
}

// Uninstall apaga a instalação; as escolhas dos membros saem junto (ON DELETE CASCADE).
func (r *Repository) Uninstall(ctx context.Context, serverID, pluginID string) error {
	_, err := r.db.Exec(ctx, `DELETE FROM server_plugins WHERE server_id = $1 AND plugin_id = $2`, serverID, pluginID)
	if err != nil {
		return fmt.Errorf("plugin: desinstalar: %w", err)
	}
	return nil
}

// ListServer: instalados no servidor e aprovados, com a escolha de userID.
func (r *Repository) ListServer(ctx context.Context, serverID, userID string) ([]ServerPlugin, error) {
	rows, err := r.db.Query(ctx, `
		SELECT `+pluginCols+`,
			EXISTS (SELECT 1 FROM member_plugins m
				WHERE m.server_id = sp.server_id AND m.plugin_id = sp.plugin_id AND m.user_id = $2)
		FROM server_plugins sp
		JOIN plugins p ON p.id = sp.plugin_id
		JOIN users u ON u.id = p.author_id
		WHERE sp.server_id = $1 AND p.status = 'approved'
		ORDER BY sp.installed_at, p.id`, serverID, userID)
	if err != nil {
		return nil, fmt.Errorf("plugin: listar do servidor: %w", err)
	}
	return pgx.CollectRows(rows, scanServerPlugin)
}

func scanServerPlugin(row pgx.CollectableRow) (ServerPlugin, error) {
	var s ServerPlugin
	err := row.Scan(&s.ID, &s.Name, &s.Description, &s.PanelURL, &s.Icon, &s.AuthorID, &s.AuthorUsername,
		&s.Status, &s.ReviewNote, &s.ReviewedBy, &s.CreatedAt, &s.UpdatedAt, &s.Enabled)
	return s, err
}

// SetEnabled liga (só se o plugin estiver instalado e aprovado) ou desliga a
// escolha do membro. Fora dessas condições ligar não faz nada, sem erro.
func (r *Repository) SetEnabled(ctx context.Context, serverID, userID, pluginID string, on bool) error {
	var err error
	if on {
		_, err = r.db.Exec(ctx, `
			INSERT INTO member_plugins (server_id, user_id, plugin_id)
			SELECT sp.server_id, $2, sp.plugin_id
			FROM server_plugins sp JOIN plugins p ON p.id = sp.plugin_id
			WHERE sp.server_id = $1 AND sp.plugin_id = $3 AND p.status = 'approved'
				AND EXISTS (SELECT 1 FROM server_members sm WHERE sm.server_id = $1 AND sm.user_id = $2)
			ON CONFLICT DO NOTHING`, serverID, userID, pluginID)
	} else {
		_, err = r.db.Exec(ctx, `
			DELETE FROM member_plugins WHERE server_id = $1 AND user_id = $2 AND plugin_id = $3`,
			serverID, userID, pluginID)
	}
	if err != nil {
		return fmt.Errorf("plugin: escolha do membro: %w", err)
	}
	return nil
}

// ServersWith devolve os servidores que instalaram o plugin.
func (r *Repository) ServersWith(ctx context.Context, pluginID string) ([]string, error) {
	rows, err := r.db.Query(ctx, `SELECT server_id::text FROM server_plugins WHERE plugin_id = $1`, pluginID)
	if err != nil {
		return nil, fmt.Errorf("plugin: servidores: %w", err)
	}
	return pgx.CollectRows(rows, pgx.RowTo[string])
}
