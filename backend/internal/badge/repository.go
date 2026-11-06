package badge

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

var ErrUserNotFound = errors.New("user not found")

type Repository struct {
	db *pgxpool.Pool
}

func BadgeRepository(db *pgxpool.Pool) *Repository {
	return &Repository{db: db}
}

// donoMinMembers: membros além do dono (bots não contam) para o servidor
// contar no badge Dono (servidor vazio criado em série não vale).
const donoMinMembers = 3

// Stats junta os números da pessoa numa query só: contadores prontos, um
// COUNT de servidores pelo índice de owner_id (só os com donoMinMembers
// membros além do dono, pela chave de server_members), um COUNT dos cards de propostas
// pelo índice de author_id (Contribuinte), as mensagens distintas em que
// reagiu pelo índice (user_id, message_id) (Reações: várias reações na mesma
// mensagem contam 1), as amizades aceitas com conta real (Amigos) e se ela está em
// dev_badge_users (Fundador).
func (r *Repository) Stats(ctx context.Context, userID string) (Stats, error) {
	var s Stats
	var escolhas []string
	err := r.db.QueryRow(
		ctx,
		`
		SELECT
			u.created_at,
			COALESCE(l.xp, 0),
			COALESCE(l.voice_seconds, 0),
			COALESCE(b.messages_sent, 0),
			(SELECT COUNT(DISTINCT r.message_id) FROM message_reactions r WHERE r.user_id = u.id),
			COALESCE(b.stream_seconds, 0),
			COALESCE(b.watch_seconds, 0),
			COALESCE(b.night_seconds, 0),
			COALESCE(b.morning_seconds, 0),
			COALESCE(b.peak_call_size, 0),
			COALESCE(b.longest_session_seconds, 0),
			(SELECT COUNT(*) FROM servers sv WHERE sv.owner_id = u.id AND (
				SELECT COUNT(*) FROM server_members sm JOIN users mu ON mu.id = sm.user_id AND NOT mu.is_bot
				WHERE sm.server_id = sv.id AND sm.user_id <> sv.owner_id
			) >= $2),
			(SELECT COUNT(*) FROM proposals p WHERE p.author_id = u.id),
			(SELECT COUNT(*) FROM friendships f
				JOIN users o ON o.id = CASE WHEN f.requester_id = u.id THEN f.addressee_id ELSE f.requester_id END
				WHERE (f.requester_id = u.id OR f.addressee_id = u.id) AND f.status = 'accepted'
				AND `+contaRealSQL("o")+`),
			EXISTS (SELECT 1 FROM dev_badge_users d WHERE d.user_id = u.id),
			ARRAY(SELECT e.enquete || ':' || e.opcao FROM escolhas e WHERE e.user_id = u.id),
			COALESCE(b.songs_played, 0),
			COALESCE(b.sounds_played, 0),
			COALESCE(b.stickers_sent, 0),
			COALESCE(b.streak_days, 0),
			COALESCE(b.longest_streak_days, 0),
			COALESCE(b.active_last_day::text, ''),
			COALESCE(b.camera_seconds, 0),
			(SELECT COUNT(*) FROM proposal_votes v WHERE v.user_id = u.id),
			CASE WHEN u.announce_birthday THEN COALESCE(u.birthday_day, 0) ELSE 0 END,
			CASE WHEN u.announce_birthday THEN COALESCE(u.birthday_month, 0) ELSE 0 END,
			COALESCE(u.birthday_set_at, u.created_at),
			(SELECT COUNT(*) FROM server_first_messages f WHERE f.user_id = u.id),
			COALESCE((SELECT h.bugs FROM bug_hunters h WHERE h.user_id = u.id), 0),
			COALESCE((SELECT t.posicao FROM badge_top10 t WHERE t.user_id = u.id), 0),
			(SELECT COUNT(*) FROM badge_top10) >= $3
		FROM users u
		LEFT JOIN user_levels l ON l.user_id = u.id
		LEFT JOIN user_badge_stats b ON b.user_id = u.id
		WHERE u.id = $1
		`,
		userID, donoMinMembers, Top10Slots,
	).Scan(
		&s.CreatedAt,
		&s.XP,
		&s.VoiceSeconds,
		&s.MessagesSent,
		&s.Reactions,
		&s.StreamSeconds,
		&s.WatchSeconds,
		&s.NightSeconds,
		&s.MorningSeconds,
		&s.PeakCallSize,
		&s.LongestSessionSeconds,
		&s.OwnedServers,
		&s.Proposals,
		&s.Friends,
		&s.IsDev,
		&escolhas,
		&s.SongsPlayed,
		&s.SoundsPlayed,
		&s.StickersSent,
		&s.StreakDays,
		&s.LongestStreakDays,
		&s.ActiveLastDay,
		&s.CameraSeconds,
		&s.Votes,
		&s.BirthdayDay,
		&s.BirthdayMonth,
		&s.BirthdaySetAt,
		&s.FirstMessages,
		&s.BugsReported,
		&s.Top10Rank,
		&s.Top10Full,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return Stats{}, ErrUserNotFound
	}
	if err == nil {
		s.Escolhas = escolhasSet(escolhas)
	}
	return s, err
}

