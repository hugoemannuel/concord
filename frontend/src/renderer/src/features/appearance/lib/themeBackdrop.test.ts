import { describe, expect, it } from 'vitest'
import { activeTheme, backdropFx } from './themeBackdrop'
import { withDefaults, type ThemeInput } from './themeInput'
import type { CustomTheme } from './customThemes'

const BASE: ThemeInput = withDefaults({
  accent: '#5865f2',
  background: '#313338',
  sidebar: '#2b2d31',
  card: '#2b2d31',
  text: '#dbdee1',
  glow: ''
})
const SAVED: CustomTheme = { ...BASE, id: 'abc', name: 'Meu', effect: 'snow' }

describe('activeTheme', () => {
  it('o rascunho do editor vale mais que o tema escolhido', () => {
    const draft = { ...SAVED, effect: 'fire' }
    expect(activeTheme(draft, 'custom-abc', [SAVED])?.effect).toBe('fire')
  })
  it('o tema próprio escolhido; tema pronto ou sumido: nada', () => {
    expect(activeTheme(null, 'custom-abc', [SAVED])?.effect).toBe('snow')
    expect(activeTheme(null, 'discord-dark', [SAVED])).toBeNull()
    expect(activeTheme(null, 'custom-zzz', [SAVED])).toBeNull()
  })
})

describe('backdropFx', () => {
  it('sem efeito (ou efeito desconhecido): nada', () => {
    expect(backdropFx(null)).toBeNull()
    expect(backdropFx(BASE)).toBeNull()
    expect(backdropFx({ ...BASE, effect: 'fumaça' })).toBeNull()
  })
  it('usa os mesmos parâmetros do cartão de perfil (50 = padrão) e a cor de sempre do efeito', () => {
    expect(backdropFx({ ...BASE, effect: 'snow' })).toEqual({
      id: 'snow',
      kind: 'css',
      params: { density: 1, speed: 1, color: '#ffffff' },
      look: expect.objectContaining({ size: 1, opacity: 1, palette: 'single', area: 'full', glow: 0 })
    })
    const fx = backdropFx({ ...BASE, effect: 'fire', effectDensity: 100, effectSpeed: 1, effectColor: '#00ff00' })!
    expect(fx.kind).toBe('canvas')
    expect(fx.params.density).toBeGreaterThan(2)
    expect(fx.params.speed).toBeLessThan(0.5)
    expect(fx.params.color).toBe('#00ff00')
  })
  it('tema salvo antes dos ajustes (campos ausentes) desenha igual', () => {
    const NEW = ['effectSize', 'effectDirection', 'effectOpacity', 'effectPalette', 'effectColor2', 'effectArea', 'effectGlow']
    const old = Object.fromEntries(Object.entries(BASE).filter(([k]) => !NEW.includes(k)))
    const fx = backdropFx({ ...old, effect: 'rain' } as unknown as ThemeInput)!
    expect(fx.look).toMatchObject({ size: 1, direction: 'default', opacity: 1, palette: 'single', area: 'full', glow: 0 })
  })
  it('os ajustes valem no fundo do app', () => {
    const fx = backdropFx({
      ...BASE,
      effect: 'rain',
      effectSize: 100,
      effectDirection: 'left',
      effectOpacity: 40,
      effectPalette: 'rainbow',
      effectArea: 'banner',
      effectGlow: 50
    })!
    expect(fx.look).toMatchObject({ size: 2, direction: 'left', opacity: 0.4, palette: 'rainbow', area: 'banner', glow: 0.5 })
  })
  it('efeito novo também funciona no fundo do app', () => {
    expect(backdropFx({ ...BASE, effect: 'fireworks' })).toMatchObject({ id: 'fireworks', kind: 'canvas' })
  })
  it('efeito sem cor própria (confete) recebe uma cor válida', () => {
    expect(backdropFx({ ...BASE, effect: 'confetti' })!.params.color).toMatch(/^#[0-9a-f]{6}$/)
  })
})
