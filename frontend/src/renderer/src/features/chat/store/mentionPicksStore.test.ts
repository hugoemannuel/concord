import { beforeEach, describe, expect, it } from 'vitest'
import { picksOf, useMentionPicksStore } from './mentionPicksStore'

beforeEach(() => useMentionPicksStore.setState({ byRoom: {} }))

describe('mentionPicksStore', () => {
  it('guarda os cargos escolhidos por sala', () => {
    const { update } = useMentionPicksStore.getState()
    update('channel:a', (p) => ({ ...p, suporte: 'r1' }))
    update('channel:b', (p) => ({ ...p, mod: 'r2' }))
    expect(picksOf(useMentionPicksStore.getState(), 'channel:a')).toEqual({ suporte: 'r1' })
    expect(picksOf(useMentionPicksStore.getState(), 'channel:b')).toEqual({ mod: 'r2' })
  })

  it('sala sem escolha: sempre o mesmo objeto vazio', () => {
    const state = useMentionPicksStore.getState()
    expect(picksOf(state, 'channel:x')).toEqual({})
    expect(picksOf(state, 'channel:x')).toBe(picksOf(state, 'channel:y'))
  })

  it('atualização que devolve as mesmas escolhas não troca o estado', () => {
    const { update } = useMentionPicksStore.getState()
    update('channel:a', (p) => ({ ...p, suporte: 'r1' }))
    const before = useMentionPicksStore.getState().byRoom
    update('channel:a', (p) => p)
    expect(useMentionPicksStore.getState().byRoom).toBe(before)
  })
})
