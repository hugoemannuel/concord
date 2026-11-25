import { request } from '../../../shared/api/client'
import type { TelemetryReport } from '../lib/telemetryTypes'

/** Telemetria das lives e calls (backend: internal/liveobs), a mesma rota do desktop. */
export function postTelemetry(reports: TelemetryReport[]): Promise<void> {
  return request<void>('/obs/telemetry', { method: 'POST', body: JSON.stringify({ reports }) })
}
