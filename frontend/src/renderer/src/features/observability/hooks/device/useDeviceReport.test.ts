import { describe, expect, it } from 'vitest'
import { ApiError } from '../../../../shared/api/client'
import { deviceFailedState } from './useDeviceReport'

describe('deviceFailedState', () => {
  it('403 = só devs; outros erros = tentar de novo', () => {
    expect(deviceFailedState(new ApiError(403, 'devs only'))).toEqual({ status: 'forbidden' })
    expect(deviceFailedState(new ApiError(500, 'x'))).toEqual({ status: 'error' })
    expect(deviceFailedState(new Error('rede'))).toEqual({ status: 'error' })
  })
})
