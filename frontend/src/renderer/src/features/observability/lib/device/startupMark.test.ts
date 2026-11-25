import { describe, expect, it, vi } from 'vitest'
import { markStartup } from './startupMark'

describe('markStartup', () => {
  it('só mede quem abriu o app já logado', () => {
    const usable = vi.fn()
    expect(markStartup({ startedLoggedIn: false, web: false, now: 900, usable })).toBeNull()
    expect(usable).not.toHaveBeenCalled()
  })

  it('desktop: o main marca (do início do processo)', () => {
    const usable = vi.fn()
    expect(markStartup({ startedLoggedIn: true, web: false, now: 900, usable })).toBeNull()
    expect(usable).toHaveBeenCalledTimes(1)
  })

  it('web: o tempo desde a navegação', () => {
    expect(markStartup({ startedLoggedIn: true, web: true, now: 900.6 })).toBe(901)
  })
})
