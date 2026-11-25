package liveobs

import (
	"fmt"
	"slices"
	"testing"
	"time"
)

var t0 = time.Date(2026, 10, 29, 20, 0, 0, 0, time.UTC)

func fp(v float64) *float64 { return &v }

func session(id, kind, user string, start, minutes int) SessionStats {
	return SessionStats{
		ID: id, Kind: kind, UserID: user, Username: user, CallID: "c1",
		StartedAt: t0.Add(time.Duration(start) * time.Minute),
		EndedAt:   t0.Add(time.Duration(start+minutes) * time.Minute),
		Seconds:   float64(minutes * 60),
	}
}

func TestBucketFor(t *testing.T) {
	tests := []struct {
		span time.Duration
		want time.Duration
	}{
		{time.Hour, time.Minute},
		{24 * time.Hour, 5 * time.Minute},
		{7 * 24 * time.Hour, 60 * time.Minute},
		{14 * 24 * time.Hour, 120 * time.Minute},
		{60 * 24 * time.Hour, 240 * time.Minute},
	}
	for _, tt := range tests {
		if got := bucketFor(tt.span); got != tt.want {
			t.Errorf("bucketFor(%v) = %v, quer %v", tt.span, got, tt.want)
		}
	}
}

func TestBucketSeriesSomaBandaETiraMedias(t *testing.T) {
	minutes := []ServerMinute{
		{Minute: t0, Seconds: 60, Up: true, BytesIn: 75_000_000, BytesOut: 150_000_000, PacketsIn: 98, PacketsLostIn: 2,
			PacketsOut: 100, Participants: 3, VideoTracksOut: 2, RTTMs: fp(40), LiveKitCPUPercent: fp(10), HostCPUPercent: fp(30)},
		{Minute: t0.Add(time.Minute), Seconds: 60, Up: true, BytesIn: 0, BytesOut: 0, PacketsIn: 0,
			Participants: 5, VideoTracksOut: 1, RTTMs: fp(60), LiveKitCPUPercent: fp(20), HostCPUPercent: fp(50)},
		{Minute: t0.Add(5 * time.Minute), Seconds: 0, Up: false, HostCPUPercent: fp(5)},
	}
	got := bucketSeries(minutes, 5*time.Minute)
	if len(got) != 2 {
		t.Fatalf("pontos = %d, quer 2", len(got))
	}
	p := got[0]
	checks := []struct {
		name string
		ok   bool
	}{
		{"início do intervalo", p.At.Equal(t0)},
		{"Mbps de entrada no intervalo (75 MB em 120 s)", near(p.MbpsIn, 5)},
		{"Mbps de saída", near(p.MbpsOut, 10)},
		{"perda na subida", p.LossInPct != nil && near(*p.LossInPct, 2)},
		{"perda na descida sem perda = 0", p.LossOutPct != nil && *p.LossOutPct == 0},
		{"RTT médio", near(*p.RTTMs, 50)},
		{"CPU média", near(*p.LiveKitCPU, 15) && near(*p.HostCPU, 40)},
		{"pico de participantes", p.Participants == 5 && p.VideoTracksOut == 2},
		{"no ar", p.Up},
	}
	for _, c := range checks {
		if !c.ok {
			t.Errorf("%s: %+v", c.name, p)
		}
	}
	down := got[1]
	if down.Up || down.LossInPct != nil || down.MbpsIn != 0 || *down.HostCPU != 5 {
		t.Errorf("intervalo sem LiveKit = %+v", down)
	}
}

func TestLiveRowsJuntaQuemAssistiu(t *testing.T) {
	share := session("s1", KindShare, "ana", 0, 30)
	share.HardwareRatio = fp(1)
	hw := session("w1", KindWatch, "bia", 5, 10)
	hw.StreamerID, hw.Freezes, hw.HardwareRatio = "ana", 10, fp(1)
	sw := session("w2", KindWatch, "caio", 10, 10)
	sw.StreamerID, sw.Freezes, sw.HardwareRatio = "ana", 0, fp(0)
	otherCall := session("w3", KindWatch, "duda", 5, 10)
	otherCall.StreamerID, otherCall.CallID = "ana", "c2"
	later := session("w4", KindWatch, "edu", 40, 10)
	later.StreamerID = "ana"
	older := session("s0", KindShare, "bia", -60, 10)

	rows := liveRows([]SessionStats{older, share, hw, sw, otherCall, later}, 10)
	if len(rows) != 2 || rows[0].ID != "s1" {
		t.Fatalf("lives = %+v, quer s1 primeiro (mais recente)", rows)
	}
	r := rows[0]
	if r.Viewers != 2 || r.DurationSeconds != 1800 {
		t.Errorf("espectadores = %d, duração = %v; quer 2 e 1800", r.Viewers, r.DurationSeconds)
	}
	if r.ViewerFreezesPerMin == nil || !near(*r.ViewerFreezesPerMin, 0.5) {
		t.Errorf("congelamentos/min = %v, quer 0,5 (10 em 20 min)", r.ViewerFreezesPerMin)
	}
	if r.ViewerSoftwareRatio == nil || !near(*r.ViewerSoftwareRatio, 0.5) {
		t.Errorf("no processador = %v, quer 0,5", r.ViewerSoftwareRatio)
	}
	if rows[1].Viewers != 0 || rows[1].ViewerFreezesPerMin != nil {
		t.Errorf("live sem ninguém = %+v", rows[1])
	}
	if got := liveRows([]SessionStats{share, older}, 1); len(got) != 1 {
		t.Errorf("limite ignorado: %d", len(got))
	}
}

