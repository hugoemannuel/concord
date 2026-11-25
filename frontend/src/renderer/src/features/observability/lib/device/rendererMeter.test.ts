import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LAG_TICK_MS } from './loopLag'
import { RendererMeter } from './rendererMeter'

let visible = true
let focused = true
const takeWsRtt = vi.fn(() => ({ medianMs: 45, maxMs: 90 }))

function meter(): RendererMeter {
  return new RendererMeter({
    now: () => Date.now(),
    visible: () => visible,
    focused: () => focused,
    apiBaseUrl: 'https://srv/api',
    takeWsRtt
  })
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(0)
  visible = true
  focused = true
})
afterEach(() => vi.useRealTimers())

describe('RendererMeter', () => {
  it('junta tudo o que o renderer mede numa linha', () => {
    const m = meter()
    m.start()
    m.longFrame(120)
    m.interaction(3, 250)
    m.resource({ name: 'https://srv/api/me', duration: 80, initiatorType: 'fetch' })
    vi.advanceTimersByTime(LAG_TICK_MS * 15)
    focused = false
    m.windowChanged()
    vi.advanceTimersByTime(LAG_TICK_MS * 15)
    expect(m.take(180 * 1024 * 1024)).toEqual({
      visible_pct: 100,
      focused_pct: 50,
      lag_p95_ms: 0,
      lag_max_ms: 0,
      long_count: 1,
      long_ms: 120,
      long_max_ms: 120,
      slow_inputs: 1,
      input_max_ms: 250,
      heap_mb: 180,
      ws_rtt_ms: 45,
      ws_rtt_max_ms: 90,
      api_ms_p50: 80,
      api_ms_p95: 80,
      api_count: 1
    })
  })

  it('quadro longo com a janela escondida não conta; escondida para o timer', () => {
    const m = meter()
    m.start()
    visible = false
    m.windowChanged()
    m.longFrame(500)
    expect(vi.getTimerCount()).toBe(0)
    vi.advanceTimersByTime(60_000)
    const row = m.take(null)
    expect([row.long_count, row.visible_pct, row.lag_p95_ms, row.heap_mb]).toEqual([
      0,
      0,
      null,
      null
    ])
  })

  it('stop desliga o timer do laço', () => {
    const m = meter()
    m.start()
    m.stop()
    expect(vi.getTimerCount()).toBe(0)
  })
})