// Unlocks devolve os tiers já gravados da pessoa.
func (r *Repository) Unlocks(ctx context.Context, userID string) (Unlocks, error) {
	rows, err := r.db.Query(ctx, `SELECT category, tier, unlocked_at FROM user_badges WHERE user_id = $1`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := Unlocks{}
	for rows.Next() {
		var u Unlock
		if err := rows.Scan(&u.Category, &u.Tier, &u.At); err != nil {
			return nil, err
		}
		if out[u.Category] == nil {
			out[u.Category] = map[int]time.Time{}
		}
		out[u.Category][u.Tier] = u.At
	}
	return out, rows.Err()
}

// SaveUnlocks grava os tiers novos e devolve só os que entraram agora (outro
// pedido pode ter gravado o mesmo tier ao mesmo tempo).
func (r *Repository) SaveUnlocks(ctx context.Context, userID string, unlocks []Unlock) ([]Unlock, error) {
	if len(unlocks) == 0 {
		return nil, nil
	}
	categories := make([]string, len(unlocks))
	tiers := make([]int32, len(unlocks))
	times := make([]time.Time, len(unlocks))
	for i, u := range unlocks {
		categories[i], tiers[i], times[i] = u.Category, int32(u.Tier), u.At
	}
	rows, err := r.db.Query(
		ctx,
		`
		INSERT INTO user_badges (user_id, category, tier, unlocked_at)
		SELECT $1, c, t, at FROM unnest($2::text[], $3::int[], $4::timestamptz[]) AS x(c, t, at)
		ON CONFLICT DO NOTHING
		RETURNING category, tier, unlocked_at
		`,
		userID, categories, tiers, times,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var saved []Unlock
	for rows.Next() {
		var u Unlock
		if err := rows.Scan(&u.Category, &u.Tier, &u.At); err != nil {
			return nil, err
		}
		saved = append(saved, u)
	}
	return saved, rows.Err()
}

// AddCount soma n ao contador da categoria e devolve o total novo. Só as
// categorias de counterColumns têm contador.
func (r *Repository) AddCount(ctx context.Context, userID, category string, n int64) (int64, error) {
	column, ok := counterColumns[category]
	if !ok {
		return 0, fmt.Errorf("badge %q não tem contador", category)
	}
	// column vem da lista fixa acima, nunca de quem chama.
	var total int64
	err := r.db.QueryRow(ctx, fmt.Sprintf(`
		INSERT INTO user_badge_stats (user_id, %[1]s) VALUES ($1, $2)
		ON CONFLICT (user_id) DO UPDATE SET
			%[1]s = user_badge_stats.%[1]s + EXCLUDED.%[1]s,
			updated_at = NOW()
		RETURNING %[1]s
		`, column), userID, n).Scan(&total)
	return total, err
}

// RecordActiveDay grava que as pessoas usaram o app no dia (AAAA-MM-DD, em
// Brasília): o dia seguinte ao último soma na sequência, um buraco recomeça
// do 1, e o mesmo dia de novo não muda nada. Id que não existe é ignorado.
func (r *Repository) RecordActiveDay(ctx context.Context, userIDs []string, day string) error {
	_, err := r.db.Exec(
		ctx,
		`
		INSERT INTO user_badge_stats (user_id, active_last_day, streak_days, longest_streak_days)
		SELECT u.id, $2::date, 1, 1 FROM unnest($1::uuid[]) AS x(id) JOIN users u ON u.id = x.id
		ON CONFLICT (user_id) DO UPDATE SET
			streak_days = CASE WHEN user_badge_stats.active_last_day = EXCLUDED.active_last_day - 1
				THEN user_badge_stats.streak_days + 1 ELSE 1 END,
			longest_streak_days = GREATEST(user_badge_stats.longest_streak_days,
				CASE WHEN user_badge_stats.active_last_day = EXCLUDED.active_last_day - 1
				THEN user_badge_stats.streak_days + 1 ELSE 1 END),
			active_last_day = EXCLUDED.active_last_day,
			updated_at = NOW()
		WHERE user_badge_stats.active_last_day IS NULL OR user_badge_stats.active_last_day < EXCLUDED.active_last_day
		`,
		userIDs, day,
	)
	return err
}

// AddCallStats soma, numa escrita só, o que o tracker juntou de cada pessoa
// (tempos) e guarda o maior valor (tamanho da call e sessão seguida). Quem não
// existe mais (conta apagada no meio da call) é pulado, para não derrubar o
// lote.
func (r *Repository) AddCallStats(ctx context.Context, deltas map[string]Delta) error {
	if len(deltas) == 0 {
		return nil
	}
	c := callStatsColumns(deltas)
	_, err := r.db.Exec(
		ctx,
		`
		INSERT INTO user_badge_stats (user_id, stream_seconds, watch_seconds, night_seconds, morning_seconds, peak_call_size, longest_session_seconds, camera_seconds)
		SELECT x.id, x.stream, x.watch, x.night, x.morning, x.peak, x.longest, x.camera
		FROM unnest($1::uuid[], $2::bigint[], $3::bigint[], $4::bigint[], $5::bigint[], $6::bigint[], $7::bigint[], $8::bigint[])
			AS x(id, stream, watch, night, morning, peak, longest, camera)
		JOIN users u ON u.id = x.id
		ON CONFLICT (user_id) DO UPDATE SET
			stream_seconds = user_badge_stats.stream_seconds + EXCLUDED.stream_seconds,
			watch_seconds = user_badge_stats.watch_seconds + EXCLUDED.watch_seconds,
			camera_seconds = user_badge_stats.camera_seconds + EXCLUDED.camera_seconds,
			night_seconds = user_badge_stats.night_seconds + EXCLUDED.night_seconds,
			morning_seconds = user_badge_stats.morning_seconds + EXCLUDED.morning_seconds,
			peak_call_size = GREATEST(user_badge_stats.peak_call_size, EXCLUDED.peak_call_size),
			longest_session_seconds = GREATEST(user_badge_stats.longest_session_seconds, EXCLUDED.longest_session_seconds),
			updated_at = NOW()
		`,
		c.ids, c.stream, c.watch, c.night, c.morning, c.peak, c.longest, c.camera,
	)
	return err
}

// callStatsCols: os deltas em colunas, na ordem do unnest de AddCallStats.
type callStatsCols struct {
	ids                                                  []string
	stream, watch, night, morning, peak, longest, camera []int64
}

func callStatsColumns(deltas map[string]Delta) callStatsCols {
	var c callStatsCols
	for userID, d := range deltas {
		c.ids = append(c.ids, userID)
		c.stream = append(c.stream, d.Stream)
		c.watch = append(c.watch, d.Watch)
		c.night = append(c.night, d.Night)
		c.morning = append(c.morning, d.Morning)
		c.peak = append(c.peak, d.PeakCallSize)
		c.longest = append(c.longest, d.LongestSession)
		c.camera = append(c.camera, d.Camera)
	}
	return c
}

// SaveSessions grava, no desligamento, as sessões de maratona em andamento
// (segundos seguidos em call) para o processo novo continuar a contagem.
func (r *Repository) SaveSessions(ctx context.Context, sessions map[string]int64) error {
	if len(sessions) == 0 {
		return nil
	}
	ids := make([]string, 0, len(sessions))
	secs := make([]int64, 0, len(sessions))
	for id, s := range sessions {
		ids = append(ids, id)
		secs = append(secs, s)
	}
	_, err := r.db.Exec(
		ctx,
		`
		INSERT INTO user_badge_stats (user_id, session_seconds, session_saved_at)
		SELECT id, s, NOW() FROM unnest($1::uuid[], $2::bigint[]) AS x(id, s)
		ON CONFLICT (user_id) DO UPDATE SET
			session_seconds = EXCLUDED.session_seconds,
			session_saved_at = EXCLUDED.session_saved_at
		`,
		ids, secs,
	)
	return err
}

// LoadSessions lê as sessões gravadas há menos de maxAge (o deploy acabou de
// reiniciar) e as consome: um reinício depois não as reaproveita de novo.
func (r *Repository) LoadSessions(ctx context.Context, maxAge time.Duration) (map[string]int64, error) {
	rows, err := r.db.Query(
		ctx,
		`
		UPDATE user_badge_stats SET session_seconds = 0, session_saved_at = NULL
		FROM (
			SELECT user_id, session_seconds AS s, session_saved_at AS at
			FROM user_badge_stats WHERE session_saved_at IS NOT NULL FOR UPDATE
		) old
		WHERE user_badge_stats.user_id = old.user_id
		RETURNING old.user_id, old.s, old.at > NOW() - make_interval(secs => $1)
		`,
		maxAge.Seconds(),
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := map[string]int64{}
	for rows.Next() {
		var id string
		var s int64
		var fresh bool
		if err := rows.Scan(&id, &s, &fresh); err != nil {
			return nil, err
		}
		if fresh && s > 0 {
			out[id] = s
		}
	}
	return out, rows.Err()
}

// escolhasSet vira a lista "enquete:opcao" num conjunto (nunca nil).
func escolhasSet(items []string) map[string]bool {
	out := make(map[string]bool, len(items))
	for _, it := range items {
		out[it] = true
	}
	return out
}
