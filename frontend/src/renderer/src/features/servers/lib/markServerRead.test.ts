import { describe, expect, it } from 'vitest'
import { readServerPatch, type UnreadState } from './markServerRead'

const state: UnreadState = {
  channelsByServer: { s1: ['c1', 'c2'], s2: ['c3'] },
  unreadByRoom: { 'channel:c1': 3, 'channel:c2': 1, 'channel:c3': 5, 'conversation:d1': 2 },
  mentionsByRoom: { 'channel:c1': 1, 'channel:c3': 2 },
  unreadByServer: { s1: 4, s2: 5 },
  mentionsByServer: { s1: 1, s2: 2 }
}

describe('readServerPatch', () => {
  it('zera as não lidas e as menções do servidor e dos canais dele', () => {
    const p = readServerPatch(state, 's1')
    expect(p.unreadByServer.s1).toBe(0)
    expect(p.mentionsByServer.s1).toBe(0)
    expect(p.unreadByRoom['channel:c1']).toBe(0)
    expect(p.unreadByRoom['channel:c2']).toBe(0)
    expect(p.mentionsByRoom['channel:c1']).toBe(0)
  })

  it('não mexe em outro servidor nem nas conversas privadas', () => {
    const p = readServerPatch(state, 's1')
    expect(p.unreadByServer.s2).toBe(5)
    expect(p.mentionsByServer.s2).toBe(2)
    expect(p.unreadByRoom['channel:c3']).toBe(5)
    expect(p.unreadByRoom['conversation:d1']).toBe(2)
  })

  it('servidor sem canais conhecidos só zera o total dele', () => {
    const p = readServerPatch(state, 's9')
    expect(p.unreadByServer.s9).toBe(0)
    expect(p.unreadByRoom['channel:c1']).toBe(3)
  })

  it('não muda o estado de entrada', () => {
    readServerPatch(state, 's1')
    expect(state.unreadByRoom['channel:c1']).toBe(3)
  })
})
