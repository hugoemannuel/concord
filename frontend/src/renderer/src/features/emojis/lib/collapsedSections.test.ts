import { beforeEach, describe, expect, it, vi } from 'vitest'
import { isCollapsed, resetCollapsedSections, setCollapsed } from './collapsedSections'

beforeEach(() => {
  const data = new Map<string, string>()
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v)
  })
  resetCollapsedSections()
})

describe('collapsedSections', () => {
  it('lembra entre as aberturas', () => {
    setCollapsed('emoji:s1', true)
    resetCollapsedSections()
    expect(isCollapsed('emoji:s1')).toBe(true)
    setCollapsed('emoji:s1', false)
    resetCollapsedSections()
    expect(isCollapsed('emoji:s1')).toBe(false)
  })

  it('dado estragado ou armazenamento bloqueado não quebra', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => '{nem json',
      setItem: () => {
        throw new Error('cheio')
      }
    })
    expect(isCollapsed('x')).toBe(false)
    setCollapsed('x', true)
    expect(isCollapsed('x')).toBe(true)
  })
})
