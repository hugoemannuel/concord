package event

import (
	"testing"
	"time"
)

var brt = time.FixedZone("BRT", -3*60*60)

func at(y int, m time.Month, d, h, min int) time.Time {
	return time.Date(y, m, d, h, min, 0, 0, brt)
}

func TestOccurrenceAt(t *testing.T) {
	start := at(2026, time.January, 31, 20, 0)
	cases := []struct {
		name string
		rule Recurrence
		n    int
		want time.Time
	}{
		{"zero é o início", RecWeekly, 0, start},
		{"diária", RecDaily, 3, at(2026, time.February, 3, 20, 0)},
		{"semanal", RecWeekly, 2, at(2026, time.February, 14, 20, 0)},
		{"mensal cai no último dia de fevereiro", RecMonthly, 1, at(2026, time.February, 28, 20, 0)},
		{"mensal volta ao dia 31 depois", RecMonthly, 2, at(2026, time.March, 31, 20, 0)},
		{"mensal vira o ano", RecMonthly, 12, at(2027, time.January, 31, 20, 0)},
		{"sem repetição sempre o início", RecNone, 5, start},
	}
	for _, c := range cases {
		if got := OccurrenceAt(start, c.rule, c.n, brt); !got.Equal(c.want) {
			t.Errorf("%s: %v, esperava %v", c.name, got, c.want)
		}
	}
}

func TestFinished(t *testing.T) {
	start := at(2026, time.March, 1, 20, 0)
	until := at(2026, time.March, 15, 23, 0)
	three := 3
	cases := []struct {
		name  string
		rule  Recurrence
		until *time.Time
		count *int
		n     int
		want  bool
	}{
		{"sem repetição acaba na 2ª", RecNone, nil, nil, 1, true},
		{"sem repetição ainda na 1ª", RecNone, nil, nil, 0, false},
		{"semanal sem fim nunca acaba", RecWeekly, nil, nil, 100, false},
		{"por contagem: índice 2 ainda cabe", RecWeekly, nil, &three, 2, false},
		{"por contagem: índice 3 passou", RecWeekly, nil, &three, 3, true},
		{"por data: dia 15 ainda cabe", RecWeekly, &until, nil, 2, false},
		{"por data: dia 22 passou", RecWeekly, &until, nil, 3, true},
	}
	for _, c := range cases {
		if got := Finished(c.rule, c.until, c.count, start, c.n, brt); got != c.want {
			t.Errorf("%s: %v, esperava %v", c.name, got, c.want)
		}
	}
}

func TestRecurrenceValid(t *testing.T) {
	for _, r := range []Recurrence{RecNone, RecDaily, RecWeekly, RecMonthly} {
		if !r.Valid() {
			t.Errorf("%q deveria ser válida", r)
		}
	}
	if Recurrence("yearly").Valid() || Recurrence("").Valid() {
		t.Error("regra desconhecida não pode ser válida")
	}
}
