import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { describe, expect, it } from 'vitest'
import { moveSourceMaps, SOURCEMAP_BUILD } from './vite.renderer.shared'

describe('source maps fora da saída (docs/adr/0068)', () => {
  it('build "hidden" e sem o código-fonte', () => {
    expect(SOURCEMAP_BUILD.sourcemap).toBe('hidden')
    expect(SOURCEMAP_BUILD.rollupOptions.output.sourcemapExcludeSources).toBe(true)
  })

  it('move os .map para a pasta própria, achatados e sem sourcesContent', () => {
    const base = mkdtempSync(join(tmpdir(), 'sourcemaps-'))
    const out = join(base, 'out')
    const dest = join(base, 'sourcemaps')
    mkdirSync(join(out, 'assets'), { recursive: true })
    writeFileSync(join(out, 'assets', 'index-abc.js'), 'código')
    writeFileSync(
      join(out, 'assets', 'index-abc.js.map'),
      JSON.stringify({ version: 3, sources: ['a.ts'], sourcesContent: ['segredo'], mappings: 'AAAA' })
    )

    const moved = moveSourceMaps(out, ['assets/index-abc.js', 'assets/index-abc.js.map'], dest)

    expect(moved).toEqual([join(dest, 'index-abc.js.map')])
    expect(existsSync(join(out, 'assets', 'index-abc.js.map'))).toBe(false)
    expect(existsSync(join(out, 'assets', 'index-abc.js'))).toBe(true)
    expect(JSON.parse(readFileSync(join(dest, 'index-abc.js.map'), 'utf8'))).toEqual({
      version: 3,
      sources: ['a.ts'],
      mappings: 'AAAA'
    })
  })

  it('sem .map não cria a pasta', () => {
    const base = mkdtempSync(join(tmpdir(), 'sourcemaps-'))
    expect(moveSourceMaps(base, ['index.html'], join(base, 'sourcemaps'))).toEqual([])
    expect(existsSync(join(base, 'sourcemaps'))).toBe(false)
  })
})
