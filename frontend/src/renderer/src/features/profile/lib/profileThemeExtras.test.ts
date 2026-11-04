import { describe, expect, it } from 'vitest'
import {
  DEFAULT_EXTRAS,
  GRADIENT_DIRECTIONS,
  MAX_BORDER_WIDTH,
  densityFactor,
  effectParams,
  extrasClasses,
  extrasVars,
  resolveExtras,
  speedFactor
} from './profileThemeExtras'

describe('resolveExtras', () => {
  it('ausente (tema antigo) vira o padrão', () => {
    expect(resolveExtras(undefined)).toEqual(DEFAULT_EXTRAS)
    expect(resolveExtras(null)).toEqual(DEFAULT_EXTRAS)
    expect(resolveExtras({})).toEqual(DEFAULT_EXTRAS)
  })
  it('zeros do backend antigo viram o padrão', () => {
    expect(
      resolveExtras({ effect_density: 0, effect_speed: 0, border_width: 0, background_angle: 0 })
    ).toEqual(DEFAULT_EXTRAS)
  })
  it('mantém valores válidos (cor em minúsculas)', () => {
    const v = {
      effect_color: '#AABBCC',
      effect_density: 1,
      effect_speed: 100,
      border_animation: 'spin',
      border_width: MAX_BORDER_WIDTH,
      background_angle: 360,
      texture: 'grid'
    }
    expect(resolveExtras(v)).toEqual({ ...DEFAULT_EXTRAS, ...v, effect_color: '#aabbcc' })
  })
  it('cada valor inválido volta ao padrão sozinho', () => {
    const t = resolveExtras({
      effect_color: 'red;x',
      effect_density: 101,
      effect_speed: 2.5,
      border_animation: 'wobble',
      border_width: 7,
      background_angle: -1,
      texture: 'grain'
    })
    expect(t).toEqual({ ...DEFAULT_EXTRAS, texture: 'grain' })
  })
})

describe('fatores e parâmetros', () => {
  it('50 = 1, sobe e desce dentro de um intervalo seguro', () => {
    expect(densityFactor(50)).toBe(1)
    expect(speedFactor(50)).toBe(1)
    expect(densityFactor(1)).toBeGreaterThan(0.3)
    expect(densityFactor(100)).toBeLessThan(3)
    expect(speedFactor(1)).toBeGreaterThan(0.4)
    expect(speedFactor(100)).toBeLessThan(2.5)
  })
  it('cor escolhida ganha da padrão', () => {
    expect(effectParams(DEFAULT_EXTRAS, '#123456').color).toBe('#123456')
    expect(effectParams({ ...DEFAULT_EXTRAS, effect_color: '#ffffff' }, '#123456').color).toBe(
      '#ffffff'
    )
  })
})

describe('extrasVars / extrasClasses', () => {
  it('padrão: só a espessura, sem classes', () => {
    expect(extrasVars(DEFAULT_EXTRAS)).toEqual({ '--pt-bw': '2px' })
    expect(extrasClasses(DEFAULT_EXTRAS, 'neon')).toEqual([])
  })
  it('cor do efeito, textura e animação', () => {
    const e = {
      ...DEFAULT_EXTRAS,
      effect_color: '#00ff00',
      texture: 'lines',
      border_animation: 'pulse'
    }
    expect(extrasVars(e)).toMatchObject({ '--pt-fxc': '#00ff00' })
    expect(extrasClasses(e, 'solid')).toEqual(['pt-tex-lines', 'pt-anim-pulse'])
    expect(extrasClasses(e, 'none')).toEqual(['pt-tex-lines'])
  })
  it('as direções do degradê são ângulos válidos e incluem o padrão', () => {
    for (const d of GRADIENT_DIRECTIONS) {
      expect(resolveExtras({ background_angle: d.angle }).background_angle).toBe(d.angle)
    }
    expect(GRADIENT_DIRECTIONS.some((d) => d.angle === DEFAULT_EXTRAS.background_angle)).toBe(true)
    // Sem seta de texto: o editor gira um ícone pelo ângulo.
    for (const d of GRADIENT_DIRECTIONS) expect(Object.keys(d).sort()).toEqual(['angle', 'label'])
  })
})
