import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AREA_HOLD_MS, createHoldGesture } from './holdGesture'

describe('createHoldGesture', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('segurar parado avisa, com o ponto onde começou', () => {
    const onHold = vi.fn()
    createHoldGesture(onHold).start({ x: 10, y: 20 })
    vi.advanceTimersByTime(AREA_HOLD_MS - 1)
    expect(onHold).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(onHold).toHaveBeenCalledWith({ x: 10, y: 20 })
  })
  it('tremer um pouco não desiste', () => {
    const onHold = vi.fn()
    const hold = createHoldGesture(onHold)
    hold.start({ x: 10, y: 20 })
    hold.move({ x: 14, y: 23 })
    vi.advanceTimersByTime(AREA_HOLD_MS)
    expect(onHold).toHaveBeenCalledTimes(1)
  })
  it('andar antes do tempo é rolagem', () => {
    const onHold = vi.fn()
    const hold = createHoldGesture(onHold)
    hold.start({ x: 10, y: 20 })
    hold.move({ x: 10, y: 40 })
    vi.advanceTimersByTime(AREA_HOLD_MS)
    expect(onHold).not.toHaveBeenCalled()
  })
  it('soltar antes do tempo desiste', () => {
    const onHold = vi.fn()
    const hold = createHoldGesture(onHold)
    hold.start({ x: 0, y: 0 })
    hold.cancel()
    vi.advanceTimersByTime(AREA_HOLD_MS)
    expect(onHold).not.toHaveBeenCalled()
  })
  it('um toque novo substitui o anterior', () => {
    const onHold = vi.fn()
    const hold = createHoldGesture(onHold)
    hold.start({ x: 1, y: 1 })
    hold.start({ x: 2, y: 2 })
    vi.advanceTimersByTime(AREA_HOLD_MS)
    expect(onHold).toHaveBeenCalledTimes(1)
    expect(onHold).toHaveBeenCalledWith({ x: 2, y: 2 })
  })
  it('mexer sem nada em andamento não faz nada', () => {
    expect(() => createHoldGesture(vi.fn()).move({ x: 100, y: 100 })).not.toThrow()
  })
})
