package alert

import (
	"context"
	"errors"
	"fmt"
	"log"
	"sync"
	"time"
)

// evaluateEvery: as regras são avaliadas uma vez por minuto (a fonte principal,
// livekit_metrics, também é por minuto).
const evaluateEvery = time.Minute

// incidentStore: os incidentes no banco (Repository).
type incidentStore interface {
	OpenIncidents(ctx context.Context) ([]Incident, error)
	InsertIncident(ctx context.Context, inc *Incident) error
	UpdateIncident(ctx context.Context, inc Incident) error
	CloseIncident(ctx context.Context, id int64, at time.Time) error
}

// sender escreve no canal (Poster).
type sender interface {
	Send(ctx context.Context, ch ChannelKind, level Level, text string) error
}

// Engine avalia as regras, guarda o incidente aberto de cada uma e posta só
// nas mudanças: disparou, piorou, normalizou e um lembrete espaçado.
type Engine struct {
	rules []Rule
	store incidentStore
	post  sender
	texts texts
	muted map[string]bool
	now   func() time.Time

	// mu: Evaluate (a cada minuto) e Notify (boot, banco, systemd) em paralelo.
	mu      sync.Mutex
	streaks map[string]*streak
	open    map[string]*Incident
	last    map[string]Reading
}

// NewEngine: muted são os IDs de ALERTS_MUTED (gravam, não postam).
func NewEngine(rules []Rule, store incidentStore, post sender, appURL string, muted []string) *Engine {
	e := &Engine{
		rules: rules, store: store, post: post, texts: texts{appURL: appURL}, now: time.Now,
		muted: map[string]bool{}, streaks: map[string]*streak{}, open: map[string]*Incident{}, last: map[string]Reading{},
	}
	for _, id := range muted {
		e.muted[id] = true
	}
	return e
}

// Load lê os incidentes abertos (o estado de antes do reinício). O de uma
// regra que não existe mais é fechado.
func (e *Engine) Load(ctx context.Context) error {
	e.mu.Lock()
	defer e.mu.Unlock()
	open, err := e.store.OpenIncidents(ctx)
	if err != nil {
		return fmt.Errorf("ler incidentes abertos: %w", err)
	}
	known := map[string]bool{}
	for _, r := range e.rules {
		known[r.ID] = true
	}
	var errs []error
	for i := range open {
		inc := open[i]
		if !known[inc.RuleID] {
			errs = append(errs, e.store.CloseIncident(ctx, inc.ID, e.now()))
			continue
		}
		e.open[inc.RuleID] = &inc
	}
	return errors.Join(errs...)
}

// Run avalia já e depois a cada minuto, até ctx acabar.
func (e *Engine) Run(ctx context.Context) {
	ticker := time.NewTicker(evaluateEvery)
	defer ticker.Stop()
	for {
		if err := e.Evaluate(ctx); err != nil {
			log.Printf("[alert] avaliação: %v", err)
		}
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
		}
	}
}

// Evaluate avalia todas as regras uma vez (o erro de uma não impede as outras).
func (e *Engine) Evaluate(ctx context.Context) error {
	e.mu.Lock()
	defer e.mu.Unlock()
	var errs []error
	for _, rule := range e.rules {
		if err := e.evaluate(ctx, rule); err != nil {
			errs = append(errs, fmt.Errorf("%s: %w", rule.ID, err))
		}
	}
	return errors.Join(errs...)
}

func (e *Engine) evaluate(ctx context.Context, rule Rule) error {
	now := e.now()
	reading, checkErr := rule.Check(ctx, now)
	if checkErr != nil {
		reading = Reading{Level: LevelUnknown}
	}
	s := e.streakOf(rule.ID)
	s.observe(reading.Level, now)
	if reading.Level >= LevelWarning {
		e.last[rule.ID] = reading
	}
	act := decide(e.open[rule.ID], s.held(rule.Hold, now), now)
	return errors.Join(checkErr, e.apply(ctx, rule, act, s, now))
}

func (e *Engine) streakOf(id string) *streak {
	s, ok := e.streaks[id]
	if !ok {
		s = &streak{}
		e.streaks[id] = s
	}
	return s
}

func (e *Engine) apply(ctx context.Context, rule Rule, act action, s *streak, now time.Time) error {
	switch act {
	case actFire:
		return e.fire(ctx, rule, s, now)
	case actEscalate:
		return e.escalate(ctx, rule, s, now)
	case actResolve:
		return e.resolve(ctx, rule, now)
	case actRemind:
		return e.remind(ctx, rule, now)
	}
	return e.refreshText(ctx, rule)
}

