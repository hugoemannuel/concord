import { describe, expect, it } from 'vitest'
import { buildPalette } from './palette'
import { paletteFromColor, STARTERS } from './starters'
import { withDefaults } from './themeInput'

describe('STARTERS', () => {
  it('tem o vermelho e branco da issue #486, claro e com degradê', () => {
    const red = STARTERS.find((s) => s.id === 'vermelho-branco')!
    const p = buildPalette(red.input)
    expect(p.scheme).toBe('light')
    expect(p.fills.brand.stops.length).toBe(2)
  })

  it.each(STARTERS.map((s) => [s.label, s] as const))('%s: as cores escolhidas já servem (nada ajustado)', (_l, s) => {
    expect(buildPalette(s.input).adjusted).toEqual([])
  })
})

describe('paletteFromColor', () => {
  it.each(['#dc2626', '#22c55e', '#3b82f6', '#facc15', '#a855f7', '#808080'])('%s: escuro e claro', (color) => {
    for (const scheme of ['dark', 'light'] as const) {
      const input = { ...withDefaults({ ...paletteFromColor(color, scheme) }), ...paletteFromColor(color, scheme) }
      const p = buildPalette(input)
      expect(p.scheme).toBe(scheme)
      expect(p.adjusted).not.toContain('background')
      expect(p.adjusted).not.toContain('sidebar')
      expect(input.accent).toBe(color)
    }
  })
})
