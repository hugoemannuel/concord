import { describe, expect, it } from 'vitest'
import { InteractionStats, SLOW_INPUT_MS } from './interactionStats'

describe('InteractionStats', () => {
  it('uma interação (vários eventos com o mesmo id) conta uma vez, pela maior duração', () => {
    const stats = new InteractionStats()
    stats.add(7, 120)
    stats.add(7, 240)
    stats.add(8, 150)
    expect(stats.take()).toEqual({ slow: 1, maxMs: 240 })
  })

  it('ignora evento sem interação (interactionId 0)', () => {
    const stats = new InteractionStats()
    stats.add(0, 900)
    expect(stats.take()).toEqual({ slow: 0, maxMs: null })
  })

  it(`lenta é a partir de ${SLOW_INPUT_MS} ms; take zera`, () => {
    const stats = new InteractionStats()
    stats.add(1, SLOW_INPUT_MS)
    stats.add(2, SLOW_INPUT_MS - 1)
    expect(stats.take().slow).toBe(1)
    expect(stats.take()).toEqual({ slow: 0, maxMs: null })
  })
})
