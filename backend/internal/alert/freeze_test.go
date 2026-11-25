package alert

import (
	"context"
	"errors"
	"os"
	"strings"
	"testing"
	"time"
)

// fakeClocks: o relógio do sistema e o de hardware, movidos à mão.
type fakeClocks struct {
	wall time.Time
	mono time.Duration
	hw   time.Time
	noHW bool
}

func (c *fakeClocks) read() clockReading { return clockReading{wall: c.wall, mono: c.mono} }

func (c *fakeClocks) hardware() (time.Time, bool) { return c.hw, !c.noHW }

// tick: os dois relógios andam d juntos (máquina rodando normal).
func (c *fakeClocks) tick(d time.Duration) {
	c.wall, c.mono, c.hw = c.wall.Add(d), c.mono+d, c.hw.Add(d)
}

type fakeLastIncident struct {
	last *Incident
	err  error
}

func (f *fakeLastIncident) LastIncident(context.Context, string) (*Incident, error) {
	return f.last, f.err
}

func newFreeze(c *fakeClocks, h *fakeLastIncident, events *[]Event) *FreezeWatch {
	w := NewFreezeWatch(h, func(_ context.Context, ev Event) error {
		*events = append(*events, ev)
		return nil
	})
	w.clock, w.hardware = c.read, c.hardware
	return w
}

// O caso de 25/11: congelada de 09:32 a 14:21 UTC; na volta o sistema segue
// de 09:32 e o hardware está em 14:21; 34 min depois o NTP corrige.
func TestFreezePeloRelogioDeHardware(t *testing.T) {
	start := time.Date(2026, 11, 25, 9, 32, 0, 0, time.UTC)
	c := &fakeClocks{wall: start, hw: start}
	var events []Event
	w := newFreeze(c, &fakeLastIncident{}, &events)
	ctx := context.Background()
	_ = w.Tick(ctx)
	c.hw = c.hw.Add(4*time.Hour + 49*time.Minute) // a VM ficou pausada: só o hardware andou
	c.tick(freezeEvery)
	_ = w.Tick(ctx)
	if len(events) != 1 {
		t.Fatalf("eventos = %d, quer 1", len(events))
	}
	ev := events[0]
	if ev.RuleID != "host_frozen" || ev.Level != LevelCritical || ev.Channel != ChannelInfra {
		t.Fatalf("evento = %+v", ev)
	}
	if got := ev.EndedAt.Sub(ev.StartedAt); got != 4*time.Hour+49*time.Minute {
		t.Errorf("duração = %v", got)
	}
	want := "@all Crítico: a máquina ficou congelada por 4 h 49 min (de 06:32 a 11:21, estimado) e voltou sem reiniciar: pausa do provedor. O relógio do sistema está 4 h 49 min atrasado"
	if !strings.HasPrefix(ev.Text, want) {
		t.Errorf("texto = %q", ev.Text)
	}
	for range 60 { // meia hora com o relógio atrasado: não repete
		c.tick(freezeEvery)
		_ = w.Tick(ctx)
	}
	c.wall = c.wall.Add(4*time.Hour + 49*time.Minute) // o NTP corrigiu: salto sem monotônico
	c.tick(freezeEvery)
	_ = w.Tick(ctx)
	if len(events) != 1 {
		t.Fatalf("a correção do NTP virou outro aviso: %+v", events[1:])
	}
}

func TestFreezeSemRelogioDeHardwarePeloSalto(t *testing.T) {
	start := time.Date(2026, 11, 25, 9, 32, 0, 0, time.UTC)
	c := &fakeClocks{wall: start, noHW: true}
	var events []Event
	w := newFreeze(c, &fakeLastIncident{}, &events)
	ctx := context.Background()
	_ = w.Tick(ctx)
	c.tick(freezeEvery)
	_ = w.Tick(ctx)
	if len(events) != 0 {
		t.Fatalf("avisou sem salto: %+v", events)
	}
	c.wall = c.wall.Add(8*time.Hour + 21*time.Minute)
	c.tick(freezeEvery)
	_ = w.Tick(ctx)
	if len(events) != 1 || !strings.Contains(events[0].Text, "o relógio do sistema saltou 8 h 21 min para a frente") {
		t.Fatalf("eventos = %+v", events)
	}
}

