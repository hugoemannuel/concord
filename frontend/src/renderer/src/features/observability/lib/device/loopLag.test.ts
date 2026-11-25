import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LAG_TICK_MS, LoopLag } from './loopLag'

let visible = true

function lag(): LoopLag {
  return new LoopLag({ now: () => Date.now(), visible: () => visible })
}

beforeEach(() => {
  vi.useFakeTimers()
  visible = true
})
afterEach(() => vi.useRealTimers())

describe('LoopLag', () => {
  it('sem nenhuma volta medida: null (nunca visível)', () => {
    visible = false
    const loop = lag()
    loop.sync()
    vi.advanceTimersByTime(LAG_TICK_MS * 5)
    expect(vi.getTimerCount()).toBe(0)
    expect(loop.take()).toEqual({ p95Ms: null, maxMs: null })
  })

  it('atraso = quando disparou − quando devia; p95 e máximo, e zera', () => {
    const loop = lag()
    loop.sync()
    vi.advanceTimersByTime(LAG_TICK_MS) // em dia: 0
    // Uma tarefa longa de 300 ms segura o próximo disparo.
    vi.advanceTimersByTime(LAG_TICK_MS - 1)
    vi.setSystemTime(Date.now() + 300)
    vi.advanceTimersByTime(1)
    expect(loop.take()).toEqual({ p95Ms: 300, maxMs: 300 })
    expect(loop.take()).toEqual({ p95Ms: null, maxMs: null })
  })

  it('para quando a janela some e volta no visibilitychange', () => {
    const loop = lag()
    loop.sync()
    visible = false
    loop.sync()
    expect(vi.getTimerCount()).toBe(0)
    visible = true
    loop.sync()
    loop.sync() // sem timer duplicado
    expect(vi.getTimerCount()).toBe(1)
    vi.advanceTimersByTime(LAG_TICK_MS)
    expect(loop.take().maxMs).toBe(0)
  })

  it('disparo que chega com a janela já escondida não conta nem reagenda', () => {
    const loop = lag()
    loop.sync()
    visible = false
    vi.advanceTimersByTime(LAG_TICK_MS)
    expect(vi.getTimerCount()).toBe(0)
    expect(loop.take().maxMs).toBeNull()
  })

  it('stop desliga o timer', () => {
    const loop = lag()
    loop.sync()
    loop.stop()
    expect(vi.getTimerCount()).toBe(0)
  })
})
