package serverprofile

import (
	"context"

	"github.com/jackc/pgx/v5"
)

// maxSamplesPerServer: nomes de jogo vêm do app de cada pessoa; o que passar
// disso (os menos jogados) sai na limpeza.
const maxSamplesPerServer = 100

// RecordGameSamples soma uma amostra por pessoa em cada servidor dela e guarda só
// o total por jogo: o banco nunca sabe quem jogou.
func (r *Repository) RecordGameSamples(ctx context.Context, plays []PlayedGame) error {
	users := make([]string, len(plays))
	names := make([]string, len(plays))
	apps := make([]int64, len(plays))
	hashes := make([]string, len(plays))
	for i, p := range plays {
		users[i], names[i], apps[i], hashes[i] = p.UserID, p.Game.Name, p.Game.AppID, p.Game.IconHash
	}
	_, err := r.db.Exec(ctx, `
		INSERT INTO server_game_samples (server_id, game, app_id, icon_hash, samples)
		SELECT m.server_id, x.game, MAX(x.app_id), MAX(x.icon_hash), COUNT(*)
		FROM unnest($1::uuid[], $2::text[], $3::bigint[], $4::text[]) AS x(user_id, game, app_id, icon_hash)
		JOIN server_members m ON m.user_id = x.user_id
		GROUP BY m.server_id, x.game
		ON CONFLICT (server_id, game) DO UPDATE SET
			samples = server_game_samples.samples + EXCLUDED.samples,
			app_id = EXCLUDED.app_id,
			icon_hash = EXCLUDED.icon_hash,
			last_seen = NOW()`, users, names, apps, hashes)
	return err
}

// TrimGameSamples deixa só os mais jogados de cada servidor.
func (r *Repository) TrimGameSamples(ctx context.Context) error {
	_, err := r.db.Exec(ctx, `
		DELETE FROM server_game_samples a USING (
			SELECT server_id, game, row_number() OVER (PARTITION BY server_id ORDER BY samples DESC, last_seen DESC) AS place
			FROM server_game_samples
		) ranked
		WHERE a.server_id = ranked.server_id AND a.game = ranked.game AND ranked.place > $1`, maxSamplesPerServer)
	return err
}

// MemberGames: os mais jogados do servidor, sem totais nem nomes de pessoas.
func (r *Repository) MemberGames(ctx context.Context, serverID string, limit int) ([]Game, error) {
	rows, err := r.db.Query(ctx, `
		SELECT game, app_id, icon_hash FROM server_game_samples
		WHERE server_id = $1
		ORDER BY samples DESC, last_seen DESC
		LIMIT $2`, serverID, limit)
	if err != nil {
		return nil, err
	}
	games, err := pgx.CollectRows(rows, func(row pgx.CollectableRow) (Game, error) {
		var g Game
		err := row.Scan(&g.Name, &g.AppID, &g.IconHash)
		return g, err
	})
	if err != nil {
		return nil, err
	}
	if games == nil {
		games = []Game{}
	}
	return games, nil
}
