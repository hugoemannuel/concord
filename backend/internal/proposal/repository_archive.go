package proposal

import (
	"context"
	"strings"
)

// Archive arquiva os cards concluídos ou recusados entre ids e devolve os que
// de fato mudaram (os outros, por status ou por já estarem arquivados, ficam
// como estavam). Nada é apagado: só some do quadro.
func (r *Repository) Archive(ctx context.Context, ids []string) ([]string, error) {
	return r.archived(ctx, `
		UPDATE proposals SET archived_at = NOW()
		WHERE id = ANY($1::uuid[]) AND status IN ('done', 'rejected') AND archived_at IS NULL
		RETURNING id`, ids)
}

// ArchiveByStatus arquiva de uma vez todos os cards do status (done ou rejected).
func (r *Repository) ArchiveByStatus(ctx context.Context, status string) ([]string, error) {
	return r.archived(ctx, `
		UPDATE proposals SET archived_at = NOW()
		WHERE status = $1 AND status IN ('done', 'rejected') AND archived_at IS NULL
		RETURNING id`, status)
}

func (r *Repository) archived(ctx context.Context, sql string, arg any) ([]string, error) {
	rows, err := r.db.Query(ctx, sql, arg)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []string{}
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		out = append(out, id)
	}
	return out, rows.Err()
}

// Unarchive devolve o card ao quadro; false se ele não estava arquivado.
func (r *Repository) Unarchive(ctx context.Context, id string) (bool, error) {
	tag, err := r.db.Exec(ctx, `UPDATE proposals SET archived_at = NULL WHERE id = $1 AND archived_at IS NOT NULL`, id)
	if err != nil {
		return false, err
	}
	return tag.RowsAffected() > 0, nil
}

// likeEscaper faz % e _ da busca valerem como texto.
var likeEscaper = strings.NewReplacer(`\`, `\\`, `%`, `\%`, `_`, `\_`)

// ListArchived devolve uma página das arquivadas, a mais recente primeiro. q
// busca no título e na descrição ("" traz tudo). more diz se há outra página.
func (r *Repository) ListArchived(ctx context.Context, viewerID, q string, limit, offset int) ([]Proposal, bool, error) {
	pattern := ""
	if q = strings.TrimSpace(q); q != "" {
		pattern = "%" + likeEscaper.Replace(q) + "%"
	}
	list, err := r.query(ctx, &viewerID, `
		WHERE p.archived_at IS NOT NULL
		  AND ($2::text = '' OR p.title ILIKE $2::text OR p.description ILIKE $2::text)
		ORDER BY p.archived_at DESC, p.id
		LIMIT $3 OFFSET $4`, pattern, limit+1, offset)
	if err != nil {
		return nil, false, err
	}
	more := len(list) > limit
	if more {
		list = list[:limit]
	}
	return list, more, nil
}
