import { describe, expect, it } from 'vitest'
import { cardServerProfile, openServerOf } from './useCardServerProfile'

const input = {
  userId: 'u1',
  openServerId: 's1' as string | null,
  profile: { bio: 'x' } as { bio: string } | undefined,
  globalFor: null as string | null
}

describe('openServerOf', () => {
  it('só vale com o servidor aberto na tela', () => {
    expect(openServerOf('s1', '/servers/s1/channels/c1')).toBe('s1')
    expect(openServerOf('s1', '/dms/1')).toBeNull()
    expect(openServerOf('s1', '/servers/s2')).toBeNull()
    expect(openServerOf(undefined, '/servers/s1')).toBeNull()
  })
})

describe('cardServerProfile', () => {
  it('sem perfil no servidor nada muda no cartão', () => {
    const card = cardServerProfile({ ...input, profile: undefined })
    expect(card.available).toBe(false)
    expect(card.showingGlobal).toBe(false)
    expect(card.profile).toBeUndefined()
    expect(card.scopeId).toBe('s1')
  })

  it('com perfil, mostra o do servidor e oferece o global', () => {
    const card = cardServerProfile(input)
    expect(card.available).toBe(true)
    expect(card.profile).toEqual({ bio: 'x' })
    expect(card.nextGlobalFor).toBe('u1')
  })

  it('pedindo o global, o escopo some e dá para voltar', () => {
    const card = cardServerProfile({ ...input, globalFor: 'u1' })
    expect(card.showingGlobal).toBe(true)
    expect(card.profile).toBeUndefined()
    expect(card.scopeId).toBeNull()
    expect(card.nextGlobalFor).toBeNull()
  })

  it('o pedido era de outra pessoa: volta ao perfil do servidor', () => {
    const card = cardServerProfile({ ...input, userId: 'u2', globalFor: 'u1' })
    expect(card.showingGlobal).toBe(false)
    expect(card.scopeId).toBe('s1')
  })
})
