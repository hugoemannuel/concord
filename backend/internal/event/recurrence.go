// Package event cuida dos eventos agendados de cada servidor: criação por
// quem tem Gerenciar eventos, recorrência, presença e os avisos do Salinha Bot
// (docs/superpowers/specs/2026-10-30-eventos-do-servidor-design.md).
package event

import "time"

// Recurrence é a regra de repetição de um evento (presets, sem RRULE).
type Recurrence string

const (
	RecNone    Recurrence = "none"
	RecDaily   Recurrence = "daily"
	RecWeekly  Recurrence = "weekly"
	RecMonthly Recurrence = "monthly"
)

// Valid diz se a regra é uma das conhecidas.
func (r Recurrence) Valid() bool {
	switch r {
	case RecNone, RecDaily, RecWeekly, RecMonthly:
		return true
	}
	return false
}

// OccurrenceAt devolve a n-ésima ocorrência (n=0 é o próprio início). O mensal
// mantém o dia do início e, no mês que não tem esse dia, usa o último dia.
func OccurrenceAt(start time.Time, rule Recurrence, n int, loc *time.Location) time.Time {
	s := start.In(loc)
	switch rule {
	case RecDaily:
		return s.AddDate(0, 0, n)
	case RecWeekly:
		return s.AddDate(0, 0, 7*n)
	case RecMonthly:
		return monthlyAt(s, n, loc)
	}
	return s
}

func monthlyAt(s time.Time, n int, loc *time.Location) time.Time {
	first := time.Date(s.Year(), s.Month()+time.Month(n), 1, s.Hour(), s.Minute(), s.Second(), 0, loc)
	last := time.Date(first.Year(), first.Month()+1, 0, 0, 0, 0, 0, loc).Day()
	return time.Date(first.Year(), first.Month(), min(s.Day(), last), s.Hour(), s.Minute(), s.Second(), 0, loc)
}

// Finished diz se a ocorrência de índice n já está além do fim da recorrência.
// Sem repetição só existe a ocorrência 0.
func Finished(rule Recurrence, until *time.Time, count *int, start time.Time, n int, loc *time.Location) bool {
	if rule == RecNone {
		return n >= 1
	}
	if count != nil && n >= *count {
		return true
	}
	return until != nil && OccurrenceAt(start, rule, n, loc).After(*until)
}
