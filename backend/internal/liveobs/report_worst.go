package liveobs

import (
	"cmp"
	"slices"
)

// Piores sessões e por quê: um motivo por regra, na ordem em que vale olhar
// (o PC e a conexão de quem transmite antes de quem assiste). Os textos
// aparecem no painel dos devs. Puro.

type reasonRule struct {
	text string
	hit  func(s SessionStats) bool
}

func ratioAtLeast(v *float64, min float64) bool { return v != nil && *v >= min }

func freezesPerMin(s SessionStats) float64 {
	if v := ratePerMinute(s.Freezes, s.Seconds); v != nil {
		return *v
	}
	return 0
}

var reasonRules = []reasonRule{
	{"PC de quem transmite no limite (CPU)", func(s SessionStats) bool { return s.CPURatio >= 0.3 }},
	{"Conexão de quem transmite no limite (banda)", func(s SessionStats) bool { return s.BandwidthRatio >= 0.3 }},
	{"Codificando no processador", func(s SessionStats) bool { return s.Kind == KindShare && ratioAtLeast(software(s), 0.5) }},
	{"Decodificando no processador", func(s SessionStats) bool { return s.Kind == KindWatch && ratioAtLeast(software(s), 0.5) }},
	{"Reserva ligada (alguém sem o codec)", func(s SessionStats) bool { return s.BackupRatio >= 0.3 }},
	{"Pausada pelo servidor (conexão de quem assiste)", func(s SessionStats) bool { return s.PausedRatio >= 0.1 }},
	{"Perda de pacotes", func(s SessionStats) bool { return ratioAtLeast(s.LossPct, 2) }},
	{"Congelamentos", func(s SessionStats) bool { return freezesPerMin(s) >= 1 }},
	{"Latência alta", func(s SessionStats) bool { return ratioAtLeast(s.RTTMs, 150) }},
	{"Conexão por TCP", func(s SessionStats) bool { return s.Transport == "tcp" }},
	{"Conexão por TURN", func(s SessionStats) bool { return s.Transport == "relay" }},
}

// allRules: as de cima e, depois, as da ADR 0032 (onde os quadros se perdem e
// a voz) e as do celular (ADR 0070).
var allRules = slices.Concat(reasonRules, qualityRules, mobileRules)

func reasons(s SessionStats) []string {
	out := []string{}
	for _, r := range allRules {
		if r.hit(s) {
			out = append(out, r.text)
		}
	}
	return out
}

func orZero(v *float64) float64 {
	if v == nil {
		return 0
	}
	return *v
}

// score: quanto pior, maior (abaixo do alvo, congelamentos, pausa e perda
// pesam mais que o motivo provável).
func score(s SessionStats) float64 {
	return orZero(s.BelowRatio)*100 + freezesPerMin(s)*20 + s.PausedRatio*100 + orZero(s.LossPct)*5 +
		(s.CPURatio+s.BandwidthRatio)*30 + orZero(software(s))*10
}

// sessionScore: a voz tem a pontuação dela (report_quality.go).
func sessionScore(s SessionStats) float64 {
	if s.Kind == KindCall {
		return callScore(s)
	}
	return score(s)
}

// worstRows: as sessões com pontuação acima de zero, só das que keep aceita;
// a curta demais só entra se a voz não conectou.
func worstRows(sessions []SessionStats, limit int, keep func(SessionStats) bool) []WorstRow {
	rows := []WorstRow{}
	for _, s := range sessions {
		if !keep(s) || (s.Seconds < minWorstSeconds && s.Failures == 0) {
			continue
		}
		if sc := sessionScore(s); sc > 0 {
			rows = append(rows, WorstRow{SessionStats: s, DurationSeconds: duration(s),
				FreezesPerMin: freezesPerMin(s), Score: sc, Reasons: reasons(s)})
		}
	}
	slices.SortStableFunc(rows, func(a, b WorstRow) int { return cmp.Compare(b.Score, a.Score) })
	return rows[:min(limit, len(rows))]
}

func isCall(s SessionStats) bool    { return s.Kind == KindCall }
func isNotCall(s SessionStats) bool { return s.Kind != KindCall }
