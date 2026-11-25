package alert

import (
	"context"
	"fmt"
	"time"

	"gin-quickstart/backend/internal/apperrors"
)

// Erro novo (#erros): cada grupo de erro do app visto pela primeira vez
// (app_error_groups.first_seen, ADR 0068) vira uma mensagem, com o tipo, a
// origem, a versão e o link da aba Erros. Teto de 5 por hora: uma versão ruim
// que cria dezenas de grupos sai como uma mensagem só ("mais N erros novos"),
// no máximo uma por hora; o resto vai só para o histórico. O cursor é o
// first_seen do último grupo avisado (gravado no incidente), então reiniciar
// não repete nem pula; nunca volta mais de 1 h (alertas desligados por dias
// não viram enxurrada ao ligar).
const (
	errorNewRuleID  = "error_new"
	errorNewEvery   = time.Minute
	errorNewPerHour = 5
	errorNewMaxBack = time.Hour
	errorTextMax    = 140
)

type newErrorSource interface {
	GroupsFirstSeenSince(ctx context.Context, since time.Time) ([]apperrors.GroupHead, error)
}

// ErrorWatch: o vigia dos erros novos.
type ErrorWatch struct {
	src     newErrorSource
	history lastIncidentSource
	notify  func(ctx context.Context, ev Event) error
	texts   texts
	now     func() time.Time

	cursor  time.Time
	sent    []time.Time
	summary time.Time
}

func NewErrorWatch(src newErrorSource, history lastIncidentSource, notify func(ctx context.Context, ev Event) error, appURL string) *ErrorWatch {
	return &ErrorWatch{src: src, history: history, notify: notify, texts: texts{appURL: appURL}, now: time.Now}
}

func (w *ErrorWatch) Run(ctx context.Context) {
	every(ctx, errorNewEvery, "erro novo", w.Tick)
}

// Tick: avisa os grupos novos desde o último avisado.
func (w *ErrorWatch) Tick(ctx context.Context) error {
	now := w.now()
	if err := w.loadCursor(ctx, now); err != nil {
		return err
	}
	groups, err := w.src.GroupsFirstSeenSince(ctx, w.cursor.Add(time.Microsecond))
	if err != nil || len(groups) == 0 {
		return err
	}
	budget := w.budget(now)
	for _, g := range groups[:min(budget, len(groups))] {
		if err := w.notify(ctx, w.newErrorEvent(g)); err != nil {
			return err
		}
		w.cursor, w.sent = g.FirstSeen, append(w.sent, now)
	}
	if rest := groups[min(budget, len(groups)):]; len(rest) > 0 {
		return w.notifyMany(ctx, rest, now)
	}
	return nil
}

// loadCursor: na primeira vez, o first_seen do último grupo avisado (ou agora,
// sem nenhum), sem voltar mais de 1 h.
func (w *ErrorWatch) loadCursor(ctx context.Context, now time.Time) error {
	if !w.cursor.IsZero() {
		return nil
	}
	last, err := w.history.LastIncident(ctx, errorNewRuleID)
	if err != nil {
		return fmt.Errorf("último erro novo: %w", err)
	}
	w.cursor = now
	if last != nil {
		w.cursor = later(last.StartedAt, now.Add(-errorNewMaxBack))
	}
	return nil
}

func later(a, b time.Time) time.Time {
	if a.After(b) {
		return a
	}
	return b
}

// budget: quantas mensagens individuais ainda cabem nesta hora.
func (w *ErrorWatch) budget(now time.Time) int {
	recent := w.sent[:0]
	for _, at := range w.sent {
		if now.Sub(at) < time.Hour {
			recent = append(recent, at)
		}
	}
	w.sent = recent
	return max(0, errorNewPerHour-len(recent))
}

// notifyMany: os que passaram do teto, numa mensagem só (no máximo uma por
// hora; as outras só no histórico).
func (w *ErrorWatch) notifyMany(ctx context.Context, rest []apperrors.GroupHead, now time.Time) error {
	last := rest[len(rest)-1].FirstSeen
	quiet := !w.summary.IsZero() && now.Sub(w.summary) < time.Hour
	ev := Event{RuleID: errorNewRuleID, Channel: ChannelErrors, Level: LevelWarning, StartedAt: last, EndedAt: last,
		Text: w.manyErrorsText(rest), Quiet: quiet}
	if err := w.notify(ctx, ev); err != nil {
		return err
	}
	w.cursor = last
	if !quiet {
		w.summary = now
	}
	return nil
}

func (w *ErrorWatch) newErrorEvent(g apperrors.GroupHead) Event {
	return Event{RuleID: errorNewRuleID, Channel: ChannelErrors, Level: LevelWarning, StartedAt: g.FirstSeen, EndedAt: g.FirstSeen,
		Text: newErrorText(g, w.texts.link(Rule{Tab: "erros"}))}
}

func (w *ErrorWatch) manyErrorsText(rest []apperrors.GroupHead) string {
	source, version := mostCommon(rest)
	return manyErrorsText(len(rest), source, version, w.texts.link(Rule{Tab: "erros"}))
}

// mostCommon: a origem e a versão que mais aparecem.
func mostCommon(groups []apperrors.GroupHead) (string, string) {
	count := map[[2]string]int{}
	var best [2]string
	for _, g := range groups {
		k := [2]string{g.Source, g.FirstVersion}
		count[k]++
		if count[k] > count[best] {
			best = k
		}
	}
	return best[0], best[1]
}
