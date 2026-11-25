package liveobs

import (
	"slices"
	"time"
)

// Montagem do painel a partir das sessões agregadas e dos minutos do LiveKit.
// Puro: quem lê o banco é o ReportRepository.

const (
	maxLives = 30
	maxWorst = 15
	// maxWorstCalls: teto das piores chamadas (lista própria).
	maxWorstCalls = 10
	// Sessões com menos que isso medido não entram nas piores (início/fim).
	minWorstSeconds = 60.0
	maxPoints       = 300
)

var bucketSteps = []time.Duration{
	time.Minute, 5 * time.Minute, 15 * time.Minute, 30 * time.Minute,
	time.Hour, 2 * time.Hour, 4 * time.Hour,
}

func buildReport(from, to time.Time, sessions []SessionStats, minutes []ServerMinute, events []EventRow) LiveReport {
	bucket := bucketFor(to.Sub(from))
	// Cada lista com o seu teto: a pontuação da live e a da voz têm escalas
	// diferentes, e numa lista só a voz nunca entrava.
	lives := worstRows(sessions, maxWorst, isNotCall)
	calls := worstRows(sessions, maxWorstCalls, isCall)
	return LiveReport{
		From:       from,
		To:         to,
		BucketMin:  int(bucket / time.Minute),
		Server:     bucketSeries(minutes, bucket),
		Lives:      liveRows(sessions, maxLives),
		Worst:      append(slices.Clone(lives), calls...),
		WorstLives: lives,
		WorstCalls: calls,
		Breakdown:  breakdowns(sessions),
		Events:     events,
	}
}

// bucketFor: o menor intervalo que deixa a série com até maxPoints pontos.
func bucketFor(span time.Duration) time.Duration {
	for _, step := range bucketSteps {
		if span/step <= maxPoints {
			return step
		}
	}
	return bucketSteps[len(bucketSteps)-1]
}

// mean: média dos valores presentes (nil sem nenhum).
type mean struct {
	sum float64
	n   int
}

func (m *mean) add(v *float64) {
	if v != nil {
		m.sum += *v
		m.n++
	}
}

func (m mean) value() *float64 {
	if m.n == 0 {
		return nil
	}
	v := m.sum / float64(m.n)
	return &v
}

type bucketAcc struct {
	point                     ServerPoint
	seconds                   float64
	bytesIn, bytesOut         int64
	packetsIn, packetsOut     int64
	lostIn, lostOut           int64
	rtt, livekitCPU, cpu, mem mean
}

func (a *bucketAcc) add(m ServerMinute) {
	a.point.Up = a.point.Up || m.Up
	a.seconds += m.Seconds
	a.bytesIn += m.BytesIn
	a.bytesOut += m.BytesOut
	a.packetsIn += m.PacketsIn
	a.packetsOut += m.PacketsOut
	a.lostIn += m.PacketsLostIn
	a.lostOut += m.PacketsLostOut
	a.rtt.add(m.RTTMs)
	a.livekitCPU.add(m.LiveKitCPUPercent)
	a.cpu.add(m.HostCPUPercent)
	a.mem.add(m.HostMemPercent)
	a.point.Participants = max(a.point.Participants, m.Participants)
	a.point.VideoTracksOut = max(a.point.VideoTracksOut, m.VideoTracksOut)
}

func mbps(bytes int64, seconds float64) float64 {
	if seconds <= 0 {
		return 0
	}
	return float64(bytes) * 8 / 1e6 / seconds
}

func lossPct(lost, delivered int64) *float64 {
	total := lost + delivered
	if total <= 0 {
		return nil
	}
	v := float64(lost) * 100 / float64(total)
	return &v
}

func (a *bucketAcc) result() ServerPoint {
	p := a.point
	p.MbpsIn, p.MbpsOut = mbps(a.bytesIn, a.seconds), mbps(a.bytesOut, a.seconds)
	p.LossInPct, p.LossOutPct = lossPct(a.lostIn, a.packetsIn), lossPct(a.lostOut, a.packetsOut)
	p.RTTMs, p.LiveKitCPU = a.rtt.value(), a.livekitCPU.value()
	p.HostCPU, p.HostMem = a.cpu.value(), a.mem.value()
	return p
}

// bucketSeries: os minutos (em ordem) agrupados em intervalos de bucket.
func bucketSeries(minutes []ServerMinute, bucket time.Duration) []ServerPoint {
	points := []ServerPoint{}
	var acc *bucketAcc
	for _, m := range minutes {
		at := m.Minute.Truncate(bucket)
		if acc != nil && !acc.point.At.Equal(at) {
			points = append(points, acc.result())
			acc = nil
		}
		if acc == nil {
			acc = &bucketAcc{point: ServerPoint{At: at}}
		}
		acc.add(m)
	}
	if acc != nil {
		points = append(points, acc.result())
	}
	return points
}

func duration(s SessionStats) float64 {
	return s.EndedAt.Sub(s.StartedAt).Seconds()
}

func ratePerMinute(count int64, seconds float64) *float64 {
	if seconds <= 0 {
		return nil
	}
	v := float64(count) * 60 / seconds
	return &v
}

// software: fração do tempo no processador (1 − na placa).
func software(s SessionStats) *float64 {
	if s.HardwareRatio == nil {
		return nil
	}
	v := 1 - *s.HardwareRatio
	return &v
}

func watching(share, w SessionStats) bool {
	return w.Kind == KindWatch && w.StreamerID == share.UserID && w.CallID == share.CallID &&
		w.StartedAt.Before(share.EndedAt) && w.EndedAt.After(share.StartedAt)
}

func liveRow(share SessionStats, all []SessionStats) LiveRow {
	row := LiveRow{SessionStats: share, DurationSeconds: duration(share)}
	var freezes int64
	var seconds float64
	var sw mean
	for _, w := range all {
		if !watching(share, w) {
			continue
		}
		row.Viewers++
		freezes += w.Freezes
		seconds += w.Seconds
		sw.add(software(w))
	}
	row.ViewerFreezesPerMin, row.ViewerSoftwareRatio = ratePerMinute(freezes, seconds), sw.value()
	return row
}

// liveRows: as lives (quem transmite), da mais recente, com quem assistiu.
func liveRows(sessions []SessionStats, limit int) []LiveRow {
	shares := slices.DeleteFunc(slices.Clone(sessions), func(s SessionStats) bool { return s.Kind != KindShare })
	slices.SortFunc(shares, func(a, b SessionStats) int { return b.StartedAt.Compare(a.StartedAt) })
	rows := []LiveRow{}
	for _, s := range shares[:min(limit, len(shares))] {
		rows = append(rows, liveRow(s, sessions))
	}
	return rows
}
