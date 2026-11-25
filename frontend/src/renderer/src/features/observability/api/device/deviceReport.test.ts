import { beforeEach, describe, expect, it, vi } from 'vitest'

const request = vi.hoisted(() => vi.fn())
vi.mock('../../../../shared/api/client', () => ({ request }))

import { fetchDeviceReport } from './deviceReport'

describe('fetchDeviceReport', () => {
  beforeEach(() => {
    request.mockReset()
    request.mockResolvedValue({ people: 0 })
  })

  it('pede os aparelhos dos últimos N dias', async () => {
    await expect(fetchDeviceReport(3)).resolves.toEqual({ people: 0 })
    expect(request).toHaveBeenCalledWith('/obs/devices?days=3')
  })
})
