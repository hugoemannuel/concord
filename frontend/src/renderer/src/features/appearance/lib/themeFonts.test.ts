import { describe, expect, it } from 'vitest'
import { FONT_OPTIONS, fontPreviewFamily, fontStack } from './themeFonts'
import { FONTS } from './themeInput'

describe('themeFonts', () => {
  it('cada fonte aceita tem nome e pilha, sem repetir', () => {
    expect(FONT_OPTIONS.map((f) => f.id).sort()).toEqual([...FONTS].sort())
    expect(new Set(FONT_OPTIONS.map((f) => f.label)).size).toBe(FONT_OPTIONS.length)
    expect(FONT_OPTIONS.length).toBeGreaterThanOrEqual(10)
  })

  it('a embutida vem primeiro e cai numa genérica do mesmo estilo', () => {
    expect(fontStack('montserrat')).toMatch(/^'Montserrat', .*sans-serif/)
    expect(fontStack('zilla')).toMatch(/^'Zilla Slab', .*serif/)
    expect(fontStack('spacemono')).toMatch(/^'Space Mono', .*monospace/)
  })

  it('a padrão não troca a fonte (nem no chip, que usa a do app)', () => {
    expect(fontStack('outfit')).toBeNull()
    expect(fontPreviewFamily('outfit')).toBeUndefined()
    expect(fontPreviewFamily('bitter')).toMatch(/^'Bitter'/)
  })
})
