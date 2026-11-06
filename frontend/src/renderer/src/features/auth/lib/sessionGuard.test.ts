import { beforeEach, describe, expect, it, vi } from 'vitest'

// O persist do authStore lê window.localStorage ao criar o store: instala antes do import.
const storage = vi.hoisted(() => {
  const data = new Map<string, string>()
  const mem = {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
    clear: () => data.clear(),
    key: (i: number) => [...data.keys()][i] ?? null,
    get length() {
      return data.size
    }
  }
  vi.stubGlobal('window', { localStorage: mem, addEventListener: () => {} })
  return mem
})

import { useAuthStore, type User } from '../store/authStore'
import { AUTH_STORAGE_KEY } from './authRefresh'
import { sessionGuard } from './sessionGuard'

const user = (id: string) => ({ id }) as User

beforeEach(() => {
  useAuthStore.getState().clear()
  useAuthStore.getState().setTokens('A', 'R1')
  useAuthStore.getState().setUser(user('ana'))
})

describe('sessionGuard', () => {
  it('renovar o token no meio da requisição (401 → refresh) mantém a sessão', () => {
    const sameSession = sessionGuard()
    useAuthStore.getState().setTokens('B', 'R2')
    expect(sameSession()).toBe(true)
  })

  it('sair no meio da requisição descarta a resposta', () => {
    const sameSession = sessionGuard()
    useAuthStore.getState().clear()
    expect(sameSession()).toBe(false)
  })

  it('sair e entrar de novo também é outra sessão', () => {
    const sameSession = sessionGuard()
    useAuthStore.getState().clear()
    useAuthStore.getState().setTokens('C', 'R3')
    expect(sameSession()).toBe(false)
  })

  it('entrar como visitante (setState direto) é outra sessão', () => {
    useAuthStore.getState().clear()
    const sameSession = sessionGuard()
    useAuthStore.setState({ accessToken: 'guest', refreshToken: null })
    expect(sameSession()).toBe(false)
  })

  it('outra aba: renovação mantém, troca de conta não', async () => {
    const saved = (accessToken: string, id: string): string =>
      JSON.stringify({ state: { accessToken, refreshToken: 'R', user: user(id) }, version: 0 })
    const sameSession = sessionGuard()

    storage.setItem(AUTH_STORAGE_KEY, saved('B', 'ana'))
    await useAuthStore.persist.rehydrate()
    expect(sameSession()).toBe(true)

    storage.setItem(AUTH_STORAGE_KEY, saved('C', 'bia'))
    await useAuthStore.persist.rehydrate()
    expect(sameSession()).toBe(false)
  })

  it('a época não vai para o armazenamento (cada aba conta a sua)', () => {
    const saved = storage.getItem(AUTH_STORAGE_KEY) ?? ''
    expect(saved).toContain('R1')
    expect(saved).not.toContain('sessionEpoch')
  })
})
