package liveobs

import (
	"errors"
	"strings"
	"testing"
)

const (
	sessionA = "6f1c1b7e-8a5e-4a51-9f2a-aaaaaaaaaaaa"
	callA    = "6f1c1b7e-8a5e-4a51-9f2a-cccccccccccc"
	userB    = "6f1c1b7e-8a5e-4a51-9f2a-bbbbbbbbbbbb"
)

func intp(v int) *int { return &v }

func validReport() Report {
	return Report{SessionID: sessionA, Kind: KindWatch, CallID: callA, StreamerID: userB}
}

func TestValidateReportRecusaOQueNaoDaParaGravar(t *testing.T) {
	tests := []struct {
		name   string
		change func(*Report)
	}{
		{"sessão sem uuid", func(r *Report) { r.SessionID = "abc" }},
		{"tipo desconhecido", func(r *Report) { r.Kind = "outro" }},
		{"call sem uuid", func(r *Report) { r.CallID = "x" }},
		{"quem transmite sem uuid", func(r *Report) { r.StreamerID = "1; drop" }},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			r := validReport()
			tt.change(&r)
			if err := r.Validate(); !errors.Is(err, ErrInvalidReport) {
				t.Errorf("err = %v, quer ErrInvalidReport", err)
			}
		})
	}
	ok := validReport()
	ok.CallID, ok.StreamerID = "", ""
	if err := ok.Validate(); err != nil {
		t.Errorf("sem call nem streamer: %v", err)
	}
}

func TestValidateReportCortaTextosENumeros(t *testing.T) {
	r := validReport()
	r.Context = ClientContext{OS: strings.Repeat("w", 200), GPU: " ANGLE (NVIDIA) ", Network: "4g", Cores: -2}
	fps, loss := 999.0, -3.0
	r.Sample = &Sample{
		Seconds: 9999, Codec: "h265 extra longo demais", FPS: &fps, Height: intp(-1),
		BitrateKbps: intp(5_000_000), LossPct: &loss, Freezes: -4, Transport: "quic", Limitation: "cpu",
	}
	r.Events = make([]Event, 30)
	for i := range r.Events {
		r.Events[i] = Event{Type: EventStepDown, Detail: strings.Repeat("d", 500)}
	}
	r.Events[0].Type = "inventado"
	if err := r.Validate(); err != nil {
		t.Fatal(err)
	}
	s := r.Sample
	checks := []struct {
		name string
		ok   bool
	}{
		{"SO cortado", len(r.Context.OS) == maxText},
		{"GPU sem espaços nas pontas", r.Context.GPU == "ANGLE (NVIDIA)"},
		{"núcleos negativos viram zero", r.Context.Cores == 0},
		{"intervalo no teto", s.Seconds == maxSeconds},
		{"codec cortado", len(s.Codec) == maxCodec},
		{"fps no teto", *s.FPS == maxFPS},
		{"altura negativa vira vazia", s.Height == nil},
		{"bitrate no teto", *s.BitrateKbps == maxKbps},
		{"perda negativa vira vazia", s.LossPct == nil},
		{"contador negativo vira zero", s.Freezes == 0},
		{"transporte desconhecido vira vazio", s.Transport == ""},
		{"limitação conhecida fica", s.Limitation == "cpu"},
		{"no máximo maxEvents eventos, sem o desconhecido", len(r.Events) == maxEvents && r.Events[0].Type == EventStepDown},
		{"detalhe cortado", len(r.Events[0].Detail) == maxText},
	}
	for _, c := range checks {
		if !c.ok {
			t.Errorf("%s: %+v", c.name, s)
		}
	}
}

func TestValidateBatch(t *testing.T) {
	if err := (&Batch{}).Validate(); !errors.Is(err, ErrInvalidReport) {
		t.Errorf("lote vazio: %v", err)
	}
	many := Batch{Reports: make([]Report, maxReports+1)}
	if err := many.Validate(); !errors.Is(err, ErrInvalidReport) {
		t.Errorf("lote grande: %v", err)
	}
	bad := Batch{Reports: []Report{validReport(), {SessionID: "x"}}}
	if err := bad.Validate(); !errors.Is(err, ErrInvalidReport) {
		t.Errorf("um ruim: %v", err)
	}
	good := Batch{Reports: []Report{validReport()}}
	if err := good.Validate(); err != nil {
		t.Errorf("lote bom: %v", err)
	}
}

