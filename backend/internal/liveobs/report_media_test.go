package liveobs

import (
	"context"
	"slices"
	"testing"
	"time"
)

// Os congelamentos de tela parada não contam como congelamento visto.
func TestCongelamentosDescontamTelaParada(t *testing.T) {
	w := session("w", KindWatch, "bia", 0, 10)
	w.Freezes, w.StaticFreezes = 30, 25
	if got := freezesPerMin(w); !near(got, 0.5) {
		t.Errorf("congelamentos/min = %v, quer 0,5 (5 em 10 min)", got)
	}
	if slices.Contains(reasons(w), "Congelamentos") {
		t.Error("tela parada contou como motivo de congelamento")
	}
	share := session("s", KindShare, "ana", 0, 10)
	share.UserID, w.StreamerID, w.CallID, share.CallID = "ana", "ana", "c", "c"
	row := liveRow(share, []SessionStats{share, w})
	if row.ViewerFreezesPerMin == nil || !near(*row.ViewerFreezesPerMin, 0.5) {
		t.Errorf("congelamentos de quem assistiu = %v", row.ViewerFreezesPerMin)
	}
	got := breakdowns([]SessionStats{w})["os"][0]
	if got.FreezesPerMin == nil || !near(*got.FreezesPerMin, 0.5) {
		t.Errorf("distribuição = %+v", got)
	}
}

func TestReasonsDosSinaisDeMidia(t *testing.T) {
	share := session("s", KindShare, "ana", 0, 10)
	share.StartMs = fp(6200)
	watch := session("w", KindWatch, "bia", 0, 10)
	watch.StartMs = fp(4000)
	call := session("c", KindCall, "caio", 0, 10)
	call.DSPUnderrunPct, call.PlayoutSynthPct, call.CamFPS = fp(2), fp(1.5), fp(9)
	cases := []struct {
		s    SessionStats
		want []string
	}{
		{share, []string{"Demorou para entrar no ar"}},
		{watch, []string{"Primeiro quadro demorou"}},
		{call, []string{"Processamento do microfone engasga (PC de quem fala)",
			"Saída de áudio do PC falha (não é a rede)", "Câmera travando ou lenta"}},
	}
	for _, c := range cases {
		if got := reasons(c.s); !slices.Equal(got, c.want) {
			t.Errorf("%s: motivos = %q, quer %q", c.s.Kind, got, c.want)
		}
	}
	frozen := session("f", KindCall, "duda", 0, 10)
	frozen.CamFreezes, frozen.CamSeconds = 20, 600
	if !slices.Contains(reasons(frozen), "Câmera travando ou lenta") {
		t.Error("câmera com 2 congelamentos/min sem motivo")
	}
	ok := session("o", KindCall, "eva", 0, 10)
	ok.DSPUnderrunPct, ok.PlayoutSynthPct, ok.CamFPS, ok.CamFreezes, ok.CamSeconds = fp(0.2), fp(0.1), fp(30), 1, 600
	if got := reasons(ok); len(got) != 0 {
		t.Errorf("voz boa com motivos: %q", got)
	}
}

// O processamento do microfone, a saída de áudio e a câmera pesam na voz.
func TestCallScoreContaOsSinaisDeMidia(t *testing.T) {
	call := session("c", KindCall, "caio", 0, 10)
	if callScore(call) != 0 {
		t.Fatal("voz boa com pontuação")
	}
	call.DSPUnderrunPct, call.PlayoutSynthPct, call.CamFreezes, call.CamSeconds = fp(1), fp(2), 30, 600
	if got := callScore(call); !near(got, 10+20+15) {
		t.Errorf("pontuação = %v, quer 45", got)
	}
}

func TestBreakdownsPorSuperficieEMotor(t *testing.T) {
	a := session("a", KindShare, "ana", 0, 10)
	a.Surface, a.Engine = "monitor", "nativo"
	b := session("b", KindShare, "bia", 0, 10)
	b.Surface, b.Engine = "window", "chromium"
	w := session("w", KindWatch, "caio", 0, 10)
	got := breakdowns([]SessionStats{a, b, w})
	if len(got["surface"]) != 2 || len(got["engine"]) != 2 {
		t.Errorf("superfície = %+v, motor = %+v", got["surface"], got["engine"])
	}
}

func TestReportRepositoryAgregaOsSinaisDeMidia(t *testing.T) {
	db := newTelemetryDB(t)
	ctx := context.Background()
	tel := NewTelemetryRepository(db)
	reports := []Report{
		// Tela parada: 150 kbps a 25 quadros/s = 750 bytes por quadro recebido.
		{SessionID: sessionA, Kind: KindWatch, Sample: &Sample{Seconds: 20, Freezes: 4, BitrateKbps: intp(150), RecvFPS: fp(25),
			MediaSignals: MediaSignals{StartMs: intp(1200)}}},
		{SessionID: sessionB, Kind: KindShare, Sample: &Sample{Seconds: 20, MediaSignals: MediaSignals{
			QP: fp(30), StartMs: intp(2400), SourceHeight: intp(1440), Surface: "monitor"}},
			Events: []Event{{Type: EventCodecChosen, Detail: "nativo: h264 placa"}}},
		{SessionID: sessionC, Kind: KindCall, Sample: &Sample{Seconds: 60, MediaSignals: MediaSignals{
			DSPUnderrunPct: fp(2), DSP: "rnnoise", PlayoutSynthPct: fp(0.5), CamFPS: fp(20), CamFreezes: intp(3)}}},
	}
	if err := tel.SaveAll(ctx, userAna, reports); err != nil {
		t.Fatal(err)
	}
	moving := Report{SessionID: sessionA, Kind: KindWatch, Sample: &Sample{Seconds: 20, Freezes: 1, BitrateKbps: intp(4000), RecvFPS: fp(30)}}
	if err := tel.Save(ctx, userAna, moving); err != nil {
		t.Fatal(err)
	}
	got, err := NewReportRepository(db).Sessions(ctx, time.Now().Add(-time.Hour))
	if err != nil {
		t.Fatal(err)
	}
	by := map[string]SessionStats{}
	for _, s := range got {
		by[s.ID] = s
	}
	w, s, c := by[sessionA], by[sessionB], by[sessionC]
	checks := []struct {
		name string
		ok   bool
	}{
		{"tela parada separada", w.Freezes == 5 && w.StaticFreezes == 4},
		{"primeiro quadro", w.StartMs != nil && *w.StartMs == 1200},
		{"motor sem codec escolhido", w.Engine == ""},
		{"qp, tempo e fonte", s.QP != nil && *s.QP == 30 && s.StartMs != nil && *s.StartMs == 2400 && s.SourceHeight != nil && *s.SourceHeight == 1440},
		{"superfície e motor", s.Surface == "monitor" && s.Engine == "nativo"},
		{"microfone", c.DSPUnderrunPct != nil && *c.DSPUnderrunPct == 2 && c.DSP == "rnnoise"},
		{"saída e câmera", c.PlayoutSynthPct != nil && *c.PlayoutSynthPct == 0.5 && c.CamFPS != nil && *c.CamFPS == 20 && c.CamFreezes == 3 && c.CamSeconds == 60},
	}
	for _, ch := range checks {
		if !ch.ok {
			t.Errorf("%s: %+v", ch.name, by)
		}
	}
}
