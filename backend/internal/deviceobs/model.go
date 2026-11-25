// Package deviceobs: métricas do aparelho (app lento, travado ou pesado),
// ADR 0069. O app agrega por minuto e manda o lote em POST /api/obs/device;
// os devs leem o painel em GET /api/obs/devices.
package deviceobs

// Estados do app numa linha.
const (
	StateIdle   = "parado"
	StateCall   = "call"
	StateStream = "transmitindo"
)

// Status da aceleração por hardware ("" = o app não sabe).
const (
	GPUEnabled  = "enabled"
	GPUSoftware = "software"
	GPUDisabled = "disabled"
)

// Batch: um pedido do app (a abertura e as linhas fechadas desde o último).
type Batch struct {
	Session Session  `json:"session"`
	Samples []Sample `json:"samples"`
}

// Session: uma abertura do app (o id é gerado no app a cada abertura).
type Session struct {
	ID         string `json:"id"`
	OS         string `json:"os"`
	AppVersion string `json:"app_version"`
	Target     string `json:"target"`
	GPU        string `json:"gpu"`
	Cores      int    `json:"cores"`
	MemTotalMB *int   `json:"mem_total_mb"`
	StartupMs  *int   `json:"startup_ms"`
	GPUStatus  string `json:"gpu_status"`
}

// Sample: uma linha agregada no app. Número nil = não medido; os contadores
// inteiros são 0 por padrão.
type Sample struct {
	Seconds    float64  `json:"seconds"`
	AgoS       float64  `json:"ago_s"`
	State      string   `json:"state"`
	Watching   bool     `json:"watching"`
	Game       *bool    `json:"game"`
	VisiblePct *float64 `json:"visible_pct"`
	FocusedPct *float64 `json:"focused_pct"`

	CPUBrowser  *float64 `json:"cpu_browser"`
	CPURenderer *float64 `json:"cpu_renderer"`
	CPUGPU      *float64 `json:"cpu_gpu"`
	CPUOther    *float64 `json:"cpu_other"`
	CPUAppMax   *float64 `json:"cpu_app_max"`

	MemAppMB      *float64 `json:"mem_app_mb"`
	MemRendererMB *float64 `json:"mem_renderer_mb"`
	MemGPUMB      *float64 `json:"mem_gpu_mb"`

	CPUHelpers   *float64 `json:"cpu_helpers"`
	MemHelpersMB *float64 `json:"mem_helpers_mb"`

	SysCPUPct     *float64 `json:"sys_cpu_pct"`
	SysMemFreeMB  *float64 `json:"sys_mem_free_mb"`
	LoadAvg       *float64 `json:"load_avg"`
	OnBattery     *bool    `json:"on_battery"`
	SpeedLimitPct *float64 `json:"speed_limit_pct"`

	Hangs      int `json:"hangs"`
	GPUCrashes int `json:"gpu_crashes"`

	LagP95Ms   *float64 `json:"lag_p95_ms"`
	LagMaxMs   *float64 `json:"lag_max_ms"`
	LongCount  int      `json:"long_count"`
	LongMs     *float64 `json:"long_ms"`
	LongMaxMs  *float64 `json:"long_max_ms"`
	SlowInputs int      `json:"slow_inputs"`
	InputMaxMs *float64 `json:"input_max_ms"`
	HeapMB     *float64 `json:"heap_mb"`

	WSRTTMs    *float64 `json:"ws_rtt_ms"`
	WSRTTMaxMs *float64 `json:"ws_rtt_max_ms"`
	APIMsP50   *float64 `json:"api_ms_p50"`
	APIMsP95   *float64 `json:"api_ms_p95"`
	APICount   int      `json:"api_count"`
}
