package liveobs

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// ErrNotOwner: a sessão existe e é de outra pessoa (o relatório é ignorado).
var ErrNotOwner = errors.New("sessão de outra pessoa")

// TelemetryRepository: live_sessions, live_samples e live_events (migration 000173).
type TelemetryRepository struct {
	db *pgxpool.Pool
}

func NewTelemetryRepository(db *pgxpool.Pool) *TelemetryRepository {
	return &TelemetryRepository{db: db}
}

// SaveAll grava os relatórios de um pedido numa transação só: as sessões
// (cria ou renova, só quem a criou) numa ida ao banco e as amostras e os
// eventos noutra; início e fim viram eventos do servidor. Sessão de outra
// pessoa é pulada.
func (r *TelemetryRepository) SaveAll(ctx context.Context, userID string, reps []Report) error {
	_, err := r.saveAll(ctx, userID, reps)
	return err
}

// Save grava um relatório; sessão de outra pessoa = ErrNotOwner.
func (r *TelemetryRepository) Save(ctx context.Context, userID string, rep Report) error {
	owned, err := r.saveAll(ctx, userID, []Report{rep})
	if err == nil && owned == 0 {
		return ErrNotOwner
	}
	return err
}

// saveAll devolve quantos relatórios eram de sessões da pessoa.
func (r *TelemetryRepository) saveAll(ctx context.Context, userID string, reps []Report) (int, error) {
	var owned int
	err := pgx.BeginFunc(ctx, r.db, func(tx pgx.Tx) error {
		saved, err := upsertSessions(ctx, tx, userID, reps)
		if err != nil {
			return err
		}
		owned = len(saved)
		if err := resumeCalls(ctx, tx, saved); err != nil {
			return err
		}
		return insertDetails(ctx, tx, saved)
	})
	return owned, err
}

// ownedReport: relatório de uma sessão da pessoa, se a sessão é nova e se
// este relatório a fechou (o fim vem uma vez só, mesmo reenviado ou depois de
// o servidor fechá-la).
type ownedReport struct {
	rep      Report
	inserted bool
	endedNow bool
}

// sessionEvents: os do app, com o início (sessão nova, antes de qualquer
// evento) e o fim (na hora em que o app montou o relatório).
func sessionEvents(o ownedReport) []Event {
	events := o.rep.Events
	if o.inserted {
		events = append([]Event{{Type: EventStart, AgoMs: startAgo(o.rep)}}, events...)
	}
	if o.endedNow {
		events = append(events, Event{Type: EventEnd, AgoMs: o.rep.AgoMs})
	}
	return events
}

// startAgo: a sessão começa no mais velho entre o relatório e os eventos dele.
func startAgo(rep Report) int {
	ago := rep.AgoMs
	for _, e := range rep.Events {
		ago = max(ago, e.AgoMs)
	}
	return ago
}

func nullable(s string) any {
	if s == "" {
		return nil
	}
	return s
}

// upsertSessions cria ou renova as sessões numa ida ao banco e devolve os
// relatórios das que são da pessoa (as de outra pessoa ficam de fora).
func upsertSessions(ctx context.Context, tx pgx.Tx, userID string, reps []Report) ([]ownedReport, error) {
	batch := &pgx.Batch{}
	for _, rep := range reps {
		queueUpsertSession(batch, userID, rep)
	}
	results := tx.SendBatch(ctx, batch)
	defer results.Close()
	owned := make([]ownedReport, 0, len(reps))
	for _, rep := range reps {
		var inserted, endedNow bool
		err := results.QueryRow().Scan(&inserted, &endedNow)
		if errors.Is(err, pgx.ErrNoRows) {
			continue
		}
		if err != nil {
			return nil, fmt.Errorf("gravar live_sessions: %w", err)
		}
		owned = append(owned, ownedReport{rep: rep, inserted: inserted, endedNow: endedNow})
	}
	return owned, results.Close()
}

