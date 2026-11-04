import { describe, expect, it } from 'vitest'
import { effectDef, EFFECT_GROUPS, PROFILE_EFFECTS } from './effectCatalog'
import {
  DEFAULT_EFFECT_LOOK,
  fxLook,
  particleColor,
  resolveEffectLook,
  secondColor,
  sizeFactor
} from './effectLook'

describe('resolveEffectLook', () => {
  it('ausente ou zerado (tema antigo): o padrão', () => {
    expect(resolveEffectLook(undefined)).toEqual(DEFAULT_EFFECT_LOOK)
    expect(resolveEffectLook({})).toEqual(DEFAULT_EFFECT_LOOK)
    expect(resolveEffectLook({ effect_size: 0, effect_opacity: 0, effect_glow: 0 })).toEqual(
      DEFAULT_EFFECT_LOOK
    )
  })
  it('valores válidos ficam (cor em minúsculas)', () => {
    const look = {
      effect_size: 100,
      effect_direction: 'left',
      effect_opacity: 10,
      effect_palette: 'duo',
      effect_color2: '#ABCDEF',
      effect_area: 'banner',
      effect_glow: 100
    }
    expect(resolveEffectLook(look)).toEqual({ ...look, effect_color2: '#abcdef' })
  })
  it('cada inválido volta ao padrão sozinho', () => {
    const got = resolveEffectLook({
      effect_size: 101,
      effect_direction: 'diagonal',
      effect_opacity: -5,
      effect_palette: 'neon',
      effect_color2: 'url(x)',
      effect_area: 'avatar',
      effect_glow: 1.5
    } as never)
    expect(got).toEqual(DEFAULT_EFFECT_LOOK)
  })
})

describe('sizeFactor e secondColor', () => {
  it('50 = 1; vai de ~0,5 a 2', () => {
    expect(sizeFactor(50)).toBe(1)
    expect(sizeFactor(1)).toBeCloseTo(0.507, 2)
    expect(sizeFactor(100)).toBe(2)
  })
  it('a segunda cor automática é outra cor válida', () => {
    expect(secondColor('#ff0000')).toMatch(/^#[0-9a-f]{6}$/)
    expect(secondColor('#ff0000')).not.toBe('#ff0000')
    expect(secondColor('#ffffff')).toMatch(/^#[0-9a-f]{6}$/)
  })
})

describe('fxLook', () => {
  const look = {
    ...DEFAULT_EFFECT_LOOK,
    effect_size: 100,
    effect_direction: 'left',
    effect_palette: 'rainbow',
    effect_glow: 40,
    effect_opacity: 50,
    effect_area: 'banner'
  }
  it('padrão: nada muda', () => {
    expect(fxLook(effectDef('rain'), DEFAULT_EFFECT_LOOK, '#7cc4ff')).toEqual({
      size: 1,
      flow: 'down',
      direction: 'default',
      opacity: 1,
      palette: 'single',
      color2: secondColor('#7cc4ff'),
      area: 'full',
      glow: 0
    })
  })
  it('efeito que aceita tudo usa os valores', () => {
    const got = fxLook(effectDef('rain'), look, '#7cc4ff')
    expect(got).toMatchObject({
      size: 2,
      direction: 'left',
      palette: 'rainbow',
      glow: 0.4,
      opacity: 0.5,
      area: 'banner'
    })
  })
  it('o que o efeito não expõe é ignorado', () => {
    const got = fxLook(effectDef('glitch'), look, '#ffffff')
    expect(got).toMatchObject({ size: 1, direction: 'default', palette: 'single', glow: 0 })
    // Opacidade e área valem para todos.
    expect(got).toMatchObject({ opacity: 0.5, area: 'banner' })
  })
  it('direção fora das que o efeito tem volta ao sentido dele', () => {
    const cloudsDown = { ...DEFAULT_EFFECT_LOOK, effect_direction: 'down' }
    expect(fxLook(effectDef('clouds'), cloudsDown, '#ffffff').direction).toBe('default')
  })
  it('a segunda cor escolhida vale', () => {
    const duo = { ...DEFAULT_EFFECT_LOOK, effect_palette: 'duo', effect_color2: '#123456' }
    expect(fxLook(effectDef('rain'), duo, '#7cc4ff').color2).toBe('#123456')
  })
})

describe('particleColor', () => {
  it('cor única: não força nada', () => {
    expect(particleColor('single', '#ff0000', '#0000ff', 0, 5)).toBeNull()
  })
  it('duas cores: vai de uma à outra', () => {
    expect(particleColor('duo', '#ff0000', '#0000ff', 0, 3)).toBe('#ff0000')
    expect(particleColor('duo', '#ff0000', '#0000ff', 2, 3)).toBe('#0000ff')
    expect(particleColor('duo', '#ff0000', '#0000ff', 0, 1)).toBe('#ff0000')
  })
  it('arco-íris: cada partícula num matiz', () => {
    const a = particleColor('rainbow', '#ff0000', '#0000ff', 0, 6)
    const b = particleColor('rainbow', '#ff0000', '#0000ff', 3, 6)
    expect(a).not.toBe(b)
    expect(a).toMatch(/^hsl\(/)
  })
})

describe('catálogo', () => {
  it('todo efeito está num grupo; "Nenhum" vem primeiro', () => {
    const grouped = EFFECT_GROUPS.flatMap((g) => g.effects.map((e) => e.id)).sort()
    expect(grouped).toEqual(PROFILE_EFFECTS.map((e) => e.id).sort())
    expect(EFFECT_GROUPS[0].effects[0].id).toBe('none')
    expect(EFFECT_GROUPS.map((g) => g.label)).toEqual([
      'Básicos',
      'Natureza',
      'Clima',
      'Espaço',
      'Festa',
      'Retrô'
    ])
  })
  it('são pelo menos 10 efeitos novos', () => {
    expect(PROFILE_EFFECTS.length).toBeGreaterThanOrEqual(24)
  })
  it('as opções de cada efeito são coerentes', () => {
    for (const e of PROFILE_EFFECTS) {
      // Paleta própria: sem cor para escolher, então sem mistura.
      if (e.color === null) expect(e.palette, e.id).toBe(false)
      // Só tem direção quem tem sentido, e o sentido é uma das opções.
      if (e.directions.length) expect(e.directions, e.id).toContain(e.flow)
      // Partículas em CSS não giram.
      if (e.kind === 'css') expect(e.directions, e.id).toEqual([])
    }
    expect(effectDef('none')).toMatchObject({ size: false, palette: false, glow: false })
  })
  it('corações e texto não ficam de cabeça para baixo', () => {
    for (const id of ['hearts', 'matrix']) {
      expect(effectDef(id).directions, id).toEqual([])
    }
    expect(effectDef('money').directions).not.toContain('up')
  })
})