func TestReasonsDizPorQue(t *testing.T) {
	s := session("x", KindShare, "ana", 0, 10)
	s.CPURatio, s.BandwidthRatio, s.BackupRatio, s.HardwareRatio = 0.5, 0.4, 0.5, fp(0)
	s.Transport, s.RTTMs, s.LossPct = "tcp", fp(200), fp(3)
	want := []string{
		"PC de quem transmite no limite (CPU)",
		"Conexão de quem transmite no limite (banda)",
		"Codificando no processador",
		"Reserva ligada (alguém sem o codec)",
		"Perda de pacotes",
		"Latência alta",
		"Conexão por TCP",
	}
	if got := reasons(s); !slices.Equal(got, want) {
		t.Errorf("motivos = %q\nquer %q", got, want)
	}

	w := session("y", KindWatch, "bia", 0, 10)
	w.HardwareRatio, w.PausedRatio, w.Freezes, w.Transport = fp(0.2), 0.3, 20, "relay"
	// paused fica fora: com o LiveKit de hoje (allow_pause desligado) não acontece.
	want = []string{"Decodificando no processador", "Congelamentos", "Conexão por TURN"}
	if got := reasons(w); !slices.Equal(got, want) {
		t.Errorf("motivos = %q\nquer %q", got, want)
	}

	ok := session("z", KindWatch, "caio", 0, 10)
	ok.HardwareRatio, ok.Transport = fp(1), "udp"
	if got := reasons(ok); len(got) != 0 {
		t.Errorf("sessão boa com motivos: %q", got)
	}
}

func TestScoreIgnoraPausaDoServidor(t *testing.T) {
	paused := session("pausa", KindWatch, "a", 0, 10)
	paused.PausedRatio = 1
	if got := score(paused); got != 0 {
		t.Errorf("pausa pontuou: %v", got)
	}
}

func TestWorstRowsOrdenaPelasPiores(t *testing.T) {
	good := session("bom", KindWatch, "a", 0, 10)
	good.HardwareRatio, good.Transport = fp(1), "udp"
	frozen := session("congela", KindWatch, "b", 0, 10)
	frozen.Freezes, frozen.FreezeMs = 30, 20_000
	slow := session("lenta", KindShare, "c", 0, 10)
	slow.BelowRatio, slow.CPURatio = fp(0.9), 0.9
	short := session("curta", KindWatch, "d", 0, 0)
	short.Seconds, short.Freezes = 20, 50
	call := session("voz", KindCall, "e", 0, 10)
	call.LossPct = fp(50)

	call.LossPct = nil
	failed := session("falhou", KindCall, "f", 0, 0)
	failed.Failures = 1

	all := func(SessionStats) bool { return true }
	rows := worstRows([]SessionStats{good, frozen, slow, short, call, failed}, 3, all)
	ids := []string{}
	for _, r := range rows {
		ids = append(ids, r.ID)
	}
	if !slices.Equal(ids, []string{"lenta", "falhou", "congela"}) {
		t.Errorf("piores = %v, quer [lenta falhou congela] (sem a boa, a curta e a call boa)", ids)
	}
	if rows[2].FreezesPerMin != 3 || len(rows[2].Reasons) == 0 {
		t.Errorf("congela = %+v", rows[2])
	}
}

