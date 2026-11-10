import { describe, expect, it } from 'vitest'
import { castigoMenu } from './castigoMenu'

const now = Date.parse('2026-11-09T12:00:00Z')
const none = { canMute: false, canDeafen: false, canDisconnect: false }
const castigo = {
  server_id: 's',
  user_id: 'u',
  speak_until: new Date(now + 60_000).toISOString(),
  connect_until: null,
  listen_until: null
}

describe('castigoMenu', () => {
  it('na mesma call qualquer um abre (votação)', () => {
    expect(castigoMenu({ eligible: true, sharedCallId: 'c', powers: none, now })).toEqual({
      canOpen: true,
      canLift: false
    })
  })

  it('fora da call só quem modera a voz', () => {
    expect(castigoMenu({ eligible: true, powers: none, now }).canOpen).toBe(false)
    expect(castigoMenu({ eligible: true, powers: { ...none, canMute: true }, now }).canOpen).toBe(
      true
    )
  })

  it('tirar pede a moderação dos efeitos que valem', () => {
    expect(
      castigoMenu({ eligible: true, powers: { ...none, canMute: true }, castigo, now }).canLift
    ).toBe(true)
    expect(
      castigoMenu({ eligible: true, powers: { ...none, canDeafen: true }, castigo, now }).canLift
    ).toBe(false)
    expect(
      castigoMenu({
        eligible: true,
        powers: { ...none, canMute: true },
        castigo,
        now: now + 120_000
      }).canLift
    ).toBe(false)
  })

  it('alvo inválido (eu, o dono, quem não é membro) não mostra nada', () => {
    expect(
      castigoMenu({
        eligible: false,
        sharedCallId: 'c',
        powers: { ...none, canMute: true },
        castigo,
        now
      })
    ).toEqual({
      canOpen: false,
      canLift: false
    })
  })
})
