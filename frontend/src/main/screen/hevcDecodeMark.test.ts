import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({ app: { getPath: () => '/dados' } }))

import { HEVC_MARK_TTL_MS, hevcMarkPath, hevcReceiveOff, nextHevcMark } from './hevcDecodeMark'

const DAY = 24 * 3600_000

describe('hevcReceiveOff', () => {
  it('marca recente desliga o H.265 recebido; vencida, lixo ou futura não', () => {
    const now = 100 * DAY
    expect(hevcReceiveOff({ savedAt: now - DAY }, now)).toBe(true)
    expect(hevcReceiveOff({ savedAt: now - HEVC_MARK_TTL_MS - 1 }, now)).toBe(false)
    expect(hevcReceiveOff({ savedAt: now + DAY }, now)).toBe(false)
    expect(hevcReceiveOff(null, now)).toBe(false)
    expect(hevcReceiveOff({ savedAt: 'x' }, now)).toBe(false)
  })
})

describe('nextHevcMark', () => {
  it('regressão (como a marca do codificador): marca vigente não é regravada', () => {
    const now = 100 * DAY
    expect(nextHevcMark({ savedAt: now - DAY }, now)).toBeNull()
    expect(nextHevcMark(null, now)).toEqual({ savedAt: now })
    expect(nextHevcMark({ savedAt: now - HEVC_MARK_TTL_MS - 1 }, now)).toEqual({ savedAt: now })
  })
})

describe('hevcMarkPath', () => {
  it('na pasta de dados Concord, que o index.ts só fixa depois deste import', () => {
    expect(hevcMarkPath().replace(/\\/g, '/')).toBe('/dados/Concord/hevc-decode-failed.json')
  })
})