func TestSessionEventsPoeInicioEFim(t *testing.T) {
	app := []Event{{Type: EventStepDown}}
	tests := []struct {
		name     string
		inserted bool
		ended    bool
		want     []string
	}{
		{"sessão nova", true, false, []string{EventStart, EventStepDown}},
		{"meio", false, false, []string{EventStepDown}},
		{"última", false, true, []string{EventStepDown, EventEnd}},
		{"nova e já acabou", true, true, []string{EventStart, EventStepDown, EventEnd}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := sessionEvents(ownedReport{rep: Report{Events: app, Ended: tt.ended}, inserted: tt.inserted, endedNow: tt.ended})
			if len(got) != len(tt.want) {
				t.Fatalf("eventos = %v, quer %v", got, tt.want)
			}
			for i := range got {
				if got[i].Type != tt.want[i] {
					t.Errorf("eventos = %v, quer %v", got, tt.want)
				}
			}
		})
	}
}

func TestValidateReportLimitaOsSinaisDeQualidade(t *testing.T) {
	r := validReport()
	capture, recv, codecMs, concealed, recvLoss := 999.0, -1.0, 1e9, 140.0, 12.5
	r.Sample = &Sample{CaptureFPS: &capture, RecvFPS: &recv, CodecMs: &codecMs,
		ConcealedPct: &concealed, RecvLossPct: &recvLoss, ConnectMs: intp(9_000_000)}
	r.Events = []Event{{Type: EventCodecChosen}, {Type: EventConnectFailed}, {Type: EventReconnected}, {Type: EventDecoderFailed}}
	if err := r.Validate(); err != nil {
		t.Fatal(err)
	}
	s := r.Sample
	checks := []struct {
		name string
		ok   bool
	}{
		{"captura no teto", *s.CaptureFPS == maxFPS},
		{"recebidos negativo vira vazio", s.RecvFPS == nil},
		{"ms do codec no teto", *s.CodecMs == maxMs},
		{"áudio sintetizado até 100%", *s.ConcealedPct == 100},
		{"perda recebida fica", *s.RecvLossPct == 12.5},
		{"tempo para conectar no teto", *s.ConnectMs == int(maxMs)},
		{"eventos de codec, conexão e decodificador aceitos", len(r.Events) == 4},
	}
	for _, c := range checks {
		if !c.ok {
			t.Errorf("%s: %+v %v", c.name, s, r.Events)
		}
	}
}

func TestValidateReportLimitaAIdadeDosEventos(t *testing.T) {
	r := validReport()
	r.AgoMs = -5
	r.Events = []Event{{Type: EventReconnected, AgoMs: 90_000}, {Type: EventConnectFailed, AgoMs: 99 * 60_000}, {Type: EventStepUp, AgoMs: -1}}
	if err := r.Validate(); err != nil {
		t.Fatal(err)
	}
	if r.AgoMs != 0 {
		t.Errorf("idade negativa do relatório = %d, quer 0", r.AgoMs)
	}
	want := []int{90_000, maxAgoMs, 0}
	for i, e := range r.Events {
		if e.AgoMs != want[i] {
			t.Errorf("evento %d: idade = %d, quer %d", i, e.AgoMs, want[i])
		}
	}
}

func TestSessionEventsInicioEFimNaHoraDoRelatorio(t *testing.T) {
	rep := Report{AgoMs: 30_000, Events: []Event{{Type: EventReconnected, AgoMs: 50_000}}, Ended: true}
	got := sessionEvents(ownedReport{rep: rep, inserted: true, endedNow: true})
	// O início vai para o evento mais velho; o fim fica na hora do relatório.
	want := []int{50_000, 50_000, 30_000}
	for i, e := range got {
		if e.AgoMs != want[i] {
			t.Errorf("%s: idade = %d, quer %d", e.Type, e.AgoMs, want[i])
		}
	}
}

func TestValidateReportAceitaOsEventosDaEntrada(t *testing.T) {
	r := validReport()
	r.Events = []Event{{Type: EventSlowJoin, Detail: "acesso 0,2 s · sinal 0,4 s · mídia 4,1 s"}, {Type: EventJoinAbandoned, Detail: "saiu · sinal · 8 s"}}
	if err := r.Validate(); err != nil {
		t.Fatal(err)
	}
	if len(r.Events) != 2 || r.Events[0].Type != "entrada_lenta" || r.Events[1].Type != "entrada_abandonada" {
		t.Errorf("eventos = %+v", r.Events)
	}
}
