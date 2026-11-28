import { describe, expect, it } from 'vitest'
import { canMoveVoiceUser, voiceChannelOf } from './voiceMove'

describe('canMoveVoiceUser', () => {
  it('precisa de usuário autenticado, MOVE_MEMBERS no canal e cargo mais alto >= alvo', () => {
    expect(canMoveVoiceUser({ meId: 'mod', canMoveMembers: true, canModerateTarget: true })).toBe(
      true
    )
    expect(canMoveVoiceUser({ meId: 'mod', canMoveMembers: false, canModerateTarget: true })).toBe(
      false
    )
    expect(canMoveVoiceUser({ meId: 'mod', canMoveMembers: true, canModerateTarget: false })).toBe(
      false
    )
    expect(
      canMoveVoiceUser({ meId: undefined, canMoveMembers: true, canModerateTarget: true })
    ).toBe(false)
  })
})

describe('voiceChannelOf', () => {
  it('acha o canal em que a pessoa está', () => {
    const calls = {
      geral: { participants: [{ user_id: 'ana' }] },
      jogos: { participants: [{ user_id: 'bia' }, { user_id: 'caio' }] },
      vazio: undefined
    }
    expect(voiceChannelOf(calls, 'caio')).toBe('jogos')
    expect(voiceChannelOf(calls, 'duda')).toBeNull()
  })
})
