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
// first_seen do último grupo avisado (gravado no incidente) mais os grupos já
// avisados naquele mesmo instante (um lote grava o mesmo first_seen em
// todos), então reiniciar não repete e uma falha no meio do lote não pula os
// outros; nunca volta mais de 1 h (alertas desligados por dias não viram
// enxurrada ao ligar). Grupo de menos de 30 s espera a próxima rodada: um lote
// que confirma depois de outro mais novo não fica atrás do cursor.
const (
	errorNewRuleID  = "error_new"
	errorNewEvery   = time.Minute
	errorNewPerHour = 5
	errorNewMaxBack = time.Hour
	errorTextMax    = 140
	errorNewSettle  = 30 * time.Second
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

	cursor time.Time
	// atCursor: os grupos já avisados com first_seen igual ao cursor;
	// skipCursor: todos os do cursor já foram (o cursor veio do histórico).
	atCursor   map[string]bool
	skipCursor bool
	sent       []time.Time
	summary    time.Time
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
	read, err := w.src.GroupsFirstSeenSince(ctx, w.cursor)
	if err != nil {
		return err
	}
	groups := w.pending(read, now)
	n := min(w.budget(now), len(groups))
	for _, g := range groups[:n] {
		if err := w.notify(ctx, w.newErrorEvent(g)); err != nil {
			return err
		}
		w.advance(g)
		w.sent = append(w.sent, now)
	}
	if rest := groups[n:]; len(rest) > 0 {
		return w.notifyMany(ctx, rest, now)
	}
	return nil
}

// pending: os grupos lidos que ainda não foram avisados e já assentaram.
func (w *ErrorWatch) pending(read []apperrors.GroupHead, now time.Time) []apperrors.GroupHead {
	out := read[:0:0]
	for _, g := range read {
		if g.FirstSeen.After(now.Add(-errorNewSettle)) {
			break // em ordem de first_seen: os seguintes também são recentes
		}
		if g.FirstSeen.Equal(w.cursor) && (w.skipCursor || w.atCursor[g.Fingerprint]) {
			continue
		}
		out = append(out, g)
	}
	return out
}

// advance: o grupo foi avisado (ou entrou no resumo).
func (w *ErrorWatch) advance(g apperrors.GroupHead) {
	if g.FirstSeen.After(w.cursor) {
		w.cursor, w.atCursor, w.skipCursor = g.FirstSeen, map[string]bool{}, false
	}
	w.atCursor[g.Fingerprint] = true
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
	w.cursor, w.atCursor, w.skipCursor = now, map[string]bool{}, true
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
	for _, g := range rest {
		w.advance(g)
	}
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
