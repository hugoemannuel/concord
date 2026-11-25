import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ScreenAdapt, type ScreenAdaptDeps } from './screenAdapt'
import { ADAPT } from './screenAdaptController'
import type { ScreenShareQuality } from './screenShareQuality'

const limited = new Map([
  [
    'o1',
    {
      id: 'o1',
      type: 'outbound-rtp',
      kind: 'video',
      bytesSent: 1,
      qualityLimitationReason: 'bandwidth'
    }
  ]
]) as unknown as RTCStatsReport
const fine = new Map([
  [
    'o1',
    { id: 'o1', type: 'outbound-rtp', kind: 'video', bytesSent: 1, qualityLimitationReason: 'none' }
  ]
]) as unknown as RTCStatsReport

function deps(reports: () => RTCStatsReport | null): ScreenAdaptDeps & {
  applied: ScreenShareQuality[]
} {
  const applied: ScreenShareQuality[] = []
  return {
    applied,
    read: async () => reports(),
    apply: vi.fn(async (q: ScreenShareQuality) => {
      applied.push(q)
    }),
    report: vi.fn(),
    softwareCodec: vi.fn()
  }
}

const fullHd = { width: 1920, height: 1080 }
const chosen: ScreenShareQuality = { resolution: '1080p', frameRate: 60 }

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe('ScreenAdapt', () => {
  it('banda faltando: desce 1080p60 → 720p60 e avisa quem transmite', async () => {
    const d = deps(() => limited)
    const adapt = new ScreenAdapt(d, chosen, fullHd, false)
    adapt.start()
    expect(d.report).toHaveBeenLastCalledWith({
      chosen: '1080p 60',
      effective: '1080p 60',
      reduced: false,
      reason: null,
      step: 0
    })
    await vi.advanceTimersByTimeAsync(ADAPT.tickMs * (ADAPT.startHold + ADAPT.downAfter))
    expect(d.applied).toEqual([{ resolution: '720p', frameRate: 60 }])
    expect(d.report).toHaveBeenLastCalledWith({
      chosen: '1080p 60',
      effective: '720p 60',
      reduced: true,
      reason: 'bandwidth',
      step: 1
    })
    adapt.stop()
  })

  it('troca recusada pelo navegador: continua no degrau anterior', async () => {
    const d = deps(() => limited)
    d.apply = vi.fn(async () => {
      throw new Error('recusado')
    })
    const adapt = new ScreenAdapt(d, chosen, fullHd, false)
    adapt.start()
    await vi.advanceTimersByTimeAsync(ADAPT.tickMs * (ADAPT.startHold + ADAPT.downAfter))
    expect(adapt.effective()).toEqual(chosen)
    adapt.stop()
  })

  it('a pessoa escolheu outra qualidade: recomeça do novo escolhido', async () => {
    let report = limited
    const d = deps(() => report)
    const adapt = new ScreenAdapt(d, chosen, fullHd, false)
    adapt.start()
    await vi.advanceTimersByTimeAsync(ADAPT.tickMs * (ADAPT.startHold + ADAPT.downAfter))
    report = fine
    adapt.choose({ resolution: '720p', frameRate: 30 })
    expect(adapt.effective()).toEqual({ resolution: '720p', frameRate: 30 })
    expect(d.report).toHaveBeenLastCalledWith({
      chosen: '720p 30',
      effective: '720p 30',
      reduced: false,
      reason: null,
      step: 0
    })
    adapt.stop()
  })

  it('AV1 caindo no software é repassado; parado, não lê mais', async () => {
    const soft = new Map([
      ['c', { id: 'c', type: 'codec', mimeType: 'video/AV1' }],
      [
        'o1',
        {
          id: 'o1',
          type: 'outbound-rtp',
          kind: 'video',
          codecId: 'c',
          bytesSent: 1,
          powerEfficientEncoder: false
        }
      ]
    ]) as unknown as RTCStatsReport
    const read = vi.fn(async () => soft)
    const d = { ...deps(() => soft), read }
    const adapt = new ScreenAdapt(d, chosen, fullHd, false)
    adapt.start()
    await vi.advanceTimersByTimeAsync(ADAPT.tickMs)
    expect(d.softwareCodec).toHaveBeenCalledWith('av1')
    adapt.stop()
    const calls = read.mock.calls.length
    await vi.advanceTimersByTimeAsync(ADAPT.tickMs * 3)
    expect(read.mock.calls.length).toBe(calls)
  })
  it('regressão: live inteira no processador repassa a queda uma vez só, não a cada leitura', async () => {
    const soft = new Map([
      ['c', { id: 'c', type: 'codec', mimeType: 'video/H264' }],
      [
        'o1',
        {
          id: 'o1',
          type: 'outbound-rtp',
          kind: 'video',
          codecId: 'c',
          bytesSent: 1,
          powerEfficientEncoder: false
        }
      ]
    ]) as unknown as RTCStatsReport
    const d = deps(() => soft)
    const adapt = new ScreenAdapt(d, chosen, fullHd, false)
    adapt.start()
    await vi.advanceTimersByTimeAsync(ADAPT.tickMs * 10)
    expect(d.softwareCodec).toHaveBeenCalledTimes(1)
    expect(d.softwareCodec).toHaveBeenCalledWith('h264')
    adapt.stop()
  })
})
