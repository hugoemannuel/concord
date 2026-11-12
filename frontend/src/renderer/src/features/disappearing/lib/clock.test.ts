import { describe, expect, it, vi } from 'vitest'
import { clockFor, createClock } from './clock'

function setup() {
  let t = 1000
  const setIntervalMock = vi.fn((_fn: () => void, _ms: number): unknown => 'id')
  const timers = { setInterval: setIntervalMock, clearInterval: vi.fn() }
  const clock = createClock(30_000, () => t, timers)
  return {
    clock,
    timers,
    advance: (n: number) => (t += n),
    fire: () => setIntervalMock.mock.calls[0][0]()
  }
}

describe('createClock', () => {
  it('um intervalo para todos: começa no primeiro e para no último', () => {
    const { clock, timers } = setup()
    const a = clock.subscribe(() => {})
    const b = clock.subscribe(() => {})
    expect(timers.setInterval).toHaveBeenCalledTimes(1)
    a()
    expect(timers.clearInterval).not.toHaveBeenCalled()
    b()
    expect(timers.clearInterval).toHaveBeenCalledTimes(1)
    clock.subscribe(() => {})
    expect(timers.setInterval).toHaveBeenCalledTimes(2)
  })

  it('o tick atualiza o valor e avisa todos; o snapshot é estável entre ticks', () => {
    const { clock, advance, fire } = setup()
    const l1 = vi.fn()
    const l2 = vi.fn()
    clock.subscribe(l1)
    clock.subscribe(l2)
    expect(clock.getSnapshot()).toBe(1000)
    expect(clock.getSnapshot()).toBe(1000)
    advance(30_000)
    fire()
    expect(clock.getSnapshot()).toBe(31_000)
    expect(l1).toHaveBeenCalledTimes(1)
    expect(l2).toHaveBeenCalledTimes(1)
  })

  it('quem saiu não é mais avisado', () => {
    const { clock, fire } = setup()
    const l1 = vi.fn()
    const off = clock.subscribe(l1)
    clock.subscribe(() => {})
    off()
    fire()
    expect(l1).not.toHaveBeenCalled()
  })

  it('clockFor devolve o mesmo relógio por intervalo', () => {
    expect(clockFor(1234)).toBe(clockFor(1234))
    expect(clockFor(1234)).not.toBe(clockFor(4321))
  })
})
