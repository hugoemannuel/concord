package apperrors

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
)

// Leituras do painel dos devs (GET /obs/errors e /obs/errors/:fingerprint).
// A janela é [From, To) com o mesmo critério do alerts.go (inWindow).

// ErrGroupNotFound: a impressão digital não existe (404).
var ErrGroupNotFound = errors.New("grupo de erro não encontrado")

const (
	maxGroups  = 200
	maxScreens = 20
	maxRecent  = 30
)

// groupQuery: os filtros da lista (Source e Version vazios = todos).
type groupQuery struct {
	From, To        time.Time
	Source, Version string
}

// groupColumns: os campos de um GroupSummary (sem new_in_version), com o
// número e as listas contando só as ocorrências da janela.
const groupColumns = `g.fingerprint, g.source, g.kind, g.message, g.first_seen, g.last_seen,
	COALESCE(SUM(o.count), 0), COUNT(DISTINCT o.user_id),
	COALESCE(array_agg(DISTINCT o.app_version) FILTER (WHERE o.app_version <> ''), '{}'),
	COALESCE(array_agg(DISTINCT o.os) FILTER (WHERE o.os <> ''), '{}'),
	COALESCE(array_agg(DISTINCT o.target) FILTER (WHERE o.target <> ''), '{}')`

func (g *GroupSummary) fields() []any {
	return []any{&g.Fingerprint, &g.Source, &g.Kind, &g.Message, &g.FirstSeen, &g.LastSeen,
		&g.Count, &g.Users, &g.Versions, &g.Systems, &g.Targets}
}

// Groups: os grupos com ocorrência na janela, de quem atingiu mais gente e
// depois do mais recente; até maxGroups.
func (r *Repository) Groups(ctx context.Context, q groupQuery) ([]GroupSummary, error) {
	rows, err := r.db.Query(ctx, `SELECT `+groupColumns+`
		FROM app_error_groups g
		JOIN app_error_occurrences o ON o.fingerprint = g.fingerprint
		WHERE `+inWindow+` AND ($3 = '' OR g.source = $3) AND ($4 = '' OR o.app_version = $4)
		GROUP BY g.fingerprint
		ORDER BY 8 DESC, g.last_seen DESC, g.fingerprint
		LIMIT $5`, q.From, q.To, q.Source, q.Version, maxGroups)
	if err != nil {
		return nil, fmt.Errorf("ler grupos de erro: %w", err)
	}
	return pgx.CollectRows(rows, func(row pgx.CollectableRow) (GroupSummary, error) {
		var g GroupSummary
		return g, row.Scan(g.fields()...)
	})
}

// Versions: as versões vistas na janela (da origem, se pedida).
func (r *Repository) Versions(ctx context.Context, from, to time.Time, source string) ([]string, error) {
	rows, err := r.db.Query(ctx, `SELECT DISTINCT o.app_version
		FROM app_error_occurrences o
		JOIN app_error_groups g ON g.fingerprint = o.fingerprint
		WHERE `+inWindow+` AND o.app_version <> '' AND ($3 = '' OR g.source = $3)
		ORDER BY 1`, from, to, source)
	if err != nil {
		return nil, fmt.Errorf("ler versões: %w", err)
	}
	return pgx.CollectRows(rows, pgx.RowTo[string])
}

// VersionIndex: as versões de cada grupo na retenção inteira (para o
// new_in_version e a versão mais nova de cada origem).
func (r *Repository) VersionIndex(ctx context.Context) ([]groupVersions, error) {
	rows, err := r.db.Query(ctx, `SELECT g.source, g.fingerprint, array_agg(DISTINCT o.app_version)
		FROM app_error_groups g
		JOIN app_error_occurrences o ON o.fingerprint = g.fingerprint
		GROUP BY g.fingerprint`)
	if err != nil {
		return nil, fmt.Errorf("ler versões dos grupos: %w", err)
	}
	return pgx.CollectRows(rows, func(row pgx.CollectableRow) (groupVersions, error) {
		var g groupVersions
		return g, row.Scan(&g.Source, &g.Fingerprint, &g.Versions)
	})
}

// Group: um grupo (mesmo sem ocorrência na janela) e a pilha guardada.
func (r *Repository) Group(ctx context.Context, fingerprint string, from, to time.Time) (GroupSummary, string, error) {
	var g GroupSummary
	var stack string
	err := r.db.QueryRow(ctx, `SELECT `+groupColumns+`, g.stack
		FROM app_error_groups g
		LEFT JOIN app_error_occurrences o ON o.fingerprint = g.fingerprint AND `+inWindow+`
		WHERE g.fingerprint = $3
		GROUP BY g.fingerprint`, from, to, fingerprint).Scan(append(g.fields(), &stack)...)
	if errors.Is(err, pgx.ErrNoRows) {
		return g, "", ErrGroupNotFound
	}
	if err != nil {
		return g, "", fmt.Errorf("ler grupo de erro: %w", err)
	}
	return g, stack, nil
}

// Screens: em que telas o grupo aconteceu na janela, da mais frequente.
func (r *Repository) Screens(ctx context.Context, fingerprint string, from, to time.Time) ([]ScreenCount, error) {
	rows, err := r.db.Query(ctx, `SELECT o.screen, SUM(o.count)
		FROM app_error_occurrences o
		WHERE o.fingerprint = $3 AND `+inWindow+`
		GROUP BY o.screen
		ORDER BY 2 DESC, 1
		LIMIT $4`, from, to, fingerprint, maxScreens)
	if err != nil {
		return nil, fmt.Errorf("ler telas do erro: %w", err)
	}
	return pgx.CollectRows(rows, func(row pgx.CollectableRow) (ScreenCount, error) {
		var s ScreenCount
		return s, row.Scan(&s.Screen, &s.Count)
	})
}

// Recent: as linhas de ocorrência mais novas da janela, com o nome de quem viu.
func (r *Repository) Recent(ctx context.Context, fingerprint string, from, to time.Time, limit int) ([]Occurrence, error) {
	rows, err := r.db.Query(ctx, `SELECT o.last_at, COALESCE(u.username, ''), o.app_version, o.os, o.target,
			o.screen, o.in_call, o.in_live, o.count
		FROM app_error_occurrences o
		LEFT JOIN users u ON u.id = o.user_id
		WHERE o.fingerprint = $3 AND `+inWindow+`
		ORDER BY o.last_at DESC, o.id DESC
		LIMIT $4`, from, to, fingerprint, limit)
	if err != nil {
		return nil, fmt.Errorf("ler ocorrências do erro: %w", err)
	}
	return pgx.CollectRows(rows, func(row pgx.CollectableRow) (Occurrence, error) {
		var o Occurrence
		return o, row.Scan(&o.At, &o.Username, &o.AppVersion, &o.OS, &o.Target, &o.Screen, &o.InCall, &o.InLive, &o.Count)
	})
}
