import { request } from '../../../../shared/api/client'

// Painel dos aparelhos (backend: internal/deviceobs, GET /obs/devices; só devs).
// Contrato: docs/superpowers/plans/2026-11-25-obs-dispositivo.md. null = não medido.

export type DeviceState = 'parado' | 'call' | 'transmitindo'

/** Uma pessoa com aparelho pesado ou travado, e por quê. */
export interface DeviceWorstRow {
  user_id: string
  username: string
  os: string
  gpu: string
  app_version: string
  target: string
  minutes: number
  cpu_app: number | null
  cpu_renderer_call: number | null
  mem_app_mb: number | null
  mem_free_min_mb: number | null
  mem_total_mb: number | null
  sys_cpu: number | null
  lag_p95_ms: number | null
  long_ms_per_min: number | null
  slow_inputs: number
  hangs: number
  gpu_crashes: number
  software_gpu: boolean
  ws_rtt_ms: number | null
  startup_ms: number | null
  score: number
  reasons: string[]
}

/** Consumo típico de um estado do app (linha de base). */
export interface DeviceBaselineRow {
  state: DeviceState
  samples: number
  people: number
  cpu_app_p50: number | null
  cpu_app_p90: number | null
  cpu_renderer_p50: number | null
  mem_app_p50: number | null
  mem_app_p90: number | null
  lag_p95_p50: number | null
  long_ms_per_min_p50: number | null
}

/** Uma versão do app (por alvo: desktop ou web). */
export interface DeviceVersionRow {
  app_version: string
  target: string
  people: number
  samples: number
  cpu_app_call: number | null
  mem_app_mb: number | null
  lag_p95_p50: number | null
  long_ms_per_min: number | null
  hangs: number
  software_gpu_people: number
}

export interface DeviceReport {
  from: string
  to: string
  people: number
  samples: number
  worst: DeviceWorstRow[]
  baseline: DeviceBaselineRow[]
  versions: DeviceVersionRow[]
}

export function fetchDeviceReport(days: number): Promise<DeviceReport> {
  return request<DeviceReport>(`/obs/devices?days=${days}`)
}
