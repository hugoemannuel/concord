package liveobs

import (
	"cmp"
	"slices"
)

// Distribuição das lives por SO, placa de vídeo, codec e transporte; e, com as
// calls também, por transporte, plataforma, rede e aparelho (ADR 0070). Puro.

const unknownKey = "(desconhecida)"

type dimension struct {
	name      string
	key       func(s SessionStats) string
	withCalls bool
	// skipEmpty: sem o grupo "(desconhecida)" (o aparelho só existe no Android).
	skipEmpty bool
}

var dimensions = []dimension{
	{"os", func(s SessionStats) string { return s.OS }, false, false},
	{"gpu", func(s SessionStats) string { return s.GPU }, false, false},
	{"codec", func(s SessionStats) string { return s.Codec }, false, false},
	{"transport", func(s SessionStats) string { return s.Transport }, true, false},
	{"target", func(s SessionStats) string { return s.Target }, true, false},
	{"network", androidNetwork, true, true},
	{"device", func(s SessionStats) string { return s.Device }, true, true},
	// ADR 0074: a fonte da live (monitor, janela) e o motor (nativo, Chromium).
	{"surface", func(s SessionStats) string { return s.Surface }, false, true},
	{"engine", func(s SessionStats) string { return s.Engine }, false, true},
}

// androidNetwork: a rede só do Android. No desktop e na web a coluna é o
// effectiveType do Chromium ("4g" em ~90% das sessões), não o tipo de rede.
func androidNetwork(s SessionStats) string {
	if s.Target != "android" {
		return ""
	}
	return s.Network
}

// counts: a sessão entra nessa distribuição.
func (d dimension) counts(s SessionStats) bool {
	return (d.withCalls || s.Kind != KindCall) && (!d.skipEmpty || d.key(s) != "")
}

// tally: as somas de um grupo (ou de uma pessoa dentro dele).
type tally struct {
	below, sw    mean
	freezes      int64
	watchSeconds float64
}

func (t *tally) add(s SessionStats) {
	t.below.add(s.BelowRatio)
	t.sw.add(software(s))
	if s.Kind == KindWatch {
		t.freezes += seenFreezes(s)
		t.watchSeconds += s.Seconds
	}
}

func (t *tally) freezesPerMin() *float64 { return ratePerMinute(t.freezes, t.watchSeconds) }
func (t *tally) belowRatio() *float64    { return t.below.value() }
func (t *tally) softwareRatio() *float64 { return t.sw.value() }

// group: o grupo inteiro e cada pessoa nele (para a mediana por pessoa: uma
// pessoa só chegou a ser 22% das horas assistidas e puxava todas as médias).
type group struct {
	row    BreakdownRow
	all    tally
	people map[string]*tally
}

func (g *group) add(s SessionStats) {
	g.row.Sessions++
	g.all.add(s)
	if g.people[s.UserID] == nil {
		g.people[s.UserID] = &tally{}
	}
	g.people[s.UserID].add(s)
}

// medianOf: a mediana do valor por pessoa (só de quem tem o valor); nil sem nenhum.
func medianOf(people map[string]*tally, pick func(*tally) *float64) *float64 {
	values := []float64{}
	for _, p := range people {
		if v := pick(p); v != nil {
			values = append(values, *v)
		}
	}
	if len(values) == 0 {
		return nil
	}
	slices.Sort(values)
	mid := len(values) / 2
	v := values[mid]
	if len(values)%2 == 0 {
		v = (values[mid-1] + values[mid]) / 2
	}
	return &v
}

func (g *group) result() BreakdownRow {
	row := g.row
	row.People = len(g.people)
	row.BelowRatio, row.SoftwareRatio, row.FreezesPerMin = g.all.belowRatio(), g.all.softwareRatio(), g.all.freezesPerMin()
	row.BelowRatioMedian = medianOf(g.people, (*tally).belowRatio)
	row.SoftwareRatioMedian = medianOf(g.people, (*tally).softwareRatio)
	row.FreezesPerMinMedian = medianOf(g.people, (*tally).freezesPerMin)
	return row
}

func groupBy(sessions []SessionStats, d dimension) []BreakdownRow {
	groups := map[string]*group{}
	for _, s := range sessions {
		if !d.counts(s) {
			continue
		}
		key := cmp.Or(d.key(s), unknownKey)
		if groups[key] == nil {
			groups[key] = &group{row: BreakdownRow{Key: key}, people: map[string]*tally{}}
		}
		groups[key].add(s)
	}
	rows := []BreakdownRow{}
	for _, g := range groups {
		rows = append(rows, g.result())
	}
	slices.SortFunc(rows, func(a, b BreakdownRow) int {
		return cmp.Or(cmp.Compare(b.Sessions, a.Sessions), cmp.Compare(a.Key, b.Key))
	})
	return rows
}

func breakdowns(sessions []SessionStats) map[string][]BreakdownRow {
	out := map[string][]BreakdownRow{}
	for _, d := range dimensions {
		out[d.name] = groupBy(sessions, d)
	}
	return out
}
