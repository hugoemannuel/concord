import { describe, expect, it, vi } from 'vitest'
import { handlerBox } from './stableHandlers'

describe('handlerBox', () => {
  it('os handlers são o mesmo objeto e chamam sempre a versão mais nova', () => {
    const first = vi.fn((n: number) => n)
    const box = handlerBox({ pick: first })
    const handlers = box.handlers

    expect(handlers.pick(1)).toBe(1)
    const second = vi.fn((n: number) => n * 10)
    box.update({ pick: second })
    expect(box.handlers).toBe(handlers)
    expect(handlers.pick(2)).toBe(20)
    expect(first).toHaveBeenCalledTimes(1)
    expect(second).toHaveBeenCalledWith(2)
  })
})
