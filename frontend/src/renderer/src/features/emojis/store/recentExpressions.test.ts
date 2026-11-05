import { beforeEach, describe, expect, it, vi } from 'vitest'
import { rankedRecent, resetRecentExpressions, useRecentExpressions } from './recentExpressions'

function fakeStorage(): Storage {
  const data = new Map<string, string>()
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
    clear: () => data.clear(),
    key: () => null,
    get length() {
      return data.size
    }
  }
}

beforeEach(() => {
  vi.stubGlobal('localStorage', fakeStorage())
  resetRecentExpressions()
})

describe('recentExpressions', () => {
  it('registra por tipo e guarda para a próxima sessão, por conta', () => {
    const store = useRecentExpressions.getState()
    store.load('ana')
    store.record('emoji', 'custom:e1')
    store.record('sticker', 's1')
    expect(rankedRecent(useRecentExpressions.getState().emoji)).toEqual(['custom:e1'])

    resetRecentExpressions()
    useRecentExpressions.getState().load('ana')
    expect(rankedRecent(useRecentExpressions.getState().emoji)).toEqual(['custom:e1'])
    expect(rankedRecent(useRecentExpressions.getState().sticker)).toEqual(['s1'])

    useRecentExpressions.getState().load('bia')
    expect(rankedRecent(useRecentExpressions.getState().emoji)).toEqual([])
  })

  it('dado estragado no armazenamento vira lista vazia', () => {
    localStorage.setItem('salinha:recent-expressions:ana', '{nem json')
    useRecentExpressions.getState().load('ana')
    expect(useRecentExpressions.getState().emoji).toEqual({})
  })

  it('sem armazenamento disponível continua funcionando', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('bloqueado')
      },
      setItem: () => {
        throw new Error('bloqueado')
      }
    })
    useRecentExpressions.getState().load('ana')
    useRecentExpressions.getState().record('emoji', '👍')
    expect(rankedRecent(useRecentExpressions.getState().emoji)).toEqual(['👍'])
  })
})
