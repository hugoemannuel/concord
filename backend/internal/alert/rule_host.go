package alert

import "time"

// CPU e memória da máquina inteira (host_cpu_pct e host_mem_pct do
// livekit_metrics, via platform/hoststats). O OBSERVABILIDADE.md trata CPU
// acima de 80% como "VPS no limite"; a VPS divide 2 vCPU e ~4 GB com Postgres,
// LiveKit, Caddy e o Maestro. Crítico só perto de travar: 95% de CPU por 10
// min (calls engasgando) ou 95% de memória por 5 min (o kernel começa a matar
// processos).
const (
	hostCPUWarn    = 85
	hostCPUCrit    = 95
	hostCPUWarnFor = 5 * time.Minute
	hostCPUCritFor = 10 * time.Minute

	hostMemWarn = 90
	hostMemCrit = 95
	hostMemFor  = 5 * time.Minute

	// hostClearFor: abaixo do limite por isso antes de normalizar.
	hostClearFor = 3 * time.Minute
)

func hostCPURule(src minuteSource) Rule {
	return Rule{
		ID: "host_cpu", Title: "CPU da máquina", Channel: ChannelInfra, Tab: "servidor",
		Hold:  Hold{Warning: hostCPUWarnFor, Critical: hostCPUCritFor, Clear: hostClearFor},
		Check: thresholdCheck(src, func(m Minute) *float64 { return m.HostCPU }, limits{hostCPUWarn, hostCPUCrit}, "CPU da máquina em %.0f%% (limite %.0f%%)"),
	}
}

func hostMemRule(src minuteSource) Rule {
	return Rule{
		ID: "host_mem", Title: "Memória da máquina", Channel: ChannelInfra, Tab: "servidor",
		Hold:  Hold{Warning: hostMemFor, Critical: hostMemFor, Clear: hostClearFor},
		Check: thresholdCheck(src, func(m Minute) *float64 { return m.HostMem }, limits{hostMemWarn, hostMemCrit}, "memória da máquina em %.0f%% (limite %.0f%%)"),
	}
}
