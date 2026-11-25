package liveobs

import (
	"context"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"
)

// Retomada da call (ADR 0032, emenda de 2026-11-25): quando o app recomeça no
// meio da call (atualização com retomada, crash, recarga), a sessão de voz
// antiga nunca manda o fim. A sessão nova da mesma pessoa na mesma call fecha
// a antiga no último sinal dela e ganha o evento `retomou`, com o buraco e a
// troca de versão. A antiga tem de estar parada há 30 s–5 min: menos que isso
// pode ser outro aparelho ainda mandando; mais, é outra entrada.
const resumeSQL = `WITH closed AS (
		UPDATE live_sessions o SET ended_at = o.last_seen_at
		FROM live_sessions n
		WHERE n.id = $1 AND o.user_id = n.user_id AND o.kind = 'call' AND o.call_id = n.call_id
			AND o.id <> n.id AND o.ended_at IS NULL
			AND o.last_seen_at < n.started_at - interval '30 seconds'
			AND o.last_seen_at > n.started_at - interval '5 minutes'
		RETURNING o.id, o.last_seen_at, o.app_version
	), ends AS (
		INSERT INTO live_events (session_id, type, at) SELECT id, 'fim', last_seen_at FROM closed
	)
	SELECT round(extract(epoch FROM n.started_at - c.last_seen_at))::int, c.app_version, n.app_version
	FROM closed c, live_sessions n
	WHERE n.id = $1
	ORDER BY c.last_seen_at DESC
	LIMIT 1`

// resumed: o buraco da retomada e as versões antes e depois.
type resumed struct {
	gapSeconds int
	from, to   string
}

// detail: "73 s" ou "73 s · 0.6.97 → 0.6.98".
func (r resumed) detail() string {
	gap := fmt.Sprintf("%d s", r.gapSeconds)
	if r.from == r.to {
		return gap
	}
	return fmt.Sprintf("%s · %s → %s", gap, orDash(r.from), orDash(r.to))
}

func orDash(s string) string {
	if s == "" {
		return "—"
	}
	return s
}

// resumeCandidates: as sessões de voz que acabaram de nascer (só elas retomam).
func resumeCandidates(owned []ownedReport) []int {
	var out []int
	for i, o := range owned {
		if o.inserted && o.rep.Kind == KindCall && o.rep.CallID != "" {
			out = append(out, i)
		}
	}
	return out
}

// resumeCalls fecha as sessões antigas retomadas e põe o `retomou` nos
// eventos da sessão nova (gravados depois, com os outros).
func resumeCalls(ctx context.Context, tx pgx.Tx, owned []ownedReport) error {
	idx := resumeCandidates(owned)
	if len(idx) == 0 {
		return nil
	}
	batch := &pgx.Batch{}
	for _, i := range idx {
		batch.Queue(resumeSQL, owned[i].rep.SessionID)
	}
	results := tx.SendBatch(ctx, batch)
	defer results.Close()
	for _, i := range idx {
		var r resumed
		err := results.QueryRow().Scan(&r.gapSeconds, &r.from, &r.to)
		if errors.Is(err, pgx.ErrNoRows) {
			continue
		}
		if err != nil {
			return fmt.Errorf("retomada da call: %w", err)
		}
		rep := &owned[i].rep
		rep.Events = append(rep.Events, Event{Type: EventResumed, Detail: r.detail(), AgoMs: rep.AgoMs})
	}
	return results.Close()
}
