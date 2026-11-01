import { describe, expect, it } from 'vitest'
import { parseGradient, parseThemeInput } from './parseTheme'

const V1 = {
  id: 'abc',
  name: 'Antigo',
  accent: '#E11D48',
  background: '#1a1a1e',
  sidebar: '#121214',
  card: '#242429',
  text: '#efeff1',
  glow: '#5b21b6'
}

describe('parseThemeInput', () => {
  it('migra o formato v1 sem perder nada (o vidro da v1 vem junto com o brilho)', () => {
    expect(parseThemeInput(V1)).toEqual({
      accent: '#e11d48',
      background: '#1a1a1e',
      sidebar: '#121214',
      card: '#242429',
      text: '#efeff1',
      glow: '#5b21b6',
      gradients: {},
      highlight: '',
      textMuted: '',
      border: '',
      glowStrength: 100,
      glass: 40,
      radius: 100,
      density: 'normal',
      font: 'outfit'
    })
    expect(parseThemeInput({ ...V1, glow: '' })?.glass).toBe(0)
  })

  it('lê os campos v2 válidos', () => {
    const t = parseThemeInput({
      ...V1,
      gradients: { background: { type: 'radial', angle: 90, colors: ['#FF0000'] }, outro: {} },
      highlight: '#F472B6',
      glass: 0,
      glowStrength: 30,
      radius: 160,
      density: 'compact',
      font: 'serif'
    })
    expect(t).toMatchObject({
      gradients: { background: { type: 'radial', angle: 90, colors: ['#ff0000'] } },
      highlight: '#f472b6',
      glass: 0,
      glowStrength: 30,
      radius: 160,
      density: 'compact',
      font: 'serif'
    })
  })

  it('extra inválido cai no padrão sem perder o tema', () => {
    const t = parseThemeInput({ ...V1, glass: 300, radius: -1, density: 'x', font: 1, border: 'azul', gradients: 'x' })
    expect(t).toMatchObject({ glass: 40, radius: 100, density: 'normal', font: 'outfit', border: '', gradients: {} })
  })

  it('cores básicas inválidas: null', () => {
    expect(parseThemeInput({ ...V1, accent: 'red' })).toBeNull()
    expect(parseThemeInput({ ...V1, glow: 'x' })).toBeNull()
    expect(parseThemeInput(null)).toBeNull()
  })
})

describe('parseGradient', () => {
  it('1 ou 2 cores; tipo e ângulo com padrão', () => {
    expect(parseGradient({ colors: ['#000000'] })).toEqual({ type: 'linear', angle: 180, colors: ['#000000'] })
    expect(parseGradient({ colors: [] })).toBeUndefined()
    expect(parseGradient({ colors: ['#000000', '#111111', '#222222'] })).toBeUndefined()
    expect(parseGradient({ colors: ['preto'] })).toBeUndefined()
    expect(parseGradient(null)).toBeUndefined()
  })
})
