package deviceobs

import (
	"context"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// ReportRepository: as leituras do painel (agregados por pessoa, por estado e
// por versão, e quem é dev). Os motivos ficam em Go (report_reasons.go).
type ReportRepository struct {
	db *pgxpool.Pool
}

func NewReportRepository(db *pgxpool.Pool) *ReportRepository {
	return &ReportRepository{db: db}
}

// Tetos de linhas lidas por painel (o grupo é pequeno; isso só protege o
// banco de um período cheio demais).
const (
	maxPeople   = 2000
	maxVersions = 50
)

// samplesCTE: as linhas do período com o contexto da abertura; cpu_app é a
// soma dos processos (vazio se nenhum foi medido) e visible_s, os segundos
// com a janela visível.
const samplesCTE = `WITH x AS (
	SELECT d.*, s.user_id, s.os, s.gpu, s.app_version, s.target, s.last_seen_at,
		s.mem_total_mb, s.startup_ms, s.gpu_status,
		s.gpu_status IN ('software', 'disabled') AS software_gpu,
		d.state IN ('call', 'transmitindo') AS in_call,
		CASE WHEN num_nonnulls(d.cpu_browser, d.cpu_renderer, d.cpu_gpu, d.cpu_other) > 0 THEN
			COALESCE(d.cpu_browser, 0) + COALESCE(d.cpu_renderer, 0) + COALESCE(d.cpu_gpu, 0) + COALESCE(d.cpu_other, 0)
		END::float8 AS cpu_app,
		(d.seconds * COALESCE(d.visible_pct, 0) / 100)::float8 AS visible_s
	FROM device_samples d
	JOIN device_sessions s ON s.id = d.session_id
	WHERE d.at >= $1
)
`

// timeAvg: média de expr pesada pelos segundos de cada linha (uma linha de
// 5 min vale cinco de 1 min), só nas linhas que mediram expr e, se cond não
// for vazio, que passam em cond. Vazio se nenhuma linha mediu.
func timeAvg(expr, cond string) string {
	where := expr + " IS NOT NULL"
	if cond != "" {
		where += " AND " + cond
	}
	return fmt.Sprintf("(SUM((%[1]s) * x.seconds) FILTER (WHERE %[2]s) / NULLIF(SUM(x.seconds) FILTER (WHERE %[2]s), 0))::float8",
		expr, where)
}

// Contexto (SO, placa, versão) da abertura vista por último.
var peopleSQL = samplesCTE + `
SELECT x.user_id::text, COALESCE(u.username, ''),
	(array_agg(x.os ORDER BY x.last_seen_at DESC))[1], (array_agg(x.gpu ORDER BY x.last_seen_at DESC))[1],
	(array_agg(x.app_version ORDER BY x.last_seen_at DESC))[1], (array_agg(x.target ORDER BY x.last_seen_at DESC))[1],
	count(*), SUM(x.seconds)::float8 / 60,
	` + timeAvg("x.cpu_app", "") + `, ` + timeAvg("x.cpu_renderer", "x.in_call") + `, ` + timeAvg("x.mem_app_mb", "") + `,
	MIN(x.sys_mem_free_mb)::float8, MAX(x.mem_total_mb)::float8, ` + timeAvg("x.sys_cpu_pct", "") + `,
	percentile_cont(0.5) WITHIN GROUP (ORDER BY x.lag_p95_ms),
	SUM(x.visible_s) / 60, SUM(x.long_ms)::float8 / NULLIF(SUM(x.visible_s) / 60, 0),
	SUM(x.slow_inputs), SUM(x.hangs), SUM(x.gpu_crashes), BOOL_OR(x.software_gpu),
	percentile_cont(0.5) WITHIN GROUP (ORDER BY x.ws_rtt_ms), MAX(x.startup_ms)::float8
FROM x
LEFT JOIN users u ON u.id = x.user_id
GROUP BY x.user_id, u.username
ORDER BY SUM(x.seconds) DESC, x.user_id
LIMIT $2`

func (p *PersonStats) fields() []any {
	return []any{&p.UserID, &p.Username, &p.OS, &p.GPU, &p.AppVersion, &p.Target, &p.Samples, &p.Minutes,
		&p.CPUApp, &p.CPURendererCall, &p.MemAppMB, &p.MemFreeMinMB, &p.MemTotalMB, &p.SysCPU, &p.LagP95Ms,
		&p.VisibleMinutes, &p.LongMsPerMin, &p.SlowInputs, &p.Hangs, &p.GPUCrashes, &p.SoftwareGPU,
		&p.WSRTTMs, &p.StartupMs}
}

// People: as pessoas com linhas desde from, quem mais usou primeiro.
func (r *ReportRepository) People(ctx context.Context, from time.Time) ([]PersonStats, error) {
	rows, err := r.db.Query(ctx, peopleSQL, from, maxPeople)
	if err != nil {
		return nil, fmt.Errorf("ler pessoas: %w", err)
	}
	return pgx.CollectRows(rows, func(row pgx.CollectableRow) (PersonStats, error) {
		var p PersonStats
		return p, row.Scan(p.fields()...)
	})
}

// Quadros longos por minuto de cada linha (só as que tiveram janela visível).
const baselineSQL = samplesCTE + `
SELECT x.state, count(*), count(DISTINCT x.user_id),
	percentile_cont(0.5) WITHIN GROUP (ORDER BY x.cpu_app), percentile_cont(0.9) WITHIN GROUP (ORDER BY x.cpu_app),
	percentile_cont(0.5) WITHIN GROUP (ORDER BY x.cpu_renderer),
	percentile_cont(0.5) WITHIN GROUP (ORDER BY x.mem_app_mb), percentile_cont(0.9) WITHIN GROUP (ORDER BY x.mem_app_mb),
	percentile_cont(0.5) WITHIN GROUP (ORDER BY x.lag_p95_ms),
	percentile_cont(0.5) WITHIN GROUP (ORDER BY x.long_ms / NULLIF(x.visible_s / 60, 0))
FROM x
GROUP BY x.state
ORDER BY array_position(ARRAY['parado', 'call', 'transmitindo'], x.state)`

func (b *BaselineRow) fields() []any {
	return []any{&b.State, &b.Samples, &b.People, &b.CPUAppP50, &b.CPUAppP90, &b.CPURendererP50,
		&b.MemAppP50, &b.MemAppP90, &b.LagP95P50, &b.LongMsPerMinP50}
}

// Baseline: a linha de base de cada estado presente desde from.
func (r *ReportRepository) Baseline(ctx context.Context, from time.Time) ([]BaselineRow, error) {
	rows, err := r.db.Query(ctx, baselineSQL, from)
	if err != nil {
		return nil, fmt.Errorf("ler linha de base: %w", err)
	}
	return pgx.CollectRows(rows, func(row pgx.CollectableRow) (BaselineRow, error) {
		var b BaselineRow
		return b, row.Scan(b.fields()...)
	})
}

var versionsSQL = samplesCTE + `
SELECT x.app_version, x.target, count(DISTINCT x.user_id), count(*),
	` + timeAvg("x.cpu_app", "x.in_call") + `, ` + timeAvg("x.mem_app_mb", "") + `,
	percentile_cont(0.5) WITHIN GROUP (ORDER BY x.lag_p95_ms),
	SUM(x.long_ms)::float8 / NULLIF(SUM(x.visible_s) / 60, 0),
	SUM(x.hangs), count(DISTINCT x.user_id) FILTER (WHERE x.software_gpu)
FROM x
GROUP BY x.app_version, x.target
ORDER BY x.app_version DESC, x.target
LIMIT $2`

func (v *VersionRow) fields() []any {
	return []any{&v.AppVersion, &v.Target, &v.People, &v.Samples, &v.CPUAppCall, &v.MemAppMB, &v.LagP95P50,
		&v.LongMsPerMin, &v.Hangs, &v.SoftwareGPUPeople}
}

// Versions: por versão do app e alvo, a mais nova primeiro (ordem de texto).
func (r *ReportRepository) Versions(ctx context.Context, from time.Time) ([]VersionRow, error) {
	rows, err := r.db.Query(ctx, versionsSQL, from, maxVersions)
	if err != nil {
		return nil, fmt.Errorf("ler versões: %w", err)
	}
	return pgx.CollectRows(rows, func(row pgx.CollectableRow) (VersionRow, error) {
		var v VersionRow
		return v, row.Scan(v.fields()...)
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
