package level

import (
	"context"

	"github.com/jackc/pgx/v5/pgxpool"
)

type Repository struct {
	db *pgxpool.Pool
}

func LevelRepository(db *pgxpool.Pool) *Repository {
	return &Repository{
		db: db,
	}
}

// voiceXP é o XP e o tempo de voz a somar para uma pessoa.
type voiceXP struct {
	userID      string
	xp, seconds int64
}

// voiceTotals são o XP e o tempo de voz de uma pessoa depois da soma.
type voiceTotals struct {
	xp, seconds int64
}

// AddVoiceXP soma, numa escrita só, XP e tempo de voz de cada pessoa e devolve
// os totais atualizados. Quem não existe mais (conta apagada no meio da call)
// é pulado e não vem nos totais.
func (r *Repository) AddVoiceXP(ctx context.Context, adds []voiceXP) (map[string]voiceTotals, error) {
	totals := make(map[string]voiceTotals, len(adds))
	if len(adds) == 0 {
		return totals, nil
	}
	ids, xps, secs := voiceColumns(adds)
	rows, err := r.db.Query(
		ctx,
		`
		INSERT INTO user_levels (user_id, xp, voice_seconds)
		SELECT x.user_id, x.xp, x.seconds
		FROM unnest($1::uuid[], $2::bigint[], $3::bigint[]) AS x(user_id, xp, seconds)
		JOIN users u ON u.id = x.user_id
		ON CONFLICT (user_id) DO UPDATE SET
			xp = user_levels.xp + EXCLUDED.xp,
			voice_seconds = user_levels.voice_seconds + EXCLUDED.voice_seconds,
			updated_at = NOW()
		RETURNING user_id, xp, voice_seconds
		`,
		ids, xps, secs,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var id string
		var t voiceTotals
		if err := rows.Scan(&id, &t.xp, &t.seconds); err != nil {
			return nil, err
		}
		totals[id] = t
	}
	return totals, rows.Err()
}

// voiceColumns: as somas em colunas, na ordem do unnest de AddVoiceXP.
func voiceColumns(adds []voiceXP) (ids []string, xps, secs []int64) {
	for _, a := range adds {
		ids = append(ids, a.userID)
		xps = append(xps, a.xp)
		secs = append(secs, a.seconds)
	}
	return ids, xps, secs
}

// FindByUserIDs devolve o progresso de cada usuário; quem nunca ganhou XP fica
// no nível 1.
func (r *Repository) FindByUserIDs(ctx context.Context, userIDs []string) (map[string]Progress, error) {
	result := make(map[string]Progress, len(userIDs))
	for _, id := range userIDs {
		result[id] = newProgress(id, 0, 0)
	}

	rows, err := r.db.Query(
		ctx,
		`
		SELECT user_id, xp, voice_seconds
		FROM user_levels
		WHERE user_id = ANY($1::uuid[])
		`,
		userIDs,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	for rows.Next() {
		var id string
		var xp, seconds int64
		if err := rows.Scan(&id, &xp, &seconds); err != nil {
			return nil, err
		}
		result[id] = newProgress(id, xp, seconds)
	}
	return result, rows.Err()
}
