import type { GpuStatus } from '../../../../../../shared/deviceStats'

// O formato que o backend recebe (POST /api/obs/device; internal/deviceobs,
// docs/adr/0069). null = não medido.

export type DeviceState = 'parado' | 'call' | 'transmitindo'

/** O que a pessoa fazia na linha: separa a linha de base de cada estado. */
export interface DeviceLabel {
  state: DeviceState
  watching: boolean
  /** Jogo aberto: só com a atividade ligada; senão null. */
  game: boolean | null
}

/** O que o renderer mede sozinho (no web, é tudo o que há). */
export interface RendererMeasures {
  visible_pct: number | null
  focused_pct: number | null
  lag_p95_ms: number | null
  lag_max_ms: number | null
  long_count: number
  long_ms: number
  long_max_ms: number | null
  slow_inputs: number
  input_max_ms: number | null
  heap_mb: number | null
  ws_rtt_ms: number | null
  ws_rtt_max_ms: number | null
  api_ms_p50: number | null
  api_ms_p95: number | null
  api_count: number
}

/** O que vem do processo principal (device-stats:take); null no web. */
export interface MainMeasures {
  cpu_browser: number | null
  cpu_renderer: number | null
  cpu_gpu: number | null
  cpu_other: number | null
  cpu_app_max: number | null
  mem_app_mb: number | null
  mem_renderer_mb: number | null
  mem_gpu_mb: number | null
  cpu_helpers: number | null
  mem_helpers_mb: number | null
  sys_cpu_pct: number | null
  sys_mem_free_mb: number | null
  load_avg: number | null
  on_battery: boolean | null
  speed_limit_pct: number | null
  hangs: number
  gpu_crashes: number
}

export type DeviceSample = { seconds: number; ago_s: number } & DeviceLabel &
  RendererMeasures &
  MainMeasures

export interface DeviceSession {
  id: string
  os: string
  app_version: string
  target: string
  gpu: string
  cores: number
  mem_total_mb: number | null
  startup_ms: number | null
  gpu_status: GpuStatus
}

export interface DeviceBatch {
  session: DeviceSession
  samples: DeviceSample[]
}
