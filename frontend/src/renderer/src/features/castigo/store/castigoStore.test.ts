import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Castigo, CastigoVote } from '../lib/castigo'

const api = vi.hoisted(() => ({
  listCastigos: vi.fn(),
  currentCastigoVote: vi.fn(),
  castCastigoVote: vi.fn()
}))
vi.mock('../api/castigos', () => api)

import { ApiError } from '../../../shared/api/client'
import { useCastigoStore } from './castigoStore'

const c = (user: string): Castigo => ({
  server_id: 's',
  user_id: user,
  speak_until: '2026-11-09T12:05:00Z',
  connect_until: null,
  listen_until: null
})

describe('castigoStore', () => {
  beforeEach(() => useCastigoStore.setState({ byServer: {}, votes: {} }))

  it('load troca a lista do servidor; upsert soma ou atualiza', async () => {
    api.listCastigos.mockResolvedValue([c('ana')])
    await useCastigoStore.getState().load('s')
    useCastigoStore.getState().upsert(c('bia'))
    useCastigoStore.getState().upsert({ ...c('ana'), speak_until: null })
    const byUser = useCastigoStore.getState().byServer.s
    expect(Object.keys(byUser).sort()).toEqual(['ana', 'bia'])
    expect(byUser.ana.speak_until).toBeNull()
  })

  it('votação: lê a aberta, troca pelo evento e sai', async () => {
    const vote = { id: 'v', call_id: 'c1', status: 'open' } as CastigoVote
    api.currentCastigoVote.mockResolvedValueOnce(vote).mockResolvedValueOnce(undefined)
    await useCastigoStore.getState().loadVote('c1')
    await useCastigoStore.getState().loadVote('c2')
    expect(Object.keys(useCastigoStore.getState().votes)).toEqual(['c1'])
    useCastigoStore.getState().setVote({ ...vote, status: 'passed' })
    expect(useCastigoStore.getState().votes.c1.status).toBe('passed')
    useCastigoStore.getState().dropVote('c1')
    expect(useCastigoStore.getState().votes).toEqual({})
  })
})

describe('castigoStore.setVote', () => {
  it('a resposta atrasada do voto não reabre a votação decidida', () => {
    useCastigoStore.setState({ byServer: {}, votes: {} })
    const open = {
      id: 'v',
      call_id: 'c1',
      status: 'open',
      yes: ['a'],
      no: []
    } as unknown as CastigoVote
    useCastigoStore.getState().setVote({ ...open, status: 'passed', yes: ['a', 'b'] })
    useCastigoStore.getState().setVote({ ...open, yes: ['a', 'b'] })
    expect(useCastigoStore.getState().votes.c1.status).toBe('passed')
  })
})

describe('castigoStore.cast', () => {
  const vote = {
    id: 'v',
    call_id: 'c1',
    status: 'open',
    yes: ['a'],
    no: []
  } as unknown as CastigoVote

  it('o voto atualiza a votação', async () => {
    useCastigoStore.setState({ byServer: {}, votes: { c1: vote } })
    api.castCastigoVote.mockResolvedValueOnce({ ...vote, yes: ['a', 'b'] })
    await useCastigoStore.getState().cast(vote, true)
    expect(useCastigoStore.getState().votes.c1.yes).toEqual(['a', 'b'])
  })

  it('votação que acabou no servidor sai; outro erro não', async () => {
    useCastigoStore.setState({ byServer: {}, votes: { c1: vote } })
    api.castCastigoVote.mockRejectedValueOnce(new ApiError(500, 'x', 'internal'))
    await expect(useCastigoStore.getState().cast(vote, true)).rejects.toThrow()
    expect(useCastigoStore.getState().votes.c1).toBeDefined()
    api.castCastigoVote.mockRejectedValueOnce(new ApiError(404, 'x', 'vote_not_found'))
    await expect(useCastigoStore.getState().cast(vote, true)).rejects.toThrow()
    expect(useCastigoStore.getState().votes.c1).toBeUndefined()
  })
})
