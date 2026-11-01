import { describe, expect, it } from 'vitest'
import { parseThemeCss, THEME_TOKENS } from '../../settings/lib/themes'
import { PRESET_SEEDS } from './customThemes'
import { customThemesCss } from './themeCss'

describe('customThemesCss', () => {
  const css = customThemesCss([
    { key: 'custom-abc', input: PRESET_SEEDS['discord-dark'] },
    { key: 'custom-neo', input: { ...PRESET_SEEDS['discord-dark'], glow: '#dc2626' } },
    { key: 'custom-luz', input: PRESET_SEEDS['discord-light'] }
  ])
  const parsed = parseThemeCss(css)

  it('um bloco por tema, com todos os tokens', () => {
    expect(Object.keys(parsed).sort()).toEqual(['custom-abc', 'custom-luz', 'custom-neo'])
    for (const token of THEME_TOKENS) expect(parsed['custom-abc'][token], token).toBeDefined()
  })

  it('diz se é claro ou escuro (color-scheme)', () => {
    expect(css).toMatch(/\[data-theme='custom-abc'\] \{ color-scheme: dark;/)
    expect(css).toMatch(/\[data-theme='custom-luz'\] \{ color-scheme: light;/)
  })

  it('com brilho: liga o fundo animado e pinta as bolhas', () => {
    expect(css).toContain("[data-theme='custom-neo'] .app-decor { display: block; }")
    expect(parsed['custom-neo']['hero-1']).toBe('#dc2626')
    expect(css).not.toContain("[data-theme='custom-abc'] .app-decor")
  })

  it('lista vazia, CSS vazio', () => {
    expect(customThemesCss([])).toBe('')
  })
})
