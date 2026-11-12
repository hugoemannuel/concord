package message

import (
	"strconv"
	"time"
)

// ParseSearchDate lê "AAAA-MM-DD" ou "DD/MM/AAAA" e devolve o começo desse
// dia no fuso dado.
func ParseSearchDate(value string, loc *time.Location) (time.Time, bool) {
	var y, m, d int
	if g := isoDate.FindStringSubmatch(value); g != nil {
		y, _ = strconv.Atoi(g[1])
		m, _ = strconv.Atoi(g[2])
		d, _ = strconv.Atoi(g[3])
	} else if g := brDate.FindStringSubmatch(value); g != nil {
		d, _ = strconv.Atoi(g[1])
		m, _ = strconv.Atoi(g[2])
		y, _ = strconv.Atoi(g[3])
	} else {
		return time.Time{}, false
	}
	t := time.Date(y, time.Month(m), d, 0, 0, 0, 0, loc)
	// time.Date normaliza 31/02 para março: não é data de verdade.
	if t.Year() != y || int(t.Month()) != m || t.Day() != d || y < 2000 || y > 9999 {
		return time.Time{}, false
	}
	return t, true
}

// searchDateRange: before:D = antes do dia D; after:D = depois do dia D (a
// partir do dia seguinte, como no Discord); during:D = no dia D. Juntos, vale
// o intervalo mais estreito.
func searchDateRange(q SearchQuery, loc *time.Location) (since *time.Time, until *time.Time, err error) {
	tighterUntil := func(t time.Time) {
		if until == nil || t.Before(*until) {
			until = &t
		}
	}
	tighterSince := func(t time.Time) {
		if since == nil || t.After(*since) {
			since = &t
		}
	}
	if q.Before != "" {
		d, ok := ParseSearchDate(q.Before, loc)
		if !ok {
			return nil, nil, &SearchError{Field: "before", Value: q.Before}
		}
		tighterUntil(d)
	}
	if q.After != "" {
		d, ok := ParseSearchDate(q.After, loc)
		if !ok {
			return nil, nil, &SearchError{Field: "after", Value: q.After}
		}
		tighterSince(d.AddDate(0, 0, 1))
	}
	if q.During != "" {
		d, ok := ParseSearchDate(q.During, loc)
		if !ok {
			return nil, nil, &SearchError{Field: "during", Value: q.During}
		}
		tighterSince(d)
		tighterUntil(d.AddDate(0, 0, 1))
	}
	return since, until, nil
}
