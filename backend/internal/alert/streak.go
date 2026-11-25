package alert

import "time"

// streak: desde quando a regra está em cada nível, sem interrupção (só na
// memória: depois de um reinício a contagem recomeça, como o `for` do
// Prometheus). Zero = fora da sequência.
type streak struct {
	warn, crit, ok time.Time
}

// observe registra uma leitura. Sem dado zera tudo: a volta do dado não pode
// valer como se a condição tivesse se mantido no buraco.
func (s *streak) observe(level Level, now time.Time) {
	switch level {
	case LevelUnknown:
		*s = streak{}
	case LevelOK:
		s.warn, s.crit = time.Time{}, time.Time{}
		s.ok = keep(s.ok, now)
	case LevelWarning:
		s.crit, s.ok = time.Time{}, time.Time{}
		s.warn = keep(s.warn, now)
	case LevelCritical:
		s.ok = time.Time{}
		s.warn, s.crit = keep(s.warn, now), keep(s.crit, now)
	}
}

func keep(since, now time.Time) time.Time {
	if since.IsZero() {
		return now
	}
	return since
}

// held: o nível mais alto que já se manteve pelo tempo pedido; LevelUnknown
// enquanto nenhum se manteve (pendente).
func (s streak) held(hold Hold, now time.Time) Level {
	switch {
	case lasted(s.crit, hold.Critical, now):
		return LevelCritical
	case lasted(s.warn, hold.Warning, now):
		return LevelWarning
	case lasted(s.ok, hold.Clear, now):
		return LevelOK
	}
	return LevelUnknown
}

func lasted(since time.Time, d time.Duration, now time.Time) bool {
	return !since.IsZero() && now.Sub(since) >= d
}

// since: quando começou a sequência do nível (o "desde" da mensagem).
func (s streak) since(level Level) time.Time {
	if level == LevelCritical {
		return s.crit
	}
	return s.warn
}
