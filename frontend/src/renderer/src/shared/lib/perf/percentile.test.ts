import { describe, expect, it } from 'vitest'
import { percentile } from './percentile'

describe('percentile', () => {
  it('vazio: null', () => {
    expect(percentile([], 50)).toBeNull()
  })

  it('pelo posto mais próximo, sem mexer na lista', () => {
    const values = [5, 1, 4, 2, 3]
    expect(percentile(values, 50)).toBe(3)
    expect(percentile(values, 95)).toBe(5)
    expect(percentile(values, 0)).toBe(1)
    expect(values).toEqual([5, 1, 4, 2, 3])
  })

  it('p95 de 20 valores é o 19º', () => {
    const values = Array.from({ length: 20 }, (_, i) => i + 1)
    expect(percentile(values, 95)).toBe(19)
  })
})
