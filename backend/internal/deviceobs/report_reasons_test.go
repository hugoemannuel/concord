package deviceobs

import (
	"slices"
	"testing"
	"time"
)

func TestEvaluateCadaMotivo(t *testing.T) {
	tests := []struct {
		name   string
		p      PersonStats
		reason string
		score  int
	}{
		{"janela parou", PersonStats{Hangs: 1}, "A janela parou de responder", 3},
		{"travadas longas", PersonStats{LongMsPerMin: fp(1000), VisibleMinutes: 5}, "Travadas longas", 3},
		{"sem aceleração", PersonStats{SoftwareGPU: true}, "Sem aceleração por hardware", 3},
		{"gpu caiu", PersonStats{GPUCrashes: 2}, "Placa de vídeo caiu", 2},
		{"renderer em call", PersonStats{CPURendererCall: fp(20)}, "CPU alta do renderer em call", 2},
		{"app pesado", PersonStats{CPUApp: fp(25)}, "App pesado (CPU)", 2},
		{"interface atrasada", PersonStats{LagP95Ms: fp(100)}, "Interface atrasada", 2},
		{"cliques", PersonStats{SlowInputs: 5}, "Cliques demorando", 1},
		{"memória alta", PersonStats{MemAppMB: fp(1500)}, "Memória do app alta", 1},
		{"pouca memória (10%)", PersonStats{MemFreeMinMB: fp(1500), MemTotalMB: fp(16000)}, "Pouca memória livre", 1},
		{"pouca memória (1 GB)", PersonStats{MemFreeMinMB: fp(1000)}, "Pouca memória livre", 1},
		{"máquina no limite", PersonStats{SysCPU: fp(85)}, "Máquina no limite (CPU)", 1},
		{"rede lenta", PersonStats{WSRTTMs: fp(300)}, "Rede do app lenta", 1},
		{"abre devagar", PersonStats{StartupMs: fp(15000)}, "Abre devagar", 1},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			score, reasons := evaluate(tt.p)
			if score != tt.score || !slices.Equal(reasons, []string{tt.reason}) {
				t.Errorf("= %d %q, quer %d [%q]", score, reasons, tt.score, tt.reason)
			}
		})
	}
}

func TestEvaluateAbaixoDosLimites(t *testing.T) {
	ok := []PersonStats{
		{},
		{LongMsPerMin: fp(5000), VisibleMinutes: 4.9}, // pouco tempo visível
		{LongMsPerMin: fp(999), VisibleMinutes: 60},
		{CPURendererCall: fp(19.9), CPUApp: fp(24.9), LagP95Ms: fp(99), SlowInputs: 4, MemAppMB: fp(1499)},
		{MemFreeMinMB: fp(2000), MemTotalMB: fp(16000)},
		{MemFreeMinMB: fp(1024)},
		{SysCPU: fp(84.9), WSRTTMs: fp(299), StartupMs: fp(14999)},
	}
	for i, p := range ok {
		if score, reasons := evaluate(p); score != 0 || len(reasons) != 0 {
			t.Errorf("caso %d: %d %q, quer nada", i, score, reasons)
		}
	}
}

func TestEvaluateSomaNaOrdem(t *testing.T) {
	p := PersonStats{SoftwareGPU: true, Hangs: 1, StartupMs: fp(20000), LongMsPerMin: fp(2300), VisibleMinutes: 300}
	score, reasons := evaluate(p)
	want := []string{"A janela parou de responder", "Travadas longas", "Sem aceleração por hardware", "Abre devagar"}
	if score != 10 || !slices.Equal(reasons, want) {
		t.Errorf("= %d %q, quer 10 %q", score, reasons, want)
	}
}

func TestWorstRowsOrdenaECorta(t *testing.T) {
	people := []PersonStats{
		{Username: "zero"},
		{Username: "um", SlowInputs: 9},
		{Username: "seis", Hangs: 1, SoftwareGPU: true},
		{Username: "três", Hangs: 1},
		{Username: "outro três", SoftwareGPU: true},
	}
	got := worstRows(people, 3)
	names := []string{}
	for _, r := range got {
		names = append(names, r.Username)
	}
	if want := []string{"seis", "três", "outro três"}; !slices.Equal(names, want) {
		t.Errorf("piores = %q, quer %q", names, want)
	}
	if len(worstRows([]PersonStats{{}}, 20)) != 0 {
		t.Error("pontuação zero não entra")
	}
}

func TestBuildReportSomaTotais(t *testing.T) {
	from := time.Date(2026, 11, 18, 0, 0, 0, 0, time.UTC)
	to := from.Add(7 * 24 * time.Hour)
	people := []PersonStats{{Samples: 10, Hangs: 1}, {Samples: 5}}
	r := buildReport(from, to, people, nil, nil)
	if r.People != 2 || r.Samples != 15 || len(r.Worst) != 1 || !r.From.Equal(from) || !r.To.Equal(to) {
		t.Errorf("relatório = %+v", r)
	}
	if r.Baseline == nil || r.Versions == nil {
		t.Error("listas vazias saem como [] no JSON")
	}
}
