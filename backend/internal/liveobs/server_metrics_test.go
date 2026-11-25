package liveobs

import (
	"math"
	"strings"
	"testing"
	"time"

	"gin-quickstart/backend/internal/platform/promtext"
)

func parse(t *testing.T, text string) promtext.Metrics {
	t.Helper()
	m, err := promtext.Parse(strings.NewReader(text))
	if err != nil {
		t.Fatal(err)
	}
	return m
}

const scrapeA = `
livekit_packet_bytes{direction="incoming",transmission="initial",country=""} 1000
livekit_packet_bytes{direction="outgoing",transmission="initial",country=""} 3000
livekit_packet_bytes{direction="outgoing",transmission="retransmit",country=""} 100
livekit_packet_total{direction="incoming",transmission="initial",country=""} 10
livekit_packet_total{direction="outgoing",transmission="initial",country=""} 30
livekit_packet_loss_total{direction="incoming",source="SCREEN_SHARE",type="VIDEO",country=""} 1
livekit_packet_loss_total{direction="outgoing",source="SCREEN_SHARE",type="VIDEO",country=""} 2
livekit_nack_total{direction="incoming",country=""} 5
livekit_nack_total{direction="outgoing",country=""} 5
livekit_pli_total{direction="incoming",country=""} 1
livekit_rtt_ms_sum{direction="outgoing",source="SCREEN_SHARE",type="VIDEO",country=""} 150
livekit_rtt_ms_count{direction="outgoing",source="SCREEN_SHARE",type="VIDEO",country=""} 3
livekit_jitter_us_sum{direction="incoming",source="SCREEN_SHARE",type="VIDEO",country=""} 10000
livekit_jitter_us_count{direction="incoming",source="SCREEN_SHARE",type="VIDEO",country=""} 1
livekit_quality_score_sum 40
livekit_quality_score_count 10
livekit_room_total 1
livekit_participant_total 3
livekit_track_published_total{kind="AUDIO"} 3
livekit_track_published_total{kind="VIDEO"} 1
livekit_track_subscribed_total{kind="AUDIO"} 6
livekit_track_subscribed_total{kind="VIDEO"} 2
process_cpu_seconds_total 10
process_resident_memory_bytes 5.24288e+07
`

const scrapeB = `
livekit_packet_bytes{direction="incoming",transmission="initial",country=""} 7501000
livekit_packet_bytes{direction="outgoing",transmission="initial",country=""} 15003000
livekit_packet_bytes{direction="outgoing",transmission="retransmit",country=""} 100100
livekit_packet_total{direction="incoming",transmission="initial",country=""} 1010
livekit_packet_total{direction="outgoing",transmission="initial",country=""} 2030
livekit_packet_loss_total{direction="incoming",source="SCREEN_SHARE",type="VIDEO",country=""} 11
livekit_packet_loss_total{direction="outgoing",source="SCREEN_SHARE",type="VIDEO",country=""} 32
livekit_nack_total{direction="incoming",country=""} 15
livekit_nack_total{direction="outgoing",country=""} 25
livekit_pli_total{direction="incoming",country=""} 4
livekit_rtt_ms_sum{direction="outgoing",source="SCREEN_SHARE",type="VIDEO",country=""} 450
livekit_rtt_ms_count{direction="outgoing",source="SCREEN_SHARE",type="VIDEO",country=""} 9
livekit_jitter_us_sum{direction="incoming",source="SCREEN_SHARE",type="VIDEO",country=""} 40000
livekit_jitter_us_count{direction="incoming",source="SCREEN_SHARE",type="VIDEO",country=""} 4
livekit_quality_score_sum 85
livekit_quality_score_count 20
livekit_room_total 2
livekit_participant_total 5
livekit_track_published_total{kind="AUDIO"} 4
livekit_track_published_total{kind="VIDEO"} 2
livekit_track_subscribed_total{kind="AUDIO"} 12
livekit_track_subscribed_total{kind="VIDEO"} 6
process_cpu_seconds_total 40
process_resident_memory_bytes 1.048576e+08
process_start_time_seconds 1.79399868e+09
`

func near(a, b float64) bool { return math.Abs(a-b) < 0.01 }

