import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import type { CastigoVote } from '../lib/castigo'

const state = vi.hoisted(() => ({
  mine: null as null | {
    effects: { speak: boolean; connect: boolean; listen: boolean }
    endsAt: number
  },
  vote: null as CastigoVote | null
}))
vi.mock('../hooks/useMyCastigo', () => ({
  useMyCastigo: () => state.mine,
  useServerCastigosLoad: () => {}
}))
vi.mock('../hooks/useCastigoVote', () => ({
  useCastigoVote: () => ({
    vote: state.vote,
    ballot: 'not_voter',
    isTarget: false,
    busy: false,
    cast: vi.fn()
  })
}))
vi.mock('./CastigoModal', () => ({ default: () => <i data-modal /> }))
vi.mock('./CastigoVoteCard', () => ({ default: () => <i data-vote /> }))
vi.mock('./CastigoSelfNotice', () => ({ default: () => <i data-self /> }))

import CastigoHost from './CastigoHost'

describe('CastigoHost', () => {
  it('sem castigo nem votação, só o modal', () => {
    const html = renderToStaticMarkup(<CastigoHost />)
    expect(html).toContain('data-modal')
    expect(html).not.toContain('data-self')
    expect(html).not.toContain('data-vote')
  })

  it('o aviso e a votação', () => {
    state.mine = { effects: { speak: true, connect: false, listen: false }, endsAt: 1 }
    state.vote = { id: 'v' } as CastigoVote
    const html = renderToStaticMarkup(<CastigoHost />)
    expect(html).toContain('data-self')
    expect(html).toContain('data-vote')
  })
})
