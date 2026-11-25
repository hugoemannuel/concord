package deviceobs

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Repository: device_sessions e device_samples (migration 000213).
type Repository struct {
	db *pgxpool.Pool
}

func NewRepository(db *pgxpool.Pool) *Repository {
	return &Repository{db: db}
}

// Save grava um pedido numa transação: cria ou renova a sessão (só quem a
// criou) e grava as linhas. Sessão de outra pessoa: o lote é pulado, sem erro.
func (r *Repository) Save(ctx context.Context, userID string, b Batch) error {
	return pgx.BeginFunc(ctx, r.db, func(tx pgx.Tx) error {
		owned, err := upsertSession(ctx, tx, userID, b.Session)
		if err != nil || !owned {
			return err
		}
		return insertSamples(ctx, tx, b.Session.ID, b.Samples)
	})
}

// upsertSession: sem linha de volta = a sessão é de outra pessoa. Status da
// GPU e tempo de abertura só mudam quando vêm preenchidos.
func upsertSession(ctx context.Context, tx pgx.Tx, userID string, s Session) (bool, error) {
	var one int
	err := tx.QueryRow(ctx, `INSERT INTO device_sessions
			(id, user_id, os, app_version, target, gpu, cores, mem_total_mb, startup_ms, gpu_status)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
		ON CONFLICT (id) DO UPDATE SET
			last_seen_at = NOW(),
			startup_ms = COALESCE(EXCLUDED.startup_ms, device_sessions.startup_ms),
			gpu_status = COALESCE(NULLIF(EXCLUDED.gpu_status, ''), device_sessions.gpu_status)
		WHERE device_sessions.user_id = EXCLUDED.user_id
		RETURNING 1`,
		s.ID, userID, s.OS, s.AppVersion, s.Target, s.GPU, s.Cores, s.MemTotalMB, s.StartupMs, s.GPUStatus,
	).Scan(&one)
	if errors.Is(err, pgx.ErrNoRows) {
		return false, nil
	}
	if err != nil {
		return false, fmt.Errorf("gravar device_sessions: %w", err)
	}
	return true, nil
}

// insertSamples grava as linhas numa ida ao banco; at = agora − ago_s.
func insertSamples(ctx context.Context, tx pgx.Tx, sessionID string, samples []Sample) error {
	batch := &pgx.Batch{}
	for _, s := range samples {
		batch.Queue(insertSampleSQL, sampleArgs(sessionID, s)...)
	}
	if err := tx.SendBatch(ctx, batch).Close(); err != nil {
		return fmt.Errorf("gravar device_samples: %w", err)
	}
	return nil
}

const insertSampleSQL = `INSERT INTO device_samples
	(session_id, at, seconds, state, watching, game, visible_pct, focused_pct,
	 cpu_browser, cpu_renderer, cpu_gpu, cpu_other, cpu_app_max, mem_app_mb, mem_renderer_mb, mem_gpu_mb,
	 cpu_helpers, mem_helpers_mb, sys_cpu_pct, sys_mem_free_mb, load_avg, on_battery, speed_limit_pct,
	 hangs, gpu_crashes, lag_p95_ms, lag_max_ms, long_count, long_ms, long_max_ms, slow_inputs, input_max_ms,
	 heap_mb, ws_rtt_ms, ws_rtt_max_ms, api_ms_p50, api_ms_p95, api_count)
	VALUES ($1, NOW() - make_interval(secs => $2), $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15,
	 $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, $32, $33, $34, $35,
	 $36, $37, $38)`

func sampleArgs(sessionID string, s Sample) []any {
	return []any{sessionID, s.AgoS, s.Seconds, s.State, s.Watching, s.Game, s.VisiblePct, s.FocusedPct,
		s.CPUBrowser, s.CPURenderer, s.CPUGPU, s.CPUOther, s.CPUAppMax, s.MemAppMB, s.MemRendererMB, s.MemGPUMB,
		s.CPUHelpers, s.MemHelpersMB, s.SysCPUPct, s.SysMemFreeMB, s.LoadAvg, s.OnBattery, s.SpeedLimitPct,
		s.Hangs, s.GPUCrashes, s.LagP95Ms, s.LagMaxMs, s.LongCount, s.LongMs, s.LongMaxMs, s.SlowInputs,
		s.InputMaxMs, s.HeapMB, s.WSRTTMs, s.WSRTTMaxMs, s.APIMsP50, s.APIMsP95, s.APICount}
}

// Prune apaga as linhas de antes de before e as sessões vistas pela última
// vez antes disso (as linhas delas vão junto, por cascata).
func (r *Repository) Prune(ctx context.Context, before time.Time) error {
	if _, err := r.db.Exec(ctx, `DELETE FROM device_samples WHERE at < $1`, before); err != nil {
		return fmt.Errorf("apagar device_samples antigas: %w", err)
	}
	if _, err := r.db.Exec(ctx, `DELETE FROM device_sessions WHERE last_seen_at < $1`, before); err != nil {
		return fmt.Errorf("apagar device_sessions antigas: %w", err)
	}
	return nil
}
