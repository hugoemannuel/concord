package alert

import (
	"testing"
	"time"
)

func TestStreakHeld(t *testing.T) {
	t0 := time.Date(2026, 11, 25, 14, 0, 0, 0, time.UTC)
	hold := Hold{Warning: 5 * time.Minute, Critical: 10 * time.Minute, Clear: 2 * time.Minute}
	min := func(n int) time.Time { return t0.Add(time.Duration(n) * time.Minute) }
	tests := []struct {
		name     string
		readings []Level // uma por minuto, a partir de t0
		want     Level
	}{
		{"pico de um minuto não vale", []Level{LevelWarning}, LevelUnknown},
		{"aviso por 5 min vale", []Level{1, 1, 1, 1, 1, 1}, LevelWarning},
		{"aviso interrompido recomeça", []Level{1, 1, 1, 0, 1, 1}, LevelUnknown},
		{"crítico conta como aviso", []Level{2, 2, 2, 2, 2, 2}, LevelWarning},
		{"crítico por 10 min vale", []Level{2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2}, LevelCritical},
		{"aviso e depois crítico: o aviso segue contando", []Level{1, 1, 1, 2, 2, 2}, LevelWarning},
		{"ok por 2 min normaliza", []Level{0, 0, 0}, LevelOK},
		{"ok por 1 min ainda não", []Level{1, 0, 0}, LevelUnknown},
		{"sem dado zera tudo", []Level{1, 1, 1, 1, 1, LevelUnknown}, LevelUnknown},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			var s streak
			for i, level := range tt.readings {
				s.observe(level, min(i))
			}
			if got := s.held(hold, min(len(tt.readings)-1)); got != tt.want {
				t.Errorf("held = %d, quer %d", got, tt.want)
			}
		})
	}
}

func TestStreakSince(t *testing.T) {
	t0 := time.Date(2026, 11, 25, 14, 0, 0, 0, time.UTC)
	var s streak
	s.observe(LevelWarning, t0)
	s.observe(LevelCritical, t0.Add(time.Minute))
	if got := s.since(LevelWarning); !got.Equal(t0) {
		t.Errorf("since(aviso) = %v", got)
	}
	if got := s.since(LevelCritical); !got.Equal(t0.Add(time.Minute)) {
		t.Errorf("since(crítico) = %v", got)
	}
}