// Hipervisor que conta a pausa no monotônico: os dois relógios andam juntos,
// mas a leitura seguinte chega horas depois.
func TestFreezeMonotonicoParado(t *testing.T) {
	c := &fakeClocks{wall: at(9, 0), hw: at(9, 0)}
	var events []Event
	w := newFreeze(c, &fakeLastIncident{}, &events)
	_ = w.Tick(context.Background())
	c.tick(2 * time.Hour)
	_ = w.Tick(context.Background())
	if len(events) != 1 || events[0].EndedAt.Sub(events[0].StartedAt) != 2*time.Hour-freezeEvery {
		t.Fatalf("eventos = %+v", events)
	}
}

func TestFreezeIgnoraRelogioAtrasadoParaTras(t *testing.T) {
	c := &fakeClocks{wall: at(9, 10), hw: at(9, 0)} // o sistema adiantado 10 min
	var events []Event
	w := newFreeze(c, &fakeLastIncident{}, &events)
	_ = w.Tick(context.Background())
	c.wall = c.wall.Add(-10*time.Minute + 20*time.Second) // NTP puxou para trás; sobram 20 s, dentro da folga
	c.tick(freezeEvery)
	_ = w.Tick(context.Background())
	if len(events) != 0 {
		t.Fatalf("eventos = %+v", events)
	}
}

// Backend reiniciado com o relógio ainda atrasado: o congelamento já está no
// histórico e não sai de novo.
func TestFreezeNaoRepeteDepoisDeReiniciar(t *testing.T) {
	c := &fakeClocks{wall: at(9, 50), hw: at(14, 39)}
	from, to := at(9, 32), at(14, 21)
	hist := &fakeLastIncident{last: &Incident{RuleID: "host_frozen", StartedAt: from, EndedAt: &to}}
	var events []Event
	w := newFreeze(c, hist, &events)
	_ = w.Tick(context.Background())
	if len(events) != 0 {
		t.Fatalf("repetiu: %+v", events)
	}
	hist.last = nil
	c.tick(freezeEvery)
	_ = w.Tick(context.Background())
	if len(events) != 0 {
		t.Fatal("consultou o histórico de novo depois de saber")
	}
}

func TestFreezeHistoricoFalhaTentaDeNovo(t *testing.T) {
	c := &fakeClocks{wall: at(9, 50), hw: at(14, 39)}
	hist := &fakeLastIncident{err: errors.New("banco")}
	var events []Event
	w := newFreeze(c, hist, &events)
	if err := w.Tick(context.Background()); err == nil {
		t.Fatal("engoliu o erro")
	}
	hist.err = nil
	c.tick(freezeEvery)
	_ = w.Tick(context.Background())
	if len(events) != 1 {
		t.Fatalf("eventos = %d", len(events))
	}
}

func TestFreezeAvisoQueFalhaSaiNaProxima(t *testing.T) {
	c := &fakeClocks{wall: at(9, 50), hw: at(14, 39)}
	calls := 0
	w := NewFreezeWatch(&fakeLastIncident{}, func(context.Context, Event) error {
		calls++
		if calls == 1 {
			return errors.New("canal ainda não existe")
		}
		return nil
	})
	w.clock, w.hardware = c.read, c.hardware
	if err := w.Tick(context.Background()); err == nil {
		t.Fatal("engoliu o erro")
	}
	c.tick(freezeEvery)
	if err := w.Tick(context.Background()); err != nil || calls != 2 || w.pending != nil {
		t.Fatalf("calls = %d, err = %v", calls, err)
	}
}

func TestReadRTC(t *testing.T) {
	files := func(m map[string]string) func(string) ([]byte, error) {
		return func(p string) ([]byte, error) {
			if v, ok := m[p]; ok {
				return []byte(v), nil
			}
			return nil, os.ErrNotExist
		}
	}
	if got, ok := readRTC(files(map[string]string{rtcPath: "1795700000\n"})); !ok || got.Unix() != 1795700000 {
		t.Errorf("rtc = %v, %v", got, ok)
	}
	if _, ok := readRTC(files(nil)); ok {
		t.Error("sem arquivo deu dado")
	}
	if _, ok := readRTC(files(map[string]string{rtcPath: "x"})); ok {
		t.Error("lixo deu dado")
	}
	local := map[string]string{rtcPath: "1795700000", adjtimePath: "0.0 0 0.0\n0\nLOCAL\n"}
	if _, ok := readRTC(files(local)); ok {
		t.Error("relógio na hora local deu dado")
	}
}

func TestSystemClockAnda(t *testing.T) {
	read := systemClock()
	a := read()
	b := read()
	if b.mono < a.mono || b.wall.Before(a.wall.Add(-time.Second)) {
		t.Fatalf("a = %+v, b = %+v", a, b)
	}
}
