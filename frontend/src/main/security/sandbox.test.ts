import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { SANDBOXED_PREFERENCES } from './sandbox'

const MAIN_DIR = join(__dirname, '..')

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return sourceFiles(path)
    return /\.ts$/.test(name) && !/\.test\.ts$/.test(name) ? [path] : []
  })
}

describe('sandbox das janelas', () => {
  it('as preferências comuns ligam sandbox e isolamento, sem Node', () => {
    expect(SANDBOXED_PREFERENCES).toEqual({
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false
    })
  })

  it('nenhuma janela do main desliga o sandbox nem liga o Node', () => {
    const offenders = sourceFiles(MAIN_DIR).filter((file) =>
      /sandbox:\s*false|nodeIntegration:\s*true|contextIsolation:\s*false/.test(
        readFileSync(file, 'utf8')
      )
    )
    expect(offenders).toEqual([])
  })

  it('toda webPreferences do main usa as preferências comuns ou sandbox: true', () => {
    const missing = sourceFiles(MAIN_DIR).filter((file) => {
      const src = readFileSync(file, 'utf8')
      if (!/webPreferences:\s*\{/.test(src)) return false
      return !/\.\.\.SANDBOXED_PREFERENCES|sandbox:\s*true/.test(src)
    })
    expect(missing).toEqual([])
  })
})
