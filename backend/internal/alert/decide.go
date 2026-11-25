package alert

import "time"

// remindEvery: um disparo que continua ganha um lembrete (sem @all) nesse intervalo.
const remindEvery = 6 * time.Hour

type action int

const (
	actNone action = iota
	actFire
	actEscalate
	actResolve
	actRemind
)

// decide: o que fazer com o incidente aberto (nil = nenhum) diante do nível
// que já se manteve (streak.held).
func decide(open *Incident, held Level, now time.Time) action {
	if open == nil {
		if held >= LevelWarning {
			return actFire
		}
		return actNone
	}
	switch {
	case held == LevelOK:
		return actResolve
	case held > levelOf(open.Severity):
		return actEscalate
	case held >= LevelWarning && remindDue(open, now):
		return actRemind
	}
	return actNone
}

func remindDue(open *Incident, now time.Time) bool {
	return open.LastMessageAt == nil || now.Sub(*open.LastMessageAt) >= remindEvery
}
