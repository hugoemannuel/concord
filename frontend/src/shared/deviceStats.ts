// Métricas do aparelho que o main entrega ao renderer (device-stats:take,
// docs/adr/0069). Só números do app e do sistema: nenhum PID ou nome de processo.

export type GpuStatus = 'enabled' | 'software' | 'disabled' | ''

export interface DeviceTake {
  /** Segundos desde a última take (0 na primeira). */
  seconds: number
  /** CPU média, % da máquina inteira, por tipo de processo. */
  cpu: { browser: number | null; renderer: number | null; gpu: number | null; other: number | null }
  /** Máximo da CPU do app inteiro entre as leituras de 15 s. */
  cpuAppMax: number | null
  /** Memória do app (média), do renderer e da GPU (máximo). */
  mem: { appMB: number | null; rendererMB: number | null; gpuMB: number | null }
  /** Filhos nativos (helpers) fora do getAppMetrics: só no Linux. */
  helpers: { cpu: number | null; memMB: number | null }
  sys: {
    cpuPct: number | null
    memFreeMinMB: number | null
    memTotalMB: number | null
    loadAvg: number | null
    onBattery: boolean | null
    speedLimitPct: number | null
  }
  hangs: number
  gpuCrashes: number
  gpuStatus: GpuStatus
  /** Do início do processo até a lista de servidores chegar (device-stats:usable). */
  startupMs: number | null
}

/**
 * `app.getGPUFeatureStatus().gpu_compositing` vira o status que o painel lê.
 * Os valores do Chromium: enabled*, disabled_software, unavailable_software,
 * disabled_off*, unavailable_off*.
 */
export function gpuStatusOf(
  compositing: string | undefined,
  hardwareAcceleration: boolean
): GpuStatus {
  if (!hardwareAcceleration) return 'disabled'
  if (!compositing) return ''
  if (compositing.startsWith('enabled')) return 'enabled'
  if (compositing.endsWith('_software')) return 'software'
  if (/^(disabled|unavailable)_off/.test(compositing)) return 'disabled'
  return ''
}
