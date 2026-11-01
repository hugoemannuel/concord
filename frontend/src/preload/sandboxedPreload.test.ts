import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

// O preload roda com sandbox: true. Ali o require só conhece 'electron' (e
// events/timers/url): qualquer outro módulo do Node quebra a ponte inteira e
// o app abre sem window.api. Percorre os imports de verdade (não os de tipo)
// a partir do index.ts.

const IMPORT_RE = /^import\s+(?!type\b)(?:[^'"]*?from\s+)?['"]([^'"]+)['"]/gm

function resolveLocal(from: string, spec: string): string {
  const base = resolve(dirname(from), spec)
  return existsSync(`${base}.ts`) ? `${base}.ts` : join(base, 'index.ts')
}

function runtimeImports(entry: string): { bare: Set<string>; files: Set<string> } {
  const bare = new Set<string>()
  const files = new Set<string>()
  const queue = [entry]
  while (queue.length > 0) {
    const file = queue.pop() as string
    if (files.has(file)) continue
    files.add(file)
    for (const [, spec] of readFileSync(file, 'utf8').matchAll(IMPORT_RE)) {
      if (spec.startsWith('.')) queue.push(resolveLocal(file, spec))
      else bare.add(spec)
    }
  }
  return { bare, files }
}

describe('preload em sandbox', () => {
  const { bare, files } = runtimeImports(join(__dirname, 'index.ts'))

  it('só importa o electron em tempo de execução', () => {
    expect([...bare]).toEqual(['electron'])
  })

  it('não lê process.env (o main decide e passa por argumento ou IPC)', () => {
    const code = (f: string): string =>
      readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '')
    const readers = [...files].filter((f) => code(f).includes('process.env'))
    expect(readers.map((f) => f.slice(f.indexOf('src/')))).toEqual([])
  })
})
