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
	{"network", func(s SessionStats) string { return s.Network }, true, false},
	{"device", func(s SessionStats) string { return s.Device }, true, true},
}

// counts: a sessão entra nessa distribuição.
func (d dimension) counts(s SessionStats) bool {
	return (d.withCalls || s.Kind != KindCall) && (!d.skipEmpty || d.key(s) != "")
}

type group struct {
	row          BreakdownRow
	below, sw    mean
	freezes      int64
	watchSeconds float64
}

func (g *group) add(s SessionStats) {
	g.row.Sessions++
	g.below.add(s.BelowRatio)
	g.sw.add(software(s))
	if s.Kind == KindWatch {
		g.freezes += s.Freezes
		g.watchSeconds += s.Seconds
	}
}

func groupBy(sessions []SessionStats, d dimension) []BreakdownRow {
	groups := map[string]*group{}
	for _, s := range sessions {
		if !d.counts(s) {
			continue
		}
		key := cmp.Or(d.key(s), unknownKey)
		if groups[key] == nil {
			groups[key] = &group{row: BreakdownRow{Key: key}}
		}
		groups[key].add(s)
	}
	rows := []BreakdownRow{}
	for _, g := range groups {
		row := g.row
		row.BelowRatio, row.SoftwareRatio = g.below.value(), g.sw.value()
		row.FreezesPerMin = ratePerMinute(g.freezes, g.watchSeconds)
		rows = append(rows, row)
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