// queueUpsertSession: sem linha de volta = a sessão é de outra pessoa. As
// horas são as de quando o app montou o relatório (AgoMs; o início, no evento
// mais velho); o último sinal não volta no tempo com um reenvio atrasado.
// Devolve se a sessão é nova e se este relatório a fechou agora.
func queueUpsertSession(batch *pgx.Batch, userID string, rep Report) {
	c := rep.Context
	batch.Queue(`WITH before AS (SELECT ended_at FROM live_sessions WHERE id = $1)
		INSERT INTO live_sessions
			(id, user_id, kind, call_id, streamer_id, os, app_version, target, gpu, network, cores, device,
			 started_at, last_seen_at, ended_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12,
			NOW() - $15 * interval '1 millisecond', NOW() - $14 * interval '1 millisecond',
			CASE WHEN $13 THEN NOW() - $14 * interval '1 millisecond' END)
		ON CONFLICT (id) DO UPDATE SET
			last_seen_at = GREATEST(live_sessions.last_seen_at, EXCLUDED.last_seen_at),
			network = EXCLUDED.network,
			ended_at = COALESCE(live_sessions.ended_at, EXCLUDED.ended_at)
		WHERE live_sessions.user_id = EXCLUDED.user_id
		RETURNING (xmax = 0),
			$13 AND NOT EXISTS (SELECT 1 FROM before WHERE before.ended_at IS NOT NULL)`,
		rep.SessionID, userID, rep.Kind, nullable(rep.CallID), nullable(rep.StreamerID),
		c.OS, c.AppVersion, c.Target, c.GPU, c.Network, c.Cores, c.Device, rep.Ended, rep.AgoMs,
		startAgo(rep),
	)
}

// insertDetails grava as amostras e os eventos numa ida ao banco (os eventos
// num INSERT só, na ordem).
func insertDetails(ctx context.Context, tx pgx.Tx, owned []ownedReport) error {
	batch := &pgx.Batch{}
	for _, o := range owned {
		queueSample(batch, o.rep.SessionID, o.rep.Sample)
	}
	if cols := eventColumns(owned); len(cols.sessions) > 0 {
		batch.Queue(`INSERT INTO live_events (session_id, type, detail, at)
			SELECT s, t, d, NOW() - a * interval '1 millisecond'
			FROM unnest($1::uuid[], $2::text[], $3::text[], $4::int[]) AS u(s, t, d, a)`,
			cols.sessions, cols.types, cols.details, cols.agos)
	}
	if batch.Len() == 0 {
		return nil
	}
	if err := tx.SendBatch(ctx, batch).Close(); err != nil {
		return fmt.Errorf("gravar amostras e eventos: %w", err)
	}
	return nil
}

// eventCols: os eventos de todas as sessões em colunas (para o unnest).
type eventCols struct {
	sessions, types, details []string
	agos                     []int
}

// eventColumns: os eventos de todas as sessões em colunas, na ordem.
func eventColumns(owned []ownedReport) eventCols {
	var c eventCols
	for _, o := range owned {
		for _, e := range sessionEvents(o) {
			c.sessions = append(c.sessions, o.rep.SessionID)
			c.types = append(c.types, e.Type)
			c.details = append(c.details, e.Detail)
			c.agos = append(c.agos, e.AgoMs)
		}
	}
	return c
}

func queueSample(batch *pgx.Batch, sessionID string, s *Sample) {
	if s == nil {
		return
	}
	args := []any{sessionID, s.Seconds, s.Codec, s.Hardware, s.Width, s.Height, s.FPS, s.TargetHeight, s.TargetFPS,
		s.BitrateKbps, s.Limitation, s.Step, s.StepChanges, s.Layers, s.Backup, s.LossPct, s.JitterMs, s.RTTMs,
		s.Freezes, s.FreezeMs, s.Dropped, s.KeyFrames, s.PLI, s.NACK, s.Transport, s.Paused,
		s.CaptureFPS, s.RecvFPS, s.CodecMs, s.ConcealedPct, s.RecvLossPct, s.ConnectMs}
	batch.Queue(`INSERT INTO live_samples
		(session_id, seconds, codec, hardware, width, height, fps, target_height, target_fps,
		 bitrate_kbps, limitation, step, step_changes, layers, backup, loss_pct, jitter_ms, rtt_ms,
		 freezes, freeze_ms, frames_dropped, key_frames, pli, nack, transport, paused,
		 capture_fps, recv_fps, codec_ms, concealed_pct, recv_loss_pct, connect_ms,
		 qp, start_ms, source_width, source_height, surface, dsp_underrun_pct, dsp, playout_synth_pct,
		 cam_fps, cam_height, cam_limitation, cam_freezes)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,
		 $27,$28,$29,$30,$31,$32,$33,$34,$35,$36,$37,$38,$39,$40,$41,$42,$43,$44)`,
		append(args, s.MediaSignals.values()...)...)
}

// Prune apaga as sessões vistas pela última vez antes de before (amostras e
// eventos vão junto, por cascata).
func (r *TelemetryRepository) Prune(ctx context.Context, before time.Time) error {
	if _, err := r.db.Exec(ctx, `DELETE FROM live_sessions WHERE last_seen_at < $1`, before); err != nil {
		return fmt.Errorf("apagar live_sessions antigas: %w", err)
	}
	return nil
}
