import {
  DEFAULT_EXTRAS,
  GRADIENT_DIRECTIONS,
  MAX_BORDER_WIDTH,
  densityFactor,
  effectParams,
  resolveExtras,
  speedFactor
} from './profileThemeExtras'
import { CANVAS_EFFECTS, seededRand } from './effects'
import { fakeCtx } from './effects/fakeCtx'

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


describe('direções do degradê', () => {
  it('as direções do degradê são ângulos válidos e incluem o padrão', () => {
    for (const d of GRADIENT_DIRECTIONS) {
      expect(resolveExtras({ background_angle: d.angle }).background_angle).toBe(d.angle)
    }
    expect(GRADIENT_DIRECTIONS.some((d) => d.angle === DEFAULT_EXTRAS.background_angle)).toBe(true)
    // Sem seta de texto: o editor gira um ícone pelo ângulo.
    for (const d of GRADIENT_DIRECTIONS) expect(Object.keys(d).sort()).toEqual(['angle', 'label'])
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
    expect(effectParams({ ...DEFAULT_EXTRAS, effect_color: '#ffffff' }, '#123456').color).toBe('#ffffff')
  })

  // Review Focus 1: densidade, velocidade e cor inválidas vindas do servidor.
  it('valores inválidos do servidor viram o padrão e nenhuma cena lança erro', () => {
    const params = effectParams(resolveExtras({ effect_density: 9999, effect_speed: -5, effect_color: 'x' }), '#ff7a1a')
    expect(params).toEqual({ density: 1, speed: 1, color: '#ff7a1a' })
    const rand = seededRand(7)
    for (const scene of Object.values(CANVAS_EFFECTS)) {
      const ctx = fakeCtx()
      const state = scene.init(300, 200, params, rand)
      scene.step(state, 0.033, rand)
      scene.draw(ctx, state)
      expect(ctx.bad).toEqual([])
    }
  })
})

describe('ajustes do efeito escolhidos no desktop', () => {
  it('passam intactos: salvar o perfil no app não os apaga', () => {
    const look = {
      effect_size: 90,
      effect_direction: 'left',
      effect_opacity: 40,
      effect_palette: 'duo',
      effect_color2: '#abcdef',
      effect_area: 'banner',
      effect_glow: 60
    }
    expect(resolveExtras(look)).toMatchObject(look)
  })
  it('tema antigo: os padrões; inválido volta ao padrão', () => {
    expect(resolveExtras({})).toMatchObject({ effect_size: 50, effect_opacity: 100, effect_glow: 0, effect_area: 'full' })
    expect(resolveExtras({ effect_glow: 101, effect_direction: 'x', effect_color2: 'url(x)' })).toMatchObject({
      effect_glow: 0,
      effect_direction: 'default',
      effect_color2: ''
    })
  })
})
