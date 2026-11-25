package alert

import (
	"testing"
	"time"
)

func TestDecide(t *testing.T) {
	now := time.Date(2026, 11, 25, 14, 0, 0, 0, time.UTC)
	recent := now.Add(-time.Hour)
	old := now.Add(-7 * time.Hour)
	open := func(severity string, last time.Time) *Incident {
		return &Incident{Severity: severity, LastMessageAt: &last}
	}
	tests := []struct {
		name string
		open *Incident
		held Level
		want action
	}{
		{"nada aberto e ok", nil, LevelOK, actNone},
		{"nada aberto e pendente", nil, LevelUnknown, actNone},
		{"nada aberto e aviso", nil, LevelWarning, actFire},
		{"nada aberto e crítico", nil, LevelCritical, actFire},
		{"aberto e ok: normaliza", open("aviso", recent), LevelOK, actResolve},
		{"aberto e pendente: espera", open("aviso", old), LevelUnknown, actNone},
		{"aviso que vira crítico: agrava", open("aviso", recent), LevelCritical, actEscalate},
		{"crítico que cai para aviso: silêncio", open("critico", recent), LevelWarning, actNone},
		{"continua há horas: lembra", open("aviso", old), LevelWarning, actRemind},
		{"continua há pouco: silêncio", open("critico", recent), LevelCritical, actNone},
		{"sem última mensagem: lembra", &Incident{Severity: "aviso"}, LevelWarning, actRemind},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := decide(tt.open, tt.held, now); got != tt.want {
				t.Errorf("decide = %d, quer %d", got, tt.want)
			}
		})
	}
}
