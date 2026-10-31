import { describe, expect, it } from 'vitest'
import { sparkLayout } from './boostSparks'

describe('sparkLayout', () => {
  it('uma faísca por contagem, sem aleatoriedade', () => {
    expect(sparkLayout(12)).toHaveLength(12)
    expect(sparkLayout(12)).toEqual(sparkLayout(12))
  })

  it('sem faíscas, lista vazia', () => {
    expect(sparkLayout(0)).toEqual([])
  })

  it('espalha em ângulos diferentes, com tamanho de 3 a 5 px e atrasos de 120 a 280 ms', () => {
    const sparks = sparkLayout(22)
    expect(new Set(sparks.map((s) => `${s.dx.toFixed(1)},${s.dy.toFixed(1)}`)).size).toBe(22)
    for (const s of sparks) {
      expect(s.size).toBeGreaterThanOrEqual(3)
      expect(s.size).toBeLessThanOrEqual(5)
      expect(s.delay).toBeGreaterThanOrEqual(120)
      expect(s.delay).toBeLessThanOrEqual(280)
    }
  })
})
