import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  proposals: [] as unknown[],
  isTech: false,
  loading: false,
  query: ''
}))

vi.mock('react-router-dom', () => ({
  useNavigate: () => () => {},
  useSearchParams: () => [new URLSearchParams(state.query), () => {}]
}))
vi.mock('../../auth/store/authStore', () => ({
  useAuthStore: (select: (s: unknown) => unknown) => select({ user: { id: 'me' } })
}))
vi.mock('../store/proposalStore', () => ({
  useProposalStore: (select: (s: unknown) => unknown) =>
    select({
      proposals: state.proposals,
      isTech: state.isTech,
      loading: state.loading,
      pendingMentions: [],
      fetchProposals: vi.fn(),
      vote: vi.fn(),
      removeVote: vi.fn(),
      setStatus: vi.fn(),
      remove: vi.fn(),
      markSeen: vi.fn(),
      markMentionsSeen: vi.fn()
    })
}))
vi.mock('../components/GithubUsernameButton', () => ({ default: () => <p>github</p> }))
vi.mock('../components/NewProposalModal', () => ({
  default: ({ open }: { open: boolean }) => (open ? <p>nova</p> : null)
}))
vi.mock('../components/ProposalDetailModal', () => ({
  default: ({ proposal }: { proposal: { title: string } }) => <p>detalhe {proposal.title}</p>
}))
vi.mock('../components/ArchiveColumnAction', () => ({ default: () => null }))
vi.mock('../components/ProposalCard', () => ({ default: () => <p>arrastando</p> }))
vi.mock('../components/ConfirmCloseModal', () => ({ default: () => <p>encerrar</p> }))
vi.mock('../components/ConfirmTakeoverModal', () => ({ default: () => <p>tomar</p> }))
vi.mock('../components/DraggableProposalCard', () => ({
  default: ({ proposal, draggable }: { proposal: { title: string }; draggable: boolean }) => (
    <article data-draggable={draggable}>{proposal.title}</article>
  )
}))
vi.mock('../../../shared/ui/skeleton/layouts', () => ({
  ProposalBoardSkeleton: () => <p>skeleton</p>
}))

import { renderToStaticMarkup } from 'react-dom/server'
import Proposals from './Proposals'

const card = (id: string, status: string, title: string): unknown => ({
  id,
  status,
  title,
  created_at: '2026-10-01T00:00:00Z',
  voting_ends_at: '2026-10-02T00:00:00Z',
  yes_votes: 0,
  no_votes: 0,
  assignee: null
})

const render = (): string => renderToStaticMarkup(<Proposals />)

describe('Proposals', () => {
  beforeEach(() => {
    state.proposals = [card('p1', 'proposed', 'Modo escuro'), card('p2', 'rejected', 'Recusada')]
    state.isTech = false
    state.loading = false
    state.query = ''
  })

  it('carregando: topo e o esqueleto do quadro', () => {
    state.loading = true
    const html = render()
    expect(html).toContain('Propostas')
    expect(html).toContain('Ver recusadas (1)')
    expect(html).toContain('Novidades')
    expect(html).toContain('Nova proposta')
    expect(html).toContain('skeleton')
    expect(html).not.toContain('github')
  })

  it('carregado: cada card na sua coluna, as vazias avisam e as recusadas ficam ocultas', () => {
    const html = render()
    expect(html).toContain('Modo escuro')
    expect(html).not.toContain('>Recusada</article>')
    expect(html).toContain('Nada por aqui ainda.')
    expect(html).toContain('data-draggable="false"')
    expect(html).not.toContain('detalhe')
  })

  it('time tech: botão do GitHub e cards arrastáveis', () => {
    state.isTech = true
    const html = render()
    expect(html).toContain('github')
    expect(html).toContain('data-draggable="true"')
  })

  it('card da URL abre no modal; id que não existe, nada', () => {
    state.query = 'proposal=p1'
    expect(render()).toContain('detalhe Modo escuro')
    state.query = 'proposal=sumiu'
    expect(render()).not.toContain('detalhe')
  })
})
