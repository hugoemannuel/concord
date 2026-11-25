package liveobs

import (
	"context"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// ReportRepository: as leituras do painel (sessões agregadas, eventos e quem
// é dev). As séries do LiveKit vêm do ServerRepository.
type ReportRepository struct {
	db *pgxpool.Pool
}

func NewReportRepository(db *pgxpool.Pool) *ReportRepository {
	return &ReportRepository{db: db}
}

// maxSessions: teto de sessões lidas por painel (o grupo é pequeno; isso só
// protege o banco de um período cheio demais).
const maxSessions = 3000

// accessFailurePrefix: a falha na etapa de acesso (o token: chamada encerrada,
// sem permissão) não é queda de rede (telemetryConnection.ts, wherePhase).
const accessFailurePrefix = "entrando (acesso)"

// Minuto ruim da voz: os limites robotPct e badLossPct (report_quality.go).
// "Abaixo do alvo" (quem transmite): menos de 80% do fps escolhido ou o
// controlador num degrau abaixo do escolhido.
const sessionStatsSQL = `
SELECT s.id, s.user_id, COALESCE(u.username, ''), s.kind, COALESCE(s.call_id::text, ''),
	COALESCE(s.streamer_id::text, ''), s.os, s.gpu, s.app_version, s.target, s.cores, s.network, s.device,
	s.started_at, COALESCE(s.ended_at, s.last_seen_at),
	COALESCE(SUM(x.seconds), 0),
	COALESCE(mode() WITHIN GROUP (ORDER BY x.codec) FILTER (WHERE x.codec <> ''), ''),
	COALESCE(mode() WITHIN GROUP (ORDER BY x.transport) FILTER (WHERE x.transport <> ''), ''),
	AVG(x.fps), AVG(x.target_fps), AVG(x.height),
	AVG(CASE WHEN x.hardware THEN 1.0 WHEN NOT x.hardware THEN 0.0 END),
	AVG(CASE WHEN x.target_fps > 0 THEN
		CASE WHEN x.fps < 0.8 * x.target_fps OR x.step > 0 THEN 1.0 ELSE 0.0 END END),
	COALESCE(AVG(CASE WHEN x.limitation = 'cpu' THEN 1.0 ELSE 0.0 END), 0),
	COALESCE(AVG(CASE WHEN x.limitation = 'bandwidth' THEN 1.0 ELSE 0.0 END), 0),
	COALESCE(AVG(CASE WHEN x.backup THEN 1.0 ELSE 0.0 END), 0),
	COALESCE(AVG(CASE WHEN x.paused THEN 1.0 ELSE 0.0 END), 0),
	COALESCE(SUM(x.freezes), 0), COALESCE(SUM(x.freeze_ms), 0), COALESCE(SUM(x.step_changes), 0),
	AVG(x.bitrate_kbps), AVG(x.loss_pct), AVG(x.rtt_ms),
	AVG(x.capture_fps), AVG(x.recv_fps), AVG(x.codec_ms), AVG(x.concealed_pct), AVG(x.recv_loss_pct),
	AVG(x.connect_ms),
	COALESCE(SUM(x.seconds) FILTER (WHERE x.concealed_pct >= 3), 0) / 60,
	COALESCE(SUM(x.seconds) FILTER (WHERE x.recv_loss_pct >= 5), 0) / 60,
	COALESCE(SUM(x.seconds) FILTER (WHERE x.concealed_pct >= 3 OR x.recv_loss_pct >= 5), 0) / 60,
	(SELECT count(*) FROM live_events e WHERE e.session_id = s.id AND e.type = 'reconectou'),
	(SELECT count(*) FROM live_events e WHERE e.session_id = s.id AND e.type = 'conexao_falhou'
		AND e.detail NOT LIKE '` + accessFailurePrefix + `%'),
	(SELECT count(*) FROM live_events e WHERE e.session_id = s.id AND e.type = 'conexao_falhou'
		AND e.detail LIKE '` + accessFailurePrefix + `%'),
	(SELECT count(*) FROM live_events e WHERE e.session_id = s.id AND e.type = 'segundo_plano'),
	(SELECT count(*) FROM live_events e WHERE e.session_id = s.id AND e.type = 'rede_trocou')
FROM live_sessions s
LEFT JOIN users u ON u.id = s.user_id
LEFT JOIN live_samples x ON x.session_id = s.id
WHERE s.last_seen_at >= $1
GROUP BY s.id, u.username
ORDER BY s.started_at DESC
LIMIT $2`

func (s *SessionStats) fields() []any {
	return []any{&s.ID, &s.UserID, &s.Username, &s.Kind, &s.CallID, &s.StreamerID, &s.OS, &s.GPU,
		&s.AppVersion, &s.Target, &s.Cores, &s.Network, &s.Device, &s.StartedAt, &s.EndedAt, &s.Seconds, &s.Codec, &s.Transport,
		&s.FPS, &s.TargetFPS, &s.Height, &s.HardwareRatio, &s.BelowRatio, &s.CPURatio, &s.BandwidthRatio,
		&s.BackupRatio, &s.PausedRatio, &s.Freezes, &s.FreezeMs, &s.StepChanges, &s.BitrateKbps, &s.LossPct, &s.RTTMs,
		&s.CaptureFPS, &s.RecvFPS, &s.CodecMs, &s.ConcealedPct, &s.RecvLossPct, &s.ConnectMs,
		&s.RoboticMinutes, &s.LossMinutes, &s.BadMinutes, &s.Reconnects, &s.Failures, &s.AccessFailures,
		&s.Backgrounds, &s.NetworkChanges}
}

// Sessions: as sessões vistas desde from, agregadas, da mais recente.
func (r *ReportRepository) Sessions(ctx context.Context, from time.Time) ([]SessionStats, error) {
	rows, err := r.db.Query(ctx, sessionStatsSQL, from, maxSessions)
	if err != nil {
		return nil, fmt.Errorf("ler sessões: %w", err)
	}
	return pgx.CollectRows(rows, func(row pgx.CollectableRow) (SessionStats, error) {
		var s SessionStats
		return s, row.Scan(s.fields()...)
	})
}

// Events: os eventos mais recentes desde from.
func (r *ReportRepository) Events(ctx context.Context, from time.Time, limit int) ([]EventRow, error) {
	rows, err := r.db.Query(ctx, `SELECT e.at, e.type, e.detail, s.kind, COALESCE(u.username, '')
		FROM live_events e
		JOIN live_sessions s ON s.id = e.session_id
		LEFT JOIN users u ON u.id = s.user_id
		WHERE e.at >= $1
		ORDER BY e.at DESC, e.id DESC
		LIMIT $2`, from, limit)
	if err != nil {
		return nil, fmt.Errorf("ler eventos: %w", err)
	}
	return pgx.CollectRows(rows, func(row pgx.CollectableRow) (EventRow, error) {
		var e EventRow
		return e, row.Scan(&e.At, &e.Type, &e.Detail, &e.Kind, &e.Username)
	})
}

// IsDev: a pessoa está em dev_badge_users (os devs do Salinha, badge Fundador).
func (r *ReportRepository) IsDev(ctx context.Context, userID string) (bool, error) {
	var dev bool
	err := r.db.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM dev_badge_users WHERE user_id = $1)`, userID).Scan(&dev)
	if err != nil {
		return false, fmt.Errorf("conferir dev: %w", err)
	}
	return dev, nil
}
