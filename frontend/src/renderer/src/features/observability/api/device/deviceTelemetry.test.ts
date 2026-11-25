import { beforeEach, describe, expect, it, vi } from 'vitest'

const request = vi.hoisted(() => vi.fn())
vi.mock('../../../../shared/api/client', () => ({ request }))

import { postDeviceTelemetry } from './deviceTelemetry'
import type { DeviceBatch } from '../../lib/device/deviceTypes'

describe('postDeviceTelemetry', () => {
  beforeEach(() => {
    request.mockReset()
    request.mockResolvedValue(undefined)
  })

  it('manda o lote do aparelho em POST /obs/device', async () => {
    const batch = { session: { id: 's1' }, samples: [] } as unknown as DeviceBatch
    await postDeviceTelemetry(batch)
    expect(request).toHaveBeenCalledWith('/obs/device', {
      method: 'POST',
      body: JSON.stringify(batch)
    })
  })
})
