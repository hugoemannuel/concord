import { afterEach, describe, expect, it, vi } from 'vitest'
import { writeStyleSheet } from './themeStyleSheet'

afterEach(() => vi.unstubAllGlobals())

function fakeDocument(): { head: { children: Array<{ id: string; textContent: string }> } } & Record<string, unknown> {
  const head = { children: [] as Array<{ id: string; textContent: string }>, appendChild: (el: never) => head.children.push(el) }
  return {
    head,
    getElementById: (id: string) => head.children.find((el) => el.id === id) ?? null,
    createElement: () => ({ id: '', textContent: '' })
  }
}

describe('writeStyleSheet', () => {
  it('cria o <style> uma vez e troca o conteúdo depois', () => {
    const doc = fakeDocument()
    vi.stubGlobal('document', doc)
    writeStyleSheet('x', 'a {}')
    writeStyleSheet('x', 'b {}')
    writeStyleSheet('x', 'b {}')
    expect(doc.head.children).toEqual([{ id: 'x', textContent: 'b {}' }])
  })

  it('sem documento (testes, main), não faz nada', () => {
    expect(() => writeStyleSheet('x', 'a {}')).not.toThrow()
  })
})
