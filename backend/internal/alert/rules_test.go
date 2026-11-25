package alert

import (
	"context"
	"errors"
	"testing"
	"time"
)

// fakeSources: as linhas que as regras leem, na memória.
type fakeSources struct {
	minutes []Minute // do mais novo ao mais antigo
	crashed int
	people  map[string]int
	err     error
}

func (f *fakeSources) RecentMinutes(_ context.Context, since time.Time) ([]Minute, error) {
	var out []Minute
	for _, m := range f.minutes {
		if !m.Minute.Before(since) {
			out = append(out, m)
		}
	}
	return out, f.err
}

func (f *fakeSources) CrashedRunsSince(context.Context, time.Time) (int, error) {
	return f.crashed, f.err
}

func (f *fakeSources) PeopleWithEvent(_ context.Context, eventType, prefix string, _ time.Time) (int, error) {
	return f.people[eventType+"|"+prefix], f.err
}

func num(v float64) *float64 { return &v }

func check(t *testing.T, rule Rule, now time.Time) Reading {
	t.Helper()
	r, _ := rule.Check(context.Background(), now)
	return r
}

func TestHostRules(t *testing.T) {
	now := at(14, 0)
	minute := func(ago time.Duration, cpu, mem *float64) Minute {
		return Minute{Minute: now.Add(-ago), Up: true, HostCPU: cpu, HostMem: mem}
	}
	tests := []struct {
		name string
		rule func(minuteSource) Rule
		rows []Minute
		want Reading
	}{
		{"cpu normal", hostCPURule, []Minute{minute(time.Minute, num(40), num(50))}, Reading{Level: LevelOK}},
		{"cpu aviso", hostCPURule, []Minute{minute(time.Minute, num(88.4), nil)}, Reading{LevelWarning, "CPU da máquina em 88% (limite 85%)"}},
		{"cpu crítico", hostCPURule, []Minute{minute(time.Minute, num(97), nil)}, Reading{LevelCritical, "CPU da máquina em 97% (limite 95%)"}},
		{"cpu sem número", hostCPURule, []Minute{minute(time.Minute, nil, nil)}, Reading{Level: LevelUnknown}},
		{"minuto velho = sem dado", hostCPURule, []Minute{minute(10*time.Minute, num(99), nil)}, Reading{Level: LevelUnknown}},
		{"sem linhas", hostCPURule, nil, Reading{Level: LevelUnknown}},
		{"memória aviso", hostMemRule, []Minute{minute(time.Minute, nil, num(91))}, Reading{LevelWarning, "memória da máquina em 91% (limite 90%)"}},
		{"memória crítico", hostMemRule, []Minute{minute(time.Minute, nil, num(96))}, Reading{LevelCritical, "memória da máquina em 96% (limite 95%)"}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := check(t, tt.rule(&fakeSources{minutes: tt.rows}), now)
			if got != tt.want {
				t.Errorf("leitura = %+v, quer %+v", got, tt.want)
			}
		})
	}
}

func TestLiveKitRules(t *testing.T) {
	now := at(14, 0)
	row := func(ago time.Duration, up bool) Minute { return Minute{Minute: now.Add(-ago), Up: up} }
	tests := []struct {
		name string
		rows []Minute
		want Level
	}{
		{"respondendo", []Minute{row(time.Minute, true)}, LevelOK},
		{"caiu depois de responder", []Minute{row(time.Minute, false), row(2*time.Minute, true)}, LevelCritical},
		{"nunca respondeu (Prometheus desligado)", []Minute{row(time.Minute, false), row(2*time.Minute, false)}, LevelUnknown},
		{"coletor parado", []Minute{row(20*time.Minute, false), row(21*time.Minute, true)}, LevelUnknown},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := check(t, liveKitDownRule(&fakeSources{minutes: tt.rows}), now); got.Level != tt.want {
				t.Errorf("nível = %d, quer %d", got.Level, tt.want)
			}
		})
	}
	cpu := liveKitCPURule(&fakeSources{minutes: []Minute{{Minute: now.Add(-time.Minute), LiveKitCPU: num(190)}}})
	if got := check(t, cpu, now); got != (Reading{LevelWarning, "CPU do LiveKit em 190% de uma vCPU (limite 150%)"}) {
		t.Errorf("cpu do livekit = %+v", got)
	}
}

func TestRestartLoopRule(t *testing.T) {
	now := at(14, 0)
	if got := check(t, restartLoopRule(&fakeSources{crashed: 2}), now); got.Level != LevelOK {
		t.Errorf("2 boots = %+v", got)
	}
	got := check(t, restartLoopRule(&fakeSources{crashed: 4}), now)
	if got != (Reading{LevelCritical, "o backend subiu 4 vezes em 10 min sem desligamento limpo (journalctl -u concord-server)"}) {
		t.Errorf("4 boots = %+v", got)
	}
}

func TestCallRules(t *testing.T) {
	now := at(14, 0)
	src := &fakeSources{people: map[string]int{"conexao_falhou|entrando (mídia)": 3, "reconectou|": 2}}
	if got := check(t, callFailuresRule(src), now); got.Level != LevelCritical ||
		got.Text != "3 pessoas não conseguiram conectar a voz na etapa de mídia em 5 min (limite 3); costuma ser o servidor: LiveKit, LIVEKIT_NODE_IP ou firewall" {
		t.Errorf("falhas = %+v", got)
	}
	if got := check(t, callReconnectsRule(src), now); got.Level != LevelOK {
		t.Errorf("2 reconexões = %+v", got)
	}
	src.people["reconectou|"] = 5
	if got := check(t, callReconnectsRule(src), now); got.Level != LevelWarning ||
		got.Text != "5 pessoas com a voz caindo e voltando em 3 min (limite 4); costuma ser o LiveKit reiniciando ou a rede da VPS" {
		t.Errorf("5 reconexões = %+v", got)
	}
}

func TestRulesErroDaFonteEhSemDado(t *testing.T) {
	src := &fakeSources{err: errors.New("banco fora")}
	for _, rule := range Rules(src) {
		r, err := rule.Check(context.Background(), at(14, 0))
		if err == nil || r.Level != LevelUnknown {
			t.Errorf("%s: %+v, %v", rule.ID, r, err)
		}
	}
}

func TestTitlesTemTodasAsRegrasEEventos(t *testing.T) {
	titles := Titles(Rules(&fakeSources{}))
	for _, id := range []string{"host_cpu", "livekit_down", "call_failures", "backend_down", "unit_failed"} {
		if titles[id] == "" {
			t.Errorf("sem título: %s", id)
		}
	}
}
