import { describe, expect, it } from 'vitest'
import { contrastRatio, parseColor } from '../../../shared/lib/contrast'
import type { ThemeToken } from '../../settings/lib/themes'
import { flatten, mix } from './colorMath'
import { buildPalette } from './palette'
import { EFFECT_PEAK, GLOW_PEAK } from './paletteSurfaces'
import { withDefaults, type PaletteInput } from './themeInput'

// v3: o brilho, o efeito animado e a imagem de fundo aparecem através dos
// painéis, e o texto continua AA por cima do pior caso de cada um.

const DARK: PaletteInput = withDefaults({
  accent: '#5865f2',
  background: '#313338',
  sidebar: '#2b2d31',
  card: '#2b2d31',
  text: '#dbdee1',
  glow: ''
})
const LIGHT: PaletteInput = { ...DARK, background: '#ffffff', sidebar: '#f2f3f5', card: '#ffffff', text: '#313338' }
const IMAGE = '/api/app-theme-images/0f8fad5b-d9cb-469f-a165-70867728950e'

const PANELS: ThemeToken[] = ['bg-tertiary', 'bg-secondary', 'bg-primary', 'bg-members']
const TEXT: ThemeToken[] = ['text-normal', 'text-secondary', 'text-muted', 'text-link', 'text-brand']
const alpha = (color: string): number => parseColor(color)!.a

/** O texto passa AA nos painéis com cada cor `behind` atrás deles. */
function expectReadable(input: PaletteInput, behind: (app: string) => string[]): void {
  const { tokens } = buildPalette(input)
  for (const panel of PANELS) {
    for (const b of behind(tokens['bg-app'])) {
      const bg = flatten(tokens[panel], b)
      for (const text of TEXT) {
        expect(contrastRatio(tokens[text], bg), `--${text} em --${panel} sobre ${b}`).toBeGreaterThanOrEqual(4.5)
      }
    }
  }
}

describe('brilho de fundo (v3: claramente visível)', () => {
  it('a 100% deixa os painéis translúcidos mesmo sem vidro (o brilho fica atrás deles)', () => {
    const { tokens, blur } = buildPalette({ ...DARK, glow: '#33ff00', glowStrength: 100, glass: 0 })
    expect(alpha(tokens['bg-primary'])).toBeLessThanOrEqual(0.75)
    expect(alpha(tokens['bg-secondary'])).toBeLessThanOrEqual(0.7)
    expect(alpha(tokens['bg-tertiary'])).toBeLessThanOrEqual(0.7)
    expect(blur).toBe(0)
  })

  it('a intensidade controla quanto aparece', () => {
    const weak = buildPalette({ ...DARK, glow: '#33ff00', glowStrength: 20, glass: 0 }).tokens['bg-primary']
    const strong = buildPalette({ ...DARK, glow: '#33ff00', glowStrength: 100, glass: 0 }).tokens['bg-primary']
    expect(alpha(weak)).toBeGreaterThan(alpha(strong))
  })

  it('o texto passa AA sobre o brilho mais forte, de qualquer cor', () => {
    for (const glow of ['#33ff00', '#ffffff', '#ffff00', '#00ffff', '#ff00ff']) {
      const input = { ...DARK, glow, glowStrength: 100, highlight: glow }
      const hero = buildPalette(input).hero!
      expectReadable(input, (app) => hero.map((h) => mix(app, h, GLOW_PEAK)))
    }
  })
})

describe('efeito animado no fundo', () => {
  it('deixa os painéis translúcidos e tira o desfoque (não pesa)', () => {
    const { tokens, blur } = buildPalette({ ...DARK, effect: 'snow', glass: 60 })
    expect(alpha(tokens['bg-primary'])).toBeLessThan(1)
    expect(blur).toBe(0)
  })

  it('o texto passa AA sobre partículas brancas ou pretas', () => {
    for (const base of [DARK, LIGHT]) {
      const input = { ...base, effect: 'snow' }
      expectReadable(input, (app) => [mix(app, '#ffffff', EFFECT_PEAK), mix(app, '#000000', EFFECT_PEAK)])
    }
  })
})

