import { describe, expect, it } from 'vitest'
import {
  activeEffects,
  ballotState,
  canApplyDirect,
  castigoEndsAt,
  hasAnyPower,
  personName,
  voteView,
  type Castigo,
  type CastigoVote
} from './castigo'

const now = Date.parse('2026-11-09T12:00:00Z')
const at = (min: number): string => new Date(now + min * 60_000).toISOString()

const castigo = (over: Partial<Castigo>): Castigo => ({
  server_id: 's',
  user_id: 'u',
  speak_until: null,
  connect_until: null,
  listen_until: null,
  ...over
})

describe('activeEffects e castigoEndsAt', () => {
  it('só o que ainda não venceu', () => {
    const c = castigo({ speak_until: at(5), listen_until: at(-1) })
    expect(activeEffects(c, now)).toEqual({ speak: true, connect: false, listen: false })
    expect(castigoEndsAt(c, now)).toBe(now + 5 * 60_000)
  })

  it('o fim é o efeito que vai mais longe', () => {
    expect(castigoEndsAt(castigo({ speak_until: at(5), connect_until: at(60) }), now)).toBe(
      now + 3_600_000
    )
  })

  it('sem castigo ou vencido', () => {
    expect(activeEffects(undefined, now)).toEqual({ speak: false, connect: false, listen: false })
    expect(castigoEndsAt(castigo({ speak_until: at(-1) }), now)).toBeNull()
    expect(castigoEndsAt(null, now)).toBeNull()
    expect(activeEffects(castigo({ speak_until: 'lixo' }), now).speak).toBe(false)
  })
})

describe('canApplyDirect', () => {
  const all = { canMute: true, canDeafen: true, canDisconnect: true }

  it('pede a moderação de cada efeito', () => {
    expect(
      canApplyDirect({ speak: true, connect: false, listen: false }, { ...all, canDeafen: false })
    ).toBe(true)
    expect(
      canApplyDirect({ speak: false, connect: false, listen: true }, { ...all, canDeafen: false })
    ).toBe(false)
    expect(
      canApplyDirect(
        { speak: false, connect: true, listen: false },
        { ...all, canDisconnect: false }
      )
    ).toBe(false)
    expect(canApplyDirect({ speak: true, connect: true, listen: true }, all)).toBe(true)
  })

  it('sem efeito não aplica', () => {
    expect(canApplyDirect({ speak: false, connect: false, listen: false }, all)).toBe(false)
  })

  it('hasAnyPower', () => {
    expect(hasAnyPower({ canMute: false, canDeafen: false, canDisconnect: false })).toBe(false)
    expect(hasAnyPower({ canMute: false, canDeafen: true, canDisconnect: false })).toBe(true)
  })
})

describe('ballotState', () => {
  const vote = { voters: ['a', 'b', 'c'], yes: ['a'], no: ['b'] } as unknown as CastigoVote

  it('onde cada um está', () => {
    expect(ballotState(vote, 'a')).toBe('voted_yes')
    expect(ballotState(vote, 'b')).toBe('voted_no')
    expect(ballotState(vote, 'c')).toBe('can_vote')
    expect(ballotState(vote, 'z')).toBe('not_voter')
    expect(ballotState(vote, undefined)).toBe('not_voter')
  })
})

describe('voteView e personName', () => {
  const vote = {
    voters: ['a', 'b'],
    yes: ['a'],
    no: [],
    target_id: 't',
    status: 'open'
  } as unknown as CastigoVote

  it('o que a votação mostra para mim', () => {
    expect(voteView(null, 'a')).toEqual({ ballot: 'not_voter', isTarget: false, closed: false })
    expect(voteView(vote, 'b')).toEqual({ ballot: 'can_vote', isTarget: false, closed: false })
    expect(voteView({ ...vote, status: 'passed' }, 't')).toEqual({
      ballot: 'not_voter',
      isTarget: true,
      closed: true
    })
  })

  it('nome da call, depois o do servidor', () => {
    const call = [
      { id: 'a', username: 'ana', display_name: 'Ana' },
      { id: 'z', username: 'zé', display_name: '' }
    ]
    const members = [
      { user_id: 'b', username: 'bia', display_name: 'Bia', nickname: 'Bibi' },
      { user_id: 'c', username: 'caio', display_name: '' }
    ]
    expect(personName('a', call, members)).toBe('Ana')
    expect(personName('z', call, members)).toBe('zé')
    expect(personName('b', call, members)).toBe('Bibi')
    expect(personName('c', call, members)).toBe('caio')
    expect(personName('x', call, members)).toBe('Alguém')
  })
})
