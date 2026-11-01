import { describe, expect, it } from 'vitest'
import { contrastRatio } from '../../../shared/lib/contrast'
import { clampLuminance, ensureContrast, isHexColor, luminance, luminanceExtremes, mix, rotateHue, withAlpha } from './colorMath'

describe('isHexColor', () => {
  it('aceita só #rrggbb', () => {
    expect(isHexColor('#a1B2c3')).toBe(true)
    expect(isHexColor('#abc')).toBe(false)
    expect(isHexColor('red')).toBe(false)
    expect(isHexColor(42)).toBe(false)
  })
})

describe('mix', () => {
  it('mistura em sRGB e devolve hex minúsculo', () => {
    expect(mix('#000000', '#ffffff', 0)).toBe('#000000')
    expect(mix('#000000', '#FFFFFF', 1)).toBe('#ffffff')
    expect(mix('#000000', '#ffffff', 0.5)).toBe('#808080')
  })
})

describe('withAlpha', () => {
  it('vira rgba()', () => {
    expect(withAlpha('#97979f', 0.122)).toBe('rgba(151, 151, 159, 0.122)')
  })
})

describe('ensureContrast', () => {
  it('não mexe numa cor que já passa', () => {
    expect(ensureContrast('#ffffff', ['#000000'], 4.5, '#ffffff')).toBe('#ffffff')
  })

  it('clareia até passar em todos os fundos', () => {
    const out = ensureContrast('#555555', ['#1a1a1e', '#2a2a30'], 4.5, '#ffffff')
    for (const bg of ['#1a1a1e', '#2a2a30']) expect(contrastRatio(out, bg)).toBeGreaterThanOrEqual(4.5)
  })

  it('escurece rumo ao preto num fundo claro', () => {
    const out = ensureContrast('#ff8080', ['#ffffff'], 4.5, '#000000')
    expect(contrastRatio(out, '#ffffff')).toBeGreaterThanOrEqual(4.5)
  })

  it('sem como passar, devolve o extremo', () => {
    expect(ensureContrast('#777777', ['#808080'], 21, '#ffffff')).toBe('#ffffff')
  })
})

describe('clampLuminance', () => {
  it('escurece até o teto', () => {
    const out = clampLuminance('#e0e0e0', { max: 0.12 })
    expect(luminance(out)).toBeLessThanOrEqual(0.12)
  })

  it('clareia até o piso', () => {
    const out = clampLuminance('#202020', { min: 0.5 })
    expect(luminance(out)).toBeGreaterThanOrEqual(0.5)
  })

  it('dentro da faixa, igual', () => {
    expect(clampLuminance('#101010', { max: 0.12 })).toBe('#101010')
  })
})

describe('luminanceExtremes', () => {
  it('fica com o mais escuro e o mais claro', () => {
    expect(luminanceExtremes(['#333333', '#000000', '#ffffff', '#777777'])).toEqual(['#000000', '#ffffff'])
    expect(luminanceExtremes(['#123456'])).toEqual(['#123456'])
  })
})

describe('rotateHue', () => {
  it('gira o matiz e mantém cinzas', () => {
    expect(rotateHue('#ff0000', 120)).toBe('#00ff00')
    expect(rotateHue('#ff0000', -120)).toBe('#0000ff')
    expect(rotateHue('#808080', 90)).toBe('#808080')
  })
})