func TestBreakdownsAgrupam(t *testing.T) {
	a := session("a", KindShare, "ana", 0, 10)
	a.OS, a.GPU, a.Codec, a.Transport, a.BelowRatio, a.HardwareRatio = "Windows", "NVIDIA", "H265", "udp", fp(0.2), fp(1)
	b := session("b", KindWatch, "bia", 0, 10)
	b.OS, b.GPU, b.Codec, b.Transport, b.Freezes, b.HardwareRatio = "Linux", "", "H264", "tcp", 20, fp(0)
	c := session("c", KindWatch, "caio", 0, 10)
	c.OS, c.Codec, c.HardwareRatio = "Windows", "H265", fp(0.5)
	call := session("v", KindCall, "duda", 0, 10)
	call.OS, call.Transport = "Android", "relay"

	got := breakdowns([]SessionStats{a, b, c, call})
	win := got["os"][0]
	if win.Key != "Windows" || win.Sessions != 2 || !near(*win.SoftwareRatio, 0.25) || !near(*win.BelowRatio, 0.2) {
		t.Errorf("Windows = %+v", win)
	}
	if got["gpu"][0].Key != "(desconhecida)" || got["gpu"][0].Sessions != 2 {
		t.Errorf("GPU vazia = %+v", got["gpu"])
	}
	linux := got["os"][1]
	if linux.FreezesPerMin == nil || *linux.FreezesPerMin != 2 || linux.BelowRatio != nil {
		t.Errorf("Linux = %+v", linux)
	}
	transports := map[string]int{}
	for _, r := range got["transport"] {
		transports[r.Key] = r.Sessions
	}
	if transports["relay"] != 1 || transports["tcp"] != 1 {
		t.Errorf("transporte conta as calls também: %v", transports)
	}
	for _, r := range got["codec"] {
		if r.Key == "" {
			t.Error("call sem vídeo entrou no codec")
		}
	}
}

func TestBuildReportJuntaTudo(t *testing.T) {
	from, to := t0.Add(-time.Hour), t0.Add(time.Hour)
	r := buildReport(from, to, []SessionStats{session("s", KindShare, "ana", 0, 10)},
		[]ServerMinute{{Minute: t0, Seconds: 60, Up: true}}, []EventRow{{Type: EventStart}})
	if r.BucketMin != 1 || len(r.Server) != 1 || len(r.Lives) != 1 || len(r.Events) != 1 || r.Breakdown["os"] == nil {
		t.Errorf("relatório = %+v", r)
	}
	if r.Worst == nil || r.WorstLives == nil || r.WorstCalls == nil {
		t.Error("piores nil (o JSON precisa de [])")
	}
}

func TestReasonsDizOndeOsQuadrosSePerdem(t *testing.T) {
	capture := session("cap", KindShare, "ana", 0, 10)
	capture.TargetFPS, capture.FPS, capture.CaptureFPS, capture.CodecMs = fp(60), fp(42), fp(43), fp(3)
	want := []string{"Captura abaixo do alvo (não é o codificador)"}
	if got := reasons(capture); !slices.Equal(got, want) {
		t.Errorf("captura: %q, quer %q", got, want)
	}

	slowEncoder := session("enc", KindShare, "ana", 0, 10)
	slowEncoder.TargetFPS, slowEncoder.CaptureFPS, slowEncoder.FPS, slowEncoder.CodecMs = fp(60), fp(58), fp(40), fp(4)
	want = []string{"Codificador não dá conta (codifica menos quadros que a captura)"}
	if got := reasons(slowEncoder); !slices.Equal(got, want) {
		t.Errorf("codificador: %q, quer %q", got, want)
	}
	// codec_ms alto na placa é latência de fila: entregando o que a captura
	// manda (AMD a 49–55 fps com 15 ms/quadro), o codificador não é o gargalo.
	latency := session("lat", KindShare, "ana", 0, 10)
	latency.TargetFPS, latency.CaptureFPS, latency.FPS, latency.CodecMs = fp(60), fp(56), fp(55), fp(15)
	if got := reasons(latency); len(got) != 0 {
		t.Errorf("codec_ms alto com o fps da captura: %q", got)
	}

	decoder := session("dec", KindWatch, "bia", 0, 10)
	decoder.RecvFPS, decoder.FPS = fp(44), fp(12)
	want = []string{"Quadros chegam e não decodificam"}
	if got := reasons(decoder); !slices.Equal(got, want) {
		t.Errorf("decodificador: %q, quer %q", got, want)
	}
	decoder.FPS = fp(41)
	if got := reasons(decoder); len(got) != 0 {
		t.Errorf("decodificando quase tudo: %q", got)
	}
}

