import { describe, expect, it, vi } from 'vitest'
import { createSessionSwitch } from './sessionSwitch'

describe('createSessionSwitch', () => {
  it('liga uma vez, desliga uma vez e pode religar', () => {
    const stop = vi.fn()
    const start = vi.fn(() => stop)
    const set = createSessionSwitch(start)
    set(true)
    set(true)
    expect(start).toHaveBeenCalledTimes(1)
    set(false)
    set(false)
    expect(stop).toHaveBeenCalledTimes(1)
    set(true)
    expect(start).toHaveBeenCalledTimes(2)
  })

  it('começar desligado não chama nada', () => {
    const start = vi.fn(() => () => {})
    createSessionSwitch(start)(false)
    expect(start).not.toHaveBeenCalled()
  })
})
