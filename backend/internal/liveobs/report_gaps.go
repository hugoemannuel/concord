package liveobs

import (
	"slices"
	"time"
)

// Buracos na coleta e reinícios do LiveKit (emenda no ADR 0029). O coletor
// roda dentro do backend: quando o backend ou a VPS param, não fica linha
// nenhuma (up = false só aparece com o backend de pé e o LiveKit fora). Por
// isso o minuto que falta na livekit_metrics é "sem coleta". Puro.

const (
	// minGapMinutes: a partir de quantos minutos seguidos faltando é buraco
	// (1 minuto só é o relógio da coleta, que às vezes pula um minuto).
	minGapMinutes = 2
	// maxGapRows: teto das listas (um reinício em laço não enche o painel).
	maxGapRows = 100
	// restartTolerance: diferença no início do LiveKit que ainda é o mesmo
	// processo (o valor vem em float).
	restartTolerance = time.Second
)

// CollectionGap: minutos seguidos sem nenhuma linha em livekit_metrics.
type CollectionGap struct {
	// From: o primeiro minuto sem coleta; To: o primeiro coletado depois
	// (ou o minuto atual, se a coleta não voltou).
	From    time.Time `json:"from"`
	To      time.Time `json:"to"`
	Minutes int       `json:"minutes"`
	// Open: a coleta não voltou até agora (To é o minuto atual).
	Open bool `json:"open"`
}

// LiveKitRestart: o LiveKit começou de novo (o process_start_time_seconds mudou).
type LiveKitRestart struct {
	// At: quando o processo novo começou; SeenAt: o minuto em que se viu.
	At     time.Time `json:"at"`
	SeenAt time.Time `json:"seen_at"`
}

func gapBetween(last, next time.Time) (CollectionGap, bool) {
	from := last.Add(time.Minute)
	n := int(next.Sub(from) / time.Minute)
	return CollectionGap{From: from, To: next, Minutes: n}, n >= minGapMinutes
}

// collectionGaps: os buracos entre os minutos (em ordem) e do último até
// now, do mais recente. O começo do período não conta (a retenção apaga de
// hora em hora, e a coleta pode ter começado depois).
func collectionGaps(minutes []ServerMinute, now time.Time) []CollectionGap {
	gaps := []CollectionGap{}
	if len(minutes) == 0 {
		return gaps
	}
	edges := append(slices.Clone(minutes), ServerMinute{Minute: now.Truncate(time.Minute)})
	for i := 1; i < len(edges); i++ {
		if gap, ok := gapBetween(edges[i-1].Minute, edges[i].Minute); ok {
			gap.Open = i == len(edges)-1
			gaps = append(gaps, gap)
		}
	}
	slices.Reverse(gaps)
	return gaps[:min(maxGapRows, len(gaps))]
}

func sameStart(a, b time.Time) bool {
	return a.Sub(b).Abs() <= restartTolerance
}

// liveKitRestarts: os minutos (em ordem) em que o início do LiveKit mudou, do
// mais recente. Minuto sem o valor (LiveKit fora, dado de antes) não conta.
func liveKitRestarts(minutes []ServerMinute) []LiveKitRestart {
	restarts := []LiveKitRestart{}
	var prev *time.Time
	for _, m := range minutes {
		if m.LiveKitStartedAt == nil {
			continue
		}
		if prev != nil && !sameStart(*prev, *m.LiveKitStartedAt) {
			restarts = append(restarts, LiveKitRestart{At: *m.LiveKitStartedAt, SeenAt: m.Minute})
		}
		prev = m.LiveKitStartedAt
	}
	slices.Reverse(restarts)
	return restarts[:min(maxGapRows, len(restarts))]
}
