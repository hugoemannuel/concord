package alert

import (
	"context"
	"runtime/debug"
	"testing"
	"time"
)

func TestBootReport(t *testing.T) {
	now := at(14, 18)
	stopped := now.Add(-4 * time.Second)
	minute := func(t time.Time) *time.Time { return &t }
	tests := []struct {
		name      string
		prev      *Run
		last      *time.Time
		wantText  string
		wantEvent bool
		wantFrom  time.Time
	}{
		{"primeiro boot", nil, nil, "Backend no ar, versão v1. Alertas ligados a partir de agora.", false, time.Time{}},
		{"reinício limpo", &Run{StartedAt: at(10, 0), StoppedAt: &stopped}, minute(at(14, 17)),
			"Backend no ar, versão v1. Reinício limpo, ficou fora 4 s.", false, time.Time{}},
		{"queda de 16 min pelo último minuto", &Run{StartedAt: at(10, 0)}, minute(at(14, 2)),
			"Aviso: o backend ficou fora de 14:02 a 14:18 (16 min), sem desligamento limpo: queda do processo ou da VPS. Voltou na versão v1.", true, at(14, 2)},
		{"caiu e voltou em segundos", &Run{StartedAt: at(10, 0)}, minute(at(14, 17)),
			"Aviso: o backend caiu e voltou sozinho em 1 min, sem desligamento limpo. Versão v1.", true, at(14, 17)},
		{"sem minuto coletado: conta do começo do boot anterior", &Run{StartedAt: at(14, 0)}, nil,
			"Aviso: o backend ficou fora de 14:00 a 14:18 (18 min), sem desligamento limpo: queda do processo ou da VPS. Voltou na versão v1.", true, at(14, 0)},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := bootReport(tt.prev, tt.last, now, "v1")
			text := got.text
			if got.event != nil {
				text = got.event.Text
				if !got.event.StartedAt.Equal(tt.wantFrom) || !got.event.EndedAt.Equal(now) || got.event.RuleID != backendDownRuleID {
					t.Errorf("evento = %+v", got.event)
				}
			}
			if text != tt.wantText || (got.event != nil) != tt.wantEvent {
				t.Errorf("texto = %q (evento %v)", text, got.event != nil)
			}
		})
	}
}

type fakeRuns struct {
	prev    *Run
	stopped *time.Time
}

func (f *fakeRuns) StartRun(context.Context, string, time.Time) (int64, *Run, error) {
	return 7, f.prev, nil
}
func (f *fakeRuns) StopRun(_ context.Context, id int64, at time.Time) error {
	if id == 7 {
		f.stopped = &at
	}
	return nil
}
func (f *fakeRuns) LastMinute(context.Context) (*time.Time, error) { return nil, nil }

type fakeBoot struct {
	loop      bool
	announced []string
	events    []Event
}

func (f *fakeBoot) Evaluate(context.Context) error { return nil }
func (f *fakeBoot) IsOpen(id string) bool          { return f.loop && id == restartLoopRuleID }
func (f *fakeBoot) Notify(_ context.Context, ev Event) error {
	f.events = append(f.events, ev)
	return nil
}
func (f *fakeBoot) Announce(_ context.Context, _ string, _ ChannelKind, text string) error {
	f.announced = append(f.announced, text)
	return nil
}

func TestLifecycleBootEStop(t *testing.T) {
	runs, alerts := &fakeRuns{}, &fakeBoot{}
	l := NewLifecycle(runs, alerts, "v1")
	l.now = func() time.Time { return at(14, 0) }
	if err := l.Boot(context.Background()); err != nil {
		t.Fatal(err)
	}
	if len(alerts.announced) != 1 {
		t.Fatalf("anúncios = %v", alerts.announced)
	}
	if err := l.Stop(context.Background()); err != nil || runs.stopped == nil {
		t.Fatalf("parada limpa não gravada: %v", err)
	}
}

func TestLifecycleReiniciandoSemPararNaoAnuncia(t *testing.T) {
	alerts := &fakeBoot{loop: true}
	l := NewLifecycle(&fakeRuns{prev: &Run{StartedAt: at(13, 58)}}, alerts, "v1")
	l.now = func() time.Time { return at(14, 0) }
	if err := l.Boot(context.Background()); err != nil {
		t.Fatal(err)
	}
	if len(alerts.announced)+len(alerts.events) != 0 {
		t.Fatalf("postou no laço: %v %v", alerts.announced, alerts.events)
	}
}

func TestStopSemBoot(t *testing.T) {
	if err := NewLifecycle(&fakeRuns{}, &fakeBoot{}, "v1").Stop(context.Background()); err != nil {
		t.Fatal(err)
	}
}

func TestVersionOf(t *testing.T) {
	got := versionOf([]debug.BuildSetting{{Key: "vcs.revision", Value: "a1b2c3d4e5f6"}, {Key: "vcs.time", Value: "2026-11-25T16:50:00Z"}})
	if got != "a1b2c3d de 25/11 13:50" {
		t.Errorf("versão = %q", got)
	}
	if got := versionOf([]debug.BuildSetting{{Key: "vcs.revision", Value: "a1b2c3d4e5f6"}}); got != "a1b2c3d" {
		t.Errorf("sem data = %q", got)
	}
	if got := versionOf(nil); got != "dev" {
		t.Errorf("sem git = %q", got)
	}
	if BuildVersion() == "" {
		t.Error("versão vazia")
	}
}
