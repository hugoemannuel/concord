import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Proposal } from '../api/proposals'

const api = {
  archiveProposal: vi.fn(),
  unarchiveProposal: vi.fn(),
  archiveAllProposals: vi.fn(),
  listArchivedProposals: vi.fn()
}
vi.mock('../api/archive', () => api)
vi.mock('../api/proposals', () => ({ listProposals: vi.fn() }))
vi.mock('../../auth/store/authStore', () => ({
  useAuthStore: { getState: () => ({ accessToken: 't', user: { id: 'eu' } }) }
}))
vi.mock('../../../shared/store/toastStore', () => ({
  showToast: { info: vi.fn(), success: vi.fn(), error: vi.fn() }
}))

const { SEARCH_DELAY_MS, useArchivedProposalStore } = await import('./archivedProposalStore')
const { useProposalStore } = await import('./proposalStore')

const card = (id: string, over: Partial<Proposal> = {}): Proposal => ({
  id,
  author_id: 'u1',
  author_name: 'Ana',
  title: `Card ${id}`,
  description: '',
  status: 'done',
  created_at: '2026-10-01T00:00:00Z',
  voting_ends_at: '2026-10-08T00:00:00Z',
  yes_votes: 0,
  no_votes: 0,
  comment_count: 0,
  images: [],
  ...over
})

const archivedCard = (id: string): Proposal => card(id, { archived_at: '2026-10-20T00:00:00Z' })
const store = (): ReturnType<typeof useArchivedProposalStore.getState> =>
  useArchivedProposalStore.getState()

beforeEach(() => {
  Object.values(api).forEach((m) => m.mockReset())
  useArchivedProposalStore.getState().reset()
  useProposalStore.getState().reset()
  useProposalStore.setState({ proposals: [card('a'), card('b'), card('c')], isTech: true })
})

describe('arquivadas: leitura', () => {
  it('carrega a primeira página e a próxima, sem repetir card', async () => {
    api.listArchivedProposals
      .mockResolvedValueOnce({ proposals: [archivedCard('x'), archivedCard('y')], has_more: true })
      .mockResolvedValueOnce({ proposals: [archivedCard('y'), archivedCard('z')], has_more: false })
    await store().fetch('')
    expect(store().items.map((p) => p.id)).toEqual(['x', 'y'])
    expect(store().hasMore && store().loaded).toBe(true)
    await store().loadMore()
    expect(api.listArchivedProposals).toHaveBeenLastCalledWith(1, '')
    expect(store().items.map((p) => p.id)).toEqual(['x', 'y', 'z'])
    expect(store().hasMore).toBe(false)
  })

  it('busca recomeça da página 0 e ignora resposta velha', async () => {
    let resolveOld: (v: unknown) => void = () => {}
    api.listArchivedProposals
      .mockReturnValueOnce(new Promise((r) => (resolveOld = r)))
      .mockResolvedValueOnce({ proposals: [archivedCard('novo')], has_more: false })
    const old = store().fetch('a')
    await store().fetch('ab')
    resolveOld({ proposals: [archivedCard('velho')], has_more: false })
    await old
    expect(store().items.map((p) => p.id)).toEqual(['novo'])
    expect(store().query).toBe('ab')
  })

  it('erro de rede não derruba: marca error e sai do carregando', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    api.listArchivedProposals.mockRejectedValue(new Error('x'))
    await store().fetch('')
    expect(store().error).toBe(true)
    expect(store().loading).toBe(false)
  })

  it('loadMore sem mais páginas não chama a API', async () => {
    await store().loadMore()
    expect(api.listArchivedProposals).not.toHaveBeenCalled()
  })
})

describe('busca e atualização', () => {
  it('digitar busca só depois da pausa, e só o último texto', async () => {
    vi.useFakeTimers()
    api.listArchivedProposals.mockResolvedValue({ proposals: [], has_more: false })
    store().setText('a')
    store().setText('ab')
    expect(store().text).toBe('ab')
    vi.advanceTimersByTime(SEARCH_DELAY_MS - 1)
    expect(api.listArchivedProposals).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    expect(api.listArchivedProposals).toHaveBeenCalledTimes(1)
    expect(api.listArchivedProposals).toHaveBeenCalledWith(0, 'ab')
    vi.useRealTimers()
  })

  it('ensureFresh carrega na primeira vez e depois só se ficou velha', async () => {
    api.listArchivedProposals.mockResolvedValue({ proposals: [archivedCard('x')], has_more: false })
    await store().ensureFresh()
    await store().ensureFresh()
    expect(api.listArchivedProposals).toHaveBeenCalledTimes(1)
    store().handleWsEvent({ type: 'proposal:archive', payload: { ids: ['a'] } })
    await store().ensureFresh()
    expect(api.listArchivedProposals).toHaveBeenCalledTimes(2)
    expect(store().stale).toBe(false)
  })
})

describe('arquivar e desarquivar', () => {
  it('arquivar tira o card do quadro e marca a lista para reler', async () => {
    api.archiveProposal.mockResolvedValue(archivedCard('a'))
    await store().archive('a')
    expect(useProposalStore.getState().proposals.map((p) => p.id)).toEqual(['b', 'c'])
    expect(store().stale).toBe(true)
  })

  it('em lote tira todas as ids devolvidas', async () => {
    api.archiveAllProposals.mockResolvedValue(['a', 'c'])
    expect(await store().archiveAll('done')).toBe(2)
    expect(api.archiveAllProposals).toHaveBeenCalledWith('done')
    expect(useProposalStore.getState().proposals.map((p) => p.id)).toEqual(['b'])
  })

  it('desarquivar devolve o card ao quadro e tira da lista de arquivadas', async () => {
    api.listArchivedProposals.mockResolvedValue({ proposals: [archivedCard('x')], has_more: false })
    await store().fetch('')
    api.unarchiveProposal.mockResolvedValue(card('x'))
    await store().unarchive('x')
    expect(store().items).toEqual([])
    expect(useProposalStore.getState().proposals.map((p) => p.id)).toContain('x')
  })
})

describe('tempo real', () => {
  it('proposal:archive tira do quadro; proposal:unarchive devolve', () => {
    store().handleWsEvent({ type: 'proposal:archive', payload: { ids: ['a', 'b'] } })
    expect(useProposalStore.getState().proposals.map((p) => p.id)).toEqual(['c'])
    expect(store().stale).toBe(true)
    store().handleWsEvent({ type: 'proposal:unarchive', payload: card('a') })
    expect(useProposalStore.getState().proposals.map((p) => p.id)).toContain('a')
  })

  it('payload ruim é ignorado', () => {
    store().handleWsEvent({ type: 'proposal:archive', payload: undefined })
    store().handleWsEvent({ type: 'proposal:unarchive', payload: {} })
    expect(useProposalStore.getState().proposals).toHaveLength(3)
  })
})
