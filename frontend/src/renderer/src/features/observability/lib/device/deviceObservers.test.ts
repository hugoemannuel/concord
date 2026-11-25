import { afterEach, describe, expect, it, vi } from 'vitest'
import { longFrameType, observeDevicePerformance, type MeterSink } from './deviceObservers'

type Callback = (list: { getEntries(): unknown[] }) => void

class FakeObserver {
  static supportedEntryTypes: string[] = []
  static all: FakeObserver[] = []
  init: Record<string, unknown> | null = null
  disconnected = false
  constructor(private readonly cb: Callback) {
    FakeObserver.all.push(this)
  }
  observe(init: Record<string, unknown>): void {
    this.init = init
  }
  disconnect(): void {
    this.disconnected = true
  }
  emit(...entries: unknown[]): void {
    this.cb({ getEntries: () => entries })
  }
}

function sink(): MeterSink & Record<string, ReturnType<typeof vi.fn>> {
  return { longFrame: vi.fn(), interaction: vi.fn(), resource: vi.fn() }
}

const byType = (type: string): FakeObserver =>
  FakeObserver.all.find((o) => o.init?.type === type) as FakeObserver

afterEach(() => {
  vi.unstubAllGlobals()
  FakeObserver.all = []
})

describe('longFrameType', () => {
  it('LoAF onde houver; senão longtask; senão nada', () => {
    expect(longFrameType(['longtask', 'long-animation-frame'])).toBe('long-animation-frame')
    expect(longFrameType(['longtask'])).toBe('longtask')
    expect(longFrameType(['resource'])).toBeNull()
  })
})

describe('observeDevicePerformance', () => {
  it('sem PerformanceObserver não faz nada', () => {
    vi.stubGlobal('PerformanceObserver', undefined)
    expect(() => observeDevicePerformance(sink())()).not.toThrow()
  })

  it('liga os três observadores e repassa as entradas', () => {
    FakeObserver.supportedEntryTypes = ['long-animation-frame', 'event', 'resource']
    vi.stubGlobal('PerformanceObserver', FakeObserver)
    const meter = sink()
    const stop = observeDevicePerformance(meter)
    byType('long-animation-frame').emit({ duration: 120 })
    expect(byType('event').init).toMatchObject({ durationThreshold: 104 })
    byType('event').emit({ interactionId: 5, duration: 240 }, { duration: 300 })
    const resource = { name: 'https://srv/api/me', duration: 80, initiatorType: 'fetch' }
    byType('resource').emit(resource)
    expect(meter.longFrame).toHaveBeenCalledWith(120)
    expect(meter.interaction).toHaveBeenCalledWith(5, 240)
    expect(meter.interaction).toHaveBeenCalledWith(0, 300)
    expect(meter.resource).toHaveBeenCalledWith(resource)
    stop()
    expect(FakeObserver.all.every((o) => o.disconnected)).toBe(true)
  })

  it('só o que o navegador suporta', () => {
    FakeObserver.supportedEntryTypes = ['longtask']
    vi.stubGlobal('PerformanceObserver', FakeObserver)
    observeDevicePerformance(sink())
    expect(FakeObserver.all.map((o) => o.init?.type)).toEqual(['longtask'])
  })
})
