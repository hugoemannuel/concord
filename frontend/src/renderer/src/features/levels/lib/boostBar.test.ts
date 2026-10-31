import { describe, expect, it } from 'vitest'
import { emberLayout, xpFillStyle } from './boostBar'

describe('xpFillStyle', () => {
  const tier = { accent: '#111111', color: '#eeeeee' }

  it('sem pausa: gradiente do tier e brilho', () => {
    expect(xpFillStyle(tier, false)).toEqual({
      backgroundImage: 'linear-gradient(90deg, #111111, #eeeeee)',
      boxShadow: '0 0 8px #eeeeee88'
    })
  })

  it('pausado: cinza e sem brilho', () => {
    expect(xpFillStyle(tier, true)).toEqual({
      backgroundImage: 'linear-gradient(90deg, #4b5563, #374151)'
    })
  })
})

describe('emberLayout', () => {
  it('uma brasa por contagem, espalhadas entre 10% e 90% da barra', () => {
    const embers = emberLayout(7)
    expect(embers).toHaveLength(7)
    for (const e of embers) {
      const left = parseFloat(e.left)
      expect(left).toBeGreaterThanOrEqual(10)
      expect(left).toBeLessThan(90)
    }
  })

  it('alterna o lado do desvio e escalona o atraso', () => {
    const [first, second, third] = emberLayout(3)
    expect(first.dx).toBeGreaterThan(0)
    expect(second.dx).toBeLessThan(0)
    expect(third.dx).toBeGreaterThan(0)
    expect([first.delay, second.delay, third.delay]).toEqual([0, 230, 460])
  })

  it('zero brasas, lista vazia', () => {
    expect(emberLayout(0)).toEqual([])
  })
})