func TestServerMinuteDeltasEntreLeituras(t *testing.T) {
	prev := countersOf(parse(t, scrapeA))
	now := countersOf(parse(t, scrapeB))
	m := serverMinute(prev, now, 60)
	checks := []struct {
		name      string
		got, want float64
	}{
		{"bytes in", float64(m.BytesIn), 7_500_000},
		{"bytes out (inicial + retransmissão)", float64(m.BytesOut), 15_100_000},
		{"retransmitidos", float64(m.RetransmitBytesOut), 100_000},
		{"pacotes in", float64(m.PacketsIn), 1000},
		{"pacotes out", float64(m.PacketsOut), 2000},
		{"perdidos na subida", float64(m.PacketsLostIn), 10},
		{"perdidos na descida", float64(m.PacketsLostOut), 30},
		{"nack", float64(m.Nack), 30},
		{"pli", float64(m.Pli), 3},
		{"rtt médio no minuto", *m.RTTMs, 50},
		{"jitter médio em ms", *m.JitterMs, 10},
		{"nota média no minuto", *m.QualityScore, 4.5},
		{"cpu do livekit (% de 1 vCPU)", *m.LiveKitCPUPercent, 50},
		{"memória do livekit", *m.LiveKitMemMB, 100},
		{"salas agora", float64(m.Rooms), 2},
		{"participantes agora", float64(m.Participants), 5},
		{"tracks publicadas", float64(m.TracksIn), 6},
		{"tracks assinadas", float64(m.TracksOut), 18},
		{"vídeos publicados", float64(m.VideoTracksIn), 2},
		{"vídeos assinados", float64(m.VideoTracksOut), 6},
	}
	for _, c := range checks {
		if !near(c.got, c.want) {
			t.Errorf("%s = %v, quer %v", c.name, c.got, c.want)
		}
	}
	if !m.Up {
		t.Error("Up = false com as duas leituras")
	}
	if m.LiveKitStartedAt == nil || !m.LiveKitStartedAt.Equal(time.Unix(1_793_998_680, 0)) {
		t.Errorf("início do LiveKit = %v", m.LiveKitStartedAt)
	}
	if a := serverMinute(prev, prev, 60); a.LiveKitStartedAt != nil {
		t.Errorf("sem process_start_time_seconds: %v, quer nil", a.LiveKitStartedAt)
	}
}

func TestServerMinuteLiveKitReiniciado(t *testing.T) {
	// Contador menor que o anterior = o LiveKit reiniciou: conta do zero.
	prev := countersOf(parse(t, scrapeB))
	now := countersOf(parse(t, scrapeA))
	m := serverMinute(prev, now, 60)
	if m.BytesIn != 1000 || m.PacketsLostOut != 2 {
		t.Errorf("depois de reiniciar: bytes in = %d, perdidos = %d; quer 1000 e 2", m.BytesIn, m.PacketsLostOut)
	}
	if !near(*m.LiveKitCPUPercent, 10.0/60*100) {
		t.Errorf("cpu = %v, quer o contador novo / 60 s", *m.LiveKitCPUPercent)
	}
	// Histograma recomeçado: média só do que entrou depois.
	if !near(*m.RTTMs, 50) {
		t.Errorf("rtt = %v, quer 50", *m.RTTMs)
	}
}

func TestServerMinuteSemAmostrasDeixaMediasVazias(t *testing.T) {
	c := countersOf(parse(t, scrapeA))
	m := serverMinute(c, c, 60)
	if m.RTTMs != nil || m.JitterMs != nil || m.QualityScore != nil {
		t.Errorf("sem amostras no minuto, médias = %v %v %v; quer nil", m.RTTMs, m.JitterMs, m.QualityScore)
	}
	if m.BytesIn != 0 {
		t.Errorf("bytes = %d, quer 0", m.BytesIn)
	}
}

func TestServerMinuteSemIntervalo(t *testing.T) {
	c := countersOf(parse(t, scrapeA))
	if m := serverMinute(c, c, 0); m.LiveKitCPUPercent != nil {
		t.Errorf("cpu sem intervalo = %v, quer nil", *m.LiveKitCPUPercent)
	}
}

func TestServerMinuteDescartaMediaImpossivelOuComPoucasAmostras(t *testing.T) {
	var prev, now counters
	// 23/11 04:33: RTT de 3 855 065 ms num minuto com 1 participante.
	now.c[cRTTSum], now.c[cRTTCount] = 3_855_065*10, 10
	// Jitter com 2 amostras no minuto: pouco demais para uma média.
	now.c[cJitterSum], now.c[cJitterCount] = 2_000_000, 2
	// Nota com amostras suficientes e valor possível: fica.
	now.c[cScoreSum], now.c[cScoreCount] = 12, 3
	m := serverMinute(prev, now, 60)
	if m.RTTMs != nil {
		t.Errorf("RTT impossível gravado: %v", *m.RTTMs)
	}
	if m.JitterMs != nil {
		t.Errorf("jitter com 2 amostras gravado: %v", *m.JitterMs)
	}
	if m.QualityScore == nil || !near(*m.QualityScore, 4) {
		t.Errorf("nota = %v, quer 4", m.QualityScore)
	}
	// No limite: 10 s de RTT com 3 amostras ainda é um valor possível.
	now.c[cRTTSum], now.c[cRTTCount] = 30_000, 3
	if m := serverMinute(prev, now, 60); m.RTTMs == nil || !near(*m.RTTMs, 10_000) {
		t.Errorf("RTT de 10 s = %v", m.RTTMs)
	}
}
