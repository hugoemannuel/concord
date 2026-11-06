package serverlevel

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// O teto diário, a conta real e as fontes contadas por trigger ficam no banco
// (migration 000150): tudo passa pelo server_level_add.

// recentWindow: o sync relê o que mudou nesse tempo (bem mais que o flush, para
// não perder uma transação que demorou a confirmar).
const recentWindow = "5 minutes"

type Repository struct {
	db *pgxpool.Pool
}

func NewRepository(db *pgxpool.Pool) *Repository {
	return &Repository{db: db}
}

// levelRow é o XP de um servidor e o último nível visto (nil = retroativo).
type levelRow struct {
	serverID string
	xp       int64
	level    *int
}

// AddAll soma, numa escrita só, o xp de cada grant (teto diário e conta real
// no banco, em server_level_add). Servidor ou pessoa que sumiu no meio da call
// é pulado, para não derrubar o lote.
func (r *Repository) AddAll(ctx context.Context, grants []grant) error {
	if len(grants) == 0 {
		return nil
	}
	servers, users, sources, xps := grantColumns(grants)
	_, err := r.db.Exec(ctx, `
		SELECT COUNT(server_level_add(x.server_id, x.user_id, x.source, x.xp::int))
		FROM unnest($1::uuid[], $2::uuid[], $3::text[], $4::bigint[]) AS x(server_id, user_id, source, xp)
		JOIN servers s ON s.id = x.server_id
		JOIN users u ON u.id = x.user_id`,
		servers, users, sources, xps)
	if err != nil {
		return fmt.Errorf("somar xp do servidor: %w", err)
	}
	return nil
}

// grantColumns: os grants em colunas, na ordem do unnest de AddAll.
func grantColumns(grants []grant) (servers, users, sources []string, xps []int64) {
	for _, g := range grants {
		servers = append(servers, g.serverID)
		users = append(users, g.userID)
		sources = append(sources, g.source)
		xps = append(xps, g.xp)
	}
	return servers, users, sources, xps
}

// GrantNewMembers dá o XP de membro novo a quem é conta real e ainda não
// rendeu (entrou agora ou virou conta real depois). Uma vez por pessoa por
// servidor.
func (r *Repository) GrantNewMembers(ctx context.Context) error {
	_, err := r.db.Exec(ctx, `
		WITH novos AS (
			INSERT INTO server_level_members (server_id, user_id)
			SELECT sm.server_id, sm.user_id FROM server_members sm
			WHERE NOT EXISTS (
				SELECT 1 FROM server_level_members g
				WHERE g.server_id = sm.server_id AND g.user_id = sm.user_id
			) AND server_level_real(sm.user_id)
			ON CONFLICT DO NOTHING
			RETURNING server_id, user_id
		)
		SELECT COUNT(server_level_add(server_id, user_id, $1, 50)) FROM novos`, SourceMembers)
	if err != nil {
		return fmt.Errorf("membros novos: %w", err)
	}
	return nil
}

// Recent: os servidores com XP mudado há pouco e os que o backend nunca viu.
func (r *Repository) Recent(ctx context.Context) ([]levelRow, error) {
	rows, _ := r.db.Query(ctx, `
		SELECT server_id::text, xp, level FROM server_levels
		WHERE level IS NULL OR updated_at > NOW() - $1::interval`, recentWindow)
	out, err := pgx.CollectRows(rows, func(row pgx.CollectableRow) (levelRow, error) {
		var l levelRow
		err := row.Scan(&l.serverID, &l.xp, &l.level)
		return l, err
	})
	if err != nil {
		return nil, fmt.Errorf("níveis recentes: %w", err)
	}
	return out, nil
}

// SetLevel grava o nível visto (sem mexer em updated_at).
func (r *Repository) SetLevel(ctx context.Context, serverID string, level int) error {
	_, err := r.db.Exec(ctx, `UPDATE server_levels SET level = $2 WHERE server_id = $1`, serverID, level)
	if err != nil {
		return fmt.Errorf("gravar nível do servidor: %w", err)
	}
	return nil
}

// Detail: XP total e o XP de cada fonte nos últimos 7 dias (hoje incluso).
func (r *Repository) Detail(ctx context.Context, serverID string) (int64, map[string]int64, error) {
	var xp int64
	err := r.db.QueryRow(ctx, `SELECT COALESCE((SELECT xp FROM server_levels WHERE server_id = $1), 0)`, serverID).Scan(&xp)
	if err != nil {
		return 0, nil, fmt.Errorf("xp do servidor: %w", err)
	}
	rows, _ := r.db.Query(ctx, `
		SELECT source, SUM(xp)::bigint FROM server_level_daily
		WHERE server_id = $1 AND day > server_level_today() - 7
		GROUP BY source`, serverID)
	week := make(map[string]int64)
	var source string
	var sum int64
	_, err = pgx.ForEachRow(rows, []any{&source, &sum}, func() error {
		week[source] = sum
		return nil
	})
	if err != nil {
		return 0, nil, fmt.Errorf("xp da semana: %w", err)
	}
	return xp, week, nil
}
