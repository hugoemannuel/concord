package alert

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// historyLimit: o painel mostra no máximo isso de incidentes (14 dias).
const historyLimit = 500

// Repository: alert_incidents e backend_runs (migration 000216).
type Repository struct {
	db *pgxpool.Pool
}

func NewRepository(db *pgxpool.Pool) *Repository {
	return &Repository{db: db}
}

const incidentColumns = `id, rule_id, channel, severity, started_at, ended_at, last_message_at, text`

func scanIncident(row pgx.CollectableRow) (Incident, error) {
	var inc Incident
	err := row.Scan(&inc.ID, &inc.RuleID, &inc.Channel, &inc.Severity, &inc.StartedAt, &inc.EndedAt, &inc.LastMessageAt, &inc.Text)
	return inc, err
}

func (r *Repository) incidents(ctx context.Context, sql string, args ...any) ([]Incident, error) {
	rows, err := r.db.Query(ctx, sql, args...)
	if err != nil {
		return nil, fmt.Errorf("ler alert_incidents: %w", err)
	}
	return pgx.CollectRows(rows, scanIncident)
}

// OpenIncidents: os disparados agora (um por regra).
func (r *Repository) OpenIncidents(ctx context.Context) ([]Incident, error) {
	return r.incidents(ctx, `SELECT `+incidentColumns+` FROM alert_incidents WHERE ended_at IS NULL ORDER BY started_at`)
}

// History: os incidentes que começaram depois de from ou ainda abertos, do mais novo ao mais antigo.
func (r *Repository) History(ctx context.Context, from time.Time) ([]Incident, error) {
	return r.incidents(ctx, `SELECT `+incidentColumns+` FROM alert_incidents
		WHERE started_at >= $1 OR ended_at IS NULL ORDER BY started_at DESC LIMIT $2`, from, historyLimit)
}

func (r *Repository) InsertIncident(ctx context.Context, inc *Incident) error {
	err := r.db.QueryRow(ctx, `INSERT INTO alert_incidents (rule_id, channel, severity, started_at, ended_at, last_message_at, text)
		VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
		inc.RuleID, inc.Channel, inc.Severity, inc.StartedAt, inc.EndedAt, inc.LastMessageAt, inc.Text).Scan(&inc.ID)
	if err != nil {
		return fmt.Errorf("inserir alert_incidents: %w", err)
	}
	return nil
}

func (r *Repository) UpdateIncident(ctx context.Context, inc Incident) error {
	_, err := r.db.Exec(ctx, `UPDATE alert_incidents SET severity = $2, last_message_at = $3, text = $4 WHERE id = $1`,
		inc.ID, inc.Severity, inc.LastMessageAt, inc.Text)
	if err != nil {
		return fmt.Errorf("atualizar alert_incidents: %w", err)
	}
	return nil
}

func (r *Repository) CloseIncident(ctx context.Context, id int64, at time.Time) error {
	if _, err := r.db.Exec(ctx, `UPDATE alert_incidents SET ended_at = $2 WHERE id = $1`, id, at); err != nil {
		return fmt.Errorf("fechar alert_incidents: %w", err)
	}
	return nil
}

// Prune apaga o que é anterior a before (retenção de 14 dias); incidente
// aberto fica.
func (r *Repository) Prune(ctx context.Context, before time.Time) error {
	_, err1 := r.db.Exec(ctx, `DELETE FROM alert_incidents WHERE ended_at IS NOT NULL AND started_at < $1`, before)
	_, err2 := r.db.Exec(ctx, `DELETE FROM backend_runs WHERE started_at < $1`, before)
	if err := errors.Join(err1, err2); err != nil {
		return fmt.Errorf("apagar alertas antigos: %w", err)
	}
	return nil
}

// Run: um boot do backend (backend_runs).
type Run struct {
	ID        int64
	StartedAt time.Time
	Version   string
	StoppedAt *time.Time
}

// StartRun grava o boot e devolve o boot anterior (nil = o primeiro).
func (r *Repository) StartRun(ctx context.Context, version string, at time.Time) (int64, *Run, error) {
	var id int64
	if err := r.db.QueryRow(ctx, `INSERT INTO backend_runs (started_at, version) VALUES ($1, $2) RETURNING id`, at, version).Scan(&id); err != nil {
		return 0, nil, fmt.Errorf("inserir backend_runs: %w", err)
	}
	var prev Run
	err := r.db.QueryRow(ctx, `SELECT id, started_at, version, stopped_at FROM backend_runs WHERE id < $1 ORDER BY id DESC LIMIT 1`, id).
		Scan(&prev.ID, &prev.StartedAt, &prev.Version, &prev.StoppedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return id, nil, nil
	}
	if err != nil {
		return 0, nil, fmt.Errorf("ler boot anterior: %w", err)
	}
	return id, &prev, nil
}

// StopRun marca a parada limpa (SIGTERM).
func (r *Repository) StopRun(ctx context.Context, id int64, at time.Time) error {
	if _, err := r.db.Exec(ctx, `UPDATE backend_runs SET stopped_at = $2 WHERE id = $1`, id, at); err != nil {
		return fmt.Errorf("marcar parada: %w", err)
	}
	return nil
}

// CrashedRunsSince: quantos boots desde since não tiveram parada limpa (o que
// está no ar conta: ainda não parou).
func (r *Repository) CrashedRunsSince(ctx context.Context, since time.Time) (int, error) {
	var n int
	if err := r.db.QueryRow(ctx, `SELECT count(*) FROM backend_runs WHERE started_at >= $1 AND stopped_at IS NULL`, since).Scan(&n); err != nil {
		return 0, fmt.Errorf("contar boots: %w", err)
	}
	return n, nil
}