describe('imagem de fundo', () => {
  it('véu escuro no tema escuro e claro no claro, nunca abaixo do mínimo', () => {
    expect(buildPalette({ ...DARK, image: IMAGE, imageDim: 0 }).imageVeil).toEqual({ color: '#000000', alpha: 0.35 })
    expect(buildPalette({ ...LIGHT, image: IMAGE, imageDim: 70 }).imageVeil).toEqual({ color: '#ffffff', alpha: 0.7 })
    expect(buildPalette(DARK).imageVeil).toBeNull()
  })

  it('o texto passa AA com uma imagem toda branca ou toda preta, no escuro e no claro', () => {
    for (const base of [DARK, LIGHT]) {
      const input = { ...base, image: IMAGE, imageDim: 0 }
      const veil = buildPalette(input).imageVeil!
      const veiled = (c: string): string => mix(c, veil.color, veil.alpha)
      expectReadable(input, () => [veiled('#ffffff'), veiled('#000000'), veiled('#ff0000')])
    }
  })

  it('a imagem fica na janela atrás dos painéis', () => {
    const p = buildPalette({ ...DARK, image: IMAGE })
    expect(p.fills.window).not.toBeNull()
    expect(alpha(p.tokens['bg-primary'])).toBeLessThanOrEqual(0.6)
    expect(alpha(p.tokens['bg-members'])).toBeLessThanOrEqual(0.6)
  })
})

describe('aleatórios v3 (brilho, efeito e imagem juntos)', () => {
  let s = 43
  const next = (): number => {
    s = (s * 1664525 + 1013904223) % 4294967296
    return s / 4294967296
  }
  const hex = (): string => `#${Math.floor(next() * 0xffffff).toString(16).padStart(6, '0')}`
  const cases = Array.from({ length: 60 }, (): PaletteInput => ({
    ...withDefaults({ accent: hex(), background: hex(), sidebar: hex(), card: hex(), text: hex(), glow: next() > 0.4 ? hex() : '' }),
    highlight: next() > 0.5 ? hex() : '',
    glowStrength: Math.floor(next() * 101),
    glass: next() > 0.5 ? Math.floor(next() * 101) : 0,
    effect: next() > 0.5 ? 'snow' : 'none',
    image: next() > 0.5 ? IMAGE : '',
    imageDim: Math.floor(next() * 91)
  }))

  it.each(cases.map((c, i) => [i, c] as const))('caso %i: texto AA sobre o pior fundo', (_i, input) => {
    const p = buildPalette(input)
    expectReadable(input, (app) => {
      const windows = p.imageVeil
        ? ['#ffffff', '#000000'].map((c) => mix(c, p.imageVeil!.color, p.imageVeil!.alpha))
        : [app]
      const glow = p.hero ? windows.flatMap((w) => p.hero!.map((h) => mix(w, h, (GLOW_PEAK * input.glowStrength) / 100))) : []
      const fx = input.effect !== 'none' ? windows.flatMap((w) => [mix(w, '#ffffff', EFFECT_PEAK), mix(w, '#000000', EFFECT_PEAK)]) : []
      return [...windows, ...glow, ...fx]
    })
  })
})

describe('readableAlpha', () => {
  it('fica como pedido quando o texto já passa; sobe (até opaco) quando não passa', async () => {
    const { readableAlpha } = await import('./paletteSurfaces')
    expect(readableAlpha(['#1e1f22'], 0.6, ['#000000'], '#ffffff')).toBe(0.6)
    expect(readableAlpha(['#ffffff'], 0.5, ['#000000'], '#000000')).toBeGreaterThan(0.5)
    expect(readableAlpha(['#808080'], 0.5, ['#ffffff'], '#ffffff')).toBeUndefined()
    expect(readableAlpha(['#1e1f22'], undefined, ['#ffffff'], '#ffffff')).toBeUndefined()
  })
})
