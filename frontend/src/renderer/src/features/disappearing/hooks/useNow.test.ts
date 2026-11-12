import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({ state: undefined as unknown, has: false, rerender: () => {} }))
vi.mock('react', () => ({
  useState: (init: () => unknown) => {
    if (!h.has) {
      h.state = init()
      h.has = true
    }
    return [
      h.state,
      (v: unknown) => {
        h.state = v
        h.rerender()
      }
    ]
  },
  useEffect: (fn: () => void) => {
    fn()
  }
}))

import { useNow } from './useNow'

describe('useNow', () => {
  let now = 0
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-11-12T12:00:00Z'))
    h.has = false
    h.rerender = () => {
      now = useNow(30_000)
    }
    h.rerender()
  })
  afterEach(() => vi.useRealTimers())

  it('começa na hora atual e avança a cada intervalo', () => {
    const start = now
    expect(start).toBe(Date.now())
    vi.advanceTimersByTime(29_000)
    expect(now).toBe(start)
    vi.advanceTimersByTime(1_000)
    expect(now).toBe(start + 30_000)
  })
})
