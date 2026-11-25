package alert

import (
	"context"
	"errors"
	"testing"
	"time"
)

func TestDatabaseWatch(t *testing.T) {
	clock := at(14, 2)
	var down bool
	var notifyErr error
	var events []Event
	w := NewDatabaseWatch(
		func(context.Context) error {
			if down {
				return errors.New("sem banco")
			}
			return nil
		},
		func(_ context.Context, ev Event) error {
			if notifyErr != nil {
				return notifyErr
			}
			events = append(events, ev)
			return nil
		})
	w.now = func() time.Time { return clock }
	tick := func(isDown bool) error {
		down = isDown
		err := w.Tick(context.Background())
		clock = clock.Add(dbPingEvery)
		return err
	}

	// Uma falha só (piscada) não vira aviso.
	_ = tick(true)
	_ = tick(false)
	if len(events) != 0 {
		t.Fatalf("piscada virou aviso: %+v", events)
	}
	// Queda de verdade; a primeira tentativa de avisar falha e a próxima avisa.
	clock = at(14, 2)
	for i := 0; i < 12; i++ {
		_ = tick(true)
	}
	clock = at(14, 5)
	notifyErr = errors.New("ainda instável")
	if err := tick(false); err == nil {
		t.Fatal("erro do aviso sumiu")
	}
	notifyErr = nil
	_ = tick(false)
	if len(events) != 1 || events[0].Text != "Aviso: o backend ficou sem banco de 14:02 a 14:05 (3 min)." || events[0].RuleID != databaseDownRuleID {
		t.Fatalf("eventos = %+v", events)
	}
	_ = tick(false)
	if len(events) != 1 {
		t.Fatal("avisou duas vezes")
	}
}
