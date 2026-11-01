import { describe, expect, it } from 'vitest'
import { parseThemeCss, THEME_TOKENS } from '../../settings/lib/themes'
import { PRESET_SEEDS } from './presetSeeds'
import { customThemesCss } from './themeCss'

describe('customThemesCss', () => {
  const css = customThemesCss([
    { key: 'custom-abc', input: PRESET_SEEDS['discord-dark'] },
    { key: 'custom-neo', input: { ...PRESET_SEEDS['discord-dark'], glow: '#dc2626', glass: 50 } },
    { key: 'custom-luz', input: PRESET_SEEDS['discord-light'] },
    {
      key: 'custom-deg',
      input: {
        ...PRESET_SEEDS['discord-light'],
        gradients: { accent: { type: 'linear', angle: 135, colors: ['#b91c1c'] } },
        radius: 0,
        density: 'compact',
        font: 'serif'
      }
    }
  ])
  // Só os blocos principais (os @media trocam valores em casos especiais).
  const parsed = parseThemeCss(css.replace(/@media[^{]*\{[^{}]*\{[^{}]*\}\s*\}/g, ''))

  it('um bloco por tema, com todos os tokens', () => {
    expect(Object.keys(parsed).sort()).toEqual(['custom-abc', 'custom-deg', 'custom-luz', 'custom-neo'])
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

  it('sem degradê nem vidro: preenchimentos vazios, sem desfoque', () => {
    expect(parsed['custom-abc']['fill-primary']).toBe('none')
    expect(parsed['custom-abc']['panel-backdrop']).toBe('none')
    expect(parsed['custom-abc']['app-image']).toBe('none')
  })

  it('degradê do destaque vira o preenchimento dos botões (e o hover)', () => {
    expect(parsed['custom-deg']['fill-brand']).toMatch(/^linear-gradient\(135deg, #[0-9a-f]{6}, #b91c1c\)$/)
    expect(parsed['custom-deg']['fill-brand-hover']).toMatch(/^linear-gradient\(135deg,/)
  })

  it('vidro: janela pintada, desfoque e versão opaca para menos transparência', () => {
    expect(parsed['custom-neo']['panel-backdrop']).toBe('blur(10px)')
    expect(parsed['custom-neo']['app-image']).toMatch(/^linear-gradient\(/)
    expect(css).toContain("@media (prefers-reduced-transparency: reduce) { [data-theme='custom-neo'] {")
  })

  it('forma: cantos, densidade só com mouse e fonte', () => {
    expect(parsed['custom-deg']['radius-lg']).toBe('0rem')
    expect(parsed['custom-deg']['font-sans']).toMatch(/^Georgia/)
    expect(css).toContain("@media (pointer: fine) { [data-theme='custom-deg'] { --spacing: 0.225rem; } }")
  })

  it('lista vazia, CSS vazio', () => {
    expect(customThemesCss([])).toBe('')
  })
})
