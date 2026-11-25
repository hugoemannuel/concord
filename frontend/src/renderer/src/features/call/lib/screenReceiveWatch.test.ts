import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ScreenReceiveWatch, type ReceiveParticipantLike } from './screenReceiveWatch'
import { HEVC_GUARD } from './screenHevcDecodeGuard'
import { DECODE_OVERLOAD } from './screenDecodeOverload'

const TICK = 2000

/** getStats() da recepção: a cada leitura, `received` e `decoded` quadros a mais. */
function receiving(mimeType: string, received: number, decoded: number, decodeMsPerFrame = 3) {
  let n = 0
  return vi.fn(async () => {
    n++
    return new Map<string, Record<string, unknown>>([
      ['c1', { id: 'c1', type: 'codec', mimeType }],
      [
        'i1',
        {
          id: 'i1',
          type: 'inbound-rtp',
          kind: 'video',
          codecId: 'c1',
          timestamp: n * TICK,
          framesReceived: n * received,
          framesDecoded: n * decoded,
          totalDecodeTime: (n * decoded * decodeMsPerFrame) / 1000,
          packetsReceived: n * 500,
          packetsLost: 0
        }
      ]
    ]) as unknown as RTCStatsReport
  })
}

function person(
  identity: string,
  read: ReturnType<typeof receiving>,
  layers = 2,
  extra: Record<string, unknown> = {}
): ReceiveParticipantLike {
  const pub = {
    source: 'screen_share',
    kind: 'video',
    isDesired: true,
    isEnabled: true,
    trackInfo: { layers: Array.from({ length: layers }, () => ({})) },
    track: { getRTCStatsReport: read },
    ...extra
  }
  return { identity, trackPublications: new Map([['s', pub]]) }
}

function setup(people: ReceiveParticipantLike[]) {
  const deps = {
    participants: () => people,
    onOverload: vi.fn(),
    onHevcFailed: vi.fn()
  }
  const watch = new ScreenReceiveWatch(deps)
  watch.start()
  return { deps, watch }
}

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

const readingsUntilHevc = HEVC_GUARD.warmup + HEVC_GUARD.readings + 1

describe('ScreenReceiveWatch', () => {
  it('regressão (GTX 970): H.265 chegando e não decodificando → avisa uma vez, com o dono da live', async () => {
    const { deps, watch } = setup([person('bia:screen', receiving('video/H265', 26, 0), 1)])
    await vi.advanceTimersByTimeAsync(TICK * (readingsUntilHevc + 5))
    expect(deps.onHevcFailed).toHaveBeenCalledTimes(1)
    expect(deps.onHevcFailed).toHaveBeenCalledWith('bia', expect.objectContaining({ codec: 'h265' }))
    watch.stop()
  })

  it('H.265 decodificando bem: nada', async () => {
    const { deps, watch } = setup([person('bia', receiving('video/H265', 26, 26), 1)])
    await vi.advanceTimersByTimeAsync(TICK * (readingsUntilHevc + 5))
    expect(deps.onHevcFailed).not.toHaveBeenCalled()
    expect(deps.onOverload).not.toHaveBeenCalled()
    watch.stop()
  })

  it('regressão (UHD 730): decodificador engasgando com camada menor disponível → pede a baixa', async () => {
    const { deps, watch } = setup([person('bia', receiving('video/H264', 104, 36, 44))])
    await vi.advanceTimersByTimeAsync(TICK * (DECODE_OVERLOAD.downAfter + 2))
    expect(deps.onOverload).toHaveBeenCalledTimes(1)
    expect(deps.onOverload).toHaveBeenCalledWith('bia', true)
    watch.stop()
  })

  it('sem camada menor (H.265 numa camada só): não pede nada', async () => {
    const { deps, watch } = setup([person('bia', receiving('video/H264', 104, 36, 44), 1)])
    await vi.advanceTimersByTimeAsync(TICK * (DECODE_OVERLOAD.downAfter + 5))
    expect(deps.onOverload).not.toHaveBeenCalled()
    watch.stop()
  })

  it('vídeo pausado ou não assinado: não lê', async () => {
    const read = receiving('video/H265', 26, 0)
    const { watch } = setup([
      person('bia', read, 1, { isEnabled: false }),
      person('caio', read, 1, { isDesired: false })
    ])
    await vi.advanceTimersByTimeAsync(TICK * 3)
    expect(read).not.toHaveBeenCalled()
    watch.stop()
  })

  it('parado, não lê mais', async () => {
    const read = receiving('video/H264', 60, 60)
    const { watch } = setup([person('bia', read)])
    await vi.advanceTimersByTimeAsync(TICK)
    watch.stop()
    const calls = read.mock.calls.length
    await vi.advanceTimersByTimeAsync(TICK * 3)
    expect(read.mock.calls.length).toBe(calls)
  })
})
