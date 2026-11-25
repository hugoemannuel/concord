package apperrors

import (
	"context"
	"fmt"
	"slices"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Repository: app_error_groups e app_error_occurrences (migration 000212).
type Repository struct {
	db *pgxpool.Pool
}

func NewRepository(db *pgxpool.Pool) *Repository {
	return &Repository{db: db}
}

// O grupo guarda a primeira pilha e a primeira versão; last_seen só anda para a frente.
const upsertGroupSQL = `
INSERT INTO app_error_groups AS g (fingerprint, source, kind, message, stack, first_seen, last_seen, first_version)
VALUES ($1, $2, $3, $4, $5, $6, $6, $7)
ON CONFLICT (fingerprint) DO UPDATE SET
	last_seen = GREATEST(g.last_seen, EXCLUDED.last_seen),
	stack = CASE WHEN g.stack = '' THEN EXCLUDED.stack ELSE g.stack END`

// Uma linha por (grupo, pessoa, hora, versão): a contagem soma e o contexto é o da última vez.
const upsertOccurrenceSQL = `
INSERT INTO app_error_occurrences AS o (fingerprint, user_id, hour, last_at, app_version, os, target, screen, in_call, in_live, count)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
ON CONFLICT ON CONSTRAINT app_error_occurrences_key DO UPDATE SET
	count = o.count + EXCLUDED.count,
	last_at = GREATEST(o.last_at, EXCLUDED.last_at),
	os = EXCLUDED.os, target = EXCLUDED.target, screen = EXCLUDED.screen,
	in_call = EXCLUDED.in_call, in_live = EXCLUDED.in_live`

// SaveAll grava os erros já preparados (limpos e com a impressão digital) numa
// transação só. userID vazio = sem conta (panic do backend fora de rota com login).
func (r *Repository) SaveAll(ctx context.Context, userID string, cc ClientContext, errs []Captured, at time.Time) error {
	at = at.UTC()
	batch := &pgx.Batch{}
	for _, e := range byFingerprint(errs) {
		batch.Queue(upsertGroupSQL, e.Fingerprint, e.Source, e.Kind, e.Message, e.Stack, at, cc.AppVersion)
		batch.Queue(upsertOccurrenceSQL, e.Fingerprint, nullable(userID), at.Truncate(time.Hour), at,
			cc.AppVersion, cc.OS, cc.Target, e.Screen, e.InCall, e.InLive, e.Count)
	}
	err := pgx.BeginFunc(ctx, r.db, func(tx pgx.Tx) error {
		return tx.SendBatch(ctx, batch).Close()
	})
	if err != nil {
		return fmt.Errorf("gravar erros do app: %w", err)
	}
	return nil
}

// Prune apaga as ocorrências de antes de before (pela hora) e os grupos que não
// acontecem desde então (pela última vez). Serve ao liveobs.Retention.
func (r *Repository) Prune(ctx context.Context, before time.Time) error {
	if _, err := r.db.Exec(ctx, `DELETE FROM app_error_occurrences WHERE hour < $1`, before); err != nil {
		return fmt.Errorf("apagar ocorrências antigas: %w", err)
	}
	if _, err := r.db.Exec(ctx, `DELETE FROM app_error_groups WHERE last_seen < $1`, before); err != nil {
		return fmt.Errorf("apagar grupos antigos: %w", err)
	}
	return nil
}

// byFingerprint: uma cópia na ordem da impressão digital. Duas transações que
// tocam os mesmos grupos travam as linhas na mesma ordem e não se esperam em
// círculo (deadlock).
func byFingerprint(errs []Captured) []Captured {
	return slices.SortedStableFunc(slices.Values(errs), func(a, b Captured) int {
		return strings.Compare(a.Fingerprint, b.Fingerprint)
	})
}

func nullable(s string) any {
	if s == "" {
		return nil
	}
	return s
}