func (e *Engine) fire(ctx context.Context, rule Rule, s *streak, now time.Time) error {
	level := s.held(rule.Hold, now)
	reading := Reading{Level: level, Text: e.last[rule.ID].Text}
	since := s.since(level)
	inc := &Incident{RuleID: rule.ID, Channel: string(rule.Channel), Severity: level.Severity(), StartedAt: since, LastMessageAt: &now, Text: reading.Text}
	if err := e.store.InsertIncident(ctx, inc); err != nil {
		return fmt.Errorf("abrir incidente: %w", err)
	}
	e.open[rule.ID] = inc
	return e.send(ctx, rule.ID, rule.Channel, level, e.texts.fire(rule, reading, since, now))
}

func (e *Engine) escalate(ctx context.Context, rule Rule, s *streak, now time.Time) error {
	inc := e.open[rule.ID]
	reading := Reading{Level: LevelCritical, Text: e.last[rule.ID].Text}
	inc.Severity, inc.Text, inc.LastMessageAt = LevelCritical.Severity(), reading.Text, &now
	if err := e.store.UpdateIncident(ctx, *inc); err != nil {
		return fmt.Errorf("agravar incidente: %w", err)
	}
	return e.send(ctx, rule.ID, rule.Channel, LevelCritical, e.texts.escalate(rule, reading, s.since(LevelCritical), now))
}

func (e *Engine) remind(ctx context.Context, rule Rule, now time.Time) error {
	inc := e.open[rule.ID]
	reading := e.last[rule.ID]
	inc.Text, inc.LastMessageAt = reading.Text, &now
	if err := e.store.UpdateIncident(ctx, *inc); err != nil {
		return fmt.Errorf("lembrete: %w", err)
	}
	return e.send(ctx, rule.ID, rule.Channel, LevelWarning, e.texts.remind(rule, reading, inc.StartedAt, now))
}

func (e *Engine) resolve(ctx context.Context, rule Rule, now time.Time) error {
	inc := e.open[rule.ID]
	if err := e.store.CloseIncident(ctx, inc.ID, now); err != nil {
		return fmt.Errorf("fechar incidente: %w", err)
	}
	delete(e.open, rule.ID)
	return e.send(ctx, rule.ID, rule.Channel, LevelWarning, e.texts.resolve(rule, inc.StartedAt, now))
}

// refreshText: o incidente aberto guarda o último número visto (o painel
// mostra o de agora), sem postar.
func (e *Engine) refreshText(ctx context.Context, rule Rule) error {
	inc, ok := e.open[rule.ID]
	text := e.last[rule.ID].Text
	if !ok || text == "" || text == inc.Text {
		return nil
	}
	inc.Text = text
	return e.store.UpdateIncident(ctx, *inc)
}

// Notify: um acontecimento de uma vez (backend voltou, banco voltou, unidade
// falhou) vira um incidente já fechado e uma mensagem.
func (e *Engine) Notify(ctx context.Context, ev Event) error {
	e.mu.Lock()
	defer e.mu.Unlock()
	now := e.now()
	ended := ev.EndedAt
	inc := &Incident{RuleID: ev.RuleID, Channel: string(ev.Channel), Severity: ev.Level.Severity(), StartedAt: ev.StartedAt, EndedAt: &ended, LastMessageAt: &now, Text: ev.Text}
	if err := e.store.InsertIncident(ctx, inc); err != nil {
		return fmt.Errorf("gravar %s: %w", ev.RuleID, err)
	}
	return e.send(ctx, ev.RuleID, ev.Channel, ev.Level, ev.Text)
}

// Announce posta sem gravar incidente (o "backend no ar" de um reinício limpo).
func (e *Engine) Announce(ctx context.Context, ruleID string, ch ChannelKind, text string) error {
	e.mu.Lock()
	defer e.mu.Unlock()
	return e.send(ctx, ruleID, ch, LevelWarning, text)
}

// IsOpen: a regra está disparada agora?
func (e *Engine) IsOpen(ruleID string) bool {
	e.mu.Lock()
	defer e.mu.Unlock()
	_, ok := e.open[ruleID]
	return ok
}

func (e *Engine) send(ctx context.Context, ruleID string, ch ChannelKind, level Level, text string) error {
	if e.muted[ruleID] {
		return nil
	}
	if err := e.post.Send(ctx, ch, level, text); err != nil {
		return fmt.Errorf("postar: %w", err)
	}
	return nil
}
