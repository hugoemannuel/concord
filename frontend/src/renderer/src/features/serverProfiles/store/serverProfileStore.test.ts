import { beforeEach, describe, expect, it } from 'vitest'
import { useServerProfileStore } from './serverProfileStore'

const state = () => useServerProfileStore.getState()

beforeEach(() => state().reset())

describe('serverProfileStore', () => {
  it('guarda só quem tem perfil, por servidor', () => {
    state().ingestMembers('s1', [{ user_id: 'a', server_profile: { bio: 'x' } }, { user_id: 'b' }])
    expect(state().byServer.s1).toEqual({ a: { bio: 'x' } })
    expect(state().byServer.s2).toBeUndefined()
  })

  it('isolamento: o perfil de um servidor não aparece em outro', () => {
    state().apply('s1', 'a', { bio: 'no s1' })
    expect(state().byServer.s2?.a).toBeUndefined()
  })

  it('lista igual não troca os objetos (sem redesenho à toa)', () => {
    state().ingestMembers('s1', [{ user_id: 'a', server_profile: { bio: 'x' } }])
    const before = state().byServer.s1
    const profileBefore = before.a
    state().ingestMembers('s1', [{ user_id: 'a', server_profile: { bio: 'x' } }])
    expect(state().byServer.s1).toBe(before)
    state().ingestMembers('s1', [
      { user_id: 'a', server_profile: { bio: 'x' } },
      { user_id: 'b', server_profile: { bio: 'y' } }
    ])
    expect(state().byServer.s1.a).toBe(profileBefore)
    expect(state().byServer.s1.b).toEqual({ bio: 'y' })
  })

  it('tirar da lista esquece o perfil', () => {
    state().ingestMembers('s1', [{ user_id: 'a', server_profile: { bio: 'x' } }])
    state().ingestMembers('s1', [{ user_id: 'a' }])
    expect(state().byServer.s1).toEqual({})
  })

  it('apply troca, tira e ignora o que não mudou', () => {
    const before = state().byServer
    state().apply('s1', 'a', null)
    expect(state().byServer).toBe(before)
    state().apply('s1', 'a', { bio: 'x' })
    const withProfile = state().byServer
    state().apply('s1', 'a', { bio: 'x' })
    expect(state().byServer).toBe(withProfile)
    state().apply('s1', 'a', undefined)
    expect(state().byServer.s1.a).toBeUndefined()
  })

  it('forgetServer solta o servidor', () => {
    state().apply('s1', 'a', { bio: 'x' })
    state().forgetServer('s1')
    state().forgetServer('s1')
    expect(state().byServer.s1).toBeUndefined()
  })
})
