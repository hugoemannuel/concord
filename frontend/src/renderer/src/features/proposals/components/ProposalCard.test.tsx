import { describe, expect, it, vi } from 'vitest'

vi.mock('../../../shared/ui/Avatar', () => ({
  default: ({ name }: { name: string }) => <i data-avatar>{name}</i>
}))

import { renderToStaticMarkup } from 'react-dom/server'
import type { Proposal } from '../api/proposals'
import ProposalCard from './ProposalCard'

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
const render = (over: Partial<Proposal> = {}, props: Partial<Parameters<typeof ProposalCard>[0]> = {}): string =>
  renderToStaticMarkup(
    <ProposalCard
      proposal={{ ...base, ...over }}
      now={NOW}
      meId="u1"
      isTech={false}
      busy={false}
      onOpen={noop}
      onVote={noop}
      onRemoveVote={noop}
      onMove={noop}
      onDelete={noop}
      {...props}
    />
  )

describe('ProposalCard', () => {
  it('é um botão que abre a proposta, com título, descrição e autor', () => {
    const html = render()
    expect(html).toContain('role="button"')
    expect(html).toContain('aria-label="Abrir proposta: Modo escuro"')
    expect(html).toContain('Tema mais escuro')
    expect(html).toContain('data-avatar')
  })

  it('mostra a contagem de comentários com o ícone desenhado, sem emoji', () => {
    const html = render()
    expect(html).toContain('title="2 comentários"')
    expect(html).not.toContain('💬')
    expect(html).toMatch(/title="2 comentários"[^>]*><svg[^>]*aria-hidden="true"/)
    expect(render({ comment_count: 1 })).toContain('title="1 comentário"')
    expect(render({ comment_count: 0 })).not.toContain('comentário')
  })

  it('em votação: barra de votos e os botões Sim/Não com o voto marcado', () => {
    const html = render({ my_vote: true })
    expect(html).toContain('aria-label="3 sim e 1 não"')
    expect(html).toMatch(/aria-pressed="true"[^>]*>Sim/)
    expect(html).toContain('Não</button>')
  })

  it('fora de votação e sem votos: sem barra nem botões', () => {
    const html = render({ status: 'done', yes_votes: 0, no_votes: 0 })
    expect(html).not.toContain('sim e')
    expect(html).not.toContain('>Sim<')
  })

  it('primeira imagem como capa e "+N" das outras', () => {
    const images = [
      { id: 'a', url: '/a.png' },
      { id: 'b', url: '/b.png' },
      { id: 'c', url: '/c.png' }
    ] as Proposal['images']
    const html = render({ images })
    expect(html).toContain('<img')
    expect(html).toContain('+2')
  })

  it('link da issue e ações de quem pode excluir', () => {
    const html = render({ github_issue_url: 'https://x/1', github_issue_number: 1 })
    expect(html).toContain('Issue #1 no GitHub')
    expect(html).toContain('Excluir')
    expect(render({}, { isTech: true })).toContain('Mover proposta para')
  })

  it('o clone do arrasto não tem botões, link nem ações', () => {
    const html = render({ github_issue_url: 'https://x/1', github_issue_number: 1 }, { overlay: true })
    expect(html).not.toContain('role="button"')
    expect(html).toContain('aria-hidden="true"')
    expect(html).not.toContain('Issue #1')
    expect(html).not.toContain('Excluir')
    expect(html).not.toContain('>Sim<')
  })

  it('"Arquivar" só para o time tech, em card concluído ou recusado', () => {
    expect(render({ status: 'done' }, { isTech: true })).toContain('>Arquivar<')
    expect(render({ status: 'rejected' }, { isTech: true })).toContain('>Arquivar<')
    expect(render({ status: 'proposed' }, { isTech: true })).not.toContain('>Arquivar<')
    expect(render({ status: 'done' }, { isTech: false })).not.toContain('>Arquivar<')
  })
})
