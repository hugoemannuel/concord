import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { startQuake } from './boostQuake'

describe('startQuake', () => {
  const classes = new Set<string>()

  beforeEach(() => {
    vi.useFakeTimers()
    classes.clear()
    vi.stubGlobal('document', {
      body: {
        classList: {
          add: (c: string) => classes.add(c),
          remove: (c: string) => classes.delete(c)
        }
      }
    })
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('treme a janela e para sozinho depois de 600 ms', () => {
    startQuake()
    expect(classes.has('boost-quake')).toBe(true)
    vi.advanceTimersByTime(599)
    expect(classes.has('boost-quake')).toBe(true)
    vi.advanceTimersByTime(1)
    expect(classes.has('boost-quake')).toBe(false)
  })

  it('o cancelamento para na hora e limpa o timer', () => {
    const stop = startQuake()
    stop()
    expect(classes.has('boost-quake')).toBe(false)
    expect(vi.getTimerCount()).toBe(0)
  })
})
