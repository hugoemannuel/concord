import { afterEach, describe, expect, it, vi } from 'vitest'
import { readSeenVersion, SEEN_VERSION_KEY, writeSeenVersion } from './seenVersion'

function memoryStorage(): Pick<Storage, 'getItem' | 'setItem'> {
  const data = new Map<string, string>()
  return {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => void data.set(key, value)
  }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('versão vista nas novidades', () => {
  it('guarda e lê do aparelho', () => {
    const storage = memoryStorage()
    vi.stubGlobal('localStorage', storage)
    expect(readSeenVersion()).toBeNull()
    writeSeenVersion('1.2.0')
    expect(storage.getItem(SEEN_VERSION_KEY)).toBe('1.2.0')
    expect(readSeenVersion()).toBe('1.2.0')
  })

  it('armazenamento bloqueado não quebra o app', () => {
    const blocked = (): never => {
      throw new Error('bloqueado')
    }
    vi.stubGlobal('localStorage', { getItem: blocked, setItem: blocked })
    expect(readSeenVersion()).toBeNull()
    expect(() => writeSeenVersion('1.0.0')).not.toThrow()
  })
})
