import { describe, expect, it, vi } from 'vitest'
import type { User } from '../store/authStore'
import { refreshMe, shouldRecheckOnFocus } from './accountRefresh'

function saved(over: Partial<User> = {}): User {
  return {
    id: 'u1',
    username: 'ana',
    display_name: 'Ana',
    email: 'ana@salinha.app',
    email_verified: false,
    created_at: '',
    updated_at: '',
    ...over
  }
}

describe('refreshMe', () => {
  it('grava a conta do servidor: o e-mail confirmado em outro lugar chega aqui', async () => {
    const commit = vi.fn()
    const fresh = saved({ email_verified: true })
    await refreshMe({ getMe: async () => fresh, current: () => saved(), commit })
    expect(commit).toHaveBeenCalledWith(fresh)
  })

  it('sem conexão, fica com a cópia salva e não lança', async () => {
    const commit = vi.fn()
    const getMe = (): Promise<User> => Promise.reject(new TypeError('Failed to fetch'))
    await expect(refreshMe({ getMe, current: () => saved(), commit })).resolves.toBeUndefined()
    expect(commit).not.toHaveBeenCalled()
  })

  it('saiu ou trocou de conta enquanto relia: descarta a resposta', async () => {
    const commit = vi.fn()
    const getMe = async (): Promise<User> => saved({ email_verified: true })
    await refreshMe({ getMe, current: () => null, commit })
    await refreshMe({ getMe, current: () => saved({ id: 'outra' }), commit })
    expect(commit).not.toHaveBeenCalled()
  })
})

describe('shouldRecheckOnFocus', () => {
  it('só enquanto o servidor diz que o e-mail não foi confirmado', () => {
    expect(shouldRecheckOnFocus(saved({ email_verified: false }))).toBe(true)
    expect(shouldRecheckOnFocus(saved({ email_verified: true }))).toBe(false)
    expect(shouldRecheckOnFocus(saved({ email_verified: undefined }))).toBe(false)
    expect(shouldRecheckOnFocus(null)).toBe(false)
  })
})
