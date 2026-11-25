package liveobs

import (
	"time"

	"gin-quickstart/backend/internal/platform/promtext"
)

// Métricas do LiveKit (o /metrics do Prometheus dele, só em 127.0.0.1) num
// minuto: o que entrou e saiu do SFU, perda nos dois sentidos, carga e
// quantas pessoas/tracks havia. Ver docs/adr/0029-observabilidade-das-lives.md.

// ServerMinute: uma linha de livekit_metrics.
type ServerMinute struct {
	Minute  time.Time
	Seconds float64
	// Up: o LiveKit respondeu (false = só os números da máquina).
	Up bool

	BytesIn, BytesOut, RetransmitBytesOut int64
	PacketsIn, PacketsOut                 int64
	// PacketsLostIn: perdidos de quem publica até o SFU (subida de quem
	// transmite); PacketsLostOut: do SFU até quem assiste (descida).
	PacketsLostIn, PacketsLostOut int64
	Nack, Pli                     int64

	// Médias no minuto (nil = nenhuma amostra).
	RTTMs, JitterMs, QualityScore *float64

	Rooms, Participants           int
	TracksIn, TracksOut           int
	VideoTracksIn, VideoTracksOut int

	// LiveKitCPUPercent: % de uma vCPU (200 = as duas inteiras).
	LiveKitCPUPercent *float64
	LiveKitMemMB      *float64
	// Máquina inteira (todas as vCPUs = 100%).
	HostCPUPercent *float64
	HostMemPercent *float64
}

// Contadores e medidores lidos numa coleta.
type counter int

const (
	cBytesIn counter = iota
	cBytesOut
	cRetransmitBytesOut
	cPacketsIn
	cPacketsOut
	cLostIn
	cLostOut
	cNack
	cPli
	cRTTSum
	cRTTCount
	cJitterSum
	cJitterCount
	cScoreSum
	cScoreCount
	cCPUSeconds
	numCounters
)

type gauge int

const (
	gRooms gauge = iota
	gParticipants
	gTracksIn
	gTracksOut
	gVideoIn
	gVideoOut
	gRSS
	numGauges
)

type query struct {
	name   string
	labels map[string]string
}

var (
	in  = map[string]string{"direction": "incoming"}
	out = map[string]string{"direction": "outgoing"}
)

var counterQueries = [numCounters]query{
	cBytesIn:            {"livekit_packet_bytes", in},
	cBytesOut:           {"livekit_packet_bytes", out},
	cRetransmitBytesOut: {"livekit_packet_bytes", map[string]string{"direction": "outgoing", "transmission": "retransmit"}},
	cPacketsIn:          {"livekit_packet_total", in},
	cPacketsOut:         {"livekit_packet_total", out},
	cLostIn:             {"livekit_packet_loss_total", in},
	cLostOut:            {"livekit_packet_loss_total", out},
	cNack:               {"livekit_nack_total", nil},
	cPli:                {"livekit_pli_total", nil},
	cRTTSum:             {"livekit_rtt_ms_sum", nil},
	cRTTCount:           {"livekit_rtt_ms_count", nil},
	cJitterSum:          {"livekit_jitter_us_sum", nil},
	cJitterCount:        {"livekit_jitter_us_count", nil},
	cScoreSum:           {"livekit_quality_score_sum", nil},
	cScoreCount:         {"livekit_quality_score_count", nil},
	cCPUSeconds:         {"process_cpu_seconds_total", nil},
}

// video: o rótulo kind que o LiveKit publica (TrackType.String(), em
// maiúsculas; conferido na produção em 25/11/2026: kind="VIDEO" e "AUDIO").
var video = map[string]string{"kind": "VIDEO"}

var gaugeQueries = [numGauges]query{
	gRooms:        {"livekit_room_total", nil},
	gParticipants: {"livekit_participant_total", nil},
	gTracksIn:     {"livekit_track_published_total", nil},
	gTracksOut:    {"livekit_track_subscribed_total", nil},
	gVideoIn:      {"livekit_track_published_total", video},
	gVideoOut:     {"livekit_track_subscribed_total", video},
	gRSS:          {"process_resident_memory_bytes", nil},
}

// counters: uma coleta do /metrics.
type counters struct {
	c [numCounters]float64
	g [numGauges]float64
}

func countersOf(m promtext.Metrics) counters {
	var s counters
	for i, q := range counterQueries {
		s.c[i] = m.Sum(q.name, q.labels)
	}
	for i, q := range gaugeQueries {
		s.g[i] = m.Sum(q.name, q.labels)
	}
	return s
}

// delta de um contador; menor que antes = o LiveKit reiniciou e contou do zero.
func (now counters) delta(prev counters, c counter) float64 {
	if now.c[c] < prev.c[c] {
		return now.c[c]
	}
	return now.c[c] - prev.c[c]
}

// average de um histograma (soma/contagem) no intervalo; nil sem amostras.
func (now counters) average(prev counters, sum, count counter, scale float64) *float64 {
	n := now.delta(prev, count)
	if n <= 0 {
		return nil
	}
	v := now.delta(prev, sum) / n * scale
	return &v
}

// serverMinute: o minuto entre duas coletas, `seconds` depois uma da outra.
func serverMinute(prev, now counters, seconds float64) ServerMinute {
	d := func(c counter) int64 { return int64(now.delta(prev, c)) }
	g := func(x gauge) int { return int(now.g[x]) }
	mem := now.g[gRSS] / (1 << 20)
	return ServerMinute{
		Seconds:            seconds,
		Up:                 true,
		BytesIn:            d(cBytesIn),
		BytesOut:           d(cBytesOut),
		RetransmitBytesOut: d(cRetransmitBytesOut),
		PacketsIn:          d(cPacketsIn),
		PacketsOut:         d(cPacketsOut),
		PacketsLostIn:      d(cLostIn),
		PacketsLostOut:     d(cLostOut),
		Nack:               d(cNack),
		Pli:                d(cPli),
		RTTMs:              now.average(prev, cRTTSum, cRTTCount, 1),
		JitterMs:           now.average(prev, cJitterSum, cJitterCount, 0.001),
		QualityScore:       now.average(prev, cScoreSum, cScoreCount, 1),
		Rooms:              g(gRooms),
		Participants:       g(gParticipants),
		TracksIn:           g(gTracksIn),
		TracksOut:          g(gTracksOut),
		VideoTracksIn:      g(gVideoIn),
		VideoTracksOut:     g(gVideoOut),
		LiveKitCPUPercent:  cpuOver(now.delta(prev, cCPUSeconds), seconds),
		LiveKitMemMB:       &mem,
	}
}

func cpuOver(cpuSeconds, seconds float64) *float64 {
	if seconds <= 0 {
		return nil
	}
	pct := cpuSeconds / seconds * 100
	return &pct
}
