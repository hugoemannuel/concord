package apperrors

import (
	"context"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
)

// Leituras para o obs-alertas (só leitura, sem conhecer o resto do pacote):
//
//   - GroupsFirstSeenSince: os erros que apareceram pela primeira vez desde
//     since ("erro novo"). Um grupo que fica 14 dias sem acontecer sai pela
//     retenção e, se voltar, conta como novo de novo.
//   - AffectedByGroup: quantas pessoas (com conta) e quantas vezes cada grupo
//     aconteceu em [from, to). A ocorrência é guardada por hora cheia: entra a
//     linha que teve atividade em from ou depois (last_at) e começou antes de to.
//     Panic do backend sem conta soma em Count, não em Users.

// GroupHead: um grupo novo.
type GroupHead struct {
	Fingerprint  string
	Source       string
	Kind         string
	Message      string
	FirstSeen    time.Time
	FirstVersion string
}

// GroupImpact: o tamanho de um grupo numa janela.
type GroupImpact struct {
	Fingerprint string
	Source      string
	Kind        string
	Message     string
	Users       int
	Count       int
}

// GroupsFirstSeenSince: os grupos com first_seen >= since, do mais antigo.
func (r *Repository) GroupsFirstSeenSince(ctx context.Context, since time.Time) ([]GroupHead, error) {
	rows, err := r.db.Query(ctx, `SELECT fingerprint, source, kind, message, first_seen, first_version
		FROM app_error_groups WHERE first_seen >= $1 ORDER BY first_seen, fingerprint`, since)
	if err != nil {
		return nil, fmt.Errorf("ler grupos novos: %w", err)
	}
	return pgx.CollectRows(rows, func(row pgx.CollectableRow) (GroupHead, error) {
		var g GroupHead
		return g, row.Scan(&g.Fingerprint, &g.Source, &g.Kind, &g.Message, &g.FirstSeen, &g.FirstVersion)
	})
}

// inWindow: a ocorrência (hora cheia até last_at) cruza [$1, $2). O filtro pela
// hora usa o índice; last_at < hora + 1h.
const inWindow = `o.last_at >= $1 AND o.hour > $1::timestamptz - interval '1 hour' AND o.hour < $2`

// AffectedByGroup: pessoas e contagem de cada grupo em [from, to), do que
// atingiu mais gente.
func (r *Repository) AffectedByGroup(ctx context.Context, from, to time.Time) ([]GroupImpact, error) {
	rows, err := r.db.Query(ctx, `SELECT g.fingerprint, g.source, g.kind, g.message,
			COUNT(DISTINCT o.user_id), SUM(o.count)
		FROM app_error_occurrences o
		JOIN app_error_groups g ON g.fingerprint = o.fingerprint
		WHERE `+inWindow+`
		GROUP BY g.fingerprint
		ORDER BY 5 DESC, 6 DESC, g.fingerprint`, from, to)
	if err != nil {
		return nil, fmt.Errorf("ler impacto dos grupos: %w", err)
	}
	return pgx.CollectRows(rows, func(row pgx.CollectableRow) (GroupImpact, error) {
		var g GroupImpact
		return g, row.Scan(&g.Fingerprint, &g.Source, &g.Kind, &g.Message, &g.Users, &g.Count)
	})
}
