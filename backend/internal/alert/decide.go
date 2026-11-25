package alert

import "time"

// remindEvery: um disparo que continua ganha um lembrete (sem @all) nesse
// intervalo, se a regra não pedir outro (Rule.Remind).
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
// que já se manteve (streak.held); every é o intervalo do lembrete.
func decide(open *Incident, held Level, now time.Time, every time.Duration) action {
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
	case held >= LevelWarning && remindDue(open, now, every):
		return actRemind
	}
	return actNone
}

func remindDue(open *Incident, now time.Time, every time.Duration) bool {
	return open.LastMessageAt == nil || now.Sub(*open.LastMessageAt) >= every
}

// remindInterval: o lembrete da regra (o padrão sem Rule.Remind).
func (r Rule) remindInterval() time.Duration {
	if r.Remind > 0 {
		return r.Remind
	}
	return remindEvery
}
