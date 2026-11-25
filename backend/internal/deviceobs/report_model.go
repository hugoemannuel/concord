package deviceobs

import "time"

// Painel do aparelho (GET /api/obs/devices, só devs): quem está com o app
// pesado ou travando e por quê, a linha de base de cada estado e a
// comparação entre versões. O banco agrega (report_repository.go); motivos e
// pontuação são Go puro (report_reasons.go).

// PersonStats: as linhas de uma pessoa no período, resumidas. nil = sem dado.
type PersonStats struct {
	UserID     string `json:"user_id"`
	Username   string `json:"username"`
	OS         string `json:"os"`
	GPU        string `json:"gpu"`
	AppVersion string `json:"app_version"`
	Target     string `json:"target"`
	// Minutes: soma de seconds / 60.
	Minutes float64 `json:"minutes"`
	// CPUApp: média de browser+renderer+gpu+other (% da máquina).
	CPUApp *float64 `json:"cpu_app"`
	// CPURendererCall: média do renderer nas linhas call/transmitindo.
	CPURendererCall *float64 `json:"cpu_renderer_call"`
	MemAppMB        *float64 `json:"mem_app_mb"`
	MemFreeMinMB    *float64 `json:"mem_free_min_mb"`
	MemTotalMB      *float64 `json:"mem_total_mb"`
	SysCPU          *float64 `json:"sys_cpu"`
	// LagP95Ms: mediana do lag_p95 das linhas.
	LagP95Ms *float64 `json:"lag_p95_ms"`
	// LongMsPerMin: soma de long_ms / minutos com a janela visível.
	LongMsPerMin *float64 `json:"long_ms_per_min"`
	SlowInputs   int64    `json:"slow_inputs"`
	Hangs        int64    `json:"hangs"`
	GPUCrashes   int64    `json:"gpu_crashes"`
	// SoftwareGPU: alguma sessão com gpu_status software ou disabled.
	SoftwareGPU bool `json:"software_gpu"`
	// WSRTTMs: mediana; StartupMs: a pior abertura.
	WSRTTMs   *float64 `json:"ws_rtt_ms"`
	StartupMs *float64 `json:"startup_ms"`
	// Só para as regras e os totais (fora do JSON).
	VisibleMinutes float64 `json:"-"`
	Samples        int     `json:"-"`
}

// WorstRow: uma pessoa com pontuação acima de zero e os motivos, na ordem.
type WorstRow struct {
	PersonStats
	Score   int      `json:"score"`
	Reasons []string `json:"reasons"`
}

// BaselineRow: a linha de base de um estado (parado, call, transmitindo).
type BaselineRow struct {
	State           string   `json:"state"`
	Samples         int      `json:"samples"`
	People          int      `json:"people"`
	CPUAppP50       *float64 `json:"cpu_app_p50"`
	CPUAppP90       *float64 `json:"cpu_app_p90"`
	CPURendererP50  *float64 `json:"cpu_renderer_p50"`
	MemAppP50       *float64 `json:"mem_app_p50"`
	MemAppP90       *float64 `json:"mem_app_p90"`
	LagP95P50       *float64 `json:"lag_p95_p50"`
	LongMsPerMinP50 *float64 `json:"long_ms_per_min_p50"`
}

// VersionRow: as linhas de uma versão do app num alvo (desktop, web).
type VersionRow struct {
	AppVersion        string   `json:"app_version"`
	Target            string   `json:"target"`
	People            int      `json:"people"`
	Samples           int      `json:"samples"`
	CPUAppCall        *float64 `json:"cpu_app_call"`
	MemAppMB          *float64 `json:"mem_app_mb"`
	LagP95P50         *float64 `json:"lag_p95_p50"`
	LongMsPerMin      *float64 `json:"long_ms_per_min"`
	Hangs             int64    `json:"hangs"`
	SoftwareGPUPeople int      `json:"software_gpu_people"`
}

// DeviceReport: a resposta do painel.
type DeviceReport struct {
	From     time.Time     `json:"from"`
	To       time.Time     `json:"to"`
	People   int           `json:"people"`
	Samples  int           `json:"samples"`
	Worst    []WorstRow    `json:"worst"`
	Baseline []BaselineRow `json:"baseline"`
	Versions []VersionRow  `json:"versions"`
}
