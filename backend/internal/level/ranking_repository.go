package level

import (
	"context"
	"errors"
	"fmt"

	"gin-quickstart/backend/internal/cosmetics"
	"gin-quickstart/backend/internal/namestyle"

	"github.com/jackc/pgx/v5"
)

// Quem entra no ranking: conta ativa, que não é bot e já tem XP. A ordem é
// XP (que dá o nível) e, no empate, quem chegou àquele XP primeiro
// (updated_at só muda quando entra XP novo); o id deixa a ordem estável.
const rankingFilter = `u.active AND NOT u.is_bot AND l.xp > 0`

// TopRanking devolve as `limit` pessoas com mais XP.
func (r *Repository) TopRanking(ctx context.Context, limit int) ([]RankingEntry, error) {
	rows, err := r.db.Query(
		ctx,
		`
		SELECT l.user_id, u.username, u.display_name, u.avatar_url, `+namestyle.Expr("u")+`, `+cosmetics.Expr("u")+`, l.xp
		FROM user_levels l
		JOIN users u ON u.id = l.user_id
		WHERE `+rankingFilter+`
		ORDER BY l.xp DESC, l.updated_at ASC, l.user_id ASC
		LIMIT $1
		`,
		limit,
	)
	if err != nil {
		return nil, fmt.Errorf("top do ranking: %w", err)
	}
	out, err := pgx.CollectRows(rows, scanRankingEntry)
	if err != nil {
		return nil, fmt.Errorf("top do ranking: %w", err)
	}
	return out, nil
}

func scanRankingEntry(row pgx.CollectableRow) (RankingEntry, error) {
	var e RankingEntry
	var style namestyle.Style
	err := row.Scan(&e.UserID, &e.Username, &e.DisplayName, &e.AvatarURL, &style, &e.Look, &e.XP)
	e.NameStyle = style
	return e, err
}

// RankOf devolve a posição de userID pela mesma ordem de TopRanking.
func (r *Repository) RankOf(ctx context.Context, userID string) (MyRank, bool, error) {
	var rank MyRank
	err := r.db.QueryRow(
		ctx,
		`
		WITH me AS (
			SELECT l.xp, l.updated_at, l.user_id
			FROM user_levels l
			JOIN users u ON u.id = l.user_id
			WHERE l.user_id = $1::uuid AND `+rankingFilter+`
		)
		SELECT me.xp, (
			SELECT COUNT(*) + 1
			FROM user_levels l
			JOIN users u ON u.id = l.user_id
			WHERE `+rankingFilter+`
			  AND (l.xp > me.xp OR (l.xp = me.xp AND (l.updated_at, l.user_id) < (me.updated_at, me.user_id)))
		)
		FROM me
		`,
		userID,
	).Scan(&rank.XP, &rank.Position)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return MyRank{}, false, nil
		}
		return MyRank{}, false, fmt.Errorf("posição no ranking: %w", err)
	}
	return rank, true, nil
}
