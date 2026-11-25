import { request } from '../../../../shared/api/client'
import type { DeviceBatch } from '../../lib/device/deviceTypes'

/** Métricas do aparelho (backend: internal/deviceobs, docs/adr/0069). */
export function postDeviceTelemetry(batch: DeviceBatch): Promise<void> {
  return request<void>('/obs/device', { method: 'POST', body: JSON.stringify(batch) })
}
