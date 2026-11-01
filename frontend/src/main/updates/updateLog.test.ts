import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('../app/appLog', () => ({ appendLog: vi.fn(), logPath: (n: string) => `/logs/${n}` }))
vi.mock('fs/promises', () => ({ stat: async () => ({ size: 0 }), rename: vi.fn() }))

import { appendLog } from '../app/appLog'
import { logUpdate } from './updateLog'

const realPlatform = process.platform

afterEach(() => {
  Object.defineProperty(process, 'platform', { value: realPlatform })
})

describe('logUpdate', () => {
  it.each(['win32', 'linux'])(
    'grava em update.log também em %s (o app abre sem terminal)',
    (platform) => {
      Object.defineProperty(process, 'platform', { value: platform })
      vi.spyOn(console, 'error').mockImplementation(() => {})
      logUpdate('abrindo sem atualizar: checagem falhou', new Error('sem rede'))
      expect(appendLog).toHaveBeenCalledWith(
        'update.log',
        'abrindo sem atualizar: checagem falhou: Error: sem rede'
      )
    }
  )
})
