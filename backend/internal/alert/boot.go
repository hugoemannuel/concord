package alert

import (
	"context"
	"fmt"
	"log"
	"runtime/debug"
	"time"
)

// Regra 1: o backend avisa ao subir, com a versão, e diz se ficou fora e por
// quê. Parada limpa (deploy, systemctl stop) grava backend_runs.stopped_at no
// SIGTERM; sem ela o processo caiu ou a VPS parou de repente. A última linha
// do livekit_metrics (o coletor grava uma por minuto) diz até quando o backend
// estava vivo.

// downAfter: queda abrupta mais curta que isso é "caiu e voltou sozinho".
const downAfter = 3 * time.Minute

// runStore: backend_runs e o último minuto coletado (Repository).
type runStore interface {
	StartRun(ctx context.Context, version string, at time.Time) (int64, *Run, error)
	StopRun(ctx context.Context, id int64, at time.Time) error
	LastMinute(ctx context.Context) (*time.Time, error)
}

// bootNotifier: o que o boot usa do Engine.
type bootNotifier interface {
	Evaluate(ctx context.Context) error
	IsOpen(ruleID string) bool
	Notify(ctx context.Context, ev Event) error
	Announce(ctx context.Context, ruleID string, ch ChannelKind, text string) error
}

// Lifecycle grava o boot e a parada do backend.
type Lifecycle struct {
	runs    runStore
	alerts  bootNotifier
	version string
	now     func() time.Time
	id      int64
}

func NewLifecycle(runs runStore, alerts bootNotifier, version string) *Lifecycle {
	return &Lifecycle{runs: runs, alerts: alerts, version: version, now: time.Now}
}

// Boot grava este boot e posta o "backend no ar" (ou de quando a quando ficou
// fora). Com o backend reiniciando sem parar, só o crítico da regra
// restart_loop sai, uma vez.
func (l *Lifecycle) Boot(ctx context.Context) error {
	now := l.now()
	id, prev, err := l.runs.StartRun(ctx, l.version, now)
	if err != nil {
		return err
	}
	l.id = id
	last, err := l.runs.LastMinute(ctx)
	if err != nil {
		log.Printf("[alert] boot: %v", err)
	}
	if err := l.alerts.Evaluate(ctx); err != nil {
		log.Printf("[alert] boot: %v", err)
	}
	if l.alerts.IsOpen(restartLoopRuleID) {
		return nil
	}
	return l.report(ctx, bootReport(prev, last, now, l.version))
}

func (l *Lifecycle) report(ctx context.Context, b bootOutcome) error {
	if b.event != nil {
		return l.alerts.Notify(ctx, *b.event)
	}
	return l.alerts.Announce(ctx, backendDownRuleID, ChannelInfra, b.text)
}

// Stop marca a parada limpa (chamado no SIGTERM, com o contexto do desligamento).
func (l *Lifecycle) Stop(ctx context.Context) error {
	if l.id == 0 {
		return nil
	}
	return l.runs.StopRun(ctx, l.id, l.now())
}

// bootOutcome: o que postar no boot: um anúncio (text) ou uma queda (event).
type bootOutcome struct {
	text  string
	event *Event
}

// bootReport decide a mensagem do boot pelo boot anterior e pelo último
// minuto coletado.
func bootReport(prev *Run, lastMinute *time.Time, now time.Time, version string) bootOutcome {
	switch {
	case prev == nil:
		return bootOutcome{text: bootFirstText(version)}
	case prev.StoppedAt != nil:
		return bootOutcome{text: bootCleanText(version, now.Sub(*prev.StoppedAt))}
	}
	alive := lastAlive(*prev, lastMinute)
	ev := Event{RuleID: backendDownRuleID, Channel: ChannelInfra, Level: LevelWarning, StartedAt: alive, EndedAt: now}
	if now.Sub(alive) < downAfter {
		ev.Text = bootCrashText(version, now.Sub(alive))
	} else {
		ev.Text = bootDownText(version, alive, now)
	}
	return bootOutcome{event: &ev}
}

// lastAlive: o último sinal de vida do boot anterior (o começo dele ou o
// último minuto coletado depois disso).
func lastAlive(prev Run, lastMinute *time.Time) time.Time {
	if lastMinute != nil && lastMinute.After(prev.StartedAt) {
		return *lastMinute
	}
	return prev.StartedAt
}

// BuildVersion: o commit (7 letras) e a data dele, que o go build grava no
// binário a partir do git ("a1b2c3d de 25/11 13:50"); "dev" sem isso.
func BuildVersion() string {
	info, ok := debug.ReadBuildInfo()
	if !ok {
		return "dev"
	}
	return versionOf(info.Settings)
}

func versionOf(settings []debug.BuildSetting) string {
	var rev, at string
	for _, s := range settings {
		switch s.Key {
		case "vcs.revision":
			rev = s.Value
		case "vcs.time":
			at = s.Value
		}
	}
	if len(rev) < 7 {
		return "dev"
	}
	t, err := time.Parse(time.RFC3339, at)
	if err != nil {
		return rev[:7]
	}
	return fmt.Sprintf("%s de %s", rev[:7], t.In(zone).Format("02/01 15:04"))
}
