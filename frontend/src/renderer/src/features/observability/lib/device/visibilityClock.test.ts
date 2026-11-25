import { describe, expect, it } from 'vitest'
import { VisibilityClock } from './visibilityClock'

describe('VisibilityClock', () => {
  it('% do tempo visível e com foco, pelos eventos', () => {
    const clock = new VisibilityClock(0, true, true)
    clock.set(30_000, true, false) // perdeu o foco aos 30 s
    clock.set(45_000, false, false) // escondeu aos 45 s
    expect(clock.take(60_000)).toEqual({ visiblePct: 75, focusedPct: 50 })
  })

  it('a próxima linha começa do estado atual', () => {
    const clock = new VisibilityClock(0, false, false)
    clock.take(10_000)
    clock.set(15_000, true, true)
    expect(clock.take(20_000)).toEqual({ visiblePct: 50, focusedPct: 50 })
  })

  it('linha sem duração: null', () => {
    const clock = new VisibilityClock(5, true, true)
    expect(clock.take(5)).toEqual({ visiblePct: null, focusedPct: null })
  })
})
