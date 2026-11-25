package liveobs

import (
	"context"
	"encoding/json"
	"strings"
	"testing"
)

func floatp(v float64) *float64 { return &v }

// Os sinais da ADR 0074 chegam achatados na amostra e ficam dentro dos limites.
func TestValidateReportLimitaOsSinaisDeMidia(t *testing.T) {
	r := validReport()
	raw := `{"seconds":20,"qp":900,"start_ms":-5,"source_width":99999,"source_height":1440,
		"surface":"Minha janela secreta","dsp_underrun_pct":250,"dsp":"` + strings.Repeat("x", 80) + `",
		"playout_synth_pct":3.5,"cam_fps":500,"cam_height":720,"cam_limitation":"cpu","cam_freezes":2}`
	r.Sample = &Sample{}
	if err := json.Unmarshal([]byte(raw), r.Sample); err != nil {
		t.Fatal(err)
	}
	r.Events = []Event{{Type: EventLiveFailed, Detail: "publicação · TimeoutError"}, {Type: EventSlept, Detail: "312 s"}}
	if err := r.Validate(); err != nil {
		t.Fatal(err)
	}
	s := r.Sample
	checks := []struct {
		name string
		ok   bool
	}{
		{"qp no teto", *s.QP == maxQP},
		{"tempo negativo vira vazio", s.StartMs == nil},
		{"largura da fonte no teto", *s.SourceWidth == maxPixels},
		{"altura da fonte fica", *s.SourceHeight == 1440},
		{"superfície fora da lista some (nunca um título)", s.Surface == ""},
		{"engasgo até 100%", *s.DSPUnderrunPct == 100},
		{"dsp cortado", len(s.DSP) == maxDSP},
		{"síntese na saída fica", *s.PlayoutSynthPct == 3.5},
		{"fps da câmera no teto", *s.CamFPS == maxFPS},
		{"altura da câmera fica", *s.CamHeight == 720},
		{"limitação da câmera da lista", s.CamLimitation == "cpu"},
		{"congelamentos da câmera ficam", *s.CamFreezes == 2},
		{"eventos novos aceitos", len(r.Events) == 2},
	}
	for _, c := range checks {
		if !c.ok {
			t.Errorf("%s: %+v %v", c.name, s.MediaSignals, r.Events)
		}
	}
}

func TestValidateReportAceitaSuperficiesConhecidas(t *testing.T) {
	for _, surface := range []string{"monitor", "window", "browser"} {
		r := validReport()
		r.Sample = &Sample{MediaSignals: MediaSignals{Surface: surface, CamLimitation: "algo"}}
		if err := r.Validate(); err != nil {
			t.Fatal(err)
		}
		if r.Sample.Surface != surface || r.Sample.CamLimitation != "" {
			t.Errorf("%s: %+v", surface, r.Sample.MediaSignals)
		}
	}
}

// Versão antiga do app (sem os campos novos): tudo nulo, nada recusado.
func TestTelemetryRepositoryGravaOsSinaisDeMidia(t *testing.T) {
	db := newTelemetryDB(t)
	repo := NewTelemetryRepository(db)
	ctx := context.Background()
	share := Report{SessionID: sessionA, Kind: KindShare, Sample: &Sample{Seconds: 20, MediaSignals: MediaSignals{
		QP: floatp(31), StartMs: intp(2400), SourceWidth: intp(2560), SourceHeight: intp(1440), Surface: "monitor",
	}}}
	call := Report{SessionID: sessionB, Kind: KindCall, Sample: &Sample{Seconds: 60, MediaSignals: MediaSignals{
		DSPUnderrunPct: floatp(1.5), DSP: "rnnoise · portão", PlayoutSynthPct: floatp(0.25),
		CamFPS: floatp(24), CamHeight: intp(720), CamLimitation: "cpu", CamFreezes: intp(3),
	}}}
	old := Report{SessionID: sessionC, Kind: KindWatch, Sample: &Sample{Seconds: 20}}
	if err := repo.SaveAll(ctx, userAna, []Report{share, call, old}); err != nil {
		t.Fatal(err)
	}
	if n := count(t, db, `SELECT count(*) FROM live_samples WHERE session_id = $1 AND qp = 31 AND start_ms = 2400
		AND source_width = 2560 AND source_height = 1440 AND surface = 'monitor' AND dsp IS NULL`, sessionA); n != 1 {
		t.Error("amostra de quem transmite sem os sinais novos")
	}
	if n := count(t, db, `SELECT count(*) FROM live_samples WHERE session_id = $1 AND dsp_underrun_pct = 1.5
		AND dsp = 'rnnoise · portão' AND playout_synth_pct = 0.25 AND cam_fps = 24 AND cam_height = 720
		AND cam_limitation = 'cpu' AND cam_freezes = 3`, sessionB); n != 1 {
		t.Error("amostra da voz sem os sinais novos")
	}
	if n := count(t, db, `SELECT count(*) FROM live_samples WHERE session_id = $1 AND qp IS NULL AND surface IS NULL
		AND cam_limitation IS NULL AND cam_freezes IS NULL`, sessionC); n != 1 {
		t.Error("amostra antiga não ficou nula")
	}
}