func TestReasonsDaVoz(t *testing.T) {
	cpu := session("cpu", KindCall, "ana", 0, 10)
	cpu.ConcealedPct, cpu.RecvLossPct = fp(6), fp(0.1)
	want := []string{"Voz robotizada (áudio sintetizado)", "Áudio sintetizado sem perda (PC de quem ouve)"}
	if got := reasons(cpu); !slices.Equal(got, want) {
		t.Errorf("sem perda: %q, quer %q", got, want)
	}

	net := session("rede", KindCall, "bia", 0, 10)
	net.ConcealedPct, net.RecvLossPct, net.Reconnects, net.Failures = fp(8), fp(4), 2, 1
	want = []string{"Voz robotizada (áudio sintetizado)", "Perda no áudio recebido", "Voz reconectou", "Voz não conectou"}
	if got := reasons(net); !slices.Equal(got, want) {
		t.Errorf("rede: %q, quer %q", got, want)
	}
	if callScore(net) <= callScore(cpu) || callScore(session("ok", KindCall, "c", 0, 10)) != 0 {
		t.Errorf("pontuação da voz: rede %v, cpu %v", callScore(net), callScore(cpu))
	}

	access := session("acesso", KindCall, "duda", 0, 10)
	access.AccessFailures = 1
	want = []string{"Sem acesso à chamada (não é queda)"}
	if got := reasons(access); !slices.Equal(got, want) {
		t.Errorf("acesso: %q, quer %q", got, want)
	}

	// Média baixa, mas 5 minutos robotizados numa sessão longa: o motivo aparece.
	long := session("longa", KindCall, "edu", 0, 120)
	long.ConcealedPct, long.RoboticMinutes, long.BadMinutes = fp(0.4), 5, 5
	if got := reasons(long); !slices.Contains(got, "Voz robotizada (áudio sintetizado)") {
		t.Errorf("minutos robotizados sem motivo: %q", got)
	}
}

func TestCallScoreContaMinutosRuins(t *testing.T) {
	// A pior call real (13/11): 48 minutos ruins numa sessão de 3 h; a média
	// da sessão fica baixa, mas ela tem de ficar acima de tudo isto.
	worst := session("pior", KindCall, "ana", 0, 180)
	worst.ConcealedPct, worst.RecvLossPct, worst.BadMinutes = fp(1.2), fp(8), 48
	short := session("curta", KindCall, "bia", 0, 2)
	short.ConcealedPct, short.RecvLossPct, short.LossPct = fp(9), fp(9), fp(20)
	short.BadMinutes = 2
	access := session("acesso", KindCall, "caio", 0, 5)
	access.AccessFailures = 2
	drop := session("caiu", KindCall, "duda", 0, 30)
	drop.Reconnects, drop.Failures = 1, 1
	if !(callScore(worst) > callScore(drop) && callScore(drop) > callScore(short)) {
		t.Errorf("pior %v, caiu %v, curta %v", callScore(worst), callScore(drop), callScore(short))
	}
	if callScore(access) != 0 {
		t.Errorf("falha de acesso pesou como queda: %v", callScore(access))
	}
	// Médias altas sem nenhum minuto ruim não pontuam (o ruído de 1 amostra).
	noisy := session("ruido", KindCall, "edu", 0, 10)
	noisy.ConcealedPct, noisy.RecvLossPct, noisy.LossPct = fp(2), fp(1), fp(3)
	if callScore(noisy) != 0 {
		t.Errorf("sem minuto ruim: %v", callScore(noisy))
	}
}

func TestBuildReportSeparaPioresLivesEChamadas(t *testing.T) {
	sessions := []SessionStats{}
	// 20 lives muito ruins (pontuação de centenas) não escondem a call ruim.
	for i := range 20 {
		s := session(fmt.Sprintf("live%d", i), KindShare, "ana", 0, 30)
		s.BelowRatio, s.CPURatio = fp(1), 1
		sessions = append(sessions, s)
	}
	call := session("voz", KindCall, "bia", 0, 60)
	call.BadMinutes = 3
	sessions = append(sessions, call)
	r := buildReport(t0.Add(-time.Hour), t0.Add(time.Hour), sessions, nil, nil)
	if len(r.WorstLives) != maxWorst || len(r.WorstCalls) != 1 || r.WorstCalls[0].ID != "voz" {
		t.Fatalf("piores lives = %d, chamadas = %+v", len(r.WorstLives), r.WorstCalls)
	}
	for _, w := range r.WorstLives {
		if w.Kind == KindCall {
			t.Errorf("call na lista das lives: %s", w.ID)
		}
	}
	// O campo antigo (o app de antes separa por kind) leva as duas listas.
	if len(r.Worst) != maxWorst+1 || r.Worst[maxWorst].ID != "voz" {
		t.Errorf("worst = %d linhas", len(r.Worst))
	}
}
