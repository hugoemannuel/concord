package changelog

import (
	"context"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Repository struct {
	db *pgxpool.Pool
}

func NewRepository(db *pgxpool.Pool) *Repository {
	return &Repository{db: db}
}

func (r *Repository) List(ctx context.Context) ([]Release, error) {
	releases, index, err := r.listReleases(ctx)
	if err != nil {
		return nil, err
	}
	if err := r.attachEntries(ctx, releases, index); err != nil {
		return nil, err
	}
	return releases, nil
}

// listReleases devolve as releases (sem notas) e onde cada id está na lista.
func (r *Repository) listReleases(ctx context.Context) ([]Release, map[int64]int, error) {
	rows, err := r.db.Query(ctx,
		`SELECT id, version, released_at, summary, required
		 FROM changelog_releases
		 ORDER BY released_at DESC, id DESC`)
	if err != nil {
		return nil, nil, err
	}
	defer rows.Close()
	return collectReleases(rows)
}

func collectReleases(rows pgx.Rows) ([]Release, map[int64]int, error) {
	var releases []Release
	index := map[int64]int{}
	for rows.Next() {
		var id int64
		rel := Release{Entries: []Entry{}}
		if err := rows.Scan(&id, &rel.Version, &rel.ReleasedAt, &rel.Summary, &rel.Required); err != nil {
			return nil, nil, err
		}
		index[id] = len(releases)
		releases = append(releases, rel)
	}
	return releases, index, rows.Err()
}

func (r *Repository) attachEntries(ctx context.Context, releases []Release, index map[int64]int) error {
	rows, err := r.db.Query(ctx,
		`SELECT release_id, kind, text, source, highlight FROM changelog_entries ORDER BY release_id, position`)
	if err != nil {
		return err
	}
	defer rows.Close()
	return collectEntries(rows, releases, index)
}

func collectEntries(rows pgx.Rows, releases []Release, index map[int64]int) error {
	for rows.Next() {
		var id int64
		var e Entry
		if err := rows.Scan(&id, &e.Kind, &e.Text, &e.Source, &e.Highlight); err != nil {
			return err
		}
		appendEntry(releases, index, id, e)
	}
	return rows.Err()
}

func appendEntry(releases []Release, index map[int64]int, releaseID int64, e Entry) {
	if i, ok := index[releaseID]; ok {
		releases[i].Entries = append(releases[i].Entries, e)
	}
}

// Upsert cria a release ou troca as entradas da que já existe, numa transação:
// repetir o deploy deixa o mesmo resultado.
func (r *Repository) Upsert(ctx context.Context, version string, p Publication) error {
	tx, err := r.db.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx) //nolint:errcheck

	if err := replaceRelease(ctx, tx, version, p); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

func replaceRelease(ctx context.Context, tx pgx.Tx, version string, p Publication) error {
	id, err := upsertRelease(ctx, tx, version, p)
	if err != nil {
		return err
	}
	if _, err := tx.Exec(ctx, `DELETE FROM changelog_entries WHERE release_id = $1`, id); err != nil {
		return err
	}
	return insertEntries(ctx, tx, id, p.Entries)
}

func upsertRelease(ctx context.Context, tx pgx.Tx, version string, p Publication) (int64, error) {
	var id int64
	err := tx.QueryRow(ctx,
		`INSERT INTO changelog_releases (version, released_at, summary, required)
		 VALUES ($1, COALESCE($2::timestamptz, NOW()), $3, $4)
		 ON CONFLICT (version) DO UPDATE
		   SET released_at = COALESCE($2::timestamptz, changelog_releases.released_at),
		       summary = EXCLUDED.summary,
		       required = EXCLUDED.required
		 RETURNING id`,
		version, p.ReleasedAt, p.Summary, p.Required).Scan(&id)
	return id, err
}

func insertEntries(ctx context.Context, tx pgx.Tx, releaseID int64, entries []Entry) error {
	for i, e := range entries {
		if _, err := tx.Exec(ctx,
			`INSERT INTO changelog_entries (release_id, kind, text, source, highlight, position) VALUES ($1, $2, $3, $4, $5, $6)`,
			releaseID, e.Kind, e.Text, e.Source, e.Highlight, i); err != nil {
			return err
		}
	}
	return nil
}
