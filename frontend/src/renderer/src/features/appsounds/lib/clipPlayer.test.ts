import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MAX_CLIP_SECONDS, playClip, stopClip } from './clipPlayer'

class FakeSource {
  buffer: unknown = null
  onended: (() => void) | null = null
  starts = 0
  stops: (number | undefined)[] = []
  to: unknown = null
  connect<T>(node: T): T {
    this.to = node
    return node
  }
  start(): void {
    this.starts++
  }
  stop(at?: number): void {
    this.stops.push(at)
  }
}
class FakeGain {
  gain = { value: 1 }
  connect<T>(node: T): T {
    return node
  }
}
class FakeContext {
  static last: FakeContext
  currentTime = 10
  destination = {}
  sources: FakeSource[] = []
  gains: FakeGain[] = []
  constructor() {
    FakeContext.last = this
  }
  resume(): Promise<void> {
    return Promise.resolve()
  }
  decodeAudioData(): Promise<object> {
    return Promise.resolve({ duration: 1 })
  }
  createBufferSource(): FakeSource {
    const s = new FakeSource()
    this.sources.push(s)
    return s
  }
  createGain(): FakeGain {
    const g = new FakeGain()
    this.gains.push(g)
    return g
  }
}

const fetchOk = vi.fn(() => Promise.resolve({ ok: true, arrayBuffer: () => Promise.resolve(new ArrayBuffer(4)) }))

beforeEach(() => {
  vi.stubGlobal('AudioContext', FakeContext)
  vi.stubGlobal('fetch', fetchOk)
  fetchOk.mockClear()
})
afterEach(() => vi.unstubAllGlobals())

describe('playClip', () => {
  it('baixa uma vez, toca com o volume e corta no teto', async () => {
    expect(await playClip('mute', '/a.ogg', 1.5)).toBe(true)
    expect(await playClip('unmute', '/a.ogg', 1)).toBe(true)
    expect(fetchOk).toHaveBeenCalledTimes(1)
    const ctx = FakeContext.last
    const [first] = ctx.sources.slice(-2)
    expect(first.starts).toBe(1)
    expect(first.stops).toContain(10 + MAX_CLIP_SECONDS)
    expect(ctx.gains.at(-2)?.gain.value).toBe(1.5)
  })

  it('novo toque do mesmo evento corta o anterior', async () => {
    await playClip('ring', '/b.ogg', 1)
    const before = FakeContext.last.sources.at(-1)!
    await playClip('ring', '/b.ogg', 1)
    expect(before.stops.length).toBe(2)
  })

  it('stopClip enquanto o arquivo baixa: não toca depois', async () => {
    const ctx = FakeContext.last
    const count = ctx.sources.length
    const pending = playClip('knock', '/novo.ogg', 1)
    stopClip('knock')
    expect(await pending).toBe(true)
    expect(ctx.sources.length).toBe(count)
  })

  it('arquivo que não baixa: false, e tenta de novo no próximo toque', async () => {
    const fail = vi.fn(() => Promise.resolve({ ok: false }))
    vi.stubGlobal('fetch', fail)
    expect(await playClip('lock', '/sumiu.ogg', 1)).toBe(false)
    expect(await playClip('lock', '/sumiu.ogg', 1)).toBe(false)
    expect(fail).toHaveBeenCalledTimes(2)
  })

  it('rede fora: false', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))))
    expect(await playClip('lock', '/offline.ogg', 1)).toBe(false)
  })

  it('stopClip sem nada tocando não quebra; quando acaba, sai da lista', async () => {
    expect(() => stopClip('nada')).not.toThrow()
    await playClip('update', '/a.ogg', 1)
    const source = FakeContext.last.sources.at(-1)!
    source.onended?.()
    stopClip('update')
    expect(source.stops.length).toBe(1)
  })
})
