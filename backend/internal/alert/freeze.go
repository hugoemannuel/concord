package alert

import (
	"context"
	"errors"
	"fmt"
	"log"
	"time"
)

// Máquina congelada pelo provedor: a VM é pausada e retomada sem reiniciar
// (23/11/2026 por 8h21, 25/11 por 4h49). Sem boot, a regra backend_down não vê
// nada. Na volta, o relógio do sistema fica atrasado pelo tempo do
// congelamento (em 25/11: sistema em 09:32 UTC, hardware em 14:21) até o
// systemd-timesyncd corrigir, o que levou até 34 min. Dois sinais:
//
//   - relógio de hardware × sistema a cada 30 s: mais de 1 min de diferença =
//     congelou; vale logo na volta (o principal).
//   - relógio de parede × monotônico entre duas leituras: o salto que sobra
//     quando o NTP corrige (ou quando o hipervisor conta a pausa no
//     monotônico). É a reserva para máquina sem relógio de hardware legível e
//     não repete o congelamento que o primeiro sinal já avisou.
//
// Um acontecimento (Event), crítico, com o começo e o fim estimados na hora
// certa: vira uma mensagem e uma linha fechada no histórico.
const (
	freezeRuleID = "host_frozen"
	freezeEvery  = 30 * time.Second
	// freezeMin: diferença que conta (o relógio de hardware tem resolução de 1 s).
	freezeMin = time.Minute
	// freezeSame: dois sinais com durações tão perto assim são o mesmo congelamento.
	freezeSame = 2 * time.Minute
	// freezeRecent: um congelamento gravado até isso antes ainda é "este"
	// (o backend reiniciado enquanto o relógio está atrasado não avisa de novo).
	freezeRecent = 3 * time.Hour
)

type lastIncidentSource interface {
	// LastIncident: o incidente mais novo da regra (nil = nenhum).
	LastIncident(ctx context.Context, ruleID string) (*Incident, error)
}

// FreezeWatch: o vigia do congelamento.
type FreezeWatch struct {
	clock    func() clockReading
	hardware func() (time.Time, bool)
	notify   func(ctx context.Context, ev Event) error
	history  lastIncidentSource

	prev *clockReading
	// reported: a duração do congelamento já avisado (0 = nenhum).
	reported time.Duration
	pending  *Event
}

func NewFreezeWatch(history lastIncidentSource, notify func(ctx context.Context, ev Event) error) *FreezeWatch {
	return &FreezeWatch{clock: systemClock(), hardware: hardwareClock, notify: notify, history: history}
}

func (w *FreezeWatch) Run(ctx context.Context) {
	every(ctx, freezeEvery, "máquina congelada", w.Tick)
}

// Tick: uma leitura dos relógios.
func (w *FreezeWatch) Tick(ctx context.Context) error {
	now := w.clock()
	ev, err := w.detect(ctx, now)
	w.prev = &now
	if ev != nil {
		w.pending = ev
	}
	return errors.Join(err, w.flush(ctx))
}

func (w *FreezeWatch) detect(ctx context.Context, now clockReading) (*Event, error) {
	hw, ok := w.hardware()
	if ok && hw.Sub(now.wall) > freezeMin {
		return w.fromHardware(ctx, hw, hw.Sub(now.wall))
	}
	reported := w.reported
	if ok {
		// Relógio em dia: o congelamento avisado acabou.
		w.reported = 0
	}
	lost := w.lost(now)
	if lost <= freezeMin || (reported > 0 && near(lost, reported)) {
		// Nada sumiu, ou é o NTP corrigindo o congelamento já avisado.
		return nil, nil
	}
	ev := frozenJumpEvent(now.wall.Add(-lost), now.wall)
	return &ev, nil
}

// lost: quanto tempo sumiu desde a leitura anterior (o salto do relógio de
// parede sobre o monotônico, mais o monotônico que passou do intervalo).
func (w *FreezeWatch) lost(now clockReading) time.Duration {
	if w.prev == nil {
		return 0
	}
	mono := now.mono - w.prev.mono
	wall := now.wall.Sub(w.prev.wall)
	return wall - mono + max(0, mono-freezeEvery)
}

// fromHardware: o congelamento visto pelo relógio de hardware, uma vez só
// (nem a cada leitura, nem depois de um reinício do backend).
func (w *FreezeWatch) fromHardware(ctx context.Context, hw time.Time, skew time.Duration) (*Event, error) {
	if w.reported > 0 && near(skew, w.reported) {
		return nil, nil
	}
	seen, err := w.alreadyRecorded(ctx, hw, skew)
	if err != nil {
		return nil, err
	}
	w.reported = skew
	if seen {
		return nil, nil
	}
	ev := frozenEvent(hw.Add(-skew), hw)
	return &ev, nil
}

func (w *FreezeWatch) alreadyRecorded(ctx context.Context, hw time.Time, skew time.Duration) (bool, error) {
	last, err := w.history.LastIncident(ctx, freezeRuleID)
	if err != nil {
		return false, fmt.Errorf("último congelamento: %w", err)
	}
	if last == nil || last.EndedAt == nil {
		return false, nil
	}
	return hw.Sub(*last.EndedAt) < freezeRecent && near(last.EndedAt.Sub(last.StartedAt), skew), nil
}

func near(a, b time.Duration) bool {
	d := a - b
	return d < freezeSame && d > -freezeSame
}

func (w *FreezeWatch) flush(ctx context.Context) error {
	if w.pending == nil {
		return nil
	}
	if err := w.notify(ctx, *w.pending); err != nil {
		return fmt.Errorf("avisar o congelamento: %w", err)
	}
	log.Printf("[alert] máquina congelada de %s a %s", w.pending.StartedAt.Format(time.RFC3339), w.pending.EndedAt.Format(time.RFC3339))
	w.pending = nil
	return nil
}

func frozenEvent(from, to time.Time) Event {
	return Event{RuleID: freezeRuleID, Channel: ChannelInfra, Level: LevelCritical, StartedAt: from, EndedAt: to,
		Text: frozenText(from, to)}
}

func frozenJumpEvent(from, to time.Time) Event {
	return Event{RuleID: freezeRuleID, Channel: ChannelInfra, Level: LevelCritical, StartedAt: from, EndedAt: to,
		Text: frozenJumpText(from, to)}
}
