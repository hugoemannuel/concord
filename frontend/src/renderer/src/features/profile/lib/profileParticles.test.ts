import { describe, expect, it } from 'vitest'
import { MAX_CSS_PARTICLES, effectParticles, particleCount } from './profileParticles'

describe('effectParticles', () => {
  it('determinístico e dentro do cartão', () => {
    for (const e of ['particles', 'sparkles', 'snow']) {
      const a = effectParticles(e)
      expect(a.length).toBeGreaterThan(0)
      expect(effectParticles(e)).toEqual(a)
      for (const p of a) {
        expect(p.left).toBeGreaterThanOrEqual(0)
        expect(p.left).toBeLessThanOrEqual(100)
        expect(p.top).toBeGreaterThanOrEqual(0)
        expect(p.top).toBeLessThanOrEqual(100)
      }
    }
    expect(effectParticles('none')).toEqual([])
  })
})

describe('quantidade e velocidade', () => {
  it('fator 1 é o de sempre', () => {
    expect(particleCount('particles')).toBe(14)
    expect(particleCount('snow', 1)).toBe(18)
    expect(effectParticles('snow', 1, 1)).toEqual(effectParticles('snow'))
  })
  it('mais quantidade, com teto; menos, nunca zero', () => {
    expect(particleCount('snow', 2.7)).toBe(MAX_CSS_PARTICLES)
    expect(particleCount('sparkles', 0.01)).toBe(1)
    expect(particleCount('none', 2)).toBe(0)
    expect(effectParticles('particles', 2)).toHaveLength(28)
  })
  it('mais rápido = animação mais curta', () => {
    const slow = effectParticles('particles', 1, 0.5)
    const fast = effectParticles('particles', 1, 2)
    expect(fast[0].duration).toBeLessThan(slow[0].duration)
  })
})

describe('tamanho das partículas', () => {
  it('o fator multiplica o tamanho e não muda a posição', () => {
    const base = effectParticles('particles', 1, 1)
    const big = effectParticles('particles', 1, 1, 2)
    expect(big.map((p) => p.size)).toEqual(base.map((p) => p.size * 2))
    expect(big.map((p) => p.left)).toEqual(base.map((p) => p.left))
  })
  it('sem o fator, igual a antes', () => {
    expect(effectParticles('snow', 1, 1, 1)).toEqual(effectParticles('snow'))
  })
})
