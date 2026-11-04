import { describe, expect, it } from 'vitest'
import { DEFAULT_PROFILE_THEME } from '../../profile/lib/profileTheme'
import {
  borderTunable,
  effectOptions,
  effectTuning,
  glowLabel,
  levelLabel,
  withEffect,
  withOriginalColor
} from './themeEditor'

describe('themeEditor', () => {
  it('trocar de efeito zera a cor escolhida', () => {
    const t = withEffect({ ...DEFAULT_PROFILE_THEME, effect_color: '#123456' }, 'fire')
    expect(t.effect).toBe('fire')
    expect(t.effect_color).toBe('')
  })
  it('opções do efeito', () => {
    expect(effectOptions(DEFAULT_PROFILE_THEME)).toEqual({ tunable: false, color: null })
    expect(effectOptions({ ...DEFAULT_PROFILE_THEME, effect: 'fire' })).toEqual({
      tunable: true,
      color: '#ff7a1a'
    })
    expect(
      effectOptions({ ...DEFAULT_PROFILE_THEME, effect: 'fire', effect_color: '#000000' }).color
    ).toBe('#000000')
    expect(effectOptions({ ...DEFAULT_PROFILE_THEME, effect: 'confetti' })).toEqual({
      tunable: true,
      color: null
    })
  })
  it('trocar de efeito solta a segunda cor e a direção, e mantém o resto', () => {
    const t = withEffect(
      {
        ...DEFAULT_PROFILE_THEME,
        effect_color2: '#123456',
        effect_direction: 'left',
        effect_size: 80,
        effect_glow: 30
      },
      'clouds'
    )
    expect(t).toMatchObject({
      effect_color2: '',
      effect_direction: 'default',
      effect_size: 80,
      effect_glow: 30
    })
  })
  it('usar a cor original também desfaz a mistura', () => {
    const t = withOriginalColor({
      ...DEFAULT_PROFILE_THEME,
      effect_color: '#111111',
      effect_color2: '#222222',
      effect_palette: 'rainbow'
    })
    expect(t).toMatchObject({ effect_color: '', effect_color2: '', effect_palette: 'single' })
  })
  it('cada efeito expõe só o que faz sentido', () => {
    const of = (effect: string): ReturnType<typeof effectTuning> =>
      effectTuning({ ...DEFAULT_PROFILE_THEME, effect })
    expect(of('rain')).toMatchObject({ size: true, glow: true, palette: true })
    expect(of('rain').directions).toEqual(['default', 'up', 'down', 'left', 'right'])
    expect(of('clouds').directions).toEqual(['default', 'left', 'right'])
    expect(of('fire').directions).toEqual([])
    expect(of('glitch')).toMatchObject({ size: false, glow: false, palette: false })
    expect(of('confetti')).toMatchObject({ palette: false, glow: false })
  })
  it('a segunda cor sai automática até a pessoa escolher', () => {
    const auto = effectTuning({ ...DEFAULT_PROFILE_THEME, effect: 'rain' }).color2
    expect(auto).toMatch(/^#[0-9a-f]{6}$/)
    expect(
      effectTuning({ ...DEFAULT_PROFILE_THEME, effect: 'rain', effect_color2: '#123456' }).color2
    ).toBe('#123456')
  })
  it('rótulo do brilho', () => {
    expect(glowLabel(0)).toBe('Desligado')
    expect(glowLabel(40)).toBe('40%')
  })
  it('borda e níveis', () => {
    expect(borderTunable(DEFAULT_PROFILE_THEME)).toBe(false)
    expect(borderTunable({ ...DEFAULT_PROFILE_THEME, border: 'neon' })).toBe(true)
    expect(levelLabel(10)).toBe('Baixa')
    expect(levelLabel(50)).toBe('Média')
    expect(levelLabel(90)).toBe('Alta')
  })
})
