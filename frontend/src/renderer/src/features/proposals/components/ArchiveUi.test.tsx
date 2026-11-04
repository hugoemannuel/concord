import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../../shared/ui/Avatar', () => ({ default: () => <i /> }))
vi.mock('../../../shared/ui/Modal', () => ({
  default: ({ title, children }: { title: string; children: React.ReactNode }) => (
    <div data-modal={title}>{children}</div>
  )
}))
vi.mock('./ProposalComments', () => ({ default: () => <div /> }))
vi.mock('./NewProposalModal', () => ({ default: () => null }))
vi.mock('../../chat/components/MediaLightbox', () => ({ default: () => null }))
vi.mock('../../auth/store/authStore', () => ({
  useAuthStore: (sel: (s: unknown) => unknown) => sel({ user: { id: 'eu' } })
}))
// A renderização no servidor lê o estado inicial do zustand: troco os stores por estados à mão.
const board = vi.hoisted(() => ({ isTech: false }))
const archived = vi.hoisted(() => ({
  state: {} as Record<string, unknown>
}))
vi.mock('../store/proposalStore', () => ({
  useProposalStore: (sel: (s: typeof board) => unknown) => sel(board)
}))
vi.mock('../store/archivedProposalStore', () => ({
  useArchivedProposalStore: Object.assign(() => archived.state, { getState: () => archived.state })
}))
vi.mock('../store/archiveActions', () => ({
  archiveWithUndo: vi.fn(),
  unarchiveWithToast: vi.fn()
}))

import { renderToStaticMarkup } from 'react-dom/server'
import type { Proposal } from '../api/proposals'
import ArchiveButton from './ArchiveButton'
import ArchiveColumnAction from './ArchiveColumnAction'
import ArchivedProposalCard from './ArchivedProposalCard'
import ArchivedProposals from './ArchivedProposals'
import ArchivedStatus from './ArchivedStatus'

const card = (over: Partial<Proposal> = {}): Proposal => ({
  id: 'p1',
  author_id: 'u1',
  author_name: 'Ana',
  title: 'Modo escuro',
  description: 'Tema mais escuro',
  status: 'done',
  created_at: '2026-10-01T00:00:00Z',
  voting_ends_at: '2026-10-08T00:00:00Z',
  archived_at: '2026-10-12T15:00:00Z',
  yes_votes: 5,
  no_votes: 2,
  comment_count: 3,
  images: [],
  ...over
})

const noop = (): void => {}

const noopAsync = async (): Promise<void> => {}
const setArchived = (state: Record<string, unknown>): void => {
  archived.state = {
    items: [],
    hasMore: false,
    loading: false,
    loadingMore: false,
    loaded: false,
    error: false,
    stale: false,
    query: '',
    text: '',
    fetch: noopAsync,
    ensureFresh: noopAsync,
    loadMore: noopAsync,
    setText: noop,
    ...state
  }
}

beforeEach(() => {
  board.isTech = false
  setArchived({})
})

describe('ArchiveColumnAction', () => {
  const render = (status: Proposal['status'], count: number): string =>
    renderToStaticMarkup(<ArchiveColumnAction status={status} count={count} />)

  it('time tech vê "Arquivar concluídas" na coluna com cards', () => {
    board.isTech = true
    expect(render('done', 3)).toContain('Arquivar concluídas')
    expect(render('done', 1)).toContain('Arquivar concluída<')
    expect(render('rejected', 2)).toContain('Arquivar recusadas')
  })
  it('some para quem não é do time tech, em coluna vazia ou em outras colunas', () => {
    expect(render('done', 3)).toBe('')
    board.isTech = true
    expect(render('done', 0)).toBe('')
    expect(render('in_progress', 3)).toBe('')
    expect(render('voting', 3)).toBe('')
  })
})

describe('ArchiveButton', () => {
  it('é um botão "Arquivar" com ícone', () => {
    const html = renderToStaticMarkup(<ArchiveButton id="p1" />)
    expect(html).toContain('>Arquivar<')
    expect(html).toContain('<svg')
  })
})

describe('ArchivedProposalCard', () => {
  const render = (over: Partial<Proposal>, canUnarchive: boolean): string =>
    renderToStaticMarkup(
      <ArchivedProposalCard
        proposal={card(over)}
        canUnarchive={canUnarchive}
        busy={false}
        onOpen={noop}
        onUnarchive={noop}
      />
    )

  it('mostra status, autor, data, placar e comentários; time tech desarquiva', () => {
    const html = render({}, true)
    expect(html).toContain('aria-label="Abrir proposta arquivada: Modo escuro"')
    expect(html).toContain('Concluída')
    expect(html).toContain('Ana')
    expect(html).toMatch(/Arquivada em 12 de out\.? de 2026/)
    expect(html).toContain('5 sim · 2 não')
    expect(html).toContain('title="3 comentários"')
    expect(html).toContain('Desarquivar')
  })
  it('sem time tech não tem "Desarquivar"; sem texto e sem comentários, some o resto', () => {
    const html = render({ description: '', comment_count: 0, status: 'rejected' }, false)
    expect(html).not.toContain('Desarquivar')
    expect(html).not.toContain('comentários')
    expect(html).toContain('Recusada')
  })
})

describe('ArchivedStatus', () => {
  const render = (over: Partial<Parameters<typeof ArchivedStatus>[0]>): string =>
    renderToStaticMarkup(
      <ArchivedStatus error={false} loading={false} empty={false} query="" onRetry={noop} {...over} />
    )

  it('erro com "Tentar de novo", carregando, vazio e busca sem resultado', () => {
    expect(render({ error: true })).toContain('Tentar de novo')
    expect(render({ loading: true })).toContain('Carregando…')
    expect(render({ empty: true })).toContain('Nenhuma proposta arquivada ainda.')
    expect(render({ empty: true, query: 'xyz' })).toContain('Nada encontrado para “xyz”.')
    expect(render({})).toBe('')
  })
})

describe('ArchivedProposals', () => {
  it('lista os cards, a busca e o "Carregar mais"', () => {
    setArchived({ items: [card(), card({ id: 'p2', title: 'Outra' })], hasMore: true, loaded: true })
    const html = renderToStaticMarkup(<ArchivedProposals />)
    expect(html).toContain('Propostas arquivadas')
    expect(html).toContain('placeholder="Buscar nas arquivadas"')
    expect(html).toContain('Modo escuro')
    expect(html).toContain('Outra')
    expect(html).toContain('Carregar mais')
    expect(html).not.toContain('Desarquivar')
  })
  it('time tech vê "Desarquivar"; lista vazia explica', () => {
    board.isTech = true
    setArchived({ items: [card()], loaded: true })
    expect(renderToStaticMarkup(<ArchivedProposals />)).toContain('Desarquivar')
    setArchived({ items: [], loaded: true })
    expect(renderToStaticMarkup(<ArchivedProposals />)).toContain('Nenhuma proposta arquivada ainda.')
  })
})
