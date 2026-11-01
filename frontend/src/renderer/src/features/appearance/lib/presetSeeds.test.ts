import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { colorDistance } from '../../../shared/lib/colorDiff'
import { parseThemeCss, THEMES } from '../../settings/lib/themes'
import { PRESET_SEEDS } from './presetSeeds'

describe('sementes dos temas prontos', () => {
  const css = readFileSync(join(__dirname, '../../../assets/theme.css'), 'utf8')
  const parsed = parseThemeCss(css)

  it.each(THEMES.map((t) => t.id))('%s: as cores batem com o theme.css', (id) => {
    const seed = PRESET_SEEDS[id]
    const tokens = parsed[id]
    const pairs: Array<[string, string]> = [
      [seed.accent, tokens.brand],
      [seed.background, tokens['bg-primary']],
      [seed.sidebar, tokens['bg-secondary']],
      [seed.card, tokens['bg-surface']],
      [seed.text, tokens['text-normal']]
    ]
    for (const [mine, real] of pairs) {
      expect(colorDistance(mine, real, tokens['bg-app']), `${mine} vs ${real}`).toBeLessThanOrEqual(1)
    }
  })
})
