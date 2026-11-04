import { describe, expect, it, vi } from 'vitest'

vi.mock('../../../shared/ui/Avatar', () => ({
  default: ({ name }: { name: string }) => <i data-avatar>{name}</i>
}))
vi.mock('../../../shared/ui/Modal', () => ({
  default: ({ title, children }: { title: string; children: React.ReactNode }) => (
    <div data-modal={title}>{children}</div>
  )
}))
vi.mock('./ProposalComments', () => ({ default: () => <div data-comments /> }))
vi.mock('./NewProposalModal', () => ({ default: () => null }))
vi.mock('../../chat/components/MediaLightbox', () => ({ default: () => null }))

import { renderToStaticMarkup } from 'react-dom/server'
import type { Proposal } from '../api/proposals'
import ProposalDetailModal from './ProposalDetailModal'

const NOW = new Date('2026-10-25T12:00:00Z').getTime()
const base: Proposal = {
  id: 'p1',
  author_id: 'u1',
  author_name: 'Ana',
  title: 'Modo escuro',
  description: 'Tema mais escuro',
  status: 'voting',
  created_at: new Date(NOW - 3_600_000).toISOString(),
  voting_ends_at: new Date(NOW + 2 * 3_600_000).toISOString(),
  yes_votes: 3,
  no_votes: 1,
  comment_count: 2,
  images: []
}

const noop = (): void => {}
const render = (over: Partial<Proposal> = {}, props: { isTech?: boolean; meId?: string | null } = {}): string =>
  renderToStaticMarkup(
    <ProposalDetailModal
      proposal={{ ...base, ...over }}
      now={NOW}
      meId={props.meId === undefined ? 'u1' : props.meId}
      isTech={props.isTech ?? false}
      busy={false}
      onVote={noop}
      onRemoveVote={noop}
      onMove={noop}
      onDelete={noop}
      onClose={noop}
    />
  )

describe('ProposalDetailModal', () => {
  it('em votação: autor, coluna, tempo, descrição, votos e Sim/Não; autor edita e exclui', () => {
    const html = render({ my_vote: false, edited_at: '2026-10-25T11:00:00Z' })
    expect(html).toContain('data-modal="Modo escuro"')
    expect(html).toContain('Em votação')
    expect(html).toContain('Tema mais escuro')
    expect(html).toContain('(editada)')
    expect(html).toContain('aria-label="3 sim e 1 não"')
    expect(html).toMatch(/aria-pressed="false"[^>]*>Sim/)
    expect(html).toMatch(/aria-pressed="true"[^>]*>Não/)
    expect(html).toContain('Editar')
    expect(html).toContain('Excluir')
    expect(html).toContain('data-comments')
  })

  it('concluída com issue: sem votar, com link e a coluna certa', () => {
    const html = render(
      { status: 'done', github_issue_url: 'https://x/9', github_issue_number: 9, description: '' },
      { meId: 'u2' }
    )
    expect(html).toContain('Concluído')
    expect(html).toContain('Issue #9 no GitHub')
    expect(html).not.toContain('>Sim<')
    expect(html).not.toContain('Excluir')
  })

  it('imagens: a primeira grande e todas ampliáveis', () => {
    const images = [
      { id: 'a', url: '/a.png', content_type: 'image/png' },
      { id: 'b', url: '/b.png', content_type: 'image/png' }
    ]
    const html = render({ images })
    expect(html).toContain('aria-label="Ampliar imagem 1"')
    expect(html).toContain('aria-label="Ampliar imagem 2"')
    expect(html).toContain('aspect-video')
    expect(html).toContain('aspect-square')
  })

  it('time tech vê o "Mover para…"; sem votos e fora de votação, sem barra', () => {
    const html = render({ status: 'proposed', yes_votes: 0, no_votes: 0 }, { isTech: true, meId: 'tech' })
    expect(html).toContain('Mover proposta para')
    expect(html).not.toContain('sim e')
  })

  it('quem não pode nada não vê rodapé de ações', () => {
    const html = render({ status: 'rejected', yes_votes: 0, no_votes: 0 }, { meId: 'u2' })
    expect(html).not.toContain('Mover proposta para')
    expect(html).not.toContain('Editar')
  })

  it('mostra quem está com o card fora da votação', () => {
    const html = render({ status: 'in_progress', assignee: { id: 'd1', name: 'Beto' } })
    expect(html).toContain('Beto')
  })
})
