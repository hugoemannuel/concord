package deviceobs

import (
	"cmp"
	"slices"
	"time"
)

// Piores pessoas e por quê: um motivo por regra, na ordem da tabela do plano
// (docs/superpowers/plans/2026-11-25-obs-dispositivo.md); cada motivo soma o
// peso na pontuação. Os textos aparecem no painel dos devs. Puro.

const maxWorst = 20

type reasonRule struct {
	text   string
	weight int
	hit    func(p PersonStats) bool
}

func atLeast(v *float64, limit float64) bool { return v != nil && *v >= limit }

// longFrames: travadas só contam com pelo menos 5 minutos de janela visível.
func longFrames(p PersonStats) bool {
	return p.VisibleMinutes >= 5 && atLeast(p.LongMsPerMin, 1000)
}

// lowFreeMemory: o mínimo de memória livre abaixo de 10% do total ou de 1 GB.
func lowFreeMemory(p PersonStats) bool {
	if p.MemFreeMinMB == nil {
		return false
	}
	free := *p.MemFreeMinMB
	return free < 1024 || (p.MemTotalMB != nil && free < 0.1**p.MemTotalMB)
}

var reasonRules = []reasonRule{
	{"A janela parou de responder", 3, func(p PersonStats) bool { return p.Hangs > 0 }},
	{"Travadas longas", 3, longFrames},
	{"Sem aceleração por hardware", 3, func(p PersonStats) bool { return p.SoftwareGPU }},
	{"Placa de vídeo caiu", 2, func(p PersonStats) bool { return p.GPUCrashes > 0 }},
	{"CPU alta do renderer em call", 2, func(p PersonStats) bool { return atLeast(p.CPURendererCall, 20) }},
	{"App pesado (CPU)", 2, func(p PersonStats) bool { return atLeast(p.CPUApp, 25) }},
	{"Interface atrasada", 2, func(p PersonStats) bool { return atLeast(p.LagP95Ms, 100) }},
	{"Cliques demorando", 1, func(p PersonStats) bool { return p.SlowInputs >= 5 }},
	{"Memória do app alta", 1, func(p PersonStats) bool { return atLeast(p.MemAppMB, 1500) }},
	{"Pouca memória livre", 1, lowFreeMemory},
	{"Máquina no limite (CPU)", 1, func(p PersonStats) bool { return atLeast(p.SysCPU, 85) }},
	{"Rede do app lenta", 1, func(p PersonStats) bool { return atLeast(p.WSRTTMs, 300) }},
	{"Abre devagar", 1, func(p PersonStats) bool { return atLeast(p.StartupMs, 15000) }},
}

// evaluate: a pontuação (soma dos pesos) e os motivos, na ordem das regras.
func evaluate(p PersonStats) (int, []string) {
	score, reasons := 0, []string{}
	for _, r := range reasonRules {
		if r.hit(p) {
			score += r.weight
			reasons = append(reasons, r.text)
		}
	}
	return score, reasons
}

// worstRows: quem tem pontuação acima de zero, a maior primeiro (empate fica
// na ordem do banco: mais minutos primeiro), no máximo limit.
func worstRows(people []PersonStats, limit int) []WorstRow {
	rows := []WorstRow{}
	for _, p := range people {
		if score, reasons := evaluate(p); score > 0 {
			rows = append(rows, WorstRow{PersonStats: p, Score: score, Reasons: reasons})
		}
	}
	slices.SortStableFunc(rows, func(a, b WorstRow) int { return cmp.Compare(b.Score, a.Score) })
	return rows[:min(limit, len(rows))]
}

// buildReport monta a resposta; listas vazias saem como [] no JSON.
func buildReport(from, to time.Time, people []PersonStats, baseline []BaselineRow, versions []VersionRow) DeviceReport {
	samples := 0
	for _, p := range people {
		samples += p.Samples
	}
	return DeviceReport{
		From: from, To: to, People: len(people), Samples: samples,
		Worst:    worstRows(people, maxWorst),
		Baseline: orEmpty(baseline),
		Versions: orEmpty(versions),
	}
}

func orEmpty[T any](s []T) []T {
	if s == nil {
		return []T{}
	}
	return s
}
