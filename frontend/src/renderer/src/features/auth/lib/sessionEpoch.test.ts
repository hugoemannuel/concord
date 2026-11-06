import { describe, expect, it } from 'vitest'
import { isNewSession } from './sessionEpoch'

const s = (accessToken: string | null, userId?: string) => ({
  accessToken,
  user: userId ? { id: userId } : null
})

describe('isNewSession', () => {
  it('entrar (sem token → com token) é sessão nova', () => {
    expect(isNewSession(s(null), s('A'))).toBe(true)
  })

  it('sair (com token → sem token) é sessão nova', () => {
    expect(isNewSession(s('A', 'ana'), s(null))).toBe(true)
  })

  it('renovar o token da mesma conta não é', () => {
    expect(isNewSession(s('A', 'ana'), s('B', 'ana'))).toBe(false)
    expect(isNewSession(s('A'), s('B'))).toBe(false)
  })

  it('carregar a conta depois do login não é', () => {
    expect(isNewSession(s('A'), s('A', 'ana'))).toBe(false)
  })

  it('trocar de conta sem passar pelo logout (outra aba) é', () => {
    expect(isNewSession(s('A', 'ana'), s('B', 'bia'))).toBe(true)
  })

  it('continuar sem login não é', () => {
    expect(isNewSession(s(null), s(null))).toBe(false)
  })
})
