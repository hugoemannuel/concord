import { describe, expect, it } from 'vitest'
import { between, clamp, countFor, countForArea, hexRgb, hsl, mix, mod, rgba } from './util'

describe('util dos efeitos', () => {
  it('hexRgb lê #rrggbb e cai no branco com cor inválida', () => {
    expect(hexRgb('#ff7a1a')).toEqual([255, 122, 26])
    expect(hexRgb('#FFFFFF')).toEqual([255, 255, 255])
    expect(hexRgb('vermelho')).toEqual([255, 255, 255])
    expect(hexRgb('#fff')).toEqual([255, 255, 255])
  })

  it('hsl converte as cores primárias e o cinza', () => {
    expect(hsl([255, 0, 0])).toEqual([0, 100, 50])
    expect(hsl([0, 255, 0])).toEqual([120, 100, 50])
    expect(hsl([0, 0, 255])).toEqual([240, 100, 50])
    expect(hsl([255, 0, 128])[0]).toBeCloseTo(329.9, 0)
    expect(hsl([128, 128, 128])).toEqual([0, 0, (128 / 255) * 100])
  })

  it('countFor escala, tem mínimo 1 e teto', () => {
    expect(countFor(10, 2, 100)).toBe(20)
    expect(countFor(10, 0, 100)).toBe(1)
    expect(countFor(10, 50, 100)).toBe(100)
    expect(countFor(10, Number.NaN, 100)).toBe(10)
  })

  it('contas pequenas', () => {
    expect(clamp(5, 0, 3)).toBe(3)
    expect(mod(-1, 20)).toBe(19)
    expect(mix([0, 0, 0], [255, 255, 255], 0.5)).toEqual([127.5, 127.5, 127.5])
    expect(rgba([10, 20, 30.4], 0.5)).toBe('rgba(10,20,30,0.5)')
    expect(between(() => 0.5, 2, 4)).toBe(3)
  })
})

describe('countForArea', () => {
  it('no cartão, igual a countFor', () => {
    expect(countForArea(20, 1, 100, 300, 450)).toBe(20)
    expect(countForArea(20, 1, 100, 120, 80)).toBe(20)
  })
  it('área maior ganha mais, sem passar do teto', () => {
    expect(countForArea(20, 1, 100, 1920, 1080)).toBe(50)
    expect(countForArea(60, 2.7, 100, 1920, 1080)).toBe(100)
  })
})
